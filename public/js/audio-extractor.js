/**
 * Audio Extractor Module (Client-Side)
 * Uses Web Audio API (AudioContext & OfflineAudioContext) to extract and decode
 * the audio stream directly from a video file into a lightweight WAV (16kHz, Mono).
 * Features Smart Silence Auto-Chunking (09:30 - 10:30 Window) for long videos.
 */

import { logToTerminal } from './logger.js';

/**
 * Finds the optimal silence / pause split point within a search window using RMS energy.
 * Search window: [minSearchSec, maxSearchSec] (e.g. 09:30 to 10:30).
 * 
 * @param {Float32Array} channelData - 16kHz mono audio samples
 * @param {number} sampleRate - e.g. 16000
 * @param {number} minSearchSec - Start of window in seconds (e.g. 570s = 09:30)
 * @param {number} maxSearchSec - End of window in seconds (e.g. 630s = 10:30)
 * @param {number} [frameSizeSec=0.2] - Frame size for RMS calculation (200ms)
 * @returns {number} The optimal split time in seconds
 */
export function findLowestRmsPoint(channelData, sampleRate, minSearchSec, maxSearchSec, frameSizeSec = 0.2) {
  const startSample = Math.max(0, Math.floor(minSearchSec * sampleRate));
  const endSample = Math.min(channelData.length, Math.floor(maxSearchSec * sampleRate));
  const frameSamples = Math.floor(frameSizeSec * sampleRate);
  const hopSamples = Math.floor(0.1 * sampleRate); // 100ms hop

  let minRms = Infinity;
  let optimalSample = Math.floor((startSample + endSample) / 2); // Default fallback: midpoint

  for (let pos = startSample; pos <= endSample - frameSamples; pos += hopSamples) {
    let sum = 0;
    // Step by 2 for high performance while retaining RMS precision
    for (let i = 0; i < frameSamples; i += 2) {
      const sample = channelData[pos + i];
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / (frameSamples / 2));
    if (rms < minRms) {
      minRms = rms;
      optimalSample = pos + Math.floor(frameSamples / 2);
    }
  }

  return optimalSample / sampleRate;
}

/**
 * Converts a Float32Array of 1-channel (Mono) audio samples to a WAV Blob.
 * 
 * @param {Float32Array} float32Samples 
 * @param {number} sampleRate 
 * @returns {Blob}
 */
export function monoFloat32ToWavBlob(float32Samples, sampleRate = 16000) {
  const numOfChan = 1;
  const length = float32Samples.length * 2 + 44; // 16-bit PCM = 2 bytes per sample
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  let pos = 0;

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"

  // "fmt " subchunk
  setUint32(0x20746d66); // "fmt "
  setUint32(16); // 16 for PCM
  setUint16(1); // PCM format
  setUint16(numOfChan); // 1 channel
  setUint32(sampleRate); // 16000
  setUint32(sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // 16 bits per sample

  // "data" subchunk
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  // Write PCM samples
  for (let i = 0; i < float32Samples.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(pos, s, true);
    pos += 2;
  }

  return new Blob([outBuffer], { type: 'audio/wav' });
}

/**
 * Extract audio from video and intelligently chunk it if duration exceeds 10.5 minutes (630s).
 * Uses Smart Silence Detection in window [09:30 - 10:30] from chunk start.
 * 
 * @param {File} videoFile 
 * @param {Function} [onProgress] 
 * @returns {Promise<Array<{blob: Blob, startTime: number, endTime: number, index: number, total: number}>>}
 */
export async function extractAudioChunksFromVideo(videoFile, onProgress = () => {}) {
  logToTerminal('AUDIO:ENGINE', `Extracting audio from "${videoFile.name}" (${(videoFile.size / (1024 * 1024)).toFixed(2)} MB)...`);
  onProgress('កំពុងអានទិន្នន័យវីដេអូ (Reading video file)...');
  const arrayBuffer = await videoFile.arrayBuffer();

  onProgress('កំពុងបំបែកសំឡេង (Decoding audio stream)...');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();
  let decodedBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    if (audioCtx.state !== 'closed') {
      await audioCtx.close();
    }
  }

  const duration = decodedBuffer.duration;
  logToTerminal('AUDIO:ENGINE', `Decoded audio track: ${duration.toFixed(1)}s (16kHz Mono)`);
  onProgress('កំពុងបង្រួមសំឡេងជា 16kHz Mono (Resampling)...');

  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(duration * targetSampleRate),
    targetSampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = decodedBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const channelData = renderedBuffer.getChannelData(0);

  // Single chunk if <= 10.5 minutes (630 seconds)
  const MAX_SINGLE_CHUNK_SEC = 630;
  if (duration <= MAX_SINGLE_CHUNK_SEC) {
    onProgress('កំពុងបង្កើតឯកសារ WAV (Encoding WAV)...');
    const wavBlob = monoFloat32ToWavBlob(channelData, targetSampleRate);
    logToTerminal('AUDIO:ENGINE', `Audio <= 10.5m. Generated 1 single WAV chunk (${(wavBlob.size / (1024 * 1024)).toFixed(2)} MB)`);
    return [{
      blob: wavBlob,
      startTime: 0,
      endTime: duration,
      index: 0,
      total: 1
    }];
  }

  // Multi-chunk with Smart Silence Detection in window [09:30 - 10:30]
  logToTerminal('AUDIO:ENGINE', `Video > 10.5m. Initiating Smart Silence Auto-Chunking (09:30 - 10:30 window)...`);
  onProgress('🔍 កំពុងស្កេនរកចន្លោះស្ងាត់ (09:30 - 10:30) និងបំបែកជាកង់ៗ (Smart Silence Auto-Chunking)...');
  const chunks = [];
  let currentStart = 0;

  while (currentStart < duration) {
    const remaining = duration - currentStart;
    
    // If remaining audio is within 10.5 minutes, make it the final chunk
    if (remaining <= MAX_SINGLE_CHUNK_SEC) {
      const startIdx = Math.floor(currentStart * targetSampleRate);
      const endIdx = channelData.length;
      const slice = channelData.subarray(startIdx, endIdx);
      const blob = monoFloat32ToWavBlob(slice, targetSampleRate);
      chunks.push({
        blob,
        startTime: currentStart,
        endTime: duration,
        index: chunks.length
      });
      logToTerminal('AUDIO:ENGINE', `Final Chunk ${chunks.length}: [${currentStart.toFixed(1)}s - ${duration.toFixed(1)}s] (${(blob.size / (1024 * 1024)).toFixed(2)} MB)`);
      break;
    }

    // Search window: 09:30 (570s) to 10:30 (630s) relative to currentStart
    const minSearch = currentStart + 570;
    const maxSearch = Math.min(duration, currentStart + 630);
    const splitTime = findLowestRmsPoint(channelData, targetSampleRate, minSearch, maxSearch);

    const startIdx = Math.floor(currentStart * targetSampleRate);
    const endIdx = Math.floor(splitTime * targetSampleRate);
    const slice = channelData.subarray(startIdx, endIdx);
    const blob = monoFloat32ToWavBlob(slice, targetSampleRate);

    chunks.push({
      blob,
      startTime: currentStart,
      endTime: splitTime,
      index: chunks.length
    });

    logToTerminal('AUDIO:ENGINE', `Created Chunk ${chunks.length}: [${currentStart.toFixed(1)}s - ${splitTime.toFixed(1)}s] (${(blob.size / (1024 * 1024)).toFixed(2)} MB) (Silence dip at ${splitTime.toFixed(1)}s)`);

    currentStart = splitTime;
  }

  // Set total count
  const total = chunks.length;
  chunks.forEach(c => c.total = total);
  logToTerminal('AUDIO:ENGINE', `Auto-chunking completed: ${total} chunks generated successfully`);

  return chunks;
}

/**
 * Backward-compatible single audio extract function
 */
export async function extractAudioFromVideo(videoFile, onProgress = () => {}) {
  const chunks = await extractAudioChunksFromVideo(videoFile, onProgress);
  return chunks[0].blob;
}
