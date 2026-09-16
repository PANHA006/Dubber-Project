const dubberService = require('../services/dubber.service');
const geminiService = require('../services/gemini.service');
const { formatTerminalLog } = require('../utils/terminal-logger');

/**
 * Controller for Dubber API endpoints
 */
class DubberController {
  /**
   * Health check endpoint
   */
  async healthCheck(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        message: 'Dubber Project API is running smoothly!',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Terminal Log Bridge endpoint: receives client logs and outputs to server terminal
   */
  terminalLog(req, res) {
    const { category, message, details } = req.body || {};
    formatTerminalLog(category || 'CLIENT', message || '', details);
    res.status(200).json({ success: true });
  }

  /**
   * Get system status and configuration details
   */
  async getStatus(req, res, next) {
    try {
      const status = await dubberService.getStatus();
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a dubbing job
   */
  async createJob(req, res, next) {
    try {
      const job = await dubberService.createDubbingJob(req.body);
      res.status(201).json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Transcribe audio to subtitle JSON using Gemini
   */
  async transcribe(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'មិនមានឯកសារសំឡេង (Audio file) ត្រូវបានផ្ញើមកទេ',
        });
      }

      const fileSizeMb = (req.file.size / (1024 * 1024)).toFixed(2);
      formatTerminalLog('SERVER:UPLOAD', `Received audio payload: ${req.file.originalname}`, {
        size: `${fileSizeMb} MB`,
        mimetype: req.file.mimetype || 'audio/wav',
        tempPath: req.file.path
      });

      const customApiKey = req.body?.apiKey || null;
      const subtitles = await geminiService.transcribeAudio(
        req.file.path,
        req.file.mimetype || 'audio/wav',
        customApiKey
      );

      formatTerminalLog('SERVER:RESULT', `Successfully processed transcription`, {
        subtitlesCount: subtitles.length,
        file: req.file.originalname
      });

      // Clean up local temp file after processing
      const fs = require('fs');
      fs.unlink(req.file.path, (err) => {
        if (err) console.warn('Could not delete temp audio file:', err.message);
      });

      res.status(200).json({
        success: true,
        data: subtitles,
      });
    } catch (error) {
      formatTerminalLog('SERVER:ERROR', `Transcription error: ${error.message}`);
      // Ensure temp file is cleaned up even if transcription fails
      if (req.file && req.file.path) {
        const fs = require('fs');
        fs.unlink(req.file.path, () => {});
      }
      next(error);
    }
  }
}

module.exports = new DubberController();
