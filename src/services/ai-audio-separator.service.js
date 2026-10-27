const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('../config');
const pcmMuterService = require('./pcm-muter.service');
const { formatTerminalLog } = require('../utils/terminal-logger');

class AiAudioSeparatorService {
  constructor() {
    this.workerPath = path.join(__dirname, '../workers/audio_separator_worker.py');
    this.cacheDir = path.join(__dirname, '../../storage/cache');
    this.tempDir = path.join(__dirname, '../../storage/temp');
    this.timeoutMs = 15 * 1000; // 15 seconds fast failover timeout per chunk
    this.chunkThresholdSec = 240; // 4 minutes threshold before chunking
    this.chunkDurationSec = 180;  // 3 minutes per chunk for optimal ZeroGPU safety
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  getPythonPath() {
    return config.pythonPath;
  }

  ensureFfmpegInPath() {
    if (config.ffmpegBinDirs) {
      for (const ffmpegDir of config.ffmpegBinDirs) {
        if (!process.env.PATH.includes(ffmpegDir)) {
          process.env.PATH = `${ffmpegDir};${process.env.PATH}`;
        }
      }
    }
  }

  /**
   * Return candidate Hugging Face spaces in priority order (Multi-Space Failover Pool)
   */
  getSpacesPool() {
    const pool = [];
    if (process.env.HF_SEPARATOR_SPACE) {
      pool.push(process.env.HF_SEPARATOR_SPACE.trim());
    }
    if (!pool.includes('abidlabs/music-separation')) {
      pool.push('abidlabs/music-separation');
    }
    if (!pool.includes('cscan/vocal_remover')) {
      pool.push('cscan/vocal_remover');
    }
    return pool;
  }

  /**
   * Compute a unique cache key based on video path and file metadata
   */
  getCacheKey(filePath) {
    try {
      const stat = fs.statSync(filePath);
      const data = `${filePath}_${stat.size}_${stat.mtimeMs}`;
      return crypto.createHash('md5').update(data).digest('hex');
    } catch (_) {
      return crypto.createHash('md5').update(filePath).digest('hex');
    }
  }

  /**
   * Probe audio duration in seconds using ffprobe
   */
  async getAudioDuration(filePath) {
    return new Promise((resolve) => {
      this.ensureFfmpegInPath();
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', () => {
        const dur = parseFloat(out.trim());
        resolve(!isNaN(dur) ? dur : 0);
      });
      proc.on('error', () => resolve(0));
    });
  }

  /**
   * Extract audio track from video to an optimized MP3 file for cloud upload.
   */
  async extractAudioFromVideo(videoPath, outputAudioPath) {
    return new Promise((resolve, reject) => {
      this.ensureFfmpegInPath();
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        outputAudioPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputAudioPath)) {
          resolve(outputAudioPath);
        } else {
          reject(new Error(`FFmpeg failed to extract audio (exit code ${code})`));
        }
      });

      ffmpeg.on('error', (err) => reject(err));
    });
  }

  /**
   * Separate audio into BGM and Vocals using Hugging Face Space Worker with Multi-Space Pool
   */
  async separateWithWorker(inputAudioPath, outputBgmPath, outputVocalsPath = null, hfToken = null) {
    return new Promise((resolve, reject) => {
      const pythonExe = this.getPythonPath();
      const payloadFile = path.join(this.tempDir, `sep_payload_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
      const spacesPool = this.getSpacesPool();

      const payload = {
        inputAudio: inputAudioPath,
        outputBgm: outputBgmPath,
        outputVocals: outputVocalsPath,
        spaces: spacesPool,
        hfToken: hfToken || process.env.HF_TOKEN || null
      };

      fs.writeFileSync(payloadFile, JSON.stringify(payload));

      formatTerminalLog('AI:SEPARATOR_START', `Connecting to AI Stem Separator Pool (${spacesPool.length} candidate spaces)...`, {
        audio: path.basename(inputAudioPath),
        primarySpace: spacesPool[0],
        poolSize: spacesPool.length,
        hasHfToken: Boolean(payload.hfToken)
      });

      const worker = spawn(pythonExe, ['-u', this.workerPath, '--payload', payloadFile]);

      let stdout = '';
      let stderr = '';
      let isSettled = false;

      // Timeout watchdog
      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try { worker.kill('SIGTERM'); } catch (_) {}
          try { fs.unlinkSync(payloadFile); } catch (_) {}
          reject(new Error(`AI stem separator timed out after ${this.timeoutMs / 1000}s`));
        }
      }, this.timeoutMs);

      worker.stdout.on('data', (d) => { stdout += d.toString(); });
      worker.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) formatTerminalLog('AI:SEPARATOR_INFO', msg);
        stderr += d.toString();
      });

      worker.on('close', (code) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);

        try { fs.unlinkSync(payloadFile); } catch (_) {}

        if (code === 0) {
          try {
            let jsonStr = stdout.trim();
            const startTag = '__RESULT_START__';
            const endTag = '__RESULT_END__';
            if (jsonStr.includes(startTag) && jsonStr.includes(endTag)) {
              jsonStr = jsonStr.substring(jsonStr.indexOf(startTag) + startTag.length, jsonStr.indexOf(endTag));
            } else {
              const startIdx = jsonStr.indexOf('{');
              const endIdx = jsonStr.lastIndexOf('}');
              if (startIdx !== -1 && endIdx !== -1) {
                jsonStr = jsonStr.substring(startIdx, endIdx + 1);
              }
            }
            const result = JSON.parse(jsonStr);
            if (result.success && fs.existsSync(outputBgmPath)) {
              formatTerminalLog('AI:SEPARATOR_DONE', `✅ AI Audio Separation Complete via [${result.spaceUsed || 'Cloud Space'}]: Pristine BGM preserved.`);
              return resolve(result);
            }
            return reject(new Error(result.error || 'Failed to separate audio'));
          } catch (e) {
            return reject(new Error(`Worker output parse error: ${e.message}`));
          }
        } else {
          return reject(new Error(`Audio separator worker exited with code ${code}: ${stderr}`));
        }
      });

      worker.on('error', (err) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        try { fs.unlinkSync(payloadFile); } catch (_) {}
        reject(err);
      });
    });
  }

  /**
   * Slice audio into chunks, separate each chunk, and concat back together.
   * Eliminates GPU timeout for long videos.
   */
  async separateWithChunking(fullAudioPath, finalBgmPath, cacheKey, hfToken = null) {
    const totalDuration = await this.getAudioDuration(fullAudioPath);
    const chunkCount = Math.ceil(totalDuration / this.chunkDurationSec);

    formatTerminalLog('AI:CHUNKING_START', `Audio duration is ${(totalDuration / 60).toFixed(1)} mins. Slicing into ${chunkCount} chunks (${this.chunkDurationSec}s each)...`);

    const chunkBgmFiles = [];
    const tempFiles = [];

    try {
      for (let i = 0; i < chunkCount; i++) {
        const startSec = i * this.chunkDurationSec;
        const chunkAudio = path.join(this.tempDir, `chunk_${cacheKey}_${i}.mp3`);
        const chunkBgm = path.join(this.tempDir, `bgm_chunk_${cacheKey}_${i}.wav`);
        tempFiles.push(chunkAudio, chunkBgm);

        // Slice chunk
        await new Promise((res, rej) => {
          const s = spawn('ffmpeg', [
            '-y',
            '-ss', String(startSec),
            '-t', String(this.chunkDurationSec),
            '-i', fullAudioPath,
            '-c:a', 'copy',
            chunkAudio
          ]);
          s.on('close', code => (code === 0 ? res() : rej(new Error(`Chunk slice failed (${code})`))));
          s.on('error', rej);
        });

        formatTerminalLog('AI:CHUNK_SEPARATE', `Processing Chunk #${i + 1}/${chunkCount} [${startSec}s - ${Math.min(totalDuration, startSec + this.chunkDurationSec).toFixed(0)}s]...`);
        await this.separateWithWorker(chunkAudio, chunkBgm, null, hfToken);
        chunkBgmFiles.push(chunkBgm);
      }

      // Concat all BGM chunks using FFmpeg concat
      const concatListFile = path.join(this.tempDir, `concat_${cacheKey}.txt`);
      tempFiles.push(concatListFile);
      const listContent = chunkBgmFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(concatListFile, listContent, 'utf-8');

      await new Promise((res, rej) => {
        const c = spawn('ffmpeg', [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListFile,
          '-c:a', 'pcm_s16le',
          finalBgmPath
        ]);
        c.on('close', code => (code === 0 && fs.existsSync(finalBgmPath) ? res() : rej(new Error('Concat failed'))));
        c.on('error', rej);
      });

      formatTerminalLog('AI:CHUNKING_DONE', `✅ Successfully separated and re-stitched all ${chunkCount} BGM chunks!`);
      return finalBgmPath;
    } finally {
      // Clean up temporary chunks
      tempFiles.forEach(f => {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
      });
    }
  }

  /**
   * Extract and isolate background music (BGM) while muting the original voice.
   * Complete Defensive Architecture:
   *  1. High-speed caching (instant response for repeat renders)
   *  2. Audio Chunking engine for long video protection
   *  3. Multi-Space Failover Pool
   *  4. Transparent fallback to PCM muter if completely offline
   */
  async extractAndIsolateBgm({ videoPath, subtitles = [], settings = {} }) {
    this.ensureDirs();
    const cacheKey = this.getCacheKey(videoPath);
    const cachedBgmPath = path.join(this.cacheDir, `bgm_isolated_${cacheKey}.wav`);

    // 1. Check Cache (Isolated BGM or Ducked BGM)
    if (fs.existsSync(cachedBgmPath) && fs.statSync(cachedBgmPath).size > 1000) {
      formatTerminalLog('AI:CACHE_HIT', `Found pre-separated AI BGM in cache (0s delay): ${path.basename(cachedBgmPath)}`);
      return cachedBgmPath;
    }
    const duckKey = `bgm_ducked_${cacheKey}_vol${settings.bgVolume ?? 15}.wav`;
    const duckedCachedPath = path.join(this.cacheDir, duckKey);
    if (fs.existsSync(duckedCachedPath) && fs.statSync(duckedCachedPath).size > 1000) {
      formatTerminalLog('AI:CACHE_HIT', `Found pre-ducked BGM in cache (0s delay): ${path.basename(duckedCachedPath)}`);
      return duckedCachedPath;
    }

    // 2. Extract Optimized Audio from Video
    const tempExtractedAudio = path.join(this.tempDir, `raw_audio_${cacheKey}.mp3`);
    try {
      await this.extractAudioFromVideo(videoPath, tempExtractedAudio);

      const duration = await this.getAudioDuration(tempExtractedAudio);

      // 3. Decide Single Pass vs Chunking Engine
      if (duration > this.chunkThresholdSec) {
        await this.separateWithChunking(tempExtractedAudio, cachedBgmPath, cacheKey, settings.hfToken);
      } else {
        await this.separateWithWorker(tempExtractedAudio, cachedBgmPath, null, settings.hfToken);
      }

      // Clean up raw extracted audio
      try { fs.unlinkSync(tempExtractedAudio); } catch (_) {}

      return cachedBgmPath;
    } catch (err) {
      formatTerminalLog('AI:FALLBACK', `⚠️ AI Separator pool unavailable or network error: ${err.message}. Falling back to standard PCM muter.`);
      try { if (fs.existsSync(tempExtractedAudio)) fs.unlinkSync(tempExtractedAudio); } catch (_) {}

      // Fallback seamlessly to pcm-muter so rendering never fails!
      const fallbackAudio = await pcmMuterService.extractAndMuteBackgroundAudio({
        videoPath,
        subtitles,
        settings
      });

      // Cache fallback result with ducked key so it does not overwrite pure stem cache
      const duckKey = `bgm_ducked_${cacheKey}_vol${settings.bgVolume ?? 15}.wav`;
      const duckedCachedPath = path.join(this.cacheDir, duckKey);
      try {
        fs.copyFileSync(fallbackAudio, duckedCachedPath);
        return duckedCachedPath;
      } catch (_) {
        return fallbackAudio;
      }
    }
  }
}

module.exports = new AiAudioSeparatorService();
