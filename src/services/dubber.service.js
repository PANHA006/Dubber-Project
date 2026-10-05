/**
 * Dubber Service - Reports project/system status for the dubber platform.
 */

class DubberService {
  /**
   * Get project system status and summary
   */
  async getStatus() {
    return {
      status: 'operational',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      supportedLanguages: ['km-KH (Khmer)', 'en-US (English)', 'fr-FR (French)', 'zh-CN (Chinese)'],
      version: '1.0.0',
      transcriptionEngine: process.env.TRANSCRIPTION_ENGINE || 'whisper',
      whisperModel: process.env.WHISPER_MODEL || 'base',
      hasGroqKey: Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()),
    };
  }

}

module.exports = new DubberService();
