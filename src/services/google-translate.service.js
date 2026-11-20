const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');
const { expandKhmerRepetition } = require('./gemini.service');

class GoogleTranslateService {
  /**
   * Helper: Clean and expand Khmer repetition symbol for Edge TTS compatibility
   */
  sanitizeKhmerForTTS(text) {
    if (!text || typeof text !== 'string') return '';
    try {
      const expanded = expandKhmerRepetition(text);
      return expanded.replace(/\s+/g, ' ').trim();
    } catch (_) {
      return text.trim();
    }
  }

  /**
   * Helper: Extract translated text from varying Google response formats
   */
  extractTranslation(item) {
    if (!item) return '';
    if (Array.isArray(item)) {
      if (typeof item[0] === 'string') return item[0];
      if (Array.isArray(item[0]) && typeof item[0][0] === 'string') return item[0][0];
    }
    if (typeof item === 'string') return item;
    return '';
  }

  /**
   * Translate a single text string using resilient multi-endpoint fallback
   */
  async translateSingle(text, targetLang = 'km', sourceLang = 'auto') {
    const trimmed = (text || '').trim();
    if (!trimmed) return '';

    const lang = (!sourceLang || sourceLang === 'auto') ? 'auto' : (sourceLang.startsWith('zh') ? 'auto' : sourceLang);

    // Endpoint 1: clients5 dictionary Chrome extension API (Fastest & most reliable)
    try {
      const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(lang)}&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const extracted = this.extractTranslation(data);
        if (extracted && extracted.trim()) {
          return this.sanitizeKhmerForTTS(extracted);
        }
      }
    } catch (_) {}

    // Endpoint 2: translate.googleapis.com (POST mode to avoid URL length & GET throttling)
    try {
      const params = new URLSearchParams();
      params.append('q', trimmed);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(lang)}&tl=${encodeURIComponent(targetLang)}&dt=t`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        body: params.toString()
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const fullTranslation = data[0].map(segment => (segment && segment[0]) ? segment[0] : '').join('');
          if (fullTranslation.trim()) {
            return this.sanitizeKhmerForTTS(fullTranslation);
          }
        }
      }
    } catch (_) {}

    // Endpoint 3: Standard GET to translate.googleapis.com
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(lang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const fullTranslation = data[0].map(segment => (segment && segment[0]) ? segment[0] : '').join('');
          if (fullTranslation.trim()) {
            return this.sanitizeKhmerForTTS(fullTranslation);
          }
        }
      }
    } catch (err) {
      formatTerminalLog('GOOGLE_TRANSLATE:WARN', `Failed single line translation: ${err.message}`);
    }

    return '';
  }

  /**
   * Translate a batch chunk using multiple q parameters on clients5
   */
  async translateBatchWithMultiQ(lines, sourceLang = 'auto', targetLang = 'km') {
    const lang = (!sourceLang || sourceLang === 'auto') ? 'auto' : (sourceLang.startsWith('zh') ? 'auto' : sourceLang);
    const qParams = lines.map(l => `q=${encodeURIComponent(l)}`).join('&');
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(lang)}&tl=${encodeURIComponent(targetLang)}&${qParams}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      throw new Error(`clients5 HTTP status ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid JSON format from clients5');
    }

    return lines.map((_, idx) => {
      const item = data[idx];
      return this.extractTranslation(item);
    });
  }

  /**
   * Translate an array of subtitle objects using resilient multiline batching & fallback
   * @param {Array<{id: string|number, originalText?: string, text?: string}>} subtitles
   * @param {Object} options
   * @returns {Promise<Array<{id: string|number, originalText: string, khmerText: string, englishText: string}>>}
   */
  async translateSubtitles(subtitles, options = {}) {
    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return [];
    }

    const sourceLang = options.sourceLanguage || 'auto';
    formatTerminalLog('GOOGLE_TRANSLATE:START', `Translating ${subtitles.length} subtitle lines with Resilient Google Translate...`);
    formatTerminalProgress('TRANSLATE:PROGRESS', 1, 3, `Translating ${subtitles.length} lines via Google Translate (Free)...`);

    // Batch lines in chunks of 15 to keep GET URL length safely within limits
    const BATCH_SIZE = 15;
    const results = new Array(subtitles.length);

    for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
      const chunk = subtitles.slice(i, i + BATCH_SIZE);
      const joinedOriginals = chunk.map(s => (s.originalText || s.text || '').replace(/\r?\n/g, ' ').trim());

      let translatedChunkLines = null;

      // Strategy 1: High-Speed Multi-Q query (Guarantees exact 1-to-1 index matching without newline desync)
      try {
        translatedChunkLines = await this.translateBatchWithMultiQ(joinedOriginals, sourceLang, 'km');
      } catch (err) {
        formatTerminalLog('GOOGLE_TRANSLATE:WARN', `Multi-Q batch translation failed: ${err.message}. Trying multiline fallback...`);
      }

      // Strategy 2: Multiline \n joined fallback via POST to gtx
      if (!translatedChunkLines || translatedChunkLines.length !== chunk.length) {
        try {
          const queryText = joinedOriginals.join('\n');
          const params = new URLSearchParams();
          params.append('q', queryText);
          const lang = (!sourceLang || sourceLang === 'auto') ? 'auto' : (sourceLang.startsWith('zh') ? 'auto' : sourceLang);
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(lang)}&tl=km&dt=t`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: params.toString()
          });

          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && Array.isArray(data[0])) {
              const fullText = data[0].map(seg => (seg && seg[0]) ? seg[0] : '').join('');
              const splitLines = fullText.split('\n');
              if (splitLines.length === chunk.length) {
                translatedChunkLines = splitLines;
              }
            }
          }
        } catch (_) {}
      }

      // Map translations to results
      for (let j = 0; j < chunk.length; j++) {
        const globalIdx = i + j;
        const sub = chunk[j];
        const orig = joinedOriginals[j];
        let km = (translatedChunkLines && translatedChunkLines[j]) ? translatedChunkLines[j].trim() : '';

        // If batch missed this line, use single fallback
        if (!km && orig) {
          km = await this.translateSingle(orig, 'km', sourceLang);
        }

        results[globalIdx] = {
          id: sub.id,
          originalText: orig,
          khmerText: this.sanitizeKhmerForTTS(km),
          englishText: sub.englishText || ''
        };
      }

      // Small 50ms pause between batches
      if (i + BATCH_SIZE < subtitles.length) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    const successfulTranslations = results.filter(r => r && r.khmerText && /[\u1780-\u17FF]/.test(r.khmerText)).length;
    formatTerminalProgress('TRANSLATE:PROGRESS', 3, 3, `Google Translation complete! Successfully translated ${successfulTranslations}/${results.length} lines into Khmer.`);
    formatTerminalLog('GOOGLE_TRANSLATE:DONE', `Successfully translated ${successfulTranslations}/${results.length} lines into Khmer.`);

    // If completely blocked or 0 lines translated from foreign source, notify user clearly
    if (subtitles.length > 0 && successfulTranslations === 0) {
      throw new Error('Google Translate មិនអាចបកប្រែជាភាសាខ្មែរបានទេ (Google បានទប់ស្កាត់ IP ឬមានបញ្ហា Network)។ សូមព្យាយាមម្តងទៀត ឬបញ្ចូល Gemini API Key នៅក្នុង Settings ដើម្បីបកប្រែបាន ១០០%!');
    }

    return results;
  }
}

module.exports = new GoogleTranslateService();
