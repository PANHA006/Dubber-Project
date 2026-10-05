const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');
const { formatTerminalLog } = require('../utils/terminal-logger');

class WhisperService {
  constructor() {
    this.workerPath = path.join(__dirname, '../workers/whisper_transcriber.py');
  }

  /**
   * Resolve Python executable path (centralized in src/config)
   */
  getPythonPath() {
    return config.pythonPath;
  }

  /**
   * Ensure FFmpeg is available in environment PATH for Python/PyAV
   */
  ensureFfmpegInPath() {
    for (const ffmpegDir of config.ffmpegBinDirs) {
      if (!process.env.PATH.includes(ffmpegDir)) {
        process.env.PATH = `${ffmpegDir};${process.env.PATH}`;
      }
    }
  }

  /**
   * Transcribe audio file using Faster-Whisper Python Worker
   * @param {string} audioPath - Path to audio/video file
   * @param {object} options - Options: model, vad, language, apiKey
   * @returns {Promise<Array<{start: string, end: string, originalText: string, khmerText: string, speaker: string}>>}
   */
  async transcribeAudio(audioPath, options = {}) {
    this.ensureFfmpegInPath();
    const pythonExe = this.getPythonPath();
    const modelSize = options.model || process.env.WHISPER_MODEL || 'base';
    const enableVad = options.vad !== false ? '1' : '0';
    const language = options.language || null;
    const customApiKey = options.apiKey || null;

    formatTerminalLog('WHISPER:START', `Starting Faster-Whisper Worker (Model: ${modelSize}, VAD: ${enableVad === '1'})`, {
      audio: path.basename(audioPath),
      python: pythonExe
    });

    const args = [
      '-u', // unbuffered stdout/stderr
      this.workerPath,
      '--audio', audioPath,
      '--model', modelSize,
      '--vad', enableVad,
      '--compute_type', 'int8'
    ];

    if (language) {
      args.push('--language', language);
    }

    if (options.vadThreshold !== undefined && options.vadThreshold !== null) {
      args.push('--vad_threshold', String(options.vadThreshold));
    }
    if (options.maxPauseGap !== undefined && options.maxPauseGap !== null) {
      args.push('--max_pause_gap', String(options.maxPauseGap));
    }
    if (options.maxMergeLimit !== undefined && options.maxMergeLimit !== null) {
      args.push('--max_merge_limit', String(options.maxMergeLimit));
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn(pythonExe, args, {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString('utf-8');
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf-8');
        stderrData += text;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('[PROGRESS:')) {
            const match = line.match(/\[PROGRESS:(\d+)\]\s*(.*)/);
            if (match) {
              const pct = match[1];
              const desc = match[2];
              formatTerminalLog('WHISPER:PROGRESS', `Progress: ${pct}% - ${desc}`);
            }
          } else if (line.startsWith('[INFO]')) {
            formatTerminalLog('WHISPER:INFO', line.replace('[INFO]', '').trim());
          } else if (line.startsWith('[SUCCESS]')) {
            formatTerminalLog('WHISPER:OK', line.replace('[SUCCESS]', '').trim());
          } else if (line.startsWith('[ERROR]')) {
            formatTerminalLog('WHISPER:ERROR', line.replace('[ERROR]', '').trim());
          }
        }
      });

      child.on('error', (err) => {
        formatTerminalLog('WHISPER:FAIL', `Spawn error: ${err.message}`);
        reject(new Error(`Failed to start Whisper worker: ${err.message}`));
      });

      child.on('close', async (code) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (code !== 0) {
          formatTerminalLog('WHISPER:FAIL', `Worker exited with code ${code} (${elapsed}s)`);
          return reject(new Error(`Whisper worker failed (code ${code}): ${stderrData || 'Unknown error'}`));
        }

        try {
          // Parse worker JSON output
          const parsed = JSON.parse(stdoutData.trim());
          if (!parsed.success) {
            return reject(new Error(parsed.error || 'Whisper transcription failed'));
          }

          const segments = parsed.segments || [];
          formatTerminalLog('WHISPER:DONE', `Extracted ${segments.length} discrete segments in ${elapsed}s (Audio Duration: ${parsed.duration}s, Lang: ${parsed.language})`);

          resolve(segments);
        } catch (jsonErr) {
          formatTerminalLog('WHISPER:ERROR', `Failed to parse worker output: ${jsonErr.message}`);
          reject(new Error(`Invalid worker response: ${stdoutData.slice(0, 200)}...`));
        }
      });
    });
  }
}

module.exports = new WhisperService();
