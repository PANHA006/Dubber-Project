const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');
const historyService = require('./history.service');
const pcmMuterService = require('./pcm-muter.service');
const aiAudioSeparatorService = require('./ai-audio-separator.service');

/**
 * Report FFmpeg's own progress while a long render runs.
 *
 * FFmpeg is spawned with `-progress pipe:1 -nostats`, which streams
 * `key=value` lines to stdout every ~0.5s. Without this the final mux is a
 * black box: it can run for minutes on a long video while the log sits silent
 * after "Spawning FFmpeg dubbing pipeline", which looks exactly like a hang.
 *
 * The parser reads `out_time_us` (falling back to `out_time_ms`, which FFmpeg
 * actually reports in microseconds despite the name) and turns it into a
 * percentage of the expected duration.
 *
 * @param {ChildProcess} proc - the spawned ffmpeg process
 * @param {Object} options
 * @param {number} options.totalDuration - expected output duration in seconds
 * @param {string} options.label - message shown next to the bar
 * @param {string} [options.tag] - log category
 * @param {Object} [options.details] - extra detail fields for every tick
 * @returns {() => void} call to stop reporting (e.g. right before completion)
 */
function trackFFmpegProgress(proc, { totalDuration = 0, label = 'Muxing...', tag = 'RENDER:MUX', details = {} } = {}) {
  if (!proc || !proc.stdout) return () => {};

  const startedAt = Date.now();
  let buffer = '';
  let outSeconds = 0;
  let lastEmit = 0;
  let stopped = false;

  const emit = (force = false) => {
    if (stopped || !(totalDuration > 0)) return;
    const now = Date.now();
    // Throttle to one line per second so the terminal stays readable.
    if (!force && now - lastEmit < 1000) return;
    lastEmit = now;

    const pct = Math.max(0, Math.min(99, Math.round((outSeconds / totalDuration) * 100)));
    const elapsedSec = (now - startedAt) / 1000;
    let etaText = '--';
    if (outSeconds > 0.5 && elapsedSec > 1) {
      const speed = outSeconds / elapsedSec;             // media seconds per wall second
      if (speed > 0) {
        const remaining = Math.max(0, (totalDuration - outSeconds) / speed);
        etaText = remaining >= 60
          ? `${Math.floor(remaining / 60)}m ${Math.round(remaining % 60)}s`
          : `${Math.round(remaining)}s`;
      }
    }

    formatTerminalProgress(tag, pct, 100, label, {
      ...details,
      progress: `${outSeconds.toFixed(1)}s / ${totalDuration.toFixed(1)}s`,
      speed: outSeconds > 0.5 && elapsedSec > 1 ? `${(outSeconds / elapsedSec).toFixed(1)}x` : '--',
      eta: etaText
    });
  };

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the trailing partial line

    // Only report when this chunk actually completed a progress line —
    // otherwise a chunk that ends mid-line would emit a stale value.
    let updated = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('out_time_us=') || trimmed.startsWith('out_time_ms=')) {
        const micros = parseFloat(trimmed.split('=')[1]);
        if (!isNaN(micros)) {
          outSeconds = micros / 1e6;
          updated = true;
        }
      } else if (trimmed === 'progress=end') {
        outSeconds = totalDuration;
        updated = true;
      }
    }
    if (updated) emit();
  });

  return () => { stopped = true; };
}

class VideoRendererService {
  constructor() {
    this.videoStorageDir = path.join(__dirname, '../../storage/videos');
    this.voiceStorageDir = path.join(__dirname, '../../storage/voices');
    this.exportStorageDir = path.join(__dirname, '../../storage/exports');
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.videoStorageDir)) {
      fs.mkdirSync(this.videoStorageDir, { recursive: true });
    }
    if (!fs.existsSync(this.voiceStorageDir)) {
      fs.mkdirSync(this.voiceStorageDir, { recursive: true });
    }
    if (!fs.existsSync(this.exportStorageDir)) {
      fs.mkdirSync(this.exportStorageDir, { recursive: true });
    }
  }

  /**
   * Resolve an absolute filesystem path from a URL or relative path
   */
  resolveVideoPath(videoUrl) {
    if (!videoUrl) return null;
    const cleanUrl = String(videoUrl).split('?')[0].split('#')[0];
    if (path.isAbsolute(cleanUrl) && fs.existsSync(cleanUrl)) {
      return cleanUrl;
    }
    // Check if it's in storage/videos or storage/exports
    const basename = path.basename(cleanUrl);
    const videoPath = path.join(this.videoStorageDir, basename);
    if (fs.existsSync(videoPath)) {
      return videoPath;
    }
    const exportPath = path.join(this.exportStorageDir, basename);
    if (fs.existsSync(exportPath)) {
      return exportPath;
    }
    // Check if path is relative from project root
    const rootRelative = path.join(__dirname, '../../', cleanUrl.replace(/^\//, ''));
    if (fs.existsSync(rootRelative)) {
      return rootRelative;
    }
    return null;
  }

  resolveAudioPath(audioUrl) {
    if (!audioUrl) return null;
    const cleanUrl = String(audioUrl).split('?')[0].split('#')[0];
    if (path.isAbsolute(cleanUrl) && fs.existsSync(cleanUrl)) {
      return cleanUrl;
    }
    const basename = path.basename(cleanUrl);
    const localPath = path.join(this.voiceStorageDir, basename);
    if (fs.existsSync(localPath)) {
      return localPath;
    }
    const rootRelative = path.join(__dirname, '../../', cleanUrl.replace(/^\//, ''));
    if (fs.existsSync(rootRelative)) {
      return rootRelative;
    }
    return null;
  }

  /**
   * Check if a media file has an audio stream using ffprobe
   */
  async hasAudioStream(filePath) {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_type',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);
      let output = '';
      ffprobe.stdout.on('data', chunk => { output += chunk.toString(); });
      ffprobe.on('close', () => {
        resolve(output.trim().length > 0);
      });
      ffprobe.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get duration of video using ffprobe
   */
  async getDuration(filePath) {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);
      let output = '';
      ffprobe.stdout.on('data', chunk => { output += chunk.toString(); });
      ffprobe.on('close', () => {
        const val = parseFloat(output.trim());
        resolve(isNaN(val) ? 0 : val);
      });
      ffprobe.on('error', () => {
        resolve(0);
      });
    });
  }

  /**
   * Render Dubbed Video combining original video, ducked/muted audio, and timed Khmer voices
   * @param {Object} options
   * @param {string} options.videoUrl
   * @param {Array} options.subtitles
   * @param {Object} options.settings
   * @returns {Promise<{success: boolean, dubbedVideoUrl: string, filename: string, sizeMb: number, duration: number}>}
   */
  async renderDubbedVideo({ videoUrl, subtitles = [], settings = {} }) {
    this.ensureDirs();

    const videoPath = this.resolveVideoPath(videoUrl);
    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error(`Video file not found or inaccessible: ${videoUrl}`);
    }

    const videoDuration = await this.getDuration(videoPath);
    const videoHasAudio = await this.hasAudioStream(videoPath);

    // Filter valid subtitles with existing audio files
    const validVoices = [];
    for (const sub of subtitles) {
      if (!sub) continue;
      const audioPath = this.resolveAudioPath(sub.audioUrl);
      if (audioPath && fs.existsSync(audioPath)) {
        const startSec = Math.max(0, parseFloat(sub.startSec ?? sub.start ?? 0) || 0);
        const endSec = sub.endSec !== undefined && sub.endSec !== null
          ? Math.max(startSec + 0.5, parseFloat(sub.endSec))
          : (sub.end ? Math.max(startSec + 0.5, parseFloat(sub.end)) : (startSec + 2.5));

        validVoices.push({
          id: sub.id,
          audioPath,
          startSec,
          endSec,
          delayMs: Math.round(startSec * 1000)
        });
      }
    }

    if (subtitles.length > 0 && validVoices.length === 0) {
      throw new Error(`រកមិនឃើញឯកសារសំឡេងខ្មែរ (Voice audio clips) សម្រាប់បញ្ចូលក្នុងវីដេអូទេ! សូមពិនិត្យមើលសំឡេង ឬចុច 'Generate Voice' ម្តងទៀត។`);
    }

    const dubVolMult = typeof settings.dubVolume === 'number' ? settings.dubVolume : 1.0;
    const videoVolMult = typeof settings.videoVolume === 'number' ? settings.videoVolume : 1.0;
    const removeSpoken = settings.removeSpoken !== false;
    const bgVolumePct = typeof settings.bgVolume === 'number' ? settings.bgVolume : 8;

    formatTerminalLog('VIDEO:RENDER_START', `Starting dubbed video render...`, {
      video: path.basename(videoPath),
      duration: `${videoDuration.toFixed(1)}s`,
      voiceClips: validVoices.length,
      removeSpoken,
      bgVolume: `${bgVolumePct}%`
    });

    formatTerminalProgress('RENDER:PROGRESS', 1, 4, `Validating media & pre-mixing voice clips...`, {
      clips: validVoices.length,
      video: path.basename(videoPath)
    });

    const outputFilename = `dubbed_${Date.now()}_${path.basename(videoPath, path.extname(videoPath))}.mp4`;
    const outputPath = path.join(this.videoStorageDir, outputFilename);

    // STAGE 1: Pre-mix voice clips into a synchronized master voice track
    // Chunks voice clips in batches of 35 to prevent Windows command-line limit (spawn ENAMETOOLONG)
    let masterVoiceData = null;
    if (validVoices.length > 0) {
      masterVoiceData = await this.assembleMasterVoiceTrack(validVoices, dubVolMult, videoDuration);
    }

    const tempCleanups = masterVoiceData ? [...masterVoiceData.tempFiles] : [];

    try {
      // STAGE 2: Combine Original Video + PCM Muted Background + Master Voice Track
      // `-progress pipe:1 -nostats` streams machine-readable progress to stdout so
      // this long stage can report a live percentage instead of going silent.
      const ffmpegArgs = ['-y', '-progress', 'pipe:1', '-nostats', '-i', videoPath];
      const filterComplex = [];
      const extraAudioInputs = [];
      let finalAudioMap = null;

      if (masterVoiceData && masterVoiceData.masterVoicePath) {
        if (videoHasAudio) {
          if (removeSpoken) {
            // Step 1: Feature BGM resolves background audio from video -> BGM_resolve
            // Step 2: Feature Mute Voice mutes speech intervals in BGM_resolve by 100% (0x00 silence)
            // with padBefore: 0.25s and padAfter: 0.25s
            const padBefore = typeof settings.padBefore === 'number' ? settings.padBefore : 0.25;
            const padAfter = typeof settings.padAfter === 'number' ? settings.padAfter : 0.25;
            // Smart Audio Ducking: If user enabled BGM, duck original speech down to subtle level (e.g. 10-15%)
            // so movie soundtrack & sound effects continue smoothly without 93% silence holes.
            const duckLevelPct = bgVolumePct > 0 ? Math.max(5, Math.min(25, Math.round(bgVolumePct * 0.25))) : 0;

            formatTerminalProgress('RENDER:PROGRESS', 2, 4, `Extracting BGM_resolve & applying smart voice ducking (${duckLevelPct}%)...`, {
              status: 'ENABLED',
              duckLevel: `${duckLevelPct}% (Smooth BGM)`,
              padBuffer: '±0.25s'
            });

            formatTerminalLog('MUTE:PROCESS', `🎙️ SMART AUDIO DUCKING & VOICE ISOLATION: Dialogue ducked to ${duckLevelPct}% (full ${bgVolumePct}% outside speech) [±${padBefore}s buffer]`, {
              status: 'ENABLED',
              voiceSegmentsCount: validVoices.length,
              duckLevel: `${duckLevelPct}%`,
              bgVolumeOutsideSpeech: `${bgVolumePct}%`,
              padBefore: `${padBefore}s`,
              padAfter: `${padAfter}s`
            });

            if (validVoices.length <= 3) {
              validVoices.forEach((v, idx) => {
                const s = Math.max(0, (v.startSec || 0) - padBefore).toFixed(2);
                const e = Math.max(v.startSec + 0.5, (v.endSec || (v.startSec + 2.0)) + padAfter).toFixed(2);
                formatTerminalLog('MUTE:SEGMENT', `  ↳ Segment #${idx + 1} [${s}s -> ${e}s]: Original voice ducked to ${duckLevelPct}%`);
              });
            } else {
              const firstS = Math.max(0, (validVoices[0].startSec || 0) - padBefore).toFixed(2);
              const lastE = Math.max(validVoices[validVoices.length - 1].startSec + 0.5, (validVoices[validVoices.length - 1].endSec || 0) + padAfter).toFixed(2);
              formatTerminalLog('MUTE:SUMMARY', `Smart-ducked all ${validVoices.length} speech segments from ${firstS}s to ${lastE}s (continuous background audio)`);
            }

            const mutedBgmPath = await aiAudioSeparatorService.extractAndIsolateBgm({
              videoPath,
              subtitles: validVoices,
              settings: { bgVolume: duckLevelPct, padBefore, padAfter, hfToken: settings ? settings.hfToken : null }
            });
            // Only cleanup if it is a temporary scratch file and not a persistent cached BGM
            if (!mutedBgmPath.includes('cache')) {
              tempCleanups.push(mutedBgmPath);
            }

            ffmpegArgs.push('-i', mutedBgmPath);
            extraAudioInputs.push(mutedBgmPath);

            ffmpegArgs.push('-i', masterVoiceData.masterVoicePath);
            extraAudioInputs.push(masterVoiceData.masterVoicePath);

            // Outside speech, scale background audio to bgVolumePct (e.g. 15% -> 0.15)
            const bgScale = ((Math.max(0, Math.min(100, bgVolumePct)) / 100) * videoVolMult);
            filterComplex.push(`[1:a]volume=${bgScale.toFixed(3)}[bgm_vol]`);
            filterComplex.push(`[bgm_vol][2:a]amix=inputs=2:dropout_transition=0:normalize=0[final_audio]`);
            finalAudioMap = '[final_audio]';
          } else {
            // Mute Voice is OFF, so the original track is kept — but it must still
            // obey the BGM slider. That track holds the speech AND the music
            // together and they cannot be separated, so the BGM level scales the
            // whole thing. Without this the slider was a silent no-op whenever
            // Mute Voice was OFF: BGM 0% still played the original at 100%.
            const bgScale = ((Math.max(0, Math.min(100, bgVolumePct)) / 100) * videoVolMult);
            formatTerminalLog('MUTE:PROCESS', `🔊 MUTE ORIGINAL VOICE is DISABLED (removeSpoken: false). Original audio scaled to ${bgVolumePct}%${bgVolumePct === 0 ? ' (complete silence)' : ''}.`, {
              bgVolume: `${bgVolumePct}%`,
              appliedGain: bgScale.toFixed(3),
              note: 'original speech + music are inseparable in this mode'
            });
            ffmpegArgs.push('-i', masterVoiceData.masterVoicePath);
            extraAudioInputs.push(masterVoiceData.masterVoicePath);

            filterComplex.push(`[0:a]volume=${bgScale.toFixed(3)}[orig_aud]`);
            filterComplex.push(`[orig_aud][1:a]amix=inputs=2:dropout_transition=0:normalize=0[final_audio]`);
            finalAudioMap = '[final_audio]';
          }
        } else {
          // Video has no audio: use master voice track only
          ffmpegArgs.push('-i', masterVoiceData.masterVoicePath);
          extraAudioInputs.push(masterVoiceData.masterVoicePath);
          finalAudioMap = '1:a';
        }
      } else {
        // No dub voices
        if (videoHasAudio) {
          filterComplex.push(`[0:a]volume=${videoVolMult.toFixed(3)}[orig_aud]`);
          finalAudioMap = '[orig_aud]';
        } else {
          filterComplex.push(`anullsrc=r=44100:cl=stereo[silent_audio]`);
          finalAudioMap = '[silent_audio]';
        }
      }

      if (filterComplex.length > 0) {
        ffmpegArgs.push('-filter_complex', filterComplex.join('; '));
      }

      // Mapping streams
      ffmpegArgs.push('-map', '0:v:0');
      if (finalAudioMap) {
        ffmpegArgs.push('-map', finalAudioMap);
      }

      // Encoding parameters
      const isMp4 = path.extname(videoPath).toLowerCase() === '.mp4';
      if (isMp4) {
        ffmpegArgs.push('-c:v', 'copy');
      } else {
        ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23');
      }

      ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
      if (videoDuration > 0) {
        ffmpegArgs.push('-t', videoDuration.toFixed(3));
      }
      ffmpegArgs.push(outputPath);

      formatTerminalProgress('RENDER:PROGRESS', 3, 4, `Muxing final video and audio stream...`, {
        voiceCount: validVoices.length,
        out: outputFilename
      });

      formatTerminalLog('FFMPEG:COMMAND', `Spawning FFmpeg dubbing pipeline (cmd length: ${ffmpegArgs.join(' ').length} chars)`, {
        voiceCount: validVoices.length,
        out: outputFilename
      });

      return await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ffmpegArgs);
        let stderr = '';

        // Live progress bar for the whole mux, so a multi-minute stage on a long
        // video no longer looks frozen.
        const stopProgress = trackFFmpegProgress(proc, {
          totalDuration: videoDuration,
          label: 'Muxing final video and audio stream...',
          tag: 'RENDER:MUX',
          details: { out: outputFilename }
        });

        proc.stderr.on('data', chunk => {
          stderr += chunk.toString();
        });

        proc.on('close', async (code) => {
          stopProgress();
          if (code !== 0) {
            const copyFailure = stderr.includes('could not find tag')
              || stderr.includes('Invalid argument')
              || stderr.includes('not supported');
            if (isMp4 && copyFailure) {
              formatTerminalLog('FFMPEG:FALLBACK', 'Re-trying render with libx264 transcoding...');
              try {
                const fallbackResult = await this.renderWithTranscode({
                  videoPath,
                  extraAudioInputs,
                  finalAudioMap,
                  filterComplex,
                  videoDuration,
                  outputPath,
                  outputFilename
                });
                return resolve(fallbackResult);
              } catch (fbErr) {
                return reject(fbErr);
              }
            }
            formatTerminalLog('FFMPEG:ERROR', `FFmpeg render failed (code ${code})`, { stderr: stderr.slice(-400) });
            return reject(new Error(`FFmpeg video render failed: ${stderr.slice(-300)}`));
          }

          const stats = fs.statSync(outputPath);
          const sizeMb = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
          const dubbedVideoUrl = `/storage/videos/${outputFilename}`;

          formatTerminalProgress('RENDER:PROGRESS', 4, 4, `Render complete! Output: ${outputFilename} (${sizeMb} MB)`);
          formatTerminalLog('VIDEO:RENDER_SUCCESS', `Render complete! Output: ${outputFilename} (${sizeMb} MB)`);

          try {
            historyService.addRecord({
              type: 'dubbed',
              fileName: outputFilename,
              filePath: outputPath,
              url: dubbedVideoUrl,
              sizeMb,
              quality: 'dubbed',
              originalName: path.basename(videoPath)
            });
          } catch (_) {}

          resolve({
            success: true,
            dubbedVideoUrl,
            filename: outputFilename,
            sizeMb,
            duration: videoDuration
          });
        });

        proc.on('error', (err) => {
          formatTerminalLog('FFMPEG:ERROR', `Failed to execute FFmpeg: ${err.message}`);
          reject(err);
        });
      });
    } finally {
      // Auto-cleanup all temporary stem and master voice files
      tempCleanups.forEach(f => {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch (_) {}
      });
    }
  }

  /**
   * Assembles multiple timed voice clips into a single master voice track.
   * Chunks clips into batches of up to BATCH_SIZE (35) to prevent Windows
   * command-line buffer overflow (spawn ENAMETOOLONG).
   */
  async assembleMasterVoiceTrack(validVoices, dubVolMult = 1.0, videoDuration = 0) {
    if (!validVoices || validVoices.length === 0) {
      return null;
    }

    const BATCH_SIZE = 35;
    const tempFiles = [];

    try {
      const renderBatch = async (batchClips, batchIdx) => {
        const batchOutFilename = `temp_stem_${Date.now()}_${batchIdx}.wav`;
        const batchOutPath = path.join(this.voiceStorageDir, batchOutFilename);
        tempFiles.push(batchOutPath);

        const args = ['-y'];
        const filterComplex = [];
        const mixInputs = [];

        batchClips.forEach((v, idx) => {
          args.push('-i', v.audioPath);
          const delay = Math.max(0, v.delayMs || 0);
          const label = `b${idx}`;
          filterComplex.push(`[${idx}:a]adelay=${delay}|${delay},volume=${dubVolMult.toFixed(3)}[${label}]`);
          mixInputs.push(`[${label}]`);
        });

        if (mixInputs.length > 1) {
          filterComplex.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:dropout_transition=0:normalize=0[batch_out]`);
          args.push('-filter_complex', filterComplex.join('; '), '-map', '[batch_out]');
        } else {
          filterComplex.push(`${mixInputs[0]}anull[batch_out]`);
          args.push('-filter_complex', filterComplex.join('; '), '-map', '[batch_out]');
        }

        args.push('-c:a', 'pcm_s16le');
        if (videoDuration > 0) {
          args.push('-t', videoDuration.toFixed(3));
        }
        args.push(batchOutPath);

        await new Promise((resolve, reject) => {
          const proc = spawn('ffmpeg', args);
          let errStr = '';
          proc.stderr.on('data', chunk => { errStr += chunk.toString(); });
          proc.on('close', code => {
            if (code !== 0) {
              return reject(new Error(`Batch ${batchIdx} audio render failed: ${errStr.slice(-250)}`));
            }
            resolve(batchOutPath);
          });
          proc.on('error', reject);
        });

        return batchOutPath;
      };

      // 1. If voices <= BATCH_SIZE, render directly to 1 master track
      if (validVoices.length <= BATCH_SIZE) {
        const singleStem = await renderBatch(validVoices, 0);
        return { masterVoicePath: singleStem, tempFiles };
      }

      // 2. If voices > BATCH_SIZE (e.g. 270 clips):
      const batches = [];
      for (let i = 0; i < validVoices.length; i += BATCH_SIZE) {
        batches.push(validVoices.slice(i, i + BATCH_SIZE));
      }

      formatTerminalLog('AUDIO:STEM_BATCHING', `Chunking ${validVoices.length} voice clips into ${batches.length} stems (max ${BATCH_SIZE}/stem) to prevent command-line overflow...`);

      const batchStemPaths = [];
      for (let b = 0; b < batches.length; b++) {
        formatTerminalProgress('RENDER:STEMS', b + 1, batches.length, `Mixing Audio Stem ${b + 1}/${batches.length}...`, {
          batch: `${b + 1}/${batches.length}`,
          clips: `${batches[b].length} clips`
        });
        const stemPath = await renderBatch(batches[b], b);
        batchStemPaths.push(stemPath);
      }

      // Mix all batch stems into one final master voice track
      const masterPath = path.join(this.voiceStorageDir, `master_voice_${Date.now()}.wav`);
      tempFiles.push(masterPath);

      const mergeArgs = ['-y'];
      batchStemPaths.forEach(sp => {
        mergeArgs.push('-i', sp);
      });
      mergeArgs.push('-filter_complex', `amix=inputs=${batchStemPaths.length}:dropout_transition=0:normalize=0[master_out]`);
      mergeArgs.push('-map', '[master_out]', '-c:a', 'pcm_s16le');
      if (videoDuration > 0) {
        mergeArgs.push('-t', videoDuration.toFixed(3));
      }
      mergeArgs.push(masterPath);

      await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', mergeArgs);
        let errStr = '';
        proc.stderr.on('data', chunk => { errStr += chunk.toString(); });
        proc.on('close', code => {
          if (code !== 0) {
            return reject(new Error(`Failed to mix audio stems: ${errStr.slice(-250)}`));
          }
          resolve(masterPath);
        });
        proc.on('error', reject);
      });

      return { masterVoicePath: masterPath, tempFiles };
    } catch (err) {
      tempFiles.forEach(f => {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
      });
      throw err;
    }
  }

  /**
   * Fallback re-encode when stream copy fails
   */
  async renderWithTranscode({ videoPath, extraAudioInputs = [], filterComplex, finalAudioMap, videoDuration, outputPath, outputFilename }) {
    return new Promise((resolve, reject) => {
      const args = ['-y', '-progress', 'pipe:1', '-nostats', '-i', videoPath];
      extraAudioInputs.forEach(inputPath => {
        if (inputPath && fs.existsSync(inputPath)) {
          args.push('-i', inputPath);
        }
      });
      if (filterComplex && filterComplex.length > 0) {
        args.push('-filter_complex', filterComplex.join('; '));
      }
      args.push('-map', '0:v:0');
      if (finalAudioMap) {
        args.push('-map', finalAudioMap);
      }
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-c:a', 'aac', '-b:a', '192k');
      if (videoDuration > 0) {
        args.push('-t', videoDuration.toFixed(3));
      }
      args.push(outputPath);

      const proc = spawn('ffmpeg', args);
      let stderr = '';

      const stopProgress = trackFFmpegProgress(proc, {
        totalDuration: videoDuration,
        label: 'Transcoding final video and audio stream...',
        tag: 'RENDER:MUX',
        details: { out: outputFilename, mode: 'libx264 fallback' }
      });

      proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
      proc.on('close', code => {
        stopProgress();
        if (code !== 0) {
          return reject(new Error(`FFmpeg transcode failed (code ${code}): ${stderr.slice(-300)}`));
        }
        const stats = fs.statSync(outputPath);
        const sizeMb = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
        const dubbedVideoUrl = `/storage/videos/${outputFilename}`;

        try {
          historyService.addRecord({
            type: 'dubbed',
            fileName: outputFilename,
            filePath: outputPath,
            url: dubbedVideoUrl,
            sizeMb,
            quality: 'dubbed',
            originalName: path.basename(videoPath)
          });
        } catch (_) {}

        resolve({
          success: true,
          dubbedVideoUrl,
          filename: outputFilename,
          sizeMb,
          duration: videoDuration
        });
      });
      proc.on('error', reject);
    });
  }

  /**
   * Export video with customized name, destination path, and quality
   * @param {Object} options
   * @param {string} options.sourceVideoUrl - URL or path of the dubbed or source video
   * @param {string} options.fileName - Desired file name (e.g., my_dubbed_movie.mp4)
   * @param {string} options.exportPath - Custom directory path or relative path
   * @param {string} options.quality - 'original', 'high', '720p', '4k'
   */
  async exportDubbedVideo({ sourceVideoUrl, fileName = '', exportPath = '', quality = 'original' }) {
    this.ensureDirs();

    const sourcePath = this.resolveVideoPath(sourceVideoUrl);
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error(`Source video not found for export: ${sourceVideoUrl}`);
    }

    // Determine target directory
    let targetDir = this.exportStorageDir;
    if (exportPath && exportPath.trim()) {
      const trimmed = exportPath.trim();
      if (path.isAbsolute(trimmed)) {
        targetDir = trimmed;
      } else {
        targetDir = path.join(__dirname, '../../', trimmed);
      }
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Sanitize file name
    let cleanName = (fileName || '').trim().replace(/[<>:"/\\|?*]/g, '_');
    if (!cleanName) {
      cleanName = `dubbed_export_${Date.now()}.mp4`;
    } else if (!cleanName.toLowerCase().endsWith('.mp4')) {
      cleanName += '.mp4';
    }

    const targetFilePath = path.join(targetDir, cleanName);

    formatTerminalLog('VIDEO:EXPORT_START', `Exporting video: ${cleanName}`, {
      quality,
      destination: targetDir
    });

    const args = ['-y', '-i', sourcePath];

    // Apply quality profiles
    const q = (quality || 'original').toLowerCase();
    if (q === '720p') {
      args.push('-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k');
    } else if (q === 'high') {
      args.push('-c:v', 'libx264', '-b:v', '4500k', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '320k');
    } else if (q === '4k') {
      args.push('-vf', 'scale=-2:2160', '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '320k');
    } else {
      // Default: Original match
      args.push('-c:v', 'copy', '-c:a', 'copy');
    }

    args.push(targetFilePath);

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
      proc.on('close', async (code) => {
        if (code !== 0) {
          // If original copy failed (e.g., codec compatibility), fallback to re-encode
          if (q === 'original') {
            try {
              formatTerminalLog('FFMPEG:EXPORT_FALLBACK', 'Re-trying export with libx264 re-encode...');
              const fallbackArgs = ['-y', '-i', sourcePath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '192k', targetFilePath];
              await new Promise((res, rej) => {
                const fbProc = spawn('ffmpeg', fallbackArgs);
                let fbErr = '';
                fbProc.stderr.on('data', c => { fbErr += c.toString(); });
                fbProc.on('close', c => (c === 0 ? res() : rej(new Error(`Fallback export failed (code ${c}): ${fbErr.slice(-200)}`))));
                fbProc.on('error', rej);
              });
            } catch (fbErr) {
              return reject(fbErr);
            }
          } else {
            return reject(new Error(`FFmpeg export failed (code ${code}): ${stderr.slice(-300)}`));
          }
        }

        const stats = fs.statSync(targetFilePath);
        const sizeMb = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
        
        // Calculate download URL:
        // If target file is inside exportStorageDir, calculate relative path.
        // If target file is in an external custom directory, mirror a copy into exportStorageDir so browser download always succeeds.
        const relFromExport = path.relative(this.exportStorageDir, targetFilePath);
        let downloadUrl = '';
        if (!relFromExport.startsWith('..') && !path.isAbsolute(relFromExport)) {
          downloadUrl = `/storage/exports/${relFromExport.replace(/\\/g, '/')}`;
        } else {
          const mirrorPath = path.join(this.exportStorageDir, cleanName);
          try {
            if (mirrorPath !== targetFilePath) {
              fs.copyFileSync(targetFilePath, mirrorPath);
            }
          } catch (_) {}
          downloadUrl = `/storage/exports/${cleanName}`;
        }

        formatTerminalLog('VIDEO:EXPORT_SUCCESS', `Export complete: ${cleanName} (${sizeMb} MB)`);

        try {
          historyService.addRecord({
            type: 'export',
            fileName: cleanName,
            filePath: targetFilePath,
            url: downloadUrl,
            sizeMb,
            quality: q,
            originalName: path.basename(sourcePath)
          });
        } catch (_) {}

        resolve({
          success: true,
          downloadUrl,
          fileName: cleanName,
          sizeMb,
          fullPath: targetFilePath,
          quality: q
        });
      });

      proc.on('error', (err) => {
        formatTerminalLog('FFMPEG:EXPORT_ERR', `Export launch error: ${err.message}`);
        reject(err);
      });
    });
  }
}

module.exports = new VideoRendererService();
// Exposed for unit testing — the FFmpeg progress parser, not part of the public API.
module.exports.trackFFmpegProgress = trackFFmpegProgress;
