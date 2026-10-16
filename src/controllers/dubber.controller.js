const dubberService = require('../services/dubber.service');
const geminiService = require('../services/gemini.service');
const whisperService = require('../services/whisper.service');
const groqService = require('../services/groq.service');
const deepgramService = require('../services/deepgram.service');
const ttsService = require('../services/tts.service');
const rvcService = require('../services/rvc.service');
const videoRendererService = require('../services/video-renderer.service');
const historyService = require('../services/history.service');
const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');

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
    const { category, message, details, current, total } = req.body || {};
    if (typeof current === 'number' && typeof total === 'number') {
      formatTerminalProgress(category || 'CLIENT:PROGRESS', current, total, message || '', details);
    } else {
      formatTerminalLog(category || 'CLIENT', message || '', details);
    }
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
   * Transcribe audio to subtitle JSON using Faster-Whisper
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

      const model = req.body?.model || process.env.WHISPER_MODEL || 'groq-whisper-large-v3';
      const isGroq = typeof model === 'string' && (model.startsWith('groq') || model.includes('groq'));
      const isDeepgram = typeof model === 'string' && model.startsWith('deepgram');

      let subtitles = [];
      // Source language detected by the STT engine ('zh' | 'en' | 'km' | ...).
      // Forwarded to the client so the translate step can route directly
      // (Chinese -> Khmer) instead of always bridging through English.
      let detectedLanguage = null;

      if (isGroq) {
        // Route to Groq Cloud Whisper API (Ultra-Fast 1-2s)
        const groqApiKey = req.body?.groqApiKey || req.body?.apiKey || process.env.GROQ_API_KEY;
        formatTerminalLog('SERVER:ROUTE', `Routing transcription to Groq Cloud API (model: ${model})`);
        const groqResult = await groqService.transcribeAudio(req.file.path, {
          model,
          apiKey: groqApiKey,
          originalFilename: req.file.originalname,
          vadThreshold: req.body?.vadThreshold,
          maxPauseGap: req.body?.maxPauseGap,
          maxMergeLimit: req.body?.maxMergeLimit,
          language: req.body?.language || null
        });
        subtitles = Array.isArray(groqResult) ? groqResult : (groqResult.segments || []);
        detectedLanguage = Array.isArray(groqResult) ? null : (groqResult.language || null);

        formatTerminalLog('SERVER:RESULT', `Successfully processed transcription with Groq Cloud [${model}]`, {
          engine: 'groq',
          subtitlesCount: subtitles.length,
          file: req.file.originalname
        });
      } else if (isDeepgram) {
        // Route to Deepgram Commercial Specialist API
        const deepgramApiKey = req.body?.deepgramApiKey || req.body?.apiKey || process.env.DEEPGRAM_API_KEY;
        formatTerminalLog('SERVER:ROUTE', `Routing transcription to Deepgram API (model: ${model})`);
        const dgResult = await deepgramService.transcribeAudio(req.file.path, {
          model,
          apiKey: deepgramApiKey,
          originalFilename: req.file.originalname,
          vadThreshold: req.body?.vadThreshold,
          maxPauseGap: req.body?.maxPauseGap,
          maxMergeLimit: req.body?.maxMergeLimit,
          language: req.body?.language || null
        });
        subtitles = Array.isArray(dgResult) ? dgResult : (dgResult.segments || []);
        detectedLanguage = Array.isArray(dgResult) ? null : (dgResult.language || null);

        formatTerminalLog('SERVER:RESULT', `Successfully processed transcription with Deepgram [${model}]`, {
          engine: 'deepgram',
          subtitlesCount: subtitles.length,
          file: req.file.originalname
        });
      } else {
        // Route to Faster-Whisper Local Engine (Offline CPU)
        // Normalize model name (e.g. 'medium', 'large-v2', 'large-v3', 'base', 'small')
        let localModel = model;
        if (localModel === 'whisper' || !localModel) localModel = 'base';
        
        formatTerminalLog('SERVER:ROUTE', `Routing transcription to Faster-Whisper Local Engine (model: ${localModel})`);
        const whisperResult = await whisperService.transcribeAudio(req.file.path, {
          model: localModel,
          vad: req.body?.vad !== '0' && req.body?.vad !== false,
          vadThreshold: req.body?.vadThreshold,
          maxPauseGap: req.body?.maxPauseGap,
          maxMergeLimit: req.body?.maxMergeLimit,
          language: req.body?.language || null
        });
        subtitles = Array.isArray(whisperResult) ? whisperResult : (whisperResult.segments || []);
        detectedLanguage = Array.isArray(whisperResult) ? null : (whisperResult.language || null);

        formatTerminalLog('SERVER:RESULT', `Successfully processed transcription with Faster-Whisper [${localModel}]`, {
          engine: 'faster-whisper',
          subtitlesCount: subtitles.length,
          file: req.file.originalname
        });
      }

      // Clean up local temp file after processing
      const fs = require('fs');
      fs.unlink(req.file.path, (err) => {
        if (err) console.warn('Could not delete temp audio file:', err.message);
      });

      res.status(200).json({
        success: true,
        data: subtitles,
        language: detectedLanguage,
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

  /**
   * Translate subtitles to Khmer using Google Gemini AI
   */
  async translate(req, res, next) {
    try {
      const { subtitles, apiKey, endPadding } = req.body || {};
      if (!Array.isArray(subtitles) || subtitles.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'មិនមាន Subtitles សម្រាប់ធ្វើការបកប្រែទេ'
        });
      }

      formatTerminalLog('SERVER:TRANSLATE', `Received ${subtitles.length} subtitle lines for Gemini translation (endPadding: ${endPadding ?? 0.70}s, sourceLanguage: ${req.body?.sourceLanguage || 'auto'})`);
      const translated = await geminiService.translateSubtitles(subtitles, apiKey || null, {
        endPadding,
        sourceLanguage: req.body?.sourceLanguage || null
      });

      res.status(200).json({
        success: true,
        data: translated
      });
    } catch (error) {
      formatTerminalLog('SERVER:TRANSLATE_ERR', `Gemini translation failed: ${error.message}`);
      next(error);
    }
  }

  /**
   * Generate Khmer voice audio files using Microsoft Edge TTS
   */
  async generateVoice(req, res, next) {
    try {
      const { items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'មិនមានអត្ថបទសម្រាប់ Generate Voice ទេ'
        });
      }

      formatTerminalLog('SERVER:TTS', `Received voice generation request for ${items.length} subtitle items`);
      const result = await ttsService.generateVoices(items);

      res.status(200).json({
        success: true,
        count: result.count,
        data: result.results
      });
    } catch (error) {
      formatTerminalLog('SERVER:TTS_ERR', `Voice generation error: ${error.message}`);
      next(error);
    }
  }

  /**
   * Generate finalized dubbed video with mixed Khmer audio and ducked BGM
   */
  async generateDubbedVideo(req, res, next) {
    try {
      const { videoUrl, subtitles, settings } = req.body || {};

      if (!videoUrl) {
        return res.status(400).json({
          success: false,
          message: 'សូមបញ្ចូល URL ឬ File វីដេអូជាមុនសិន (Missing videoUrl)'
        });
      }

      if (!Array.isArray(subtitles) || subtitles.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'មិនមាន Subtitles សម្រាប់បញ្ចូលក្នុងវីដេអូទេ'
        });
      }

      formatTerminalLog('SERVER:DUB_VIDEO', `Received dubbed video render request for ${videoUrl} with ${subtitles.length} subtitles`);

      const result = await videoRendererService.renderDubbedVideo({
        videoUrl,
        subtitles,
        settings: settings || {}
      });

      res.status(200).json({
        success: true,
        message: 'បង្កើតវីដេអូ Dubbed ជោគជ័យ!',
        data: result
      });
    } catch (error) {
      formatTerminalLog('SERVER:DUB_VIDEO_ERR', `Video render error: ${error.message}`);
      next(error);
    }
  }

  /**
   * Export dubbed video with custom name, path, and quality
   */
  async exportVideo(req, res, next) {
    try {
      const { sourceVideoUrl, fileName, exportPath, quality } = req.body || {};

      if (!sourceVideoUrl) {
        return res.status(400).json({
          success: false,
          message: 'សូមបញ្ចូល sourceVideoUrl សម្រាប់ Export (Missing sourceVideoUrl)'
        });
      }

      formatTerminalLog('SERVER:VIDEO_EXPORT', `Received export request for ${sourceVideoUrl} (Name: "${fileName || 'default'}", Quality: "${quality || 'original'}")`);

      const result = await videoRendererService.exportDubbedVideo({
        sourceVideoUrl,
        fileName,
        exportPath,
        quality: quality || 'original'
      });

      res.status(200).json({
        success: true,
        message: 'នាំចេញវីដេអូបានជោគជ័យ!',
        data: result
      });
    } catch (error) {
      formatTerminalLog('SERVER:VIDEO_EXPORT_ERR', `Video export error: ${error.message}`);
      next(error);
    }
  }

  /**
   * Upload video file and persist to storage/videos/
   */
  async uploadVideo(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'មិនមានឯកសារវីដេអូត្រូវបានផ្ញើមកទេ (No video file provided)'
        });
      }

      const filename = req.file.filename;
      const originalName = req.file.originalname;
      const sizeMb = (req.file.size / (1024 * 1024)).toFixed(2);
      const videoUrl = `/storage/videos/${filename}`;

      formatTerminalLog('SERVER:VIDEO_UPLOAD', `Persisted video "${originalName}" (${sizeMb} MB) to ${videoUrl}`);

      res.status(200).json({
        success: true,
        message: 'វីដេអូត្រូវបានរក្សាទុកលើ Server ដោយជោគជ័យ',
        data: {
          filename,
          originalName,
          size: req.file.size,
          sizeMb: parseFloat(sizeMb),
          videoUrl
        }
      });
    } catch (error) {
      formatTerminalLog('SERVER:VIDEO_UPLOAD_ERR', error.message);
      next(error);
    }
  }

  /**
   * Load saved project state from storage/projects/autosave_project.json
   */
  async getProject(req, res, next) {
    try {
      const fs = require('fs');
      const path = require('path');
      const projectPath = path.join(__dirname, '../../storage/projects/autosave_project.json');

      if (!fs.existsSync(projectPath)) {
        return res.status(200).json({
          success: true,
          data: null,
          message: 'No saved project found'
        });
      }

      const content = fs.readFileSync(projectPath, 'utf-8');
      const projectData = JSON.parse(content);

      res.status(200).json({
        success: true,
        data: projectData,
        message: 'Project loaded successfully'
      });
    } catch (error) {
      formatTerminalLog('SERVER:PROJECT_LOAD_ERR', error.message);
      next(error);
    }
  }

  /**
   * Save project state to storage/projects/autosave_project.json
   */
  async saveProject(req, res, next) {
    try {
      const fs = require('fs');
      const path = require('path');
      const projectDir = path.join(__dirname, '../../storage/projects');
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      const projectPath = path.join(projectDir, 'autosave_project.json');
      const incomingSubtitles = req.body.subtitles || [];
      let finalSubtitles = incomingSubtitles;
      let finalVideo = req.body.video || null;
      let finalSettings = req.body.dubbingSettings || null;

      // Safety guard: If empty or missing data received without explicit clear flag, preserve existing data on disk
      if (!req.body.isExplicitClear && fs.existsSync(projectPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));
          if (existing) {
            if (incomingSubtitles.length === 0 && Array.isArray(existing.subtitles) && existing.subtitles.length > 0) {
              finalSubtitles = existing.subtitles;
            }
            if (!finalVideo && existing.video) {
              finalVideo = existing.video;
            }
            if (!finalSettings && existing.dubbingSettings) {
              finalSettings = existing.dubbingSettings;
            }
          }
        } catch (_) {}
      }

      const payload = {
        video: finalVideo,
        subtitles: finalSubtitles,
        dubbingSettings: finalSettings,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(projectPath, JSON.stringify(payload, null, 2), 'utf-8');

      res.status(200).json({
        success: true,
        message: 'Project saved successfully',
        updatedAt: payload.updatedAt
      });
    } catch (error) {
      formatTerminalLog('SERVER:PROJECT_SAVE_ERR', error.message);
      next(error);
    }
  }

  /**
   * Get all dubbed and exported video history
   */
  async getHistory(req, res, next) {
    try {
      const historyData = historyService.getHistory();
      res.status(200).json({
        success: true,
        data: historyData
      });
    } catch (error) {
      formatTerminalLog('SERVER:GET_HISTORY_ERR', error.message);
      next(error);
    }
  }

  /**
   * Delete single history video item
   */
  async deleteHistoryItem(req, res, next) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Missing history item id'
        });
      }
      const result = historyService.deleteRecord(id);
      res.status(200).json({
        success: true,
        message: 'បានលុបវីដេអូចេញពីប្រវត្តិជោគជ័យ',
        data: result
      });
    } catch (error) {
      formatTerminalLog('SERVER:DEL_HISTORY_ERR', error.message);
      next(error);
    }
  }

  /**
   * Clear all video history and files
   */
  async clearAllHistory(req, res, next) {
    try {
      const result = historyService.clearAllHistory();
      res.status(200).json({
        success: true,
        message: 'បានសម្អាតប្រវត្តិវីដេអូទាំងអស់ជោគជ័យ',
        data: result
      });
    } catch (error) {
      formatTerminalLog('SERVER:CLEAR_HISTORY_ERR', error.message);
      next(error);
    }
  }

  /**
   * List all installed RVC character voice models
   */
  async listRVCModels(req, res, next) {
    try {
      const models = await rvcService.listModels();
      res.status(200).json({
        success: true,
        data: models
      });
    } catch (error) {
      formatTerminalLog('SERVER:RVC_LIST_ERR', error.message);
      next(error);
    }
  }

  /**
   * Upload and register a new RVC character voice model (.pth + optional .index)
   */
  async uploadRVCModel(req, res, next) {
    try {
      const { name, gender, pitchDefault } = req.body || {};
      const files = req.files || {};
      const pthFile = files.pth ? files.pth[0] : null;
      const indexFile = files.index ? files.index[0] : null;

      if (!pthFile) {
        return res.status(400).json({
          success: false,
          message: 'សូមជ្រើសរើស File Model (.pth)'
        });
      }

      const model = await rvcService.saveModel({
        name: name || pthFile.originalname.replace(/\.pth$/i, ''),
        gender: gender || 'Male',
        pitchDefault: parseInt(pitchDefault, 10) || 0
      }, pthFile, indexFile);

      res.status(200).json({
        success: true,
        message: `បានបញ្ចូលសំឡេងតួអង្គ "${model.name}" ជោគជ័យ!`,
        data: model
      });
    } catch (error) {
      formatTerminalLog('SERVER:RVC_UPLOAD_ERR', error.message);
      next(error);
    }
  }

  /**
   * Delete an RVC character model
   */
  async deleteRVCModel(req, res, next) {
    try {
      const { id } = req.params;
      const result = await rvcService.deleteModel(id);
      res.status(200).json({
        success: true,
        message: 'បានលុបសំឡេងតួអង្គជោគជ័យ',
        data: result
      });
    } catch (error) {
      formatTerminalLog('SERVER:RVC_DEL_ERR', error.message);
      next(error);
    }
  }

  /**
   * Test / preview an RVC voice model with sample Khmer speech
   */
  async testRVCVoice(req, res, next) {
    try {
      const { modelId, pitchShift, text } = req.body || {};
      const model = await rvcService.getModel(modelId);
      if (!model) {
        return res.status(404).json({
          success: false,
          message: 'មិនមានម៉ូដែលតួអង្គនេះទេ'
        });
      }

      const sampleText = text || 'សួស្តី! ខ្ញុំជាសំឡេងតួអង្គ AI ដែលបានក្លូនរួចរាល់ហើយ។';
      const baseVoice = model.gender === 'Female' ? 'Sreymom (Female)' : 'Piseth (Male)';
      const previewId = `preview_${Date.now()}`;

      // 1. Generate base speech via Edge TTS
      const ttsRes = await ttsService.generateVoices([{
        id: previewId,
        khmerText: sampleText,
        voice: baseVoice
      }]);

      if (!ttsRes.success || !ttsRes.results || ttsRes.results.length === 0) {
        return res.status(500).json({
          success: false,
          message: 'Failed to generate base audio for preview'
        });
      }

      const pathMod = require('path');
      const fsMod = require('fs');
      const generatedAudioPath = pathMod.join(ttsService.storageDir, ttsRes.results[0].filename);

      // 2. Convert via RVC
      const convertedOutput = pathMod.join(ttsService.storageDir, `preview_${model.id}_${Date.now()}.mp3`);
      const rvcRes = await rvcService.convertAudio({
        inputAudio: generatedAudioPath,
        modelId: model.id,
        pitchShift: pitchShift !== undefined ? pitchShift : model.pitchDefault,
        outputAudio: convertedOutput
      });

      // Cleanup initial base audio
      try { if (fsMod.existsSync(generatedAudioPath)) fsMod.unlinkSync(generatedAudioPath); } catch (_) {}

      res.status(200).json({
        success: true,
        audioUrl: `/storage/voices/${pathMod.basename(rvcRes.outputAudio)}?v=${Date.now()}`,
        duration: rvcRes.duration
      });
    } catch (error) {
      formatTerminalLog('SERVER:RVC_TEST_ERR', error.message);
      next(error);
    }
  }
}

module.exports = new DubberController();
