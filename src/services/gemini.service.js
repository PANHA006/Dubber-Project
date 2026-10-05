const { GoogleGenAI } = require('@google/genai');

/**
 * Gemini Service - AI translation engine for the 2-step dubbing pipeline.
 * Step 1: Chinese -> English (idioms, banter & ASR homophone correction)
 * Step 2: English -> Spoken Cinema Khmer (time-aligned dubbing lines)
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

    const prompt = `You are an elite Chinese-English audiovisual localization master and screenplay translator (អ្នកឯកទេសបកប្រែភាពយន្តចិន-អង់គ្លេសកម្រិតកំពូល).
Your mission is STEP 1 of a 2-step dubbing pipeline: Translate spoken Chinese dialogue into natural, accurate, culturally aware spoken English.

CRITICAL LOCALIZATION RULES:
1. CONTEXTUAL ASR HOMOPHONE DISAMBIGUATION (កែសម្រួលអក្សរស្តាប់ច្រឡំ):
   - Speech recognition (Whisper) frequently mistranscribes Chinese homophones (e.g. 占 vs 站, 奶狗 vs 乃哥, 狗 vs 走, etc.).
   - Read the ENTIRE DIALOGUE SCENE holistically. Infer the true intended spoken words from the conversational context and correct any homophone errors!

2. DECODE CULTURAL MEMES, SLANG & BANTER (យល់ពីពាក្យកំប្លែង ឌឺដង និង Slang):
   - Understand internet memes, modern dating terms (e.g. 小奶狗 = cute sweet puppy boyfriend), puns, teasing, roasts, and colloquial sarcasm.
   - Preserve comedic punchlines! When Character A sets up a roast and Character B retorts, the English translation MUST maintain the witty punchline connection.

3. CONVERSATIONAL SPOKEN ENGLISH:
   - Output natural conversational English dialogue suitable for subtitles/dubbing. Avoid robotic, word-by-word literal translations.

4. OUTPUT FORMAT (STRICT JSON ONLY):
   - Return ONLY a valid JSON object mapping string line numbers ("1", "2", "3"...) to an object containing "englishText".
Example output format:
{
  "1": {
    "englishText": "Look at other people's boyfriends, they're total cuties. Look at you, you only match one word: dog!"
  },
  "2": {
    "englishText": "Right, right, right, I took one word, but you took the other two words!"
  },
  "3": {
    "englishText": "Are you tired of living?!"
  }
}

Lines to translate:
${inputLines}`;

    const rawJson = await this.executeWithFailover(prompt, customApiKey, 'TRANSLATE:STEP1_EN');
    let transMap = {};
    try {
      transMap = JSON.parse(rawJson.trim());
    } catch (_) {
      const match = rawJson.match(/\{[\s\S]*\}/);
      if (match) transMap = JSON.parse(match[0]);
    }

    return subtitles.map((sub, idx) => {
      const item = transMap[String(idx + 1)] || transMap[idx + 1];
      let englishResult = '';
      if (typeof item === 'object' && item !== null) {
        englishResult = (item.englishText || item.english || item.en || '').trim();
      } else if (typeof item === 'string') {
        englishResult = item.trim();
      }
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

    const inputLines = subtitles.map((s, idx) => {
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
      const en = (s.englishText || s.text || s.originalText || '').trim();
      return `${idx + 1}. [Duration: ${dur}s, Max Words: ~${maxWords}] ${en}`;
    }).join('\n');

    const prompt = `You are an elite Cambodian movie dubbing director and senior audiovisual localization master (អ្នកដឹកនាំការបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព).
Your mission is STEP 2 of a 2-step dubbing pipeline: Adapt clear, verified English dialogue into natural, punchy, conversational spoken Khmer (ភាសានិយាយប្រែរឿងភាពយន្ត) strictly fitting the speaking duration window.

CRITICAL DUBBING LEXICON & TIME-ALIGNMENT RULES:
1. NATURAL SPOKEN CINEMA KHMER (ភាសានិយាយប្រែរឿងភាពយន្ត):
   - Translate like real voice actors talking naturally in Cambodian dubbed cinema!
   - Use natural conversational pronouns and spoken particles: «ឯង, ខ្ញុំ, នាង, ពួកយើង, ម៉េចចឹង, អ៊ែមតើ, អើ, ហ្នឹងហើយ, មែនទេ, ចង់ងាប់ហើយហ្អី...».
   - STRICTLY BAN textbook, robotic, or literal dictionary translations (ហាមដាច់ខាតភាសាសៀវភៅ ឬបកប្រែពាក្យមួយៗតាមវចនានុក្រម).

2. ABSOLUTE PROHIBITION ON "ចាស់ៗ" (ANTI-HALLUCINATION GUARD):
   - For agreements or affirmations ("Right, right, right", "Yes, yes", "Yeah, yeah", "Sure"):
     * MUST translate as: «បាទៗ», «អើៗ», «ត្រូវហើយៗ», or «ចាសៗ».
     * NEVER EVER output «ចាស់ៗ» (which means "old people/elderly")! Outputting «ចាស់ៗ» for agreement is an intolerable error.

3. RHETORICAL ANGER & CONFRONTATION:
   - For expressions like "Have you had enough of living?", "Are you tired of living?":
     * Translate as: «ឯងចង់ងាប់ហើយមែនទេ?!» or «ចង់ងាប់ហើយហ្អី?!».
     * NEVER output broken, awkward particles like «ហំ?».

4. STRICT TIME BUDGET & PACING (តម្រឹមតាមវិនាទី Duration):
   - If duration is short (< 1.5s): Keep Khmer translation ultra-short (3 to 5 words maximum).
   - If duration is moderate (1.5s - 2.5s): Keep Khmer translation between 5 to 8 words.
   - If duration is longer (> 2.5s): Keep Khmer translation between 8 to 12 words.

5. REMOVE AWKWARD PADDING & FILLERS:
   - Strip off unnecessary polite trailing particles like "ណា៎", "ខាងក្រោមណា", repetitive relative pronouns like "ដែលទើបតែក...", etc.
   - If a line contains ' / ' or double spaces, translate smoothly into a single natural, connected sentence. DO NOT output '/' in the final translation.

6. OUTPUT FORMAT (STRICT JSON ONLY):
   - Return ONLY a valid JSON object mapping string line numbers ("1", "2", "3"...) to an object containing "khmerText".
Example output format:
{
  "1": {
    "khmerText": "គម្រោងឆ្កួតៗ កែឡើងដប់ដងហើយ"
  },
  "2": {
    "khmerText": "ត្រូវហើយៗ ឯងជាមេតើ"
  }
}

Lines to translate:
${inputLines}`;

    const rawJson = await this.executeWithFailover(prompt, customApiKey, 'TRANSLATE:STEP2_KM');
    let transMap = {};
    try {
      transMap = JSON.parse(rawJson.trim());
    } catch (_) {
      const match = rawJson.match(/\{[\s\S]*\}/);
      if (match) transMap = JSON.parse(match[0]);
    }

    return subtitles.map((sub, idx) => {
      const item = transMap[String(idx + 1)] || transMap[idx + 1];
      let khmerResult = '';
      if (typeof item === 'object' && item !== null) {
        khmerResult = (item.khmerText || item.khmer || item.km || '').trim();
      } else if (typeof item === 'string') {
        khmerResult = item.trim();
      }
      return {
        ...sub,
        khmerText: khmerResult || (sub.khmerText || '')
      };
    });
  }

  /**
   * Translate subtitles using 2 SEPARATE sequential Gemini API calls (Consuming 2 Quotas):
   * Step 1 (Quota 1): Chinese -> English (Capturing idioms, banter & ASR homophone correction)
   * Step 2 (Quota 2): English -> Spoken Cinema Khmer (Time-aligned dubbing lines, no "ចាស់ៗ")
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
      formatTerminalProgress('TRANSLATE:PROGRESS', 1, 2, `Running Step 1 ONLY (Chinese -> English) for ${subtitles.length} lines`);
      formatTerminalLog('TRANSLATE:START', `Running Step 1 ONLY (Chinese -> English) for ${subtitles.length} lines`);
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

    formatTerminalProgress('TRANSLATE:PROGRESS', 1, 4, `Step 1/2: Preparing Chinese -> English Contextual Translation (${subtitles.length} lines)...`);
    formatTerminalLog('TRANSLATE:START', `Starting 2-Separate-Step Translation Pipeline for ${subtitles.length} subtitles (Consuming 2 Quotas)...`);

    // STEP 1: Chinese -> English (Quota 1)
    formatTerminalLog('TRANSLATE:PHASE1', `--- Step 1/2: Chinese -> English (Capturing idioms, banter & homophones) ---`);
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
}

module.exports = new GeminiService();
