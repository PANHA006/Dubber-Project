#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
RVC (Retrieval-based Voice Conversion) Worker for Dubber Project
Runs CPU-optimized voice conversion using infer_rvc_python.
Transforms Edge-TTS Khmer speech into target character vocal timbre.
"""

import sys
import os
import json
import time
import subprocess
import traceback

# Force UTF-8 stdout for Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

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
        try:
            return round(os.path.getsize(file_path) / 16000.0, 2)
        except Exception:
            return 2.0

def convert_single_audio(loader, task, output_dir=None):
    """
    Convert a single audio file with the specified RVC model.
    """
    input_path = task.get("inputAudio")
    model_path = task.get("modelPath")
    index_path = task.get("indexPath") or ""
    pitch_shift = int(task.get("pitchShift", 0))
    pitch_algo = task.get("pitchAlgo", "pm")  # pm (parselmouth) is CPU friendly
    output_path = task.get("outputAudio")

    if not input_path or not os.path.isfile(input_path):
        return {"success": False, "error": f"Input audio not found: {input_path}"}

    if not model_path or not os.path.isfile(model_path):
        return {"success": False, "error": f"Model file not found: {model_path}"}

    if not output_path:
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        out_dir = output_dir or os.path.dirname(input_path)
        output_path = os.path.join(out_dir, f"{base_name}_rvc.wav")

    tag = f"tag_{os.path.splitext(os.path.basename(model_path))[0]}_{pitch_shift}"

    try:
        loader.apply_conf(
            tag=tag,
            file_model=model_path,
            pitch_algo=pitch_algo,
            pitch_lvl=pitch_shift,
            file_index=index_path if os.path.isfile(index_path) else "",
            index_influence=0.66 if (index_path and os.path.isfile(index_path)) else 0.0,
            respiration_median_filtering=3,
            envelope_ratio=0.25,
            consonant_breath_protection=0.33,
            resample_sr=0
        )

        res_files = loader(
            audio_files=[input_path],
            tag_list=[tag],
            overwrite=True,
            parallel_workers=1,
            type_output="wav",
            show_progress=False
        )

        if not res_files or len(res_files) == 0:
            return {"success": False, "error": "RVC returned empty output"}

        generated_file = res_files[0]
        # If output_path differs from generated_file, move or convert with ffmpeg
        if os.path.abspath(generated_file) != os.path.abspath(output_path):
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            # Use ffmpeg to ensure desired output format (e.g. mp3 or wav)
            cmd = ["ffmpeg", "-y", "-v", "error", "-i", generated_file, output_path]
            subprocess.run(cmd, check=True)
            if generated_file != input_path and os.path.isfile(generated_file) and generated_file != output_path:
                try:
                    os.remove(generated_file)
                except Exception:
                    pass

        dur = get_audio_duration(output_path)
        return {
            "success": True,
            "outputAudio": output_path,
            "duration": dur,
            "size": os.path.getsize(output_path)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def main():
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
                try:
                    # Handle powershell escaped quotes
                    cleaned = input_arg.replace('\\"', '"')
                    data = json.loads(cleaned)
                except Exception:
                    pass

    if data is None and not sys.stdin.isatty():
        try:
            # Only read stdin if select/poll says there's data, or with small timeout
            import msvcrt
            if msvcrt.kbhit():
                stdin_content = sys.stdin.read()
                if stdin_content.strip():
                    data = json.loads(stdin_content)
        except Exception:
            pass

    if not data:
        print(json.dumps({"success": False, "error": "Missing input JSON payload"}))
        sys.exit(1)

    action = data.get("action", "convert")

    # Simple health / readiness check
    if action == "check":
        print(json.dumps({
            "success": True,
            "message": "RVC CPU Worker is ready",
            "device": "cpu"
        }))
        sys.exit(0)

    try:
        from infer_rvc_python import BaseLoader
        # Initialize BaseLoader in CPU mode
        loader = BaseLoader(only_cpu=True)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Failed to initialize BaseLoader: {str(e)}",
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)

    if action == "convert" or action == "preview":
        res = convert_single_audio(loader, data)
        print(json.dumps(res, ensure_ascii=False))

    elif action == "batch_convert":
        tasks = data.get("tasks", [])
        results = []
        for task in tasks:
            task_res = convert_single_audio(loader, task)
            task_res["id"] = task.get("id")
            results.append(task_res)
        print(json.dumps({
            "success": True,
            "count": len(results),
            "results": results
        }, ensure_ascii=False))

    else:
        print(json.dumps({"success": False, "error": f"Unknown action: {action}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
