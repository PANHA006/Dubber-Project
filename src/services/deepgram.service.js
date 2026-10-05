const fs = require('fs');
const path = require('path');
const { formatTerminalLog } = require('../utils/terminal-logger');

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
function splitWordsByPunctuation(words) {
  if (!Array.isArray(words) || words.length === 0) return [];

  const punctMarks = ['.', '?', '!', ',', '，', '。', '！', '？', '、', ';', '；', '\n'];
  const splitResult = [];
  let currentWords = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentWords.push(w);
    const wText = (w.punctuated_word || w.word || '').trim();
    const hasPunct = punctMarks.some(p => wText.includes(p));
    const nextWord = words[i + 1];
    const hasGap = nextWord && (nextWord.start - w.end >= 0.40);
    const isTooLong = currentWords.length >= 2 && (w.end - currentWords[0].start >= 4.5);

    if (hasPunct || hasGap || isTooLong) {
      const rowText = currentWords.map(item => item.punctuated_word || item.word || '').join(' ').trim();
      if (rowText) {
        const startSec = currentWords[0].start;
        const endSec = currentWords[currentWords.length - 1].end;
        splitResult.push({
          startSec,
          endSec,
          text: rowText
        });
      }
      currentWords = [];
    }
  }

  if (currentWords.length > 0) {
    const rowText = currentWords.map(item => item.punctuated_word || item.word || '').join(' ').trim();
    if (rowText) {
      const startSec = currentWords[0].start;
      const endSec = currentWords[currentWords.length - 1].end;
      splitResult.push({
        startSec,
        endSec,
        text: rowText
      });
    }
  }

  return splitResult;
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

class DeepgramService {
  /**
   * Transcribe audio using Deepgram Nova STT API
   * @param {string} audioPath 
   * @param {object} options 
   */
  async transcribeAudio(audioPath, options = {}) {
    const rawApiKey = (options.apiKey || process.env.DEEPGRAM_API_KEY || '').trim();
    if (!rawApiKey) {
      throw new Error('សូមបញ្ចូល Deepgram API Key នៅក្នុង .env ឬ Settings ជាមុនសិន');
    }

    let modelName = 'nova-3';
    const optModel = (options.model || '').toLowerCase();
    if (optModel.includes('nova-2')) {
      modelName = 'nova-2';
    } else if (optModel.includes('nova-3')) {
      modelName = 'nova-3';
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`រកមិនឃើញ Audio file នៅលើ Disk: ${audioPath}`);
    }

    const fileBuffer = fs.readFileSync(audioPath);
    const fileSizeMb = (fileBuffer.length / (1024 * 1024)).toFixed(2);

    formatTerminalLog('DEEPGRAM:START', `Invoking Deepgram [${modelName}] (${fileSizeMb} MB)...`, {
      file: path.basename(audioPath),
      model: modelName
    });

    const params = new URLSearchParams({
      model: modelName,
      smart_format: 'true',
      punctuate: 'true',
      paragraphs: 'true',
    });

    if (options.language && options.language !== 'auto') {
      params.append('language', options.language);
    }

    const startTime = Date.now();
    const endpoint = `https://api.deepgram.com/v1/listen?${params.toString()}`;

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${rawApiKey}`,
          'Content-Type': 'audio/wav'
        },
        body: fileBuffer
      });
    } catch (networkErr) {
      formatTerminalLog('DEEPGRAM:FAIL', `Network failure calling Deepgram API: ${networkErr.message}`);
      throw new Error(`បរាជ័យក្នុងការតភ្ជាប់ទៅកាន់ Deepgram API (${networkErr.message})`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      const errDetails = await response.text();
      formatTerminalLog('DEEPGRAM:ERROR', `Deepgram API returned HTTP ${response.status}: ${errDetails}`);
      throw new Error(`Deepgram Transcription បរាជ័យ (${response.status}): ${errDetails}`);
    }

    const json = await response.json();
    const alternative = json.results?.channels?.[0]?.alternatives?.[0] || {};
    const words = alternative.words || [];
    const maxPauseGap = parseFloat(options.maxPauseGap ?? 0.20);
    const maxMergeLimit = parseInt(options.maxMergeLimit ?? 3, 10);

    let processedSegments = [];
    if (words.length > 0) {
      const splitSegs = splitWordsByPunctuation(words);
      processedSegments = mergeFragmentedSegments(splitSegs, maxPauseGap, maxMergeLimit);
    } else if (alternative.transcript) {
      processedSegments = [{
        startSec: 0.0,
        endSec: json.metadata?.duration || 0,
        text: alternative.transcript.trim()
      }];
    }

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

    formatTerminalLog('DEEPGRAM:SUCCESS', `Generated ${finalSubtitles.length} aligned subtitles using Deepgram [${modelName}] in ${elapsed}s`);
    return finalSubtitles;
  }
}

module.exports = new DeepgramService();
