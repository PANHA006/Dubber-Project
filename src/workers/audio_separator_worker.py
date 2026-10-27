"""
Audio Separator Worker using Hugging Face Spaces (Gradio Client)
Separates speech/vocals from background music (BGM) and sound effects.
Supports:
  1. Multi-space failover pool (automatically tries backup spaces on quota/network error)
  2. Flexible API endpoint resolution (/inference, /predict, default)
  3. HF_TOKEN support for higher GPU quotas
  4. Generous HTTP timeouts to avoid premature read timeouts

Usage:
    python audio_separator_worker.py --payload payload.json
"""

import sys
import os
import json
import argparse
import shutil
import traceback

def call_space_predict(client, audio_path):
    from gradio_client import handle_file
    file_obj = handle_file(audio_path)
    last_err = None

    for ep in ["/inference", "/predict"]:
        try:
            return client.predict(audio=file_obj, api_name=ep)
        except Exception as e:
            last_err = e
            err_msg = str(e).lower()
            if "quota" in err_msg or "rate limit" in err_msg or "timeout" in err_msg:
                raise e

    try:
        return client.predict(file_obj)
    except Exception as e:
        last_err = e

    raise last_err or RuntimeError("Failed to invoke space prediction.")

def separate_audio(input_audio_path, output_bgm_path, output_vocals_path=None, spaces=None, hf_token=None):
    try:
        from gradio_client import Client
    except ImportError:
        return {
            "success": False,
            "error": "gradio_client is not installed in the python environment."
        }

    if not os.path.exists(input_audio_path):
        return {
            "success": False,
            "error": f"Input audio file not found: {input_audio_path}"
        }

    # Normalize candidate spaces
    if not spaces:
        spaces = ["abidlabs/music-separation"]
    elif isinstance(spaces, str):
        spaces = [spaces]

    resolved_token = hf_token or os.environ.get("HF_TOKEN") or None
    errors = []

    for space_name in spaces:
        if not space_name or not space_name.strip():
            continue
        space_name = space_name.strip()
        print(f"[AI-Separator] Attempting AI Stem Separation via Space: {space_name}...", file=sys.stderr)

        try:
            client = Client(space_name, token=resolved_token, httpx_kwargs={"timeout": 180.0})
            print(f"[AI-Separator] Connected to {space_name}. Uploading & separating: {input_audio_path}...", file=sys.stderr)

            result = call_space_predict(client, input_audio_path)

            if not result:
                raise ValueError("Empty response received from AI separator.")

            vocals_temp = None
            bgm_temp = None

            if isinstance(result, (list, tuple)):
                if len(result) >= 2:
                    vocals_temp = result[0]
                    bgm_temp = result[1]
                elif len(result) == 1:
                    bgm_temp = result[0]
            elif isinstance(result, str):
                bgm_temp = result
            elif isinstance(result, dict):
                bgm_temp = result.get("no_vocals") or result.get("instrumental") or result.get("output")
                vocals_temp = result.get("vocals")

            if not bgm_temp or not os.path.exists(str(bgm_temp)):
                raise ValueError(f"Could not locate separated BGM in response: {result}")

            # Ensure target directories exist and copy files
            if output_bgm_path:
                os.makedirs(os.path.dirname(os.path.abspath(output_bgm_path)), exist_ok=True)
                shutil.copy2(bgm_temp, output_bgm_path)
                print(f"[AI-Separator] BGM saved to: {output_bgm_path}", file=sys.stderr)

            if output_vocals_path and vocals_temp and os.path.exists(str(vocals_temp)):
                os.makedirs(os.path.dirname(os.path.abspath(output_vocals_path)), exist_ok=True)
                shutil.copy2(vocals_temp, output_vocals_path)
                print(f"[AI-Separator] Vocals saved to: {output_vocals_path}", file=sys.stderr)

            print(f"[AI-Separator] Separation succeeded using space '{space_name}'.", file=sys.stderr)
            return {
                "success": True,
                "spaceUsed": space_name,
                "bgmPath": output_bgm_path,
                "vocalsPath": output_vocals_path
            }

        except Exception as e:
            err_msg = f"Space '{space_name}' failed: {str(e)}"
            print(f"[AI-Separator] ⚠️ {err_msg}. Checking for next available space...", file=sys.stderr)
            errors.append(err_msg)
            continue

    # If all candidate spaces failed
    return {
        "success": False,
        "error": "All AI spaces in the pool failed: " + " | ".join(errors)
    }

def main():
    parser = argparse.ArgumentParser(description="AI Audio Separator Worker with Multi-Space Pool")
    parser.add_argument("--payload", required=True, help="Path to JSON payload file")
    args = parser.parse_args()

    try:
        with open(args.payload, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"__RESULT_START__{json.dumps({'success': False, 'error': f'Failed to read payload: {str(e)}'})}__RESULT_END__")
        sys.exit(1)

    input_audio = data.get("inputAudio")
    output_bgm = data.get("outputBgm")
    output_vocals = data.get("outputVocals")
    spaces = data.get("spaces") or [data.get("spaceName", "abidlabs/music-separation")]
    hf_token = data.get("hfToken")

    res = separate_audio(input_audio, output_bgm, output_vocals, spaces, hf_token)
    print(f"__RESULT_START__{json.dumps(res)}__RESULT_END__")
    sys.exit(0 if res.get("success") else 1)

if __name__ == "__main__":
    main()
