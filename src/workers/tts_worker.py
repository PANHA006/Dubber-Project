#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Microsoft Edge TTS Worker for Dubber Project
Generates high quality Khmer neural speech (km-KH-PisethNeural / km-KH-SreymomNeural)
and saves audio files directly into the project storage/voices/ directory.

Performance design notes
------------------------
The previous version processed items in a strict `for ... await` loop, so every
line waited for the previous one even though the Edge TTS call is pure network
I/O. Three changes make this dramatically faster:

1. PARALLELISM — items are run through `asyncio.gather` behind two semaphores:
   a wide one for the network call and a narrow one for the ffmpeg/ffprobe
   subprocesses, which are process-bound and would thrash if over-subscribed.
   Every subprocess goes through `create_subprocess_exec` so it never blocks
   the event loop.
2. CONTENT-HASH CACHE — the output filename is derived from a hash of the text,
   voice and target duration. Re-running Generate Voice therefore reuses the
   existing files instead of synthesising everything again, and only lines
   whose content actually changed are regenerated.
3. FEWER SUBPROCESSES — the atempo step no longer needs a follow-up ffprobe
   (atempo scales duration by exactly 1/speed, so it is computed), and the MP3
   header parser supplies the cosmetic duration of cache hits, where being
   instant matters more than the last 0.1s. The audio-processing filters
   themselves are untouched, so the generated audio is byte-for-byte the same
   pipeline as before.

Concurrency is tunable through the environment if Edge TTS ever rate-limits:
   TTS_NET_CONCURRENCY (default 8)  - simultaneous synthesis requests
   TTS_CPU_CONCURRENCY (default 3)  - simultaneous ffmpeg/ffprobe processes
   TTS_MAX_RETRIES     (default 3)  - retries per item on transient failure
"""

import sys
import os
import json
import time
import asyncio
import hashlib
import subprocess
import edge_tts

VOICE_MAP = {
    "piseth": "km-KH-PisethNeural",
    "male": "km-KH-PisethNeural",
    "sreymom": "km-KH-SreymomNeural",
    "female": "km-KH-SreymomNeural"
}

NET_CONCURRENCY = max(1, int(os.environ.get("TTS_NET_CONCURRENCY", "8") or 8))
CPU_CONCURRENCY = max(1, int(os.environ.get("TTS_CPU_CONCURRENCY", "3") or 3))
MAX_RETRIES = max(0, int(os.environ.get("TTS_MAX_RETRIES", "3") or 3))
PROCESS_TIMEOUT = 120  # seconds before a helper binary is considered hung


def resolve_voice(voice_str):
    if not voice_str:
        return "km-KH-PisethNeural"
    v_lower = str(voice_str).lower()
    if "sreymom" in v_lower or "female" in v_lower or "ស្រី" in v_lower:
        return "km-KH-SreymomNeural"
    return "km-KH-PisethNeural"


# ---------------------------------------------------------------------------
# Duration measurement
# ---------------------------------------------------------------------------
# ffprobe is the source of truth: it applies the LAME encoder delay/padding from
# the Xing header, whereas a raw frame sum reads consistently ~0.08s high. That
# bias is small but it sits right on the `target + 0.08` threshold that decides
# whether a line gets speed-fitted, so the accurate tool keeps that job.
#
# The pure-Python parser below is therefore used for the COSMETIC duration of a
# cache hit (where re-running must feel instant and 0.1s does not matter) and as
# the fallback when ffprobe is unavailable — it is far better than the old
# bytes/16000 estimate.

_BITRATE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_BITRATE_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_SAMPLE_RATES = {
    3: [44100, 48000, 32000],   # MPEG 1
    2: [22050, 24000, 16000],   # MPEG 2
    0: [11025, 12000, 8000],    # MPEG 2.5
}


def mp3_duration_seconds(path):
    """Exact duration of a CBR MP3, or None when the file cannot be parsed."""
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except Exception:
        return None

    total = len(data)
    if total < 128:
        return None

    pos = 0
    # Skip an ID3v2 tag so its bytes are not mistaken for audio frames.
    if data[0:3] == b"ID3" and total > 10:
        tag_size = (
            ((data[6] & 0x7F) << 21)
            | ((data[7] & 0x7F) << 14)
            | ((data[8] & 0x7F) << 7)
            | (data[9] & 0x7F)
        )
        pos = 10 + tag_size

    frames = 0
    total_samples = 0
    sample_rate = None

    while pos + 4 <= total:
        # Frame sync: eleven set bits.
        if data[pos] != 0xFF or (data[pos + 1] & 0xE0) != 0xE0:
            pos += 1
            continue

        header_b1 = data[pos + 1]
        header_b2 = data[pos + 2]
        version = (header_b1 >> 3) & 0x03   # 0 = 2.5, 1 = reserved, 2 = MPEG2, 3 = MPEG1
        layer = (header_b1 >> 1) & 0x03     # 1 = Layer III
        bitrate_index = (header_b2 >> 4) & 0x0F
        rate_index = (header_b2 >> 2) & 0x03
        padding = (header_b2 >> 1) & 0x01

        if version == 1 or layer != 1 or bitrate_index in (0, 15) or rate_index == 3:
            pos += 1
            continue

        if version == 3:
            bitrate = _BITRATE_V1_L3[bitrate_index] * 1000
            samples = 1152
        else:
            bitrate = _BITRATE_V2_L3[bitrate_index] * 1000
            samples = 576

        rate = _SAMPLE_RATES[version][rate_index]
        if bitrate <= 0 or rate <= 0:
            pos += 1
            continue

        frame_length = (samples // 8) * bitrate // rate + padding
        if frame_length <= 4:
            pos += 1
            continue

        sample_rate = rate
        total_samples += samples
        frames += 1
        pos += frame_length

    if frames == 0 or not sample_rate:
        return None
    return round(total_samples / sample_rate, 2)


def get_audio_duration(file_path):
    """Accurate duration in seconds — ffprobe first, MP3 header parse as fallback."""
    probed = ffprobe_duration(file_path, allow_size_estimate=False)
    if probed is not None:
        return probed
    parsed = mp3_duration_seconds(file_path)
    if parsed is not None and parsed > 0:
        return parsed
    # Last resort estimation for 128kbps mp3: bytes / 16000
    try:
        return round(os.path.getsize(file_path) / 16000.0, 2)
    except Exception:
        return 2.0


def ffprobe_duration(file_path, allow_size_estimate=True):
    """ffprobe duration, or None when it cannot be measured."""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return round(float(res.stdout.strip()), 2)
    except Exception:
        if not allow_size_estimate:
            return None
        try:
            return round(os.path.getsize(file_path) / 16000.0, 2)
        except Exception:
            return 2.0


# ---------------------------------------------------------------------------
# Async subprocess helpers
# ---------------------------------------------------------------------------

async def run_process(args):
    """Run a helper binary without blocking the event loop. Returns (code, stderr)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
    except FileNotFoundError:
        return -1, "helper binary not found"
    except Exception as exc:
        return -1, str(exc)

    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=PROCESS_TIMEOUT)
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        return -1, "helper binary timed out"
    except Exception as exc:
        return -1, str(exc)

    return proc.returncode, stderr.decode("utf-8", "replace")


async def trim_trailing_silence(file_path):
    """
    Remove trailing silence added by Edge-TTS while preserving a small natural
    safety cushion (0.08s). Uses FFmpeg reverse -> silenceremove -> reverse -> apad.

    The filter chain is deliberately unchanged from the original implementation.
    A cheaper `silenceremove=stop_periods=-1` form was measured and trims ~0.05s
    less on real clips, which would have altered the delivered audio length, so
    it was rejected — the speed work belongs in the parallel loop, not here.
    """
    if not os.path.isfile(file_path) or os.path.getsize(file_path) < 1000:
        return
    temp_trimmed = file_path + ".trimmed.mp3"
    try:
        filter_str = (
            "areverse,silenceremove=start_periods=1:start_duration=0.05:"
            "start_threshold=-40dB,areverse,apad=pad_dur=0.08"
        )
        code, _ = await run_process([
            "ffmpeg", "-y", "-v", "error",
            "-i", file_path,
            "-filter:a", filter_str,
            "-vn", temp_trimmed
        ])
        if code == 0 and os.path.isfile(temp_trimmed) and os.path.getsize(temp_trimmed) > 1000:
            os.replace(temp_trimmed, file_path)
    except Exception:
        pass
    finally:
        if os.path.isfile(temp_trimmed):
            try:
                os.remove(temp_trimmed)
            except Exception:
                pass


async def apply_speed(file_path, speed):
    """Speed up a clip with atempo. Returns True when the file was replaced."""
    temp_fitted = file_path + ".fitted.mp3"
    try:
        code, _ = await run_process([
            "ffmpeg", "-y", "-v", "error",
            "-i", file_path,
            "-filter:a", f"atempo={speed}",
            "-vn", temp_fitted
        ])
        if code == 0 and os.path.isfile(temp_fitted) and os.path.getsize(temp_fitted) > 1000:
            os.replace(temp_fitted, file_path)
            return True
    except Exception:
        pass
    finally:
        if os.path.isfile(temp_fitted):
            try:
                os.remove(temp_fitted)
            except Exception:
                pass
    return False


# ---------------------------------------------------------------------------
# Cache key
# ---------------------------------------------------------------------------

def cache_key(text, voice, target_duration):
    """
    Stable identifier for a piece of synthesised audio.

    Every input that changes the rendered result must be part of this hash —
    otherwise editing the voice or the timing would silently reuse old audio.
    """
    material = "{0}|{1}|{2}".format(text, voice, target_duration if target_duration else "")
    return hashlib.sha1(material.encode("utf-8")).hexdigest()[:10]


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

async def synthesize(text, voice, out_path, net_sem):
    """Call Edge TTS with bounded concurrency and backoff on transient errors."""
    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            # Hold the slot only for the network call, never during backoff.
            async with net_sem:
                communicator = edge_tts.Communicate(text, voice)
                await communicator.save(out_path)
            if os.path.isfile(out_path) and os.path.getsize(out_path) > 0:
                return
            raise RuntimeError("Edge TTS produced no audio")
        except Exception as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                await asyncio.sleep(0.6 * (2 ** attempt))
                continue
            raise
    raise last_error


def resolve_target_duration(item):
    """Target speaking window in seconds, from targetDuration or start/end."""
    target_duration = item.get("targetDuration")
    if target_duration is None:
        start_sec = item.get("startSec")
        end_sec = item.get("endSec")
        if start_sec is not None and end_sec is not None:
            try:
                start_val = float(start_sec)
                end_val = float(end_sec)
                if end_val > start_val:
                    return end_val - start_val
            except Exception:
                pass
        return None
    try:
        return float(target_duration)
    except Exception:
        return None


async def generate_single_item(item, output_dir, net_sem, cpu_sem):
    sub_id = item.get("id", f"sub_{os.urandom(4).hex()}")
    text = (item.get("khmerText") or item.get("text") or "").strip()
    voice_pref = item.get("voice", "Piseth (Male)")

    if not text:
        return {"id": sub_id, "success": False, "error": "Empty text"}

    chosen_voice = resolve_voice(voice_pref)
    clean_id = str(sub_id).replace(":", "_").replace("/", "_").replace("\\", "_")
    target_duration = resolve_target_duration(item)

    key = cache_key(text, chosen_voice, target_duration)
    filename = f"voice_{clean_id}_{key}.mp3"
    out_path = os.path.join(output_dir, filename)

    # --- remove the previous take for this line, if it is a different file ---
    old_audio = item.get("oldAudioUrl") or item.get("oldFilename")
    if old_audio:
        try:
            old_name = os.path.basename(str(old_audio).split("?")[0])
            old_path = os.path.join(output_dir, old_name)
            if os.path.isfile(old_path) and os.path.abspath(old_path) != os.path.abspath(out_path):
                os.remove(old_path)
        except Exception:
            pass

    # Drop any earlier hashed take for this id so the folder does not grow.
    try:
        prefix = f"voice_{clean_id}_"
        for existing in os.listdir(output_dir):
            if existing.startswith(prefix) and existing.endswith(".mp3") and existing != filename:
                stale = os.path.join(output_dir, existing)
                if os.path.abspath(stale) != os.path.abspath(out_path):
                    os.remove(stale)
    except Exception:
        pass

    # --- cache hit: nothing to synthesise ---
    if os.path.isfile(out_path) and os.path.getsize(out_path) > 1000:
        # Header parse, not ffprobe: a re-run must feel instant, and the
        # reported duration here is cosmetic.
        cached_duration = mp3_duration_seconds(out_path)
        if cached_duration is None or cached_duration <= 0:
            cached_duration = get_audio_duration(out_path)
        return {
            "id": sub_id,
            "success": True,
            "filename": filename,
            "audioUrl": f"/storage/voices/{filename}?v={key}",
            "voice": chosen_voice,
            "duration": cached_duration,
            "targetDuration": round(target_duration, 2) if target_duration else None,
            "speedApplied": 1.0,
            "size": os.path.getsize(out_path),
            "cached": True
        }

    try:
        await synthesize(text, chosen_voice, out_path, net_sem)

        # Trim and measure off the event loop so other items keep flowing.
        async with cpu_sem:
            await trim_trailing_silence(out_path)
            initial_duration = get_audio_duration(out_path)

        speed_applied = 1.0
        duration = initial_duration

        # Auto-fit speech if spoken audio exceeds target duration.
        if target_duration and target_duration > 0.4 and initial_duration > (target_duration + 0.08):
            needed_ratio = initial_duration / target_duration
            # Cap speed ratio between 1.05 and 1.35 to prevent chipmunk / fast speech
            clamped_speed = round(min(1.35, max(1.05, needed_ratio)), 2)
            async with cpu_sem:
                if await apply_speed(out_path, clamped_speed):
                    # atempo scales duration by exactly 1/speed, so no second
                    # ffprobe is needed to learn the new length.
                    duration = round(initial_duration / clamped_speed, 2)
                    speed_applied = clamped_speed
                else:
                    duration = initial_duration

        return {
            "id": sub_id,
            "success": True,
            "filename": filename,
            "audioUrl": f"/storage/voices/{filename}?v={key}",
            "voice": chosen_voice,
            "duration": duration,
            "targetDuration": round(target_duration, 2) if target_duration else None,
            "speedApplied": speed_applied,
            "size": os.path.getsize(out_path),
            "cached": False
        }
    except Exception as exc:
        return {"id": sub_id, "success": False, "error": str(exc)}


async def main():
    data = None
    if len(sys.argv) >= 2:
        input_arg = sys.argv[1]
        if os.path.isfile(input_arg):
            with open(input_arg, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            try:
                data = json.loads(input_arg)
            except Exception:
                pass

    if data is None and not sys.stdin.isatty():
        stdin_content = sys.stdin.read()
        if stdin_content.strip():
            data = json.loads(stdin_content)

    if not data:
        print(json.dumps({"success": False, "error": "Missing input JSON payload"}))
        sys.exit(1)

    items = data.get("items", [])
    output_dir = data.get("outputDir", os.path.join(os.getcwd(), "storage", "voices"))
    os.makedirs(output_dir, exist_ok=True)

    total_items = len(items)
    if total_items == 0:
        print(json.dumps({"success": True, "count": 0, "results": []}))
        return

    net_sem = asyncio.Semaphore(NET_CONCURRENCY)
    cpu_sem = asyncio.Semaphore(CPU_CONCURRENCY)

    # asyncio is single-threaded and the counter is only touched between awaits,
    # so a plain dict is a safe progress counter across the gathered tasks.
    progress = {"done": 0}

    def emit_progress(res):
        progress["done"] += 1
        try:
            p_data = {
                "current": progress["done"],
                "total": total_items,
                "id": res.get("id"),
                "voice": res.get("voice", "Piseth (Male)"),
                "duration": res.get("duration", 0),
                "speed": res.get("speedApplied", 1.0),
                "status": "OK" if res.get("success") else "FAIL"
            }
            print(f"PROGRESS_JSON:{json.dumps(p_data)}", file=sys.stderr, flush=True)
        except Exception:
            pass

    async def run_one(item):
        res = await generate_single_item(item, output_dir, net_sem, cpu_sem)
        emit_progress(res)
        return res

    # gather preserves input order, so results stay aligned with the request.
    results = await asyncio.gather(*(run_one(item) for item in items))

    print(json.dumps({
        "success": True,
        "count": len(results),
        "results": results
    }, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
