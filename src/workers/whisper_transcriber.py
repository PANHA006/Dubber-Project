import os
import sys
import json
import re
import argparse

# Limit CPU threads to avoid freezing the system
try:
    import torch
    torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))
except Exception:
    pass

def seconds_to_srt_timestamp(seconds):
    """Convert float seconds to HH:MM:SS,mmm format."""
    try:
        seconds = max(0.0, float(seconds))
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int(round((seconds - int(seconds)) * 1000))
        if millis >= 1000:
            millis = 999
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
    except Exception:
        return "00:00:00,000"

def split_segments_by_punctuation(segments):
    """
    Split segments into clean sentences/clauses whenever a word contains punctuation,
    preserving exact word-level start and end timestamps while filtering out micro-noise (< 0.4s).
    """
    punct_marks = (".", "!", "?", "。", "！", "？", "，", "；", ",", ";", "、", "។", "៕", "៖")
    noise_words = {"啊", "呃", "嗯", "吧", "一了", "呀", "哦", "哈", "哇", "嘞", "呢"}
    split_result = []
    new_id = 1

    for seg in segments:
        words = seg.get("words", [])
        if not words:
            split_result.append({
                "id": new_id,
                "startSec": seg.get("start", 0.0),
                "endSec": seg.get("end", 0.0),
                "text": seg.get("text", "").strip()
            })
            new_id += 1
            continue

        current_words = []
        for w in words:
            current_words.append(w)
            w_text = w.get("word", "").strip()
            if w_text and any(p in w_text for p in punct_marks):
                row_text = "".join(item.get("word", "") for item in current_words).strip()
                if row_text:
                    start_sec = current_words[0]["start"]
                    end_sec = current_words[-1]["end"]
                    dur = end_sec - start_sec
                    clean_txt = re.sub(r"[^\w\u4e00-\u9fff]", "", row_text).strip()
                    if dur < 0.4 and clean_txt in noise_words:
                        current_words = []
                        continue
                    split_result.append({
                        "id": new_id,
                        "startSec": start_sec,
                        "endSec": end_sec,
                        "text": row_text
                    })
                    new_id += 1
                current_words = []

        if current_words:
            row_text = "".join(item.get("word", "") for item in current_words).strip()
            if row_text:
                start_sec = current_words[0]["start"]
                end_sec = current_words[-1]["end"]
                dur = end_sec - start_sec
                clean_txt = re.sub(r"[^\w\u4e00-\u9fff]", "", row_text).strip()
                if not (dur < 0.4 and clean_txt in noise_words):
                    split_result.append({
                        "id": new_id,
                        "startSec": start_sec,
                        "endSec": end_sec,
                        "text": row_text
                    })
                    new_id += 1

    return split_result

def merge_fragmented_segments(segments, max_gap=0.20, max_merge_count=3):
    """Merge adjacent fragments while preserving their enclosing timing and respecting max merge count."""
    if not segments or max_merge_count <= 1:
        return segments
    merged = []
    current = None
    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue
        if current is None:
            current = {
                "id": seg.get("id", 1),
                "startSec": seg.get("startSec", 0.0),
                "endSec": seg.get("endSec", 0.0),
                "text": text,
                "merge_count": 1
            }
            continue
        gap = seg.get("startSec", 0.0) - current["endSec"]
        if gap <= max_gap and current.get("merge_count", 1) < max_merge_count:
            # Separate merged clauses with double space for natural visual separation
            curr_text = current["text"].rstrip(" /").strip()
            next_text = text.lstrip(" /").strip()
            current["text"] = f"{curr_text}  {next_text}"
            current["endSec"] = seg.get("endSec", current["endSec"])
            current["merge_count"] = current.get("merge_count", 1) + 1
        else:
            current.pop("merge_count", None)
            merged.append(current)
            current = {
                "id": seg.get("id", 1),
                "startSec": seg.get("startSec", 0.0),
                "endSec": seg.get("endSec", 0.0),
                "text": text,
                "merge_count": 1
            }
    if current is not None:
        current.pop("merge_count", None)
        merged.append(current)
    # Re-index
    for idx, item in enumerate(merged):
        item["id"] = idx + 1
    return merged

def extract_audio_if_needed(input_path):
    """If file is video or non-16k wav, extract clean 16kHz mono audio using FFmpeg."""
    ext = os.path.splitext(input_path)[1].lower()
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg_exe = "ffmpeg"

    import subprocess
    import tempfile
    temp_wav = os.path.join(tempfile.gettempdir(), f"whisper_{os.getpid()}_{int(os.path.getmtime(input_path))}.wav")
    if os.path.exists(temp_wav):
        return temp_wav, False

    cmd = [
        ffmpeg_exe, "-y",
        "-i", input_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        temp_wav
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return temp_wav, True
    except Exception as e:
        sys.stderr.write(f"[WARN] Audio extraction with FFmpeg failed ({e}), trying direct file...\n")
        return input_path, False

def run_transcription(audio_path, model_size="base", device="cpu", compute_type="int8", enable_vad=True, vad_threshold=0.10, max_pause_gap=0.20, max_merge_limit=3, language=None, merge=True):
    effective_audio, is_temp = extract_audio_if_needed(audio_path)

    sys.stderr.write(f"[INFO] Initializing Faster-Whisper model='{model_size}' device='{device}' compute='{compute_type}'...\n")
    sys.stderr.flush()

    from faster_whisper import WhisperModel
    cpu_threads = max(1, (os.cpu_count() or 4) // 2)

    model = WhisperModel(
        model_size,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        num_workers=1
    )

    sys.stderr.write(f"[INFO] Model loaded successfully. Starting transcription (VAD={enable_vad}, threshold={vad_threshold})...\n")
    sys.stderr.flush()

    transcribe_kwargs = {
        "beam_size": 1,
        "word_timestamps": True,
        "temperature": 0.0,
        "no_speech_threshold": 0.85,
    }

    if language and language.strip() and language.strip().lower() != "auto":
        transcribe_kwargs["language"] = language.strip().lower()

    if enable_vad:
        transcribe_kwargs["vad_filter"] = True
        transcribe_kwargs["vad_parameters"] = dict(
            threshold=float(vad_threshold),
            min_speech_duration_ms=150,
            min_silence_duration_ms=800,
            speech_pad_ms=400
        )
    else:
        transcribe_kwargs["vad_filter"] = False

    segments_generator, info = model.transcribe(effective_audio, **transcribe_kwargs)
    total_duration = getattr(info, "duration", 0.0) or 0.0
    detected_lang = getattr(info, "language", "unknown")

    sys.stderr.write(f"[INFO] Audio duration: {total_duration:.1f}s | Detected language: {detected_lang}\n")
    sys.stderr.flush()

    raw_segments = []
    for idx, seg in enumerate(segments_generator):
        words = []
        if seg.words:
            for w in seg.words:
                words.append({
                    "word": w.word,
                    "start": w.start,
                    "end": w.end,
                    "probability": getattr(w, "probability", 1.0)
                })
        raw_segments.append({
            "id": idx + 1,
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip(),
            "words": words
        })
        if total_duration > 0:
            pct = min(99, int((seg.end / total_duration) * 100))
            sys.stderr.write(f"[PROGRESS:{pct}] [{seg.start:.1f}s -> {seg.end:.1f}s] {seg.text[:40]}\n")
            sys.stderr.flush()

    # Step 3: Split by punctuation using word timestamps
    processed_segments = split_segments_by_punctuation(raw_segments)

    # Step 4: Merge adjacent segments respecting max_pause_gap and max_merge_limit
    if merge or max_merge_limit > 1:
        processed_segments = merge_fragmented_segments(
            processed_segments,
            max_gap=float(max_pause_gap),
            max_merge_count=int(max_merge_limit)
        )

    # Format into final subtitle schema
    final_output = []
    for i, s in enumerate(processed_segments):
        start_ts = seconds_to_srt_timestamp(s["startSec"])
        end_ts = seconds_to_srt_timestamp(s["endSec"])
        final_output.append({
            "id": i + 1,
            "start": start_ts,
            "end": end_ts,
            "startSec": round(s["startSec"], 3),
            "endSec": round(s["endSec"], 3),
            "originalText": s["text"],
            "khmerText": "",
            "speaker": "Speaker 1"
        })

    sys.stderr.write(f"[SUCCESS] Transcribed {len(final_output)} discrete segments.\n")
    sys.stderr.flush()

    result = {
        "success": True,
        "language": detected_lang,
        "duration": round(total_duration, 2),
        "segments": final_output
    }

    # Print pure JSON output to stdout
    print(json.dumps(result, ensure_ascii=False))

def main():
    parser = argparse.ArgumentParser(description="Faster-Whisper Worker for Dubber Project")
    parser.add_argument("--audio", required=True, help="Path to input audio/video file")
    parser.add_argument("--model", default="base", help="Model size (tiny, base, small, medium, large-v3)")
    parser.add_argument("--device", default="cpu", help="Device (cpu, cuda)")
    parser.add_argument("--compute_type", default="int8", help="Compute type (int8, float32, float16)")
    parser.add_argument("--vad", type=int, default=1, help="Enable Silero VAD (1 or 0)")
    parser.add_argument("--vad_threshold", type=float, default=0.10, help="Silero VAD threshold (0.10 to 0.50)")
    parser.add_argument("--max_pause_gap", type=float, default=0.20, help="Max gap in seconds between segments to merge")
    parser.add_argument("--max_merge_limit", type=int, default=3, help="Max merged segments limit (1 to 10)")
    parser.add_argument("--language", default=None, help="Spoken language code (e.g. en, zh, km)")
    parser.add_argument("--merge", type=int, default=1, help="Merge short fragmented segments (1 or 0)")

    args = parser.parse_args()

    if not os.path.exists(args.audio):
        error_resp = {"success": False, "error": f"Audio file not found: {args.audio}"}
        print(json.dumps(error_resp))
        sys.exit(1)

    try:
        run_transcription(
            audio_path=args.audio,
            model_size=args.model,
            device=args.device,
            compute_type=args.compute_type,
            enable_vad=bool(args.vad),
            vad_threshold=args.vad_threshold,
            max_pause_gap=args.max_pause_gap,
            max_merge_limit=args.max_merge_limit,
            language=args.language,
            merge=bool(args.merge)
        )
    except Exception as e:
        import traceback
        err_msg = str(e)
        sys.stderr.write(f"[ERROR] {err_msg}\n{traceback.format_exc()}\n")
        sys.stderr.flush()
        error_resp = {"success": False, "error": err_msg}
        print(json.dumps(error_resp))
        sys.exit(1)

if __name__ == "__main__":
    main()
