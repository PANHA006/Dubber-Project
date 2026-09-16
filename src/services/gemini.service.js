const { GoogleGenAI, Type } = require('@google/genai');
const fs = require('fs');

/**
 * Gemini Service for processing audio and generating speech-to-text with timestamps
 */
class GeminiService {
  /**
   * Transcribe an audio file using Gemini
   * @param {string} filePath - Absolute or relative path to the audio file
   * @param {string} mimeType - MIME type of the audio file (e.g., 'audio/wav')
   * @param {string} [customApiKey] - Optional API key passed from client
   * @returns {Promise<Array<{start: string, end: string, text: string, speaker?: string}>>}
   */
  async transcribeAudio(filePath, mimeType = 'audio/wav', customApiKey = null) {
    const keyManager = require('./key-manager.service');
    const { formatTerminalLog } = require('../utils/terminal-logger');
    const path = require('path');

    keyManager.logPoolStatus(customApiKey);
    let activeKeyInfo = keyManager.getActiveKey(customApiKey);
    formatTerminalLog('KEY:POOL', `Selected active key: [${activeKeyInfo.id}] (${activeKeyInfo.remainingReady}/${activeKeyInfo.totalConfigured} ready)`);

    let ai = new GoogleGenAI({ apiKey: activeKeyInfo.key });
    const effectiveMimeType = mimeType || 'audio/wav';

    let fileUpload = null;
    let upload503Attempt = 0;
    while (!fileUpload) {
      try {
        formatTerminalLog('GEMINI:API', `Uploading audio to Google File API using Key [${activeKeyInfo.id}]...`, { file: path.basename(filePath) });
        fileUpload = await ai.files.upload({
          file: filePath,
          mimeType: effectiveMimeType,
          config: {
            mimeType: effectiveMimeType,
          }
        });
        formatTerminalLog('GEMINI:API', 'Audio file uploaded to Gemini storage', {
          name: fileUpload.name,
          mimeType: effectiveMimeType
        });
      } catch (uploadErr) {
        const errStr = (uploadErr && (uploadErr.message || JSON.stringify(uploadErr))) || '';
        const isDenied = errStr.includes('PERMISSION_DENIED') ||
                         errStr.includes('denied access') ||
                         errStr.includes('403') ||
                         errStr.includes('API_KEY_INVALID') ||
                         errStr.includes('API key not valid');
        const is503 = errStr.includes('503') ||
                      errStr.includes('UNAVAILABLE') ||
                      errStr.includes('high demand');
        const isRateLimit = errStr.includes('429') ||
                            errStr.includes('RESOURCE_EXHAUSTED') ||
                            errStr.includes('Quota exceeded');

        // On 503 during upload, retry 4 times (5s, 10s, 15s, 20s) on the same key first!
        if (is503 && upload503Attempt < 4) {
          upload503Attempt++;
          const delayMs = upload503Attempt * 5000;
          formatTerminalLog('GEMINI:WARN', `Google 503 Server Congestion on upload using key [${activeKeyInfo.id}]. Retrying in ${delayMs / 1000}s (Attempt ${upload503Attempt}/4)...`);
          await new Promise(r => setTimeout(r, delayMs));
          continue; // Retry upload with the same key
        }

        if (isDenied || isRateLimit || is503) {
          const failover = keyManager.markKeyExhausted(activeKeyInfo.key, uploadErr);
          if (failover.isDenied) {
            formatTerminalLog('KEY:DENIED', `Key [${failover.keyId}] permanently blocked by Google (403 Permission Denied). Auto-skipped!`);
          } else if (failover.isDailyLocked) {
            formatTerminalLog('KEY:LOCK24H', `Key [${failover.keyId}] exhausted daily quota (limit: 20). Locked for 24 HOURS.`);
          } else if (failover.is503) {
            formatTerminalLog('KEY:503', `Key [${failover.keyId}] exhausted 4 retries on Google 503. Cooldown for ${failover.waitDurationSec}s.`);
          } else {
            formatTerminalLog('KEY:COOLDOWN', `Key [${failover.keyId}] rate-limited. Cooldown for ${failover.waitDurationSec}s.`);
          }

          if (failover.nextKeyInfo) {
            formatTerminalLog('KEY:FAILOVER', `Instant failover (<0.1s) -> Switching to Key [${failover.nextKeyInfo.id}] (${failover.nextKeyInfo.remainingReady} keys ready)`);
            activeKeyInfo = failover.nextKeyInfo;
            ai = new GoogleGenAI({ apiKey: activeKeyInfo.key });
            upload503Attempt = 0;
            continue; // Re-upload using the new healthy key!
          }
        }
        formatTerminalLog('GEMINI:ERROR', `Audio upload failed: ${uploadErr.message}`);
        throw uploadErr;
      }
    }

    const systemPrompt = `You are an elite speech recognition and professional video dubbing localization specialist with high-precision acoustic audio analysis capabilities.
Your objective is to produce perfectly timed, discrete subtitle segments with exact spoken start and end timestamps, containing BOTH the original spoken speech AND a natural, idiomatic Khmer translation.

CRITICAL TIMING & SEGMENTATION RULES:
1. Acoustic Sentence Boundaries (Breathing Pauses & Commas):
   - Listen attentively to the speaker's vocal acoustics for natural breathing pauses, commas, or micro-silences (0.2s - 0.5s).
   - Divide speech into short, readable individual sentences or conversational phrases (ideally 2 to 5 seconds per segment).
   - NEVER merge multiple distinct questions, answers, or conversational sentences into a single long block. Each spoken thought must have its own separate subtitle entry.

2. Foreground Vocal Isolation & BGM Filtering:
   - Transcribe ONLY foreground human dialog.
   - Strictly IGNORE background music (BGM), cinematic sound effects (SFX), ambient noise, and background singing/lyrics.
   - The "end" timestamp must strictly mark the exact millisecond the human speaker stops vocalizing. NEVER extend timestamps into trailing background music, instrumental solos, or silence.

3. Standard Subtitle Timestamp Format:
   - Timestamps must strictly be in standard "HH:MM:SS,mmm" format with a 2-digit hour prefix (e.g., "00:05:41,200"). Always include "00:".

4. Verbatim Transcription & Natural Khmer Dubbing Translation:
   - "originalText": Transcribe the exact spoken words verbatim in the speaker's original language (e.g. English, Chinese, etc., or Khmer if already Khmer).
   - "khmerText": Translate the meaning accurately and idiomatically into natural, conversational, fluent Khmer script suitable for video dubbing voiceover. If original speech is already in Khmer, provide the clean grammatical Khmer transcript.

5. Schema Compliance:
   - Output strictly as a JSON array adhering to the requested schema with properties: start, end, originalText, khmerText, speaker. Never output markdown code fences, comments, or preamble.`;

    const prompt = 'Please listen to the audio waveform and generate discrete, tightly bounded subtitle segments with both verbatim original speech and fluent Khmer translation.';

    const targetModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

    // In @google/genai SDK, uploaded files are passed as { fileData: { fileUri: fileUpload.uri, mimeType: fileUpload.mimeType } }
    let audioPart = fileUpload.uri 
      ? { fileData: { fileUri: fileUpload.uri, mimeType: fileUpload.mimeType || effectiveMimeType } }
      : fileUpload;

    const fullPrompt = `${systemPrompt}\n\n${prompt}`;

    formatTerminalLog('GEMINI:AI', `Invoking model: ${targetModel}...`);
    const aiStartTime = Date.now();

    const subtitleJsonSchema = {
      type: Type.ARRAY,
      description: 'List of discrete transcribed subtitle segments with both original text and natural Khmer translation',
      items: {
        type: Type.OBJECT,
        properties: {
          start: {
            type: Type.STRING,
            description: 'Start timestamp in format HH:MM:SS,mmm marking when human vocalization begins (e.g. 00:05:41,200)'
          },
          end: {
            type: Type.STRING,
            description: 'End timestamp in format HH:MM:SS,mmm marking when human vocalization ends, without extending into BGM (e.g. 00:05:44,800)'
          },
          originalText: {
            type: Type.STRING,
            description: 'Verbatim transcribed speech in the original spoken language'
          },
          khmerText: {
            type: Type.STRING,
            description: 'Natural, idiomatic, conversational Khmer translation of the speech'
          },
          speaker: {
            type: Type.STRING,
            description: 'Identified speaker or voice profile (e.g. Speaker 1, Male, Female)'
          }
        },
        required: ['start', 'end', 'originalText', 'khmerText']
      }
    };

    let response;
    const maxRetries = 5;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        if (targetModel === 'gemini-3.5-transcribe') {
          // Plain text transcript mode for specialized transcribe model
          response = await ai.models.generateContent({
            model: targetModel,
            contents: [
              audioPart,
              { text: 'Transcribe this audio with timestamps format: [HH:MM:SS,mmm - HH:MM:SS,mmm] Text' }
            ],
            config: {
              maxOutputTokens: 65536
            }
          });
        } else {
          // Primary mode: structured JSON schema output with precise timestamps
          response = await ai.models.generateContent({
            model: targetModel,
            contents: [
              audioPart,
              { text: fullPrompt }
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: subtitleJsonSchema,
              maxOutputTokens: 65536
            }
          });
        }
        const elapsed = ((Date.now() - aiStartTime) / 1000).toFixed(1);
        formatTerminalLog('GEMINI:AI', `Model [${targetModel}] finished in ${elapsed}s`);
        break; // Successfully received response
      } catch (err) {
        const errStr = (err && (err.message || JSON.stringify(err))) || '';
        const isDenied = errStr.includes('PERMISSION_DENIED') ||
                         errStr.includes('denied access') ||
                         errStr.includes('403') ||
                         errStr.includes('API_KEY_INVALID') ||
                         errStr.includes('API key not valid');
        const is503 = errStr.includes('503') ||
                      errStr.includes('UNAVAILABLE') ||
                      errStr.includes('high demand');
        const isRateLimit = errStr.includes('429') || 
                            errStr.includes('RESOURCE_EXHAUSTED') || 
                            errStr.includes('Quota exceeded');
        const isTransient = isRateLimit || is503;

        // If Error 503: retry on the SAME key 4 times (5s, 10s, 15s, 20s) before failing over!
        if (is503) {
          if (attempt < 4) {
            attempt++;
            const delayMs = attempt * 5000;
            formatTerminalLog('GEMINI:WARN', `Google 503 Server Congestion on key [${activeKeyInfo.id}]. Retrying in ${delayMs / 1000}s (Attempt ${attempt}/4)...`);
            await new Promise(r => setTimeout(r, delayMs));
            continue; // Retry with the SAME key!
          }
          // After 4 attempts fail on this key, proceed to failover and cooldown!
        }

        // Handle Rate Limit / Daily Quota / Permission Denied / (503 after 4 failed retries) with KeyManager Failover
        if (isRateLimit || isDenied || is503) {
          const failover = keyManager.markKeyExhausted(activeKeyInfo.key, err);
          if (failover.isDenied) {
            formatTerminalLog('KEY:DENIED', `Key [${failover.keyId}] permanently blocked by Google (403 Permission Denied). Auto-skipped!`);
          } else if (failover.isDailyLocked) {
            formatTerminalLog('KEY:LOCK24H', `Key [${failover.keyId}] exhausted daily quota (limit: 20). Locked for 24 HOURS.`);
          } else if (failover.is503) {
            formatTerminalLog('KEY:503', `Key [${failover.keyId}] exhausted 4 retries on Google 503. Cooldown for ${failover.waitDurationSec}s.`);
          } else {
            formatTerminalLog('KEY:COOLDOWN', `Key [${failover.keyId}] rate-limited. Cooldown for ${failover.waitDurationSec}s.`);
          }

          // If another healthy key is available in the pool, failover instantly!
          if (failover.nextKeyInfo) {
            formatTerminalLog('KEY:FAILOVER', `Instant failover (<0.1s) -> Switching to Key [${failover.nextKeyInfo.id}] (${failover.nextKeyInfo.remainingReady} keys ready)`);
            activeKeyInfo = failover.nextKeyInfo;
            ai = new GoogleGenAI({ apiKey: activeKeyInfo.key });

            // Re-upload to the new key's Gemini storage
            formatTerminalLog('GEMINI:API', `Uploading audio to new key [${activeKeyInfo.id}] storage...`);
            fileUpload = await ai.files.upload({
              file: filePath,
              mimeType: effectiveMimeType,
              config: { mimeType: effectiveMimeType }
            });
            audioPart = { fileData: { fileUri: fileUpload.uri, mimeType: fileUpload.mimeType || effectiveMimeType } };

            // Reset attempts for the fresh key and retry immediately!
            attempt = 0;
            continue;
          }
        }
        
        if (attempt <= maxRetries && isTransient) {
          let delayMs = is503 ? Math.min(attempt * 4000, 20000) : attempt * 3000;

          // Parse Google's exact retryDelay requirement (e.g. 33s)
          let googleDelaySec = 0;
          if (Array.isArray(err.details)) {
            const retryInfo = err.details.find(d => d && d.retryDelay);
            if (retryInfo && retryInfo.retryDelay) {
              googleDelaySec = parseFloat(retryInfo.retryDelay) || 0;
            }
          }
          if (!googleDelaySec && err.message) {
            const match = err.message.match(/retry in\s+([\d.]+)\s*s/i) || err.message.match(/retryDelay["']?:\s*["']?(\d+)s/i);
            if (match) {
              googleDelaySec = Math.ceil(parseFloat(match[1])) || 0;
            }
          }

          if (googleDelaySec > 0) {
            // Wait requested duration + 2s safety buffer
            delayMs = (Math.ceil(googleDelaySec) + 2) * 1000;
            formatTerminalLog('GEMINI:WARN', `Rate limit reached (429). Google requested waiting ${googleDelaySec}s. Auto-waiting ${delayMs / 1000}s to refresh quota (Attempt ${attempt}/${maxRetries})...`);
          } else if (is503) {
            formatTerminalLog('GEMINI:WARN', `Google 503 Server High Demand spike on key [${activeKeyInfo.id}]. Retrying in ${delayMs / 1000}s (Attempt ${attempt}/${maxRetries})...`);
          } else {
            formatTerminalLog('GEMINI:WARN', `Model [${targetModel}] temporary busy/unavailable. Retrying in ${delayMs / 1000}s (Attempt ${attempt}/${maxRetries})...`);
          }

          await new Promise(r => setTimeout(r, delayMs));
        } else {
          formatTerminalLog('GEMINI:ERROR', `Model [${targetModel}] failed after ${attempt} attempts: ${err.message}`);
          throw err;
        }
      }
    }

    // Cleanup uploaded file from Gemini storage to avoid quota accumulation
    try {
      if (fileUpload && fileUpload.name) {
        await ai.files.delete({ name: fileUpload.name });
      }
    } catch (cleanupErr) {
      console.warn('Gemini file cleanup warning:', cleanupErr.message);
    }

    // Extract transcription from response parts (handling both standard text and gemini-3.5 audioTranscription)
    let extractedSegments = null;
    let extractedText = '';

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    for (const part of parts) {
      const at = part.audioTranscription || part.audio_transcription;
      if (at) {
        formatTerminalLog('GEMINI:AI', 'Extracting from audioTranscription part', {
          type: typeof at,
          keys: (typeof at === 'object' && at) ? Object.keys(at).join(', ') : 'primitive'
        });

        if (Array.isArray(at)) {
          extractedSegments = at;
        } else if (typeof at === 'string') {
          extractedText += (extractedText ? '\n' : '') + at;
        } else if (typeof at === 'object' && at !== null) {
          if (Array.isArray(at.segments)) {
            extractedSegments = at.segments;
          } else if (Array.isArray(at.chunks)) {
            extractedSegments = at.chunks;
          } else if (Array.isArray(at.transcripts)) {
            extractedSegments = at.transcripts;
          } else if (typeof at.text === 'string' && at.text.trim()) {
            extractedText += (extractedText ? '\n' : '') + at.text;
          } else if (typeof at.transcript === 'string' && at.transcript.trim()) {
            extractedText += (extractedText ? '\n' : '') + at.transcript;
          } else if (Array.isArray(at.words)) {
            extractedSegments = groupWordsIntoSegments(at.words);
          } else {
            // Check any key in at that might contain string or array
            for (const key of Object.keys(at)) {
              if (Array.isArray(at[key])) {
                extractedSegments = at[key];
                break;
              } else if (typeof at[key] === 'string' && at[key].trim()) {
                extractedText += (extractedText ? '\n' : '') + at[key];
              }
            }
          }
        }
      } else if (typeof part.text === 'string' && part.text.trim()) {
        extractedText += (extractedText ? '\n' : '') + part.text;
      }
    }

    // Also check response.text as fallback
    if (!extractedText && !extractedSegments && response.text) {
      extractedText = response.text;
    }

    // If we have structured segments from audioTranscription
    if (Array.isArray(extractedSegments) && extractedSegments.length > 0) {
      const parsedSubtitles = extractedSegments.map((item, idx) => {
        const start = normalizeTimestamp(item.start || item.startTime || item.start_time, idx * 4);
        const end = normalizeTimestamp(item.end || item.endTime || item.end_time, idx * 4 + 3.8);
        const text = (item.text || item.transcript || item.content || '').trim();
        const originalText = (item.originalText || text).trim();
        const khmerText = (item.khmerText || item.translation || text).trim();
        const speaker = item.speaker || item.speakerTag || item.speaker_tag || 'Speaker 1';
        return {
          start,
          end,
          originalText,
          khmerText,
          text: khmerText || originalText,
          speaker: typeof speaker === 'number' ? `Speaker ${speaker}` : String(speaker)
        };
      }).filter(s => s.originalText.length > 0 || s.khmerText.length > 0);

      if (parsedSubtitles.length > 0) {
        formatTerminalLog('GEMINI:AI', `Generated ${parsedSubtitles.length} subtitles from audioTranscription structure`);
        return parsedSubtitles;
      }
    }

    if (!extractedText) {
      throw new Error('Gemini មិនបានផ្ដល់ចម្លើយត្រឡប់មកវិញទេ (គ្មានខ្លឹមសារសំឡេង ឬសំឡេងស្ងាត់)');
    }

    // Try parsing as JSON array
    try {
      let jsonStr = extractedText.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      const parsed = JSON.parse(jsonStr.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed.map((item, idx) => {
          const originalText = (item.originalText || item.text || item.transcript || item.content || '').trim();
          const khmerText = (item.khmerText || item.translation || originalText).trim();
          return {
            start: normalizeTimestamp(item.start, idx * 3),
            end: normalizeTimestamp(item.end, (idx + 1) * 3),
            originalText: originalText,
            khmerText: khmerText,
            text: khmerText || originalText,
            speaker: item.speaker || 'Speaker 1'
          };
        }).filter(s => s.originalText.length > 0 || s.khmerText.length > 0);

        formatTerminalLog('GEMINI:AI', `Generated ${normalized.length} subtitles from structured JSON`);
        return normalized;
      }
    } catch (_) {}

    // Otherwise parse plain text lines
    const lines = extractedText.split('\n').filter(l => l.trim().length > 0);
    const lineSegments = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(/\[?(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*[-–>]\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\]?\s*(.*)/);
      if (match) {
        const textContent = match[3].trim();
        lineSegments.push({
          start: match[1].replace('.', ','),
          end: match[2].replace('.', ','),
          originalText: textContent,
          khmerText: textContent,
          text: textContent,
          speaker: 'Speaker 1'
        });
      } else {
        const sSec = i * 4;
        const eSec = sSec + 3.8;
        lineSegments.push({
          start: formatSecondsToSRT(sSec),
          end: formatSecondsToSRT(eSec),
          originalText: line,
          khmerText: line,
          text: line,
          speaker: 'Speaker 1'
        });
      }
    }

    if (lineSegments.length > 0) {
      formatTerminalLog('GEMINI:AI', `Generated ${lineSegments.length} subtitles from text transcription`);
      return lineSegments;
    }

    throw new Error('Gemini មិនបានផ្ដល់ចម្លើយត្រឡប់មកវិញទេ (គ្មានខ្លឹមសារសំឡេង ឬសំឡេងស្ងាត់)');
  }
}

/**
 * Format seconds into standard SRT format "HH:MM:SS,mmm"
 */
function formatSecondsToSRT(seconds) {
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Normalize any timestamp format (seconds, "1.5s", Protobuf Duration, or HH:MM:SS) to "HH:MM:SS,mmm"
 */
function normalizeTimestamp(val, fallbackSec = 0) {
  if (val === null || val === undefined) return formatSecondsToSRT(fallbackSec);
  if (typeof val === 'number') return formatSecondsToSRT(val);
  if (typeof val === 'object') {
    const sec = Number(val.seconds || 0) + Number(val.nanos || 0) / 1e9;
    return formatSecondsToSRT(sec);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    // 1. Seconds format with or without 's' (e.g. "341.2s" or "341.2")
    if (/^\d+(\.\d+)?s?$/i.test(trimmed)) {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) return formatSecondsToSRT(num);
    }
    // 2. Standard HH:MM:SS,mmm or HH:MM:SS.mmm
    const tcMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
    if (tcMatch) {
      const h = tcMatch[1].padStart(2, '0');
      const m = tcMatch[2];
      const s = tcMatch[3];
      const ms = tcMatch[4].padEnd(3, '0').slice(0, 3);
      return `${h}:${m}:${s},${ms}`;
    }
    // 3. HH:MM:SS without ms
    const hmsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (hmsMatch) {
      const h = hmsMatch[1].padStart(2, '0');
      const m = hmsMatch[2];
      const s = hmsMatch[3];
      return `${h}:${m}:${s},000`;
    }
    // 4. MM:SS,mmm or MM:SS.mmm (e.g. "05:41,199" -> "00:05:41,199")
    const mmMatch = trimmed.match(/^(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
    if (mmMatch) {
      const m = mmMatch[1].padStart(2, '0');
      const s = mmMatch[2];
      const ms = mmMatch[3].padEnd(3, '0').slice(0, 3);
      return `00:${m}:${s},${ms}`;
    }
    // 5. MM:SS without ms (e.g. "05:41" -> "00:05:41,000")
    const mmssMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (mmssMatch) {
      const m = mmssMatch[1].padStart(2, '0');
      const s = mmssMatch[2];
      return `00:${m}:${s},000`;
    }
  }
  return formatSecondsToSRT(fallbackSec);
}

/**
 * Group word-level timestamps into readable subtitle phrases
 */
function groupWordsIntoSegments(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  const segments = [];
  const WORDS_PER_SEGMENT = 6;
  for (let i = 0; i < words.length; i += WORDS_PER_SEGMENT) {
    const chunkWords = words.slice(i, i + WORDS_PER_SEGMENT);
    const startVal = chunkWords[0].startTime || chunkWords[0].start_time || (i * 2);
    const endVal = chunkWords[chunkWords.length - 1].endTime || chunkWords[chunkWords.length - 1].end_time || (startVal + 2);
    const text = chunkWords.map(w => w.word || w.text || '').join(' ').trim();
    const speaker = chunkWords[0].speaker || chunkWords[0].speakerTag || 'Speaker 1';
    segments.push({
      start: normalizeTimestamp(startVal, i * 2),
      end: normalizeTimestamp(endVal, i * 2 + 2),
      text: text,
      speaker: typeof speaker === 'number' ? `Speaker ${speaker}` : String(speaker)
    });
  }
  return segments;
}

module.exports = new GeminiService();
