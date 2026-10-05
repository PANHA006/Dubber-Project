const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');

class PcmMuterService {
  constructor() {
    this.tempDir = path.join(__dirname, '../../storage/voices');
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Parse basic WAV PCM header details from a buffer
   * Supports standard canonical RIFF WAV headers
   */
  parseWavHeader(buffer) {
    if (!buffer || buffer.length < 44) {
      throw new Error('Invalid WAV buffer: File is too small (< 44 bytes)');
    }

    const riffTag = buffer.toString('ascii', 0, 4);
    const waveTag = buffer.toString('ascii', 8, 12);
    if (riffTag !== 'RIFF' || waveTag !== 'WAVE') {
      throw new Error(`Invalid WAV header: expected RIFF/WAVE, got ${riffTag}/${waveTag}`);
    }

    // Find "fmt " chunk
    let offset = 12;
    let numChannels = 2;
    let sampleRate = 44100;
    let bitsPerSample = 16;
    let dataOffset = 44;
    let dataSize = buffer.length - 44;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ') {
        const audioFormat = buffer.readUInt16LE(offset + 8);
        numChannels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        bitsPerSample = buffer.readUInt16LE(offset + 22);

        if (audioFormat !== 1 && audioFormat !== 65534) {
          // Format 1 = PCM, Format 65534 = WAVE_FORMAT_EXTENSIBLE (often PCM)
          formatTerminalLog('PCM:WARNING', `Audio format ${audioFormat} is not standard integer PCM, proceeding as PCM`);
        }
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
    }

    const bytesPerSample = Math.round(bitsPerSample / 8);
    const frameSize = numChannels * bytesPerSample;
    const totalFrames = Math.floor(dataSize / frameSize);
    const duration = totalFrames / sampleRate;

    return {
      numChannels,
      sampleRate,
      bitsPerSample,
      bytesPerSample,
      frameSize,
      dataOffset,
      dataSize,
      totalFrames,
      duration
    };
  }

  /**
   * Merge closely spaced or overlapping speech intervals
   * @param {Array<{start: number, end: number}>} rawIntervals
   * @param {number} maxGapSec - Gap below which intervals are merged
   */
  mergeIntervals(rawIntervals, maxGapSec = 0.15) {
    if (!rawIntervals || rawIntervals.length === 0) return [];

    const sorted = [...rawIntervals]
      .filter(i => typeof i.start === 'number' && typeof i.end === 'number' && !isNaN(i.start) && !isNaN(i.end))
      .sort((a, b) => a.start - b.start);

    if (sorted.length === 0) return [];

    const merged = [ { start: Math.max(0, sorted[0].start), end: Math.max(0, sorted[0].end) } ];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const prev = merged[merged.length - 1];

      if (current.start <= prev.end + maxGapSec) {
        prev.end = Math.max(prev.end, current.end);
      } else {
        merged.push({ start: Math.max(0, current.start), end: Math.max(0, current.end) });
      }
    }

    return merged;
  }

  /**
   * Core PCM Byte-level Muting on a WAV buffer
   * Mutes or attenuates raw audio bytes in speech intervals with a 10ms anti-click micro-fade.
   *
   * @param {Buffer} wavBuffer - Complete WAV file buffer
   * @param {Array} subtitles - Subtitle array with startSec and endSec
   * @param {Object} options
   * @param {number} options.padBefore - Seconds to pad before speech (default 0.20s)
   * @param {number} options.padAfter - Seconds to pad after speech (default 0.20s)
   * @param {number} options.bgVolumePct - Background volume percentage during speech (0 = total silence)
   * @returns {Buffer} Modified WAV buffer with speech muted
   */
  mutePcmBuffer(wavBuffer, subtitles = [], options = {}) {
    if (!subtitles || subtitles.length === 0) {
      return wavBuffer;
    }

    const {
      padBefore = 0.25,
      padAfter = 0.25,
      bgVolumePct = 0
    } = options;

    const info = this.parseWavHeader(wavBuffer);
    const { numChannels, sampleRate, frameSize, dataOffset, dataSize, totalFrames } = info;

    // Calculate raw padded intervals
    const rawIntervals = subtitles.map(s => {
      const start = Math.max(0, parseFloat(s.startSec ?? s.start ?? 0) - padBefore);
      const end = parseFloat(s.endSec ?? s.end ?? (start + 2.0)) + padAfter;
      return { start, end };
    });

    const merged = this.mergeIntervals(rawIntervals, 0.15);

    formatTerminalLog('PCM:MUTER_START', `Starting PCM Byte-level Audio Muting`, {
      speechSegments: subtitles.length,
      mergedIntervals: merged.length,
      audioDuration: `${info.duration.toFixed(1)}s`,
      bgVolume: `${bgVolumePct}% (${bgVolumePct === 0 ? 'Muted 100% Silence (0x00)' : 'Attenuated'})`
    });

    // 10ms micro-fade to eliminate DC-offset clicks/pops
    const fadeFrames = Math.max(1, Math.round(sampleRate * 0.010)); // 10ms
    const fadeBytes = fadeFrames * frameSize;
    const isTotalMute = bgVolumePct <= 0.01;
    const attenuation = Math.max(0, Math.min(1.0, bgVolumePct / 100));

    let mutedBytesCount = 0;

    for (const interval of merged) {
      const startFrame = Math.max(0, Math.floor(interval.start * sampleRate));
      const endFrame = Math.min(totalFrames, Math.ceil(interval.end * sampleRate));
      if (endFrame <= startFrame) continue;

      const segStartByte = dataOffset + startFrame * frameSize;
      const segEndByte = Math.min(dataOffset + dataSize, dataOffset + endFrame * frameSize);
      const segLength = segEndByte - segStartByte;
      if (segLength <= 0) continue;

      if (isTotalMute) {
        // Fade in only if starting after the beginning of the audio
        const needFadeIn = interval.start > 0.001 && segStartByte > dataOffset;
        const actualFadeInBytes = needFadeIn ? Math.min(fadeBytes, Math.floor(segLength / 2)) : 0;
        const actualFadeInFrames = Math.floor(actualFadeInBytes / frameSize);

        if (actualFadeInFrames > 0) {
          for (let f = 0; f < actualFadeInFrames; f++) {
            const factor = 1.0 - (f / actualFadeInFrames);
            const fOffset = segStartByte + f * frameSize;
            for (let ch = 0; ch < numChannels; ch++) {
              const sampleOffset = fOffset + ch * 2;
              if (sampleOffset + 1 < wavBuffer.length) {
                const val = wavBuffer.readInt16LE(sampleOffset);
                wavBuffer.writeInt16LE(Math.round(val * factor), sampleOffset);
              }
            }
          }
        }

        // Fade out only if ending before the end of the audio
        const needFadeOut = interval.end < (info.duration - 0.001) && segEndByte < (dataOffset + dataSize);
        const actualFadeOutBytes = needFadeOut ? Math.min(fadeBytes, Math.floor(segLength / 2)) : 0;
        const actualFadeOutFrames = Math.floor(actualFadeOutBytes / frameSize);

        // Fill inner region with pure 0x00 bytes (100% true silence)
        const innerStart = segStartByte + actualFadeInBytes;
        const innerEnd = segEndByte - actualFadeOutBytes;

        if (innerEnd > innerStart) {
          wavBuffer.fill(0, innerStart, innerEnd);
        }

        // Micro-fade OUT of silence (ramp up from 0 to full volume over 10ms)
        if (actualFadeOutFrames > 0) {
          for (let f = 0; f < actualFadeOutFrames; f++) {
            const factor = f / actualFadeOutFrames;
            const fOffset = innerEnd + f * frameSize;
            for (let ch = 0; ch < numChannels; ch++) {
              const sampleOffset = fOffset + ch * 2;
              if (sampleOffset + 1 < wavBuffer.length) {
                const val = wavBuffer.readInt16LE(sampleOffset);
                wavBuffer.writeInt16LE(Math.round(val * factor), sampleOffset);
              }
            }
          }
        }
      } else {
        // Attenuate to bgVolumePct (e.g. 8% or 20%)
        for (let b = segStartByte; b < segEndByte; b += 2) {
          if (b + 1 < wavBuffer.length) {
            const val = wavBuffer.readInt16LE(b);
            wavBuffer.writeInt16LE(Math.round(val * attenuation), b);
          }
        }
      }

      mutedBytesCount += segLength;
    }

    const mutedSec = (mutedBytesCount / (sampleRate * frameSize)).toFixed(1);
    formatTerminalProgress('PCM:PROGRESS', 1, 1, `PCM Muting Complete! Muted ${mutedSec}s of original dialogue across ${merged.length} intervals`, {
      mutedSec: `${mutedSec}s`,
      intervals: merged.length
    });
    formatTerminalLog('PCM:MUTER_DONE', `PCM Muting Complete! Muted ${mutedSec}s of original dialogue across ${merged.length} intervals`);

    return wavBuffer;
  }

  /**
   * Extract audio from video, apply PCM Byte-level Muting, and save to a clean WAV file.
   *
   * @param {Object} params
   * @param {string} params.videoPath - Path to original video
   * @param {Array} params.subtitles - Subtitles array
   * @param {Object} params.settings - Dubbing settings (bgVolume, padBefore, padAfter)
   * @returns {Promise<string>} Path to the resulting muted background WAV file
   */
  async extractAndMuteBackgroundAudio({ videoPath, subtitles = [], settings = {} }) {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const timestamp = Date.now();
    const tempPcmWav = path.join(this.tempDir, `temp_raw_audio_${timestamp}.wav`);
    const mutedWavPath = path.join(this.tempDir, `muted_bgm_${timestamp}.wav`);

    // 1. Extract audio from video to 16-bit 44.1kHz Stereo PCM WAV
    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', videoPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        tempPcmWav
      ];

      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
      proc.on('close', code => {
        if (code !== 0) {
          return reject(new Error(`Failed to extract PCM audio from video: ${stderr.slice(-250)}`));
        }
        resolve();
      });
      proc.on('error', reject);
    });

    try {
      // 2. Read PCM WAV into memory buffer and mute speech bytes
      const audioBuffer = fs.readFileSync(tempPcmWav);
      const bgVolume = typeof settings.bgVolume === 'number' ? settings.bgVolume : 0;
      const padBefore = typeof settings.padBefore === 'number' ? settings.padBefore : 0.25;
      const padAfter = typeof settings.padAfter === 'number' ? settings.padAfter : 0.25;

      this.mutePcmBuffer(audioBuffer, subtitles, {
        padBefore,
        padAfter,
        bgVolumePct: bgVolume
      });

      // 3. Write muted audio buffer to disk
      fs.writeFileSync(mutedWavPath, audioBuffer);
      return mutedWavPath;
    } finally {
      // Clean up the intermediate raw audio file
      try {
        if (fs.existsSync(tempPcmWav)) fs.unlinkSync(tempPcmWav);
      } catch (_) {}
    }
  }
}

module.exports = new PcmMuterService();
