const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const rvcService = require('./rvc.service');
const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');

class TTSService {
  constructor() {
    this.workerPath = path.join(__dirname, '../workers/tts_worker.py');
    this.storageDir = path.join(__dirname, '../../storage/voices');
    this.tempDir = path.join(__dirname, '../../storage/temp');
    this.ensureStorageDir();
    this.cleanupStaleTempPayloads();
  }

  ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Remove tts_payload_*.json files left behind when a worker was killed
   * mid-run. A payload is only needed while the child process is starting up.
   * @param {number} maxAgeMs - maximum age before a payload is considered stale
   */
  cleanupStaleTempPayloads(maxAgeMs = 60 * 60 * 1000) {
    try {
      const now = Date.now();
      for (const file of fs.readdirSync(this.tempDir)) {
        if (!file.startsWith('tts_payload_')) continue;
        const filePath = path.join(this.tempDir, file);
        try {
          if (now - fs.statSync(filePath).mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
          }
        } catch (_) {
          /* ignore individual file errors */
        }
      }
    } catch (_) {
      /* temp dir may not exist yet */
    }
  }

  getPythonPath() {
    return config.pythonPath;
  }

  /**
   * Generate Khmer voice files for an array of subtitle items
   * Supports both standard Edge-TTS and RVC character voice cloning
   * @param {Array<{id: string, khmerText: string, voice?: string, pitchShift?: number}>} items
   * @returns {Promise<{success: boolean, count: number, results: Array}>}
   */
  async generateVoices(items) {
    this.ensureStorageDir();
    this.cleanupStaleTempPayloads();
    if (!Array.isArray(items) || items.length === 0) {
      return { success: true, count: 0, results: [] };
    }

    // Inspect installed RVC models
    let rvcModels = [];
    try {
      rvcModels = await rvcService.listModels();
    } catch (_) {}

    const rvcModelMap = new Map();
    rvcModels.forEach(m => {
      rvcModelMap.set(m.id, m);
      rvcModelMap.set(m.name.toLowerCase(), m);
      rvcModelMap.set(`🎭 ${m.name} (RVC)`.toLowerCase(), m);
    });

    const itemRvcMap = new Map();

    const pythonExe = this.getPythonPath();
    const payload = {
      items: items.map(item => {
        // If oldAudioUrl or oldFilename is provided and exists in storageDir, clean it up if different
        const oldAudio = item.oldAudioUrl || item.oldFilename;
        if (oldAudio) {
          const oldName = path.basename(oldAudio);
          const cleanId = String(item.id).replace(/[:/\\\s]/g, '_');
          const newName = `voice_${cleanId}.mp3`;
          if (oldName !== newName) {
            const oldPath = path.join(this.storageDir, oldName);
            if (fs.existsSync(oldPath)) {
              try { fs.unlinkSync(oldPath); } catch (_) {}
            }
          }
        }

        let targetDuration = item.targetDuration;
        if (targetDuration === undefined && item.startSec !== undefined && item.endSec !== undefined) {
          const s = parseFloat(item.startSec);
          const e = parseFloat(item.endSec);
          if (e > s) {
            targetDuration = Math.round((e - s) * 100) / 100;
          }
        }

        let rawVoice = item.voice || 'Piseth (Male)';
        let baseVoice = rawVoice;

        // Check if an RVC model is requested
        let matchedModel = null;
        if (typeof rawVoice === 'string') {
          const vTrim = rawVoice.trim();
          if (rvcModelMap.has(vTrim)) {
            matchedModel = rvcModelMap.get(vTrim);
          } else if (rvcModelMap.has(vTrim.toLowerCase())) {
            matchedModel = rvcModelMap.get(vTrim.toLowerCase());
          }
        }

        if (matchedModel) {
          itemRvcMap.set(item.id, {
            model: matchedModel,
            pitchShift: item.pitchShift !== undefined ? item.pitchShift : matchedModel.pitchDefault
          });
          // Base Edge TTS matches character gender for the best timbre conversion
          baseVoice = matchedModel.gender === 'Female' ? 'Sreymom (Female)' : 'Piseth (Male)';
        }

        return {
          id: item.id,
          khmerText: (item.khmerText || item.text || '').trim(),
          voice: baseVoice,
          startSec: item.startSec ?? null,
          endSec: item.endSec ?? null,
          targetDuration: targetDuration ?? null,
          oldAudioUrl: item.oldAudioUrl || null,
          oldFilename: item.oldFilename || null
        };
      }),
      outputDir: this.storageDir
    };

    // Write to a temporary payload file to safely handle Unicode on all platforms
    const tempDir = this.tempDir;
    const tempFile = path.join(tempDir, `tts_payload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), 'utf-8');

    formatTerminalLog('TTS:START', `Generating ${items.length} Khmer voice segments via Edge TTS... (RVC characters: ${itemRvcMap.size})`);

    return new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, ['-u', this.workerPath, tempFile], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';
      let stderrBuffer = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf-8');
      });

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf-8');
        stderrBuffer += text;
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop(); // keep partial trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('PROGRESS_JSON:')) {
            try {
              const data = JSON.parse(trimmed.slice('PROGRESS_JSON:'.length));
              formatTerminalProgress('TTS:PROGRESS', data.current, data.total, `Item #${data.current} [${data.id}]`, {
                voice: String(data.voice || '').replace('km-KH-', '').replace('Neural', ''),
                dur: `${data.duration}s`,
                speed: `${data.speed}x`,
                status: data.status
              });
            } catch (_) {}
          } else if (trimmed) {
            stderr += trimmed + '\n';
          }
        }
      });

      proc.on('close', async (code) => {
        // Clean up temp file safely
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (_) {}

        // Flush any remaining buffer line
        if (stderrBuffer && stderrBuffer.trim()) {
          const trimmed = stderrBuffer.trim();
          if (trimmed.startsWith('PROGRESS_JSON:')) {
            try {
              const data = JSON.parse(trimmed.slice('PROGRESS_JSON:'.length));
              formatTerminalProgress('TTS:PROGRESS', data.current, data.total, `Item #${data.current} [${data.id}]`, {
                voice: String(data.voice || '').replace('km-KH-', '').replace('Neural', ''),
                dur: `${data.duration}s`,
                speed: `${data.speed}x`,
                status: data.status
              });
            } catch (_) {}
          } else {
            stderr += trimmed + '\n';
          }
        }

        if (code !== 0) {
          formatTerminalLog('TTS:ERROR', `TTS Worker exited with code ${code}`, { stderr });
          return reject(new Error(`TTS generation failed (code ${code}): ${stderr}`));
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          formatTerminalLog('TTS:SUCCESS', `Generated ${parsed.results?.length || 0} Khmer voice files into storage/voices/`);

          // Apply RVC conversion for character models if requested
          if (itemRvcMap.size > 0 && Array.isArray(parsed.results)) {
            let rvcIdx = 0;
            for (const resItem of parsed.results) {
              if (resItem.success && itemRvcMap.has(resItem.id)) {
                rvcIdx++;
                const rvcInfo = itemRvcMap.get(resItem.id);
                formatTerminalProgress('RVC:PROGRESS', rvcIdx, itemRvcMap.size, `Applying Character Timbre [${rvcInfo.model.name}]...`);
                const originalAudioPath = path.join(this.storageDir, resItem.filename);

                try {
                  const convertedOutput = path.join(this.storageDir, `rvc_${resItem.filename}`);
                  const rvcRes = await rvcService.convertAudio({
                    inputAudio: originalAudioPath,
                    modelId: rvcInfo.model.id,
                    pitchShift: rvcInfo.pitchShift,
                    outputAudio: convertedOutput
                  });

                  if (fs.existsSync(convertedOutput)) {
                    fs.copyFileSync(convertedOutput, originalAudioPath);
                    try { fs.unlinkSync(convertedOutput); } catch (_) {}
                    resItem.duration = rvcRes.duration;
                    resItem.size = rvcRes.size;
                    resItem.voice = `🎭 ${rvcInfo.model.name} (RVC)`;
                    formatTerminalLog('RVC:DONE', `Transformed sub ${resItem.id} to "${rvcInfo.model.name}" (${rvcRes.duration}s)`);
                  }
                } catch (convErr) {
                  formatTerminalLog('RVC:WARN', `RVC conversion for sub ${resItem.id} failed: ${convErr.message}. Preserved clean Edge TTS.`);
                }
              }
            }
          }

          resolve(parsed);
        } catch (parseErr) {
          formatTerminalLog('TTS:ERROR', `Failed to parse TTS JSON output: ${stdout}`, { stderr });
          reject(new Error(`Invalid JSON output from TTS worker: ${stdout}`));
        }
      });

      proc.on('error', (err) => {
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (_) {}
        formatTerminalLog('TTS:ERROR', `Failed to launch TTS Worker: ${err.message}`);
        reject(err);
      });
    });
  }
}

module.exports = new TTSService();
