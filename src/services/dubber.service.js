/**
 * Dubber Service - Reports project/system status for the dubber platform.
 */

const groqKeyManager = require('./groq-key-manager.service');

class DubberService {
  /**
   * Get project system status and summary
   */
  async getStatus() {
    const rawGemini = (process.env.GEMINI_API_KEY || '').trim();
    const hasGeminiKey = Boolean(rawGemini && !rawGemini.includes('your_gemini_api_key_here') && rawGemini.length > 5);
    const rawGroq = (process.env.GROQ_API_KEY || '').trim();
    const hasGroqKey = Boolean(groqKeyManager.getConfiguredKeys().length > 0);
    const rawDeepgram = (process.env.DEEPGRAM_API_KEY || '').trim();
    const hasDeepgramKey = Boolean(rawDeepgram && rawDeepgram.length > 5);
    const rawHf = (process.env.HF_TOKEN || '').trim();
    const hasHfToken = Boolean(rawHf && rawHf.length > 5);

    return {
      status: 'operational',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      supportedLanguages: ['km-KH (Khmer)', 'en-US (English)', 'fr-FR (French)', 'zh-CN (Chinese)'],
      version: '1.0.0',
      transcriptionEngine: process.env.TRANSCRIPTION_ENGINE || 'whisper',
      whisperModel: process.env.WHISPER_MODEL || 'base',
      hasGroqKey,
      hasGeminiKey,
      hasDeepgramKey,
      hasHfToken,
      hasLocalWhisper: true,
    };
  }

}

module.exports = new DubberService();
