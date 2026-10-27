const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');
const groqKeyManager = require('./groq-key-manager.service');

/**
 * Format numeric seconds into standard SRT timestamp (00:00:01,234)
 */
function secondsToSrtTimestamp(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const millis = Math.floor((s % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * Split word tokens by punctuation marks into coherent subtitle clauses
 */
/**
 * Split raw speech segments and words into discrete, natural subtitle clauses
 * Identical behavior to Faster-Whisper: segments are the primary speech units,
 * sub-split by punctuation, silence pause gaps, or max clause duration.
 */
function processRawSegments(segments = [], words = [], options = {}) {
  const maxPauseGap = parseFloat(options.maxPauseGap ?? 0.20);
  const maxMergeLimit = parseInt(options.maxMergeLimit ?? 3, 10);
  const punctMarks = ['.', '?', '!', ',', '，', '。', '！', '？', '、', ';', '；', ':', '：', '\n'];
  const noiseWords = new Set(['um', 'uh', 'ah', 'er', 'mm', 'hmm', '啊', '嗯', '哦', '呃']);

  // Case 0: Freeze Mode (maxMergeLimit <= 1)
  // Completely bypass punctuation sub-splitting and merging to preserve 100% pure Groq Whisper native segments
  if (maxMergeLimit <= 1 && Array.isArray(segments) && segments.length > 0) {
    return segments
      .filter(seg => (seg.text || '').trim().length > 0)
      .map(seg => {
        const segStart = typeof seg.start === 'number' ? seg.start : 0;
        const segEnd = typeof seg.end === 'number' ? seg.end : segStart + 1;
        return {
          startSec: segStart,
          endSec: segEnd,
          text: (seg.text || '').trim()
        };
      });
  }

  // Case A: Groq returned natural Whisper speech segments (Primary Path - exactly like Faster-Whisper)
  if (Array.isArray(segments) && segments.length > 0) {
    let wordIdx = 0;
    const splitResult = [];

    for (const seg of segments) {
      const segStart = typeof seg.start === 'number' ? seg.start : 0;
      const segEnd = typeof seg.end === 'number' ? seg.end : segStart + 1;
      const segText = (seg.text || '').trim();

      if (!segText) continue;

      // Extract words that belong inside this segment
      const segWords = [];
      while (wordIdx < words.length) {
        const w = words[wordIdx];
        if (w.start < segEnd + 0.15) {
          segWords.push(w);
          wordIdx++;
        } else {
          break;
        }
      }

      // If segment has no words, output segment directly
      if (segWords.length === 0) {
        splitResult.push({
          startSec: segStart,
          endSec: segEnd,
          text: segText
        });
        continue;
      }

      // Check for internal sub-splitting within this segment (by punctuation or silence gap >= 0.40s)
      let currentWords = [];
      for (let i = 0; i < segWords.length; i++) {
        const w = segWords[i];
        currentWords.push(w);
        const wText = (w.word || '').trim();
        const hasPunct = punctMarks.some(p => wText.includes(p));
        const nextWord = segWords[i + 1];
        const hasGap = nextWord && (nextWord.start - w.end >= 0.40);
        const isTooLong = currentWords.length >= 2 && (w.end - currentWords[0].start >= 4.5);

        if (hasPunct || hasGap || isTooLong) {
          const rowText = currentWords.map(item => item.word || '').join('').trim();
          if (rowText) {
            const startSec = currentWords[0].start;
            const endSec = currentWords[currentWords.length - 1].end;
            const dur = endSec - startSec;
            const cleanTxt = rowText.replace(/[^\w\u4e00-\u9fff]/g, '').toLowerCase().trim();
            if (!(dur < 0.4 && noiseWords.has(cleanTxt))) {
              splitResult.push({
                startSec,
                endSec,
                text: rowText
              });
            }
          }
          currentWords = [];
        }
      }

      if (currentWords.length > 0) {
        const rowText = currentWords.map(item => item.word || '').join('').trim();
        if (rowText) {
          const startSec = currentWords[0].start;
          const endSec = currentWords[currentWords.length - 1].end;
          const dur = endSec - startSec;
          const cleanTxt = rowText.replace(/[^\w\u4e00-\u9fff]/g, '').toLowerCase().trim();
          if (!(dur < 0.4 && noiseWords.has(cleanTxt))) {
            splitResult.push({
              startSec,
              endSec,
              text: rowText
            });
          }
        }
      }
    }

    // Merge short adjacent fragments according to dubbing settings
    return mergeFragmentedSegments(splitResult, maxPauseGap, maxMergeLimit);
  }

  // Case B: Fallback if only words are provided without segments
  if (Array.isArray(words) && words.length > 0) {
    const splitResult = [];
    let currentWords = [];

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      currentWords.push(w);
      const wText = (w.word || '').trim();
      const hasPunct = punctMarks.some(p => wText.includes(p));
      const nextWord = words[i + 1];
      const hasGap = nextWord && (nextWord.start - w.end >= 0.35);
      const isTooLong = currentWords.length >= 2 && (w.end - currentWords[0].start >= 4.0);

      if (hasPunct || hasGap || isTooLong) {
        const rowText = currentWords.map(item => item.word || '').join('').trim();
        if (rowText) {
          const startSec = currentWords[0].start;
          const endSec = currentWords[currentWords.length - 1].end;
          const dur = endSec - startSec;
          const cleanTxt = rowText.replace(/[^\w\u4e00-\u9fff]/g, '').toLowerCase().trim();
          if (!(dur < 0.4 && noiseWords.has(cleanTxt))) {
            splitResult.push({
              startSec,
              endSec,
              text: rowText
            });
          }
        }
        currentWords = [];
      }
    }

    if (currentWords.length > 0) {
      const rowText = currentWords.map(item => item.word || '').join('').trim();
      if (rowText) {
        const startSec = currentWords[0].start;
        const endSec = currentWords[currentWords.length - 1].end;
        const dur = endSec - startSec;
        const cleanTxt = rowText.replace(/[^\w\u4e00-\u9fff]/g, '').toLowerCase().trim();
        if (!(dur < 0.4 && noiseWords.has(cleanTxt))) {
          splitResult.push({
            startSec,
            endSec,
            text: rowText
          });
        }
      }
    }

    return mergeFragmentedSegments(splitResult, maxPauseGap, maxMergeLimit);
  }

  return [];
}

/**
 * Merge short fragmented clauses respecting maxPauseGap and maxMergeLimit
 */
function mergeFragmentedSegments(segments, maxGap = 0.20, maxMergeCount = 3) {
  if (!segments || segments.length === 0 || maxMergeCount <= 1) {
    return segments;
  }

  const merged = [];
  let current = null;

  for (const seg of segments) {
    const text = (seg.text || '').trim();
    if (!text) continue;

    if (!current) {
      current = {
        startSec: seg.startSec,
        endSec: seg.endSec,
        text,
        mergeCount: 1
      };
      continue;
    }

    const gap = seg.startSec - current.endSec;
    if (gap <= maxGap && current.mergeCount < maxMergeCount) {
      const currText = current.text.replace(/\s*\/\s*$/, '').trim();
      const nextText = text.replace(/^\s*\/\s*/, '').trim();
      current.text = `${currText}  ${nextText}`;
      current.endSec = seg.endSec;
      current.mergeCount += 1;
    } else {
      delete current.mergeCount;
      merged.push(current);
      current = {
        startSec: seg.startSec,
        endSec: seg.endSec,
        text,
        mergeCount: 1
      };
    }
  }

  if (current) {
    delete current.mergeCount;
    merged.push(current);
  }

  return merged;
}

class GroqService {
  /**
   * Transcribe an audio file using Groq Cloud Whisper API
   * @param {string} audioPath - Path to local wav/mp3/mp4 audio file
   * @param {object} options - Options: model, apiKey, vadThreshold, maxPauseGap, maxMergeLimit, language
   */
  async transcribeAudio(audioPath, options = {}) {
    const rawApiKey = (options.apiKey || process.env.GROQ_API_KEY || '').trim();
    if (!rawApiKey) {
      throw new Error('សូមបញ្ចូល Groq API Key នៅក្នុង Settings ឬក្នុង .env ជាមុនសិន (Groq API Key is required)');
    }

    // Resolve model name
    let modelName = 'whisper-large-v3';
    const optModel = (options.model || '').toLowerCase();
    if (optModel.includes('turbo')) {
      modelName = 'whisper-large-v3-turbo';
    } else if (optModel.includes('large-v3')) {
      modelName = 'whisper-large-v3';
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`រកមិនឃើញ Audio file នៅលើ Disk: ${audioPath}`);
    }

    const fileStats = fs.statSync(audioPath);
    const fileSizeMb = (fileStats.size / (1024 * 1024)).toFixed(2);

    let effectiveAudioPath = audioPath;
    let tempCompressedPath = null;

    // Groq Cloud API payload limit is strictly 25 MB (HTTP 413: Request Entity Too Large).
    // If input audio exceeds 20 MB, auto-compress to high-efficiency mono MP3 (48k/32k) via FFmpeg.
    const GROQ_MAX_FILE_BYTES = 20 * 1024 * 1024;
    if (fileStats.size > GROQ_MAX_FILE_BYTES) {
      tempCompressedPath = path.join(os.tmpdir(), `groq_compressed_${Date.now()}_${path.basename(audioPath)}.mp3`);
      const targetBitrate = fileStats.size > 80 * 1024 * 1024 ? '32k' : '48k';
      formatTerminalLog('GROQ:COMPRESS', `Audio size (${fileSizeMb} MB) exceeds Groq 25MB limit. Auto-compressing to lightweight MP3 (${targetBitrate})...`);

      const compRes = spawnSync('ffmpeg', [
        '-y',
        '-i', audioPath,
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-b:a', targetBitrate,
        tempCompressedPath
      ], { windowsHide: true });

      if (compRes.status === 0 && fs.existsSync(tempCompressedPath)) {
        const compStats = fs.statSync(tempCompressedPath);
        const compMb = (compStats.size / (1024 * 1024)).toFixed(2);
        formatTerminalLog('GROQ:COMPRESS_OK', `Compressed: ${fileSizeMb} MB -> ${compMb} MB (Saved ${(((fileStats.size - compStats.size) / fileStats.size) * 100).toFixed(0)}%) - Ready for Groq Cloud`);
        effectiveAudioPath = tempCompressedPath;
      } else {
        formatTerminalLog('GROQ:COMPRESS_WARN', `Compression note: ${compRes.stderr?.toString()?.slice(-200) || 'Proceeding with original'}`);
      }
    }

    const effectiveStats = fs.statSync(effectiveAudioPath);
    const effectiveMb = (effectiveStats.size / (1024 * 1024)).toFixed(2);

    formatTerminalProgress('STT:PROGRESS', 1, 3, `Uploading audio to Groq Whisper Cloud [${modelName}] (${effectiveMb} MB)...`, {
      file: path.basename(effectiveAudioPath),
      model: modelName
    });

    formatTerminalLog('GROQ:START', `Invoking Groq STT [${modelName}] (${effectiveMb} MB)...`, {
      file: path.basename(effectiveAudioPath),
      model: modelName
    });

    const fileBuffer = fs.readFileSync(effectiveAudioPath);
    const isMp3 = effectiveAudioPath.toLowerCase().endsWith('.mp3');
    const audioBlob = new Blob([fileBuffer], { type: isMp3 ? 'audio/mp3' : 'audio/wav' });

    let uploadFilename = isMp3 ? 'audio.mp3' : 'extracted_audio.wav';
    if (!isMp3 && options.originalFilename) {
      uploadFilename = options.originalFilename;
    } else if (!isMp3) {
      const ext = path.extname(audioPath).toLowerCase();
      uploadFilename = ext ? path.basename(audioPath) : `${path.basename(audioPath)}.wav`;
    }

    const formData = new FormData();
    formData.append('file', audioBlob, uploadFilename);
    formData.append('model', modelName);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('timestamp_granularities[]', 'segment');
    formData.append('temperature', '0.0');

    if (options.language && options.language !== 'auto') {
      formData.append('language', options.language);
    }

    const configuredKeys = groqKeyManager.getConfiguredKeys(rawApiKey);
    if (configuredKeys.length === 0) {
      throw new Error('សូមបញ្ចូល Groq API Key នៅក្នុង Settings ឬក្នុង .env ជាមុនសិន (Groq API Key is required)');
    }

    const endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
    let lastError = null;
    let json = null;
    let elapsed = '0.0';
    let attempts = 0;
    const maxAttempts = configuredKeys.length;

    try {
      while (attempts < maxAttempts) {
        attempts++;
        let activeKeyObj;
        try {
          activeKeyObj = groqKeyManager.getActiveKey(rawApiKey);
        } catch (poolErr) {
          throw poolErr;
        }

        const currentKey = activeKeyObj.key;
        const keyId = activeKeyObj.id;

        formatTerminalProgress('STT:PROGRESS', 1, 3, `Uploading audio to Groq Whisper Cloud [${modelName}] with Key [${keyId}] (${activeKeyObj.index + 1}/${activeKeyObj.totalConfigured})...`, {
          file: path.basename(effectiveAudioPath),
          model: modelName,
          key: keyId
        });

        formatTerminalLog('GROQ:START', `Invoking Groq STT [${modelName}] (${effectiveMb} MB) with Key [${keyId}] (${activeKeyObj.index + 1}/${activeKeyObj.totalConfigured})...`, {
          file: path.basename(effectiveAudioPath),
          model: modelName,
          key: keyId
        });

        const startTime = Date.now();
        let response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${currentKey}`
            },
            body: formData
          });
        } catch (networkErr) {
          formatTerminalLog('GROQ:FAIL', `Network failure calling Groq API: ${networkErr.message}`);
          throw new Error(`បរាជ័យក្នុងការតភ្ជាប់ទៅកាន់ Groq API (${networkErr.message})`);
        }

        elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (response.ok) {
          groqKeyManager.markSuccess(currentKey);
          json = await response.json();
          formatTerminalProgress('STT:PROGRESS', 2, 3, `Groq API responded in ${elapsed}s. Aligning Khmer dubbing clauses...`, {
            elapsed: `${elapsed}s`,
            key: keyId
          });
          break; // Successfully got response!
        }

        // Handle Errors & Auto-Failover
        let errDetails = '';
        try {
          const errJson = await response.json();
          errDetails = errJson?.error?.message || JSON.stringify(errJson);
        } catch (_) {
          errDetails = await response.text();
        }

        formatTerminalLog('GROQ:ERROR', `Groq API returned HTTP ${response.status} with Key [${keyId}]: ${errDetails}`);

        if (response.status === 429) {
          groqKeyManager.markRateLimited(currentKey, errDetails);
          const waitMatch = errDetails.match(/try again in ([0-9]+m[0-9.]+s|[0-9.]+s|[0-9]+m)/i);
          const waitStr = waitMatch ? waitMatch[1] : '~10 នាទី';
          formatTerminalLog('GROQ:FAILOVER', `⚠️ Key [${keyId}] ជាប់ Rate Limit (429 ASPH)។ កំពុងប្ដូរទៅ Key បន្ទាប់ដោយស្វ័យប្រវត្តិ... (Cooldown: ${waitStr})`);
          lastError = new Error(`Groq API Rate Limit ឬអស់កូតា (HTTP 429): ${errDetails}`);
          continue; // Seamless failover to next key in loop!
        } else if (response.status === 401 || errDetails.includes('Invalid API Key') || errDetails.includes('Authentication')) {
          groqKeyManager.markDenied(currentKey, errDetails);
          formatTerminalLog('GROQ:DENIED', `❌ Key [${keyId}] មិនត្រឹមត្រូវ (Invalid API Key)។ កំពុងប្ដូរទៅ Key បន្ទាប់...`);
          lastError = new Error(`Groq API Key [${keyId}] មិនត្រឹមត្រូវ (Invalid API Key)`);
          continue;
        } else {
          throw new Error(`Groq Transcription បរាជ័យ (${response.status}): ${errDetails}`);
        }
      }

      if (!json) {
        throw lastError || new Error(`រាល់ Groq API Keys ទាំងអស់ (${configuredKeys.length}) មិនអាចប្រើប្រាស់បាននៅពេលនេះឡើយ។`);
      }
      const detectedLang = json.language || 'unknown';
      const totalDuration = json.duration || 0;

      formatTerminalProgress('STT:PROGRESS', 2, 3, `Processing & aligning speech clauses (${elapsed}s)...`, {
        audioDuration: `${totalDuration}s`,
        lang: detectedLang
      });

      formatTerminalLog('GROQ:DONE', `Transcribed in ${elapsed}s (Audio Duration: ${totalDuration}s, Lang: ${detectedLang})`);

      const maxPauseGap = parseFloat(options.maxPauseGap ?? 0.20);
      const maxMergeLimit = parseInt(options.maxMergeLimit ?? 3, 10);

      let processedSegments = [];

      if ((Array.isArray(json.segments) && json.segments.length > 0) || (Array.isArray(json.words) && json.words.length > 0)) {
        processedSegments = processRawSegments(json.segments || [], json.words || [], {
          maxPauseGap,
          maxMergeLimit
        });
      } else if (json.text) {
        // Fallback to single text if neither word nor segment is present
        processedSegments = [{
          startSec: 0.0,
          endSec: totalDuration,
          text: json.text.trim()
        }];
      }

      // Format into project standard subtitle schema
      const finalSubtitles = processedSegments.map((s, idx) => ({
        id: idx + 1,
        start: secondsToSrtTimestamp(s.startSec),
        end: secondsToSrtTimestamp(s.endSec),
        startSec: Math.round(s.startSec * 1000) / 1000,
        endSec: Math.round(s.endSec * 1000) / 1000,
        originalText: s.text,
        khmerText: '',
        speaker: 'Speaker 1'
      }));

      formatTerminalProgress('STT:PROGRESS', 3, 3, `Transcription Complete! Generated ${finalSubtitles.length} aligned subtitles`, {
        count: finalSubtitles.length,
        model: modelName
      });

      formatTerminalLog('GROQ:SUCCESS', `Generated ${finalSubtitles.length} aligned subtitles using Groq [${modelName}]`);
      // Forward the detected source language so the translation router can choose
      // between the direct Chinese->Khmer path and the bridged (via English) path.
      return { segments: finalSubtitles, language: detectedLang !== 'unknown' ? detectedLang : null };
    } finally {
      if (tempCompressedPath && fs.existsSync(tempCompressedPath)) {
        try { fs.unlinkSync(tempCompressedPath); } catch (_) {}
      }
    }
  }
}

GroqService.prototype.processRawSegments = processRawSegments;
GroqService.prototype.keyManager = groqKeyManager;
module.exports = new GroqService();
