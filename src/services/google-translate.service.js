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
   * Translate a single text string using free Google Translate endpoint
   */
  async translateSingle(text, targetLang = 'km', sourceLang = 'auto') {
    const trimmed = (text || '').trim();
    if (!trimmed) return '';

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });

      if (!res.ok) {
        throw new Error(`Google Translate HTTP error ${res.status}`);
      }

      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const fullTranslation = data[0].map(segment => segment[0]).join('');
        return this.sanitizeKhmerForTTS(fullTranslation);
      }
      return trimmed;
    } catch (err) {
      formatTerminalLog('GOOGLE_TRANSLATE:WARN', `Failed single line translation: ${err.message}`);
      return trimmed;
    }
  }

  /**
   * Translate an array of subtitle objects using high-speed multiline batching
   * @param {Array<{id: string|number, originalText?: string, text?: string}>} subtitles
   * @param {Object} options
   * @returns {Promise<Array<{id: string|number, originalText: string, khmerText: string, englishText: string}>>}
   */
  async translateSubtitles(subtitles, options = {}) {
    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return [];
    }

    const sourceLang = options.sourceLanguage || 'auto';
    formatTerminalLog('GOOGLE_TRANSLATE:START', `Translating ${subtitles.length} subtitle lines with Free Google Translate (Multiline Batches)...`);
    formatTerminalProgress('TRANSLATE:PROGRESS', 1, 3, `Translating ${subtitles.length} lines via Google Translate (Free)...`);

    // Batch lines in chunks of 25 to send multiline requests (blazing fast & 0 rate limits)
    const BATCH_SIZE = 25;
    const results = new Array(subtitles.length);

    for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
      const chunk = subtitles.slice(i, i + BATCH_SIZE);
      const joinedOriginals = chunk.map(s => (s.originalText || s.text || '').replace(/\r?\n/g, ' ').trim());
      const queryText = joinedOriginals.join('\n');

      let translatedChunkLines = [];
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=km&dt=t&q=${encodeURIComponent(queryText)}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && Array.isArray(data[0])) {
            const fullText = data[0].map(seg => seg[0]).join('');
            translatedChunkLines = fullText.split('\n');
          }
        }
      } catch (err) {
        formatTerminalLog('GOOGLE_TRANSLATE:WARN', `Batch chunk translation error: ${err.message}`);
      }

      for (let j = 0; j < chunk.length; j++) {
        const globalIdx = i + j;
        const sub = chunk[j];
        const orig = joinedOriginals[j];
        let km = translatedChunkLines[j] ? translatedChunkLines[j].trim() : '';

        // If batch split missed a line, use single fallback
        if (!km && orig) {
          km = await this.translateSingle(orig, 'km', sourceLang);
        }

        results[globalIdx] = {
          id: sub.id,
          originalText: orig,
          khmerText: this.sanitizeKhmerForTTS(km || orig),
          englishText: sub.englishText || ''
        };
      }

      // Small 50ms pause between batches to be ultra respectful
      if (i + BATCH_SIZE < subtitles.length) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    formatTerminalProgress('TRANSLATE:PROGRESS', 3, 3, `Completed Google Translation for ${results.length} lines!`);
    formatTerminalLog('GOOGLE_TRANSLATE:DONE', `Successfully translated ${results.length} lines into Khmer.`);

    return results;
  }
}

module.exports = new GoogleTranslateService();
