#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Microsoft Edge TTS Worker for Dubber Project
Generates high quality Khmer neural speech (km-KH-PisethNeural / km-KH-SreymomNeural)
and saves audio files directly into the project storage/voices/ directory.
"""

import sys
import os
import json
import time
import asyncio
import subprocess
import edge_tts

VOICE_MAP = {
    "piseth": "km-KH-PisethNeural",
    "male": "km-KH-PisethNeural",
    "sreymom": "km-KH-SreymomNeural",
    "female": "km-KH-SreymomNeural"
}

def resolve_voice(voice_str):
    if not voice_str:
        return "km-KH-PisethNeural"
    v_lower = str(voice_str).lower()
    if "sreymom" in v_lower or "female" in v_lower or "ស្រី" in v_lower:
        return "km-KH-SreymomNeural"
    return "km-KH-PisethNeural"

def get_audio_duration(file_path):
    """Retrieve audio duration in seconds using ffprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        dur = float(res.stdout.strip())
        return round(dur, 2)
    except Exception:
        # Fallback estimation for 128kbps mp3: bytes / 16000
        try:
            size = os.path.getsize(file_path)
            return round(size / 16000.0, 2)
        except Exception:
            return 2.0

def trim_trailing_silence(file_path):
    """
    Remove trailing silence introduced by Edge-TTS while preserving a small natural safety cushion (0.08s).
    Uses FFmpeg reverse -> silenceremove -> reverse -> apad.
    """
    if not os.path.isfile(file_path) or os.path.getsize(file_path) < 1000:
        return
    temp_trimmed = file_path + ".trimmed.mp3"
    try:
        filter_str = "areverse,silenceremove=start_periods=1:start_duration=0.05:start_threshold=-40dB,areverse,apad=pad_dur=0.08"
        cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-i", file_path,
            "-filter:a", filter_str,
            "-vn", temp_trimmed
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        if os.path.isfile(temp_trimmed) and os.path.getsize(temp_trimmed) > 1000:
            os.replace(temp_trimmed, file_path)
    except Exception:
        if os.path.isfile(temp_trimmed):
            try:
                os.remove(temp_trimmed)
            except Exception:
                pass

async def generate_single_item(item, output_dir):
    sub_id = item.get("id", f"sub_{os.urandom(4).hex()}")
    text = (item.get("khmerText") or item.get("text") or "").strip()
    voice_pref = item.get("voice", "Piseth (Male)")

    if not text:
        return {
            "id": sub_id,
            "success": False,
            "error": "Empty text"
        }

    chosen_voice = resolve_voice(voice_pref)
    clean_id = str(sub_id).replace(":", "_").replace("/", "_").replace("\\", "_")
    version_tag = int(time.time() * 1000)
    filename = f"voice_{clean_id}_{version_tag}.mp3"
    out_path = os.path.join(output_dir, filename)

    # Delete old audio file if provided and different from out_path
    old_audio = item.get("oldAudioUrl") or item.get("oldFilename")
    if old_audio:
        try:
            old_clean_str = str(old_audio).split("?")[0]
            old_name = os.path.basename(old_clean_str)
            old_path = os.path.join(output_dir, old_name)
            if os.path.isfile(old_path) and os.path.abspath(old_path) != os.path.abspath(out_path):
                os.remove(old_path)
        except Exception:
            pass

    # Also clean up any legacy unversioned file with same ID
    try:
        legacy_path = os.path.join(output_dir, f"voice_{clean_id}.mp3")
        if os.path.isfile(legacy_path) and os.path.abspath(legacy_path) != os.path.abspath(out_path):
            os.remove(legacy_path)
    except Exception:
        pass

    # Determine target duration if provided
    target_duration = item.get("targetDuration")
    if target_duration is None:
        start_sec = item.get("startSec")
        end_sec = item.get("endSec")
        if start_sec is not None and end_sec is not None:
            try:
                s_val = float(start_sec)
                e_val = float(end_sec)
                if e_val > s_val:
                    target_duration = e_val - s_val
            except Exception:
                pass
    elif target_duration is not None:
        try:
            target_duration = float(target_duration)
        except Exception:
            target_duration = None

    try:
        communicator = edge_tts.Communicate(text, chosen_voice)
        await communicator.save(out_path)
        # Trim trailing silence added by Edge-TTS before measuring real duration
        trim_trailing_silence(out_path)
        initial_duration = get_audio_duration(out_path)
        speed_applied = 1.0

        # Auto-fit speech if spoken audio exceeds target duration
        if target_duration and target_duration > 0.4 and initial_duration > (target_duration + 0.08):
            needed_ratio = initial_duration / target_duration
            # Cap speed ratio between 1.05 and 1.35 to prevent chipmunk / fast speech
            clamped_speed = round(min(1.35, max(1.05, needed_ratio)), 2)
            temp_fitted = out_path + ".fitted.mp3"
            try:
                cmd = [
                    "ffmpeg", "-y", "-v", "error",
                    "-i", out_path,
                    "-filter:a", f"atempo={clamped_speed}",
                    "-vn", temp_fitted
                ]
                subprocess.run(cmd, check=True)
                if os.path.isfile(temp_fitted) and os.path.getsize(temp_fitted) > 1000:
                    os.replace(temp_fitted, out_path)
                    duration = get_audio_duration(out_path)
                    speed_applied = clamped_speed
                else:
                    duration = initial_duration
            except Exception:
                if os.path.isfile(temp_fitted):
                    try: os.remove(temp_fitted)
                    except Exception: pass
                duration = initial_duration
        else:
            duration = initial_duration
            speed_applied = 1.0

        return {
            "id": sub_id,
            "success": True,
            "filename": filename,
            "audioUrl": f"/storage/voices/{filename}?v={version_tag}",
            "voice": chosen_voice,
            "duration": duration,
            "targetDuration": round(target_duration, 2) if target_duration else None,
            "speedApplied": speed_applied,
            "size": os.path.getsize(out_path)
        }
    except Exception as e:
        return {
            "id": sub_id,
            "success": False,
            "error": str(e)
        }

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

    results = []
    total_items = len(items)
    for idx, item in enumerate(items):
        res = await generate_single_item(item, output_dir)
        results.append(res)
        # Emit real-time progress to stderr for parent node process
        try:
            p_data = {
                "current": idx + 1,
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

    print(json.dumps({
        "success": True,
        "count": len(results),
        "results": results
    }, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
