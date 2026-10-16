const { GoogleGenAI } = require('@google/genai');
const { buildStep1Prompt, buildStep2Prompt, buildZhToKmPrompt } = require('../prompts/translation-prompts');

/**
 * Languages we treat as "already English" — a source tagged with one of these
 * skips Step 1 entirely and goes straight into the Khmer adaptation.
 */
const ENGLISH_TAGS = ['en', 'eng', 'english', 'en-us', 'en-gb'];

/**
 * Languages we treat as "Chinese" — these are eligible for the DIRECT
 * Chinese -> Khmer single-call path (1 quota instead of 2).
 */
const CHINESE_TAGS = ['zh', 'zho', 'chi', 'cmn', 'yue', 'zh-cn', 'zh-tw', 'zh-hans', 'zh-hant', 'chinese', 'mandarin', 'cantonese'];

/**
 * Normalise whatever the STT engine reported and the client echoed back into
 * one of three routing buckets: 'zh' | 'en' | 'other'.
 *
 * @param {string|null|undefined} raw
 * @returns {'zh'|'en'|'other'}
 */
function normaliseSourceLanguage(raw) {
  if (!raw || typeof raw !== 'string') return 'other';
  const tag = raw.trim().toLowerCase();
  if (!tag) return 'other';
  if (ENGLISH_TAGS.includes(tag)) return 'en';
  if (CHINESE_TAGS.includes(tag)) return 'zh';
  // Fall back to the primary subtag ('zh-CN' -> 'zh', 'en-US' -> 'en').
  const primary = tag.split(/[-_]/)[0];
  if (ENGLISH_TAGS.includes(primary)) return 'en';
  if (CHINESE_TAGS.includes(primary)) return 'zh';
  return 'other';
}

/**
 * Resolve the translation mode from env + detected source language.
 *
 *   TRANSLATION_MODE=bridge  -> always 2-step (legacy behaviour, 2 quotas)
 *   TRANSLATION_MODE=direct  -> always single-call (best effort, 1 quota)
 *   TRANSLATION_MODE=auto    -> Chinese source -> direct, everything else -> bridge
 *
 * An explicit TRANSLATION_MODE other than 'auto' always wins, so the feature can
 * be switched off instantly without a code change.
 *
 * @param {string|null} sourceLanguage
 * @returns {{mode: 'direct'|'bridge', bucket: 'zh'|'en'|'other', reason: string}}
 */
function resolveTranslationMode(sourceLanguage) {
  const envMode = String(process.env.TRANSLATION_MODE || 'auto').trim().toLowerCase();
  const bucket = normaliseSourceLanguage(sourceLanguage);

  if (envMode === 'bridge') {
    return { mode: 'bridge', bucket, reason: 'TRANSLATION_MODE=bridge (forced 2-step)' };
  }
  if (envMode === 'direct') {
    return { mode: 'direct', bucket, reason: 'TRANSLATION_MODE=direct (forced single-call)' };
  }
  if (bucket === 'zh') {
    return { mode: 'direct', bucket, reason: 'source language is Chinese -> direct zh->km' };
  }
  return { mode: 'bridge', bucket, reason: `source language '${bucket}' -> bridged via English` };
}

/**
 * The Khmer repetition symbol "ៗ" is banned from Khmer dubbing output because the
 * Edge-TTS engine mispronounces it. The Step 2 prompt asks the model to spell the
 * word out twice instead, but models occasionally leak the symbol anyway — so we
 * expand it defensively before the text ever reaches the TTS worker.
 *
 * "លឿនៗ"                       -> "លឿនលឿន"
 * "លឿន ៗ ណាស់"                 -> "លឿនលឿន ណាស់"
 * "គម្រោងឆ្កួតៗ"                -> "គម្រោងឆ្កួតឆ្កួត"   (doubles the final syllable only)
 *
 * Khmer is written without spaces between the syllables of a word, so we cannot
 * simply take the last whitespace-delimited token: "គម្រោងឆ្កួតៗ" must become
 * "គម្រោងឆ្កួតឆ្កួត" (only the final syllable repeats), not
 * "គម្រោងឆ្កួតគម្រោងឆ្កួត".
 *
 * A Khmer syllable is: (subscript consonant)* base consonant vowel? final?  — a
 * vowel sign always opens a new syllable. So to find the last syllable we walk
 * back from the end and stop as soon as we have passed exactly one vowel sign.
 *
 * @param {string} text
 * @returns {string}
 */
function expandKhmerRepetition(text) {
  if (!text || typeof text !== 'string' || !text.includes('ៗ')) return text;

  // Any Khmer whitespace, or the zero-width space Khmer uses for line breaking.
  const SEPARATOR = /[ \t\u200B\u00A0]/;
  const KHMER_LETTER = /[\u1780-\u17A2\u17A5-\u17B3]/; // consonants + independent vowels
  const VOWEL_SIGN = /[\u17B4-\u17C5]/;                // dependent vowel signs
  const MARK = /[\u17C6-\u17D3]/;                      // coeng + other signs

  return text
    .split('\n')
    .map((line) => {
      let out = '';
      let i = 0;
      while (i < line.length) {
        if (line[i] === 'ៗ') {
          // Drop separators sitting between the word and the symbol.
          out = out.replace(/[ \t\u200B\u00A0]+$/, '');
          // Walk back through the final syllable: skip trailing final consonants
          // and marks, then the one vowel sign that opens the syllable, then the
          // base consonant and any coeng subscripts in front of it.
          let start = out.length;
          let sawVowel = false;
          while (start > 0) {
            const ch = out[start - 1];
            if (SEPARATOR.test(ch)) break;
            if (VOWEL_SIGN.test(ch)) {
              sawVowel = true;
              start--;
              break;
            }
            if (KHMER_LETTER.test(ch) || MARK.test(ch)) {
              start--;
              continue;
            }
            break; // punctuation outside the Khmer block ends the word
          }
          if (sawVowel) {
            // Include the full onset in front of the vowel: base consonant plus
            // any coeng subscripts it carries.
            while (start > 0 && MARK.test(out[start - 1])) start--;
            if (start > 0 && KHMER_LETTER.test(out[start - 1])) start--;
            while (start > 0 && out[start - 1] === '\u17D2') {
              start--;
              if (start > 0 && KHMER_LETTER.test(out[start - 1])) start--;
            }
          } else {
            // No vowel sign: the syllable is just the letter run we walked over.
            while (start > 0 && MARK.test(out[start - 1])) start--;
            if (start > 0 && KHMER_LETTER.test(out[start - 1])) start--;
          }
          out += out.slice(start);
          i++;
          while (i < line.length && SEPARATOR.test(line[i])) {
            if (out && !SEPARATOR.test(out[out.length - 1])) out += ' ';
            i++;
          }
        } else {
          out += line[i];
          i++;
        }
      }
      return out;
    })
    .join('\n');
}

/**
 * Parse a subtitle timestamp ("00:01:23,456" / "01:23.4" / 12.5) into seconds.
 * @param {string|number} val
 * @returns {number}
 */
function parseTsSec(val) {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 0;
  const clean = val.trim().replace(',', '.');
  const p = clean.split(':');
  if (p.length === 3) return parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2]);
  if (p.length === 2) return parseFloat(p[0]) * 60 + parseFloat(p[1]);
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Compute the padded speaking duration for a subtitle line and the word ceiling
 * derived from it. Shared by the English->Khmer and Chinese->Khmer callers so the
 * time budget stays identical whichever route is taken.
 *
 * @param {Object} s Subtitle record.
 * @param {number} endPadding Extra seconds granted past the original end time.
 * @returns {{dur: number, maxWords: number}}
 */
function computeTimeBudget(s, endPadding) {
  let dur = 2.0;
  if (typeof s.startSec === 'number' && typeof s.endSec === 'number' && s.endSec > s.startSec) {
    dur = s.endSec - s.startSec;
  } else {
    const st = parseTsSec(s.start);
    const et = parseTsSec(s.end);
    if (et > st) dur = et - st;
  }
  dur = Math.max(0.6, Math.round((dur + endPadding) * 10) / 10);
  const maxWords = Math.max(3, Math.round(dur * 3.5));
  return { dur, maxWords };
}

/**
 * Tolerant JSON extraction: models occasionally wrap JSON in prose or code
 * fences despite the responseMimeType constraint.
 *
 * @param {string} rawJson
 * @returns {Object}
 */
function parseJsonLoose(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') return {};
  try {
    return JSON.parse(rawJson.trim());
  } catch (_) {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_2) {
        return {};
      }
    }
    return {};
  }
}

/**
 * Pick a field out of a translation map entry, tolerating the various key
 * spellings and bare-string responses the model sometimes emits.
 *
 * @param {Object} transMap
 * @param {number} idx Zero-based line index.
 * @param {string[]} keys Candidate field names, in priority order.
 * @returns {string}
 */
function pickTranslated(transMap, idx, keys) {
  const item = transMap[String(idx + 1)] || transMap[idx + 1];
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') {
    for (const k of keys) {
      if (typeof item[k] === 'string' && item[k].trim()) return item[k].trim();
    }
  }
  return '';
}

/**
 * Gemini Service - AI translation engine for the 2-step dubbing pipeline.
 * Step 1: Chinese -> English (idioms, banter & ASR homophone correction)
 * Step 2: English -> Spoken Cinema Khmer (time-aligned dubbing lines)
 *
 * A DIRECT single-call Chinese -> Khmer path is also available when the source
 * audio is detected as Chinese (see translateDirect / TRANSLATION_MODE).
 *
 * The prompt wording itself lives in ../prompts/translation-prompts.js so it can
 * be reviewed and tested separately from this transport/failover layer.
 */
class GeminiService {
  /**
   * Helper: Execute Gemini content generation with key failover, 503 retry, and error logging
   */
  async executeWithFailover(prompt, customApiKey = null, logTag = 'TRANSLATE:AI') {
    const keyManager = require('./key-manager.service');
    const { formatTerminalLog } = require('../utils/terminal-logger');

    keyManager.logPoolStatus(customApiKey);
    let activeKeyInfo = keyManager.getActiveKey(customApiKey);
    let currentModel = process.env.GEMINI_TRANSLATION_MODEL || 'gemini-3.6-flash';
    let ai = new GoogleGenAI({ apiKey: activeKeyInfo.key });

    const maxRetries = 4;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        formatTerminalLog(logTag, `Invoking Gemini [${currentModel}] with Key [${activeKeyInfo.id}]...`);
        const startTime = Date.now();
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: [{ text: prompt }],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        formatTerminalLog('TRANSLATE:OK', `Gemini response received in ${elapsed}s`);
        return response.text;
      } catch (err) {
        const errStr = (err && (err.message || JSON.stringify(err))) || '';
        const isDenied = errStr.includes('PERMISSION_DENIED') || errStr.includes('403') || errStr.includes('API_KEY_INVALID');
        const is503 = errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('high demand');
        const isRateLimit = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota exceeded');

        if (is503 && attempt < 3) {
          attempt++;
          const delay = attempt * 3000;
          formatTerminalLog('TRANSLATE:WARN', `503 High Demand on Gemini, retrying in ${delay / 1000}s (attempt ${attempt}/3)...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        if (isRateLimit || isDenied || is503) {
          const failover = keyManager.markKeyExhausted(activeKeyInfo.key, err);
          if (failover.nextKeyInfo) {
            formatTerminalLog('TRANSLATE:FAILOVER', `Failover to Key [${failover.nextKeyInfo.id}]`);
            activeKeyInfo = failover.nextKeyInfo;
            ai = new GoogleGenAI({ apiKey: activeKeyInfo.key });
            attempt = 0;
            continue;
          }
        }
        formatTerminalLog('TRANSLATE:ERROR', `Gemini call failed: ${err.message}`);
        throw err;
      }
    }
  }

  /**
   * STEP 1: Translate foreign speech (Chinese/English) into accurate, culturally aware English
   * Performs contextual ASR homophone auto-correction and preserves comedic/dramatic punchlines.
   * Consumes 1 Gemini Quota.
   */
  async translateChineseToEnglish(subtitles, customApiKey = null, options = {}) {
    const inputLines = subtitles.map((s, idx) => {
      const text = (s.originalText || s.text || '').trim();
      return `${idx + 1}. ${text}`;
    }).join('\n');

    const prompt = buildStep1Prompt(inputLines);

    const rawJson = await this.executeWithFailover(prompt, customApiKey, 'TRANSLATE:STEP1_EN');
    const transMap = parseJsonLoose(rawJson);

    return subtitles.map((sub, idx) => {
      const englishResult = pickTranslated(transMap, idx, ['englishText', 'english', 'en']);
      return {
        ...sub,
        englishText: englishResult || sub.englishText || (sub.originalText || '')
      };
    });
  }

  /**
   * STEP 2: Adapt verified English dialogue into Natural Spoken Cinema Khmer dubbing lines
   * Strictly enforces duration budgeting and bans textbook/robotic phrasing and hallucinated "ចាស់ៗ".
   * Consumes 1 Gemini Quota.
   */
  async translateEnglishToKhmer(subtitles, customApiKey = null, options = {}) {
    const endPadding = typeof options?.endPadding === 'number' ? options.endPadding : 0.70;

    const inputLines = subtitles.map((s, idx) => {
      const { dur, maxWords } = computeTimeBudget(s, endPadding);
      const en = (s.englishText || s.text || s.originalText || '').trim();
      return `${idx + 1}. [Duration: ${dur}s, Max Words: ~${maxWords}] ${en}`;
    }).join('\n');

    const prompt = buildStep2Prompt(inputLines);

    const rawJson = await this.executeWithFailover(prompt, customApiKey, 'TRANSLATE:STEP2_KM');
    const transMap = parseJsonLoose(rawJson);

    return subtitles.map((sub, idx) => {
      const khmerResult = pickTranslated(transMap, idx, ['khmerText', 'khmer', 'km']);
      return {
        ...sub,
        khmerText: expandKhmerRepetition(khmerResult) || (sub.khmerText || '')
      };
    });
  }

  /**
   * DIRECT: Chinese -> Spoken Cinema Khmer in ONE Gemini call (Consumes 1 Quota).
   *
   * Used when the STT engine reports a Chinese source. Merges the ASR homophone
   * repair / meme decoding of Step 1 with the Khmer dubbing rules of Step 2, so
   * no English pivot is generated and no English line is shown in the UI.
   *
   * Returns each line with `englishText` mirrored from `originalText` — the UI
   * uses that equality to suppress the redundant EN badge.
   *
   * @param {Array} subtitles
   * @param {string} [customApiKey]
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async translateChineseToKhmer(subtitles, customApiKey = null, options = {}) {
    const endPadding = typeof options?.endPadding === 'number' ? options.endPadding : 0.70;

    const inputLines = subtitles.map((s, idx) => {
      const { dur, maxWords } = computeTimeBudget(s, endPadding);
      const zh = (s.originalText || s.text || '').trim();
      return `${idx + 1}. [Duration: ${dur}s, Max Words: ~${maxWords}] ${zh}`;
    }).join('\n');

    const prompt = buildZhToKmPrompt(inputLines);

    const rawJson = await this.executeWithFailover(prompt, customApiKey, 'TRANSLATE:DIRECT_KM');
    const transMap = parseJsonLoose(rawJson);

    return subtitles.map((sub, idx) => {
      const khmerResult = pickTranslated(transMap, idx, ['khmerText', 'khmer', 'km']);
      const original = sub.originalText || sub.text || '';
      return {
        ...sub,
        // Mirror the original so the renderer knows there is no English pivot.
        englishText: sub.englishText || original,
        khmerText: expandKhmerRepetition(khmerResult) || (sub.khmerText || '')
      };
    });
  }

  /**
   * Router: pick the cheapest correct path for the detected source language.
   *
   *   Chinese source + auto/direct mode -> 1 call  (Chinese -> Khmer)
   *   English / unknown   + auto mode   -> 2 calls (x -> English -> Khmer)
   *
   * @param {Array} subtitles
   * @param {string} [customApiKey]
   * @param {Object} [options] `options.sourceLanguage` overrides AUTO detection.
   * @returns {Promise<Array>}
   */
  async translateDirect(subtitles, customApiKey = null, options = {}) {
    const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');

    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return subtitles || [];
    }

    const route = resolveTranslationMode(options?.sourceLanguage || options?.language);
    formatTerminalLog('TRANSLATE:ROUTE', `Mode=${route.mode} | ${route.reason} (${subtitles.length} lines)`);

    if (route.mode === 'direct') {
      formatTerminalProgress('TRANSLATE:PROGRESS', 1, 2, `Direct ${route.bucket === 'zh' ? 'Chinese' : 'source'} -> Khmer translation (1-call mode)...`);
      const res = await this.translateChineseToKhmer(subtitles, customApiKey, options);
      formatTerminalProgress('TRANSLATE:PROGRESS', 2, 2, `Direct translation complete: ${res.length} Khmer lines (1 Quota)`);
      return res;
    }

    return this.translateBridged(subtitles, customApiKey, options);
  }

  /**
   * The legacy 2-step chain, exposed as a named method so the router can defer
   * to it without duplicating the progress reporting.
   */
  async translateBridged(subtitles, customApiKey = null, options = {}) {
    const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');

    formatTerminalProgress('TRANSLATE:PROGRESS', 1, 4, `Step 1/2: Preparing source -> English Contextual Translation (${subtitles.length} lines)...`);
    formatTerminalLog('TRANSLATE:START', `Starting 2-Separate-Step Translation Pipeline for ${subtitles.length} subtitles (Consuming 2 Quotas)...`);

    // STEP 1: source -> English (Quota 1)
    formatTerminalLog('TRANSLATE:PHASE1', `--- Step 1/2: source -> English (Capturing idioms, banter & homophones) ---`);
    const step1Subs = await this.translateChineseToEnglish(subtitles, customApiKey, options);
    formatTerminalProgress('TRANSLATE:PROGRESS', 2, 4, `Step 1/2 Complete: English context verified!`);

    // STEP 2: English -> Spoken Cinema Khmer (Quota 2)
    formatTerminalProgress('TRANSLATE:PROGRESS', 3, 4, `Step 2/2: Adapting to Spoken Cinema Khmer dubbing...`);
    formatTerminalLog('TRANSLATE:PHASE2', `--- Step 2/2: English -> Spoken Cinema Khmer (Time-aligned dubbing) ---`);
    const finalSubs = await this.translateEnglishToKhmer(step1Subs, customApiKey, options);

    formatTerminalProgress('TRANSLATE:PROGRESS', 4, 4, `Translation Complete: Generated ${finalSubs.length} Khmer dubbing lines!`);
    formatTerminalLog('TRANSLATE:SUCCESS', `2-Step Translation successfully completed (2 Quotas consumed, ${finalSubs.length} lines translated)`);
    return finalSubs;
  }

  /**
   * Translate subtitles into Khmer.
   *
   * ROUTING (see TRANSLATION_MODE env var):
   *   - Chinese source  -> 1 call  (direct zh -> km), no English line produced.
   *   - English source  -> 2 calls (en -> en polish -> km).
   *   - Unknown source  -> 2 calls (safe default, preserves current behaviour).
   *
   * Explicit `options.onlyStep1` / `options.onlyStep2` still force a single
   * targeted step, used by the UI's "re-run this step only" buttons.
   *
   * @param {Array<{id?: number, originalText?: string, text?: string, khmerText?: string}>} subtitles
   * @param {string} [customApiKey]
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async translateSubtitles(subtitles, customApiKey = null, options = {}) {
    const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');

    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return subtitles || [];
    }

    // Support single-step execution if explicitly requested by client options
    if (options.onlyStep1) {
      formatTerminalProgress('TRANSLATE:PROGRESS', 1, 2, `Running Step 1 ONLY (source -> English) for ${subtitles.length} lines`);
      formatTerminalLog('TRANSLATE:START', `Running Step 1 ONLY (source -> English) for ${subtitles.length} lines`);
      const res = await this.translateChineseToEnglish(subtitles, customApiKey, options);
      formatTerminalProgress('TRANSLATE:PROGRESS', 2, 2, `Step 1 Complete: Translated ${res.length} lines to English`);
      return res;
    }
    if (options.onlyStep2) {
      formatTerminalProgress('TRANSLATE:PROGRESS', 1, 2, `Running Step 2 ONLY (English -> Khmer) for ${subtitles.length} lines`);
      formatTerminalLog('TRANSLATE:START', `Running Step 2 ONLY (English -> Khmer) for ${subtitles.length} lines`);
      const res = await this.translateEnglishToKhmer(subtitles, customApiKey, options);
      formatTerminalProgress('TRANSLATE:PROGRESS', 2, 2, `Step 2 Complete: Translated ${res.length} lines to Khmer`);
      return res;
    }

    return this.translateDirect(subtitles, customApiKey, options);
  }
}

module.exports = new GeminiService();
// Exposed for unit testing — the TTS safety net and the routing helpers, not part
// of the public service API.
module.exports.expandKhmerRepetition = expandKhmerRepetition;
module.exports.normaliseSourceLanguage = normaliseSourceLanguage;
module.exports.resolveTranslationMode = resolveTranslationMode;
module.exports.computeTimeBudget = computeTimeBudget;
module.exports.parseJsonLoose = parseJsonLoose;
