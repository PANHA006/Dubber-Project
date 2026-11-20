const dubberService = require('../services/dubber.service');
const geminiService = require('../services/gemini.service');
const whisperService = require('../services/whisper.service');
const groqService = require('../services/groq.service');
const deepgramService = require('../services/deepgram.service');
const ttsService = require('../services/tts.service');
const rvcService = require('../services/rvc.service');
const videoRendererService = require('../services/video-renderer.service');
const historyService = require('../services/history.service');
const systemUpdaterService = require('../services/system-updater.service');
const { formatTerminalLog, formatTerminalProgress } = require('../utils/terminal-logger');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');

/**
 * Server-Side FFmpeg CFR Audio Extractor
 * Extracts 16kHz mono 16-bit PCM WAV with presentation timestamp synchronization:
 * `-af aresample=async=1:first_pts=0`
 * Guarantees zero cumulative drift across hours of concatenated / VFR video.
 */
function extractAudioCfr(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (Array.isArray(config.ffmpegBinDirs)) {
      for (const ffmpegDir of config.ffmpegBinDirs) {
        if (!process.env.PATH.includes(ffmpegDir)) {
          process.env.PATH = `${ffmpegDir};${process.env.PATH}`;
        }
      }
    }

    const args = [
      '-y',
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-af', 'aresample=async=1:first_pts=0',
      outputPath
    ];

    const proc = spawn('ffmpeg', args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg CFR audio extraction failed (code ${code}): ${stderr.slice(-300)}`));
      }
    });
    proc.on('error', err => reject(err));
  });
}

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
   * Transcribe audio/video to subtitle JSON using Faster-Whisper or Groq Cloud Whisper.
   * Features Server-Side FFmpeg CFR Audio Extraction (-af aresample=async=1:first_pts=0)
   * to guarantee zero drift between video frames and subtitles on merged/VFR videos.
   */
  async transcribe(req, res, next) {
    let effectiveAudioPath = null;
    let isTempFile = false;
    let originalFilename = '';

    try {
      const reqFile = req.file || (req.files && (req.files.audio?.[0] || req.files.video?.[0])) || null;
      if (reqFile && !req.file) req.file = reqFile;

      let videoPath = null;
      if (req.body?.videoUrl) {
        const vUrl = String(req.body.videoUrl).trim();
        const candidates = [
          path.join(config.storageDir, 'videos', path.basename(vUrl)),
          path.join(config.storageDir, vUrl.replace(/^\/?storage\//, '')),
          path.join(__dirname, '../../public', vUrl.replace(/^\//, '')),
          path.resolve(vUrl)
        ];
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            videoPath = c;
            break;
          }
        }
      } else if (reqFile) {
        const isVideo = (reqFile.mimetype && reqFile.mimetype.startsWith('video/')) ||
          ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.ts'].includes(path.extname(reqFile.originalname || '').toLowerCase());
        if (isVideo) {
          videoPath = reqFile.path;
        }
      }

      if (videoPath) {
        // Server-Side FFmpeg CFR Audio Extraction (Sample-accurate PTS alignment)
        const tempDir = path.join(config.storageDir, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempWavPath = path.join(tempDir, `server_cfr_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);

        formatTerminalLog('SERVER:CFR_EXTRACT', `Extracting audio from video via FFmpeg CFR (-af aresample=async=1:first_pts=0)...`, {
          video: path.basename(videoPath),
          output: path.basename(tempWavPath)
        });

        await extractAudioCfr(videoPath, tempWavPath);
        effectiveAudioPath = tempWavPath;
        originalFilename = path.basename(videoPath).replace(/\.[^/.]+$/, '') + '.wav';
        isTempFile = true;
      } else if (reqFile) {
        effectiveAudioPath = reqFile.path;
        originalFilename = reqFile.originalname;
        isTempFile = true;
        const fileSizeMb = (reqFile.size / (1024 * 1024)).toFixed(2);
        formatTerminalLog('SERVER:UPLOAD', `Received audio payload: ${reqFile.originalname}`, {
          size: `${fileSizeMb} MB`,
          mimetype: reqFile.mimetype || 'audio/wav',
          tempPath: reqFile.path
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'មិនមានឯកសារសំឡេង ឬវីដេអូ (Audio/Video file or videoUrl) ត្រូវបានផ្ញើមកទេ',
        });
      }

      const model = req.body?.model || process.env.WHISPER_MODEL || 'groq-whisper-large-v3';
      const isGroq = typeof model === 'string' && (model.startsWith('groq') || model.includes('groq'));
      const isDeepgram = typeof model === 'string' && model.startsWith('deepgram');

      let subtitles = [];
      // Source language detected by the STT engine ('zh' | 'en' | 'km' | ...).
      // Forwarded to the client so the translate step can route directly
      // (Chinese -> Khmer) instead of always bridging through English.
      let detectedLanguage = null;

      const endPadding = req.body?.endPadding !== undefined ? `+${Number(req.body.endPadding).toFixed(2)}s` : '+0.70s';
      const maxMergeRaw = req.body?.maxMergeLimit !== undefined ? parseInt(req.body.maxMergeLimit, 10) : 3;
      const maxMergeStr = maxMergeRaw <= 1 ? '1 (Native / Freeze)' : `${maxMergeRaw} ឃ្លា`;
      const mergeGapStr = req.body?.maxPauseGap !== undefined ? `${Number(req.body.maxPauseGap).toFixed(2)}s` : '0.15s';
      const vadStr = req.body?.vadThreshold !== undefined ? `${Number(req.body.vadThreshold).toFixed(2)}` : '0.10';

      formatTerminalLog('STT:CONFIG', `Transcription Conditions: EndPadding=${endPadding} | MaxMerged=${maxMergeStr} | MergeGap=${mergeGapStr} | VAD=${vadStr}`, {
        endPadding,
        maxMerged: maxMergeStr,
        mergeGap: mergeGapStr,
        vadFilter: vadStr
      });

      if (isGroq) {
        // Route to Groq Cloud Whisper API (Ultra-Fast 1-2s)
        const groqApiKey = req.body?.groqApiKey || req.body?.apiKey || process.env.GROQ_API_KEY;
        formatTerminalLog('SERVER:ROUTE', `Routing transcription to Groq Cloud API (model: ${model})`);
        const groqResult = await groqService.transcribeAudio(effectiveAudioPath, {
          model,
          apiKey: groqApiKey,
          originalFilename,
          vadThreshold: req.body?.vadThreshold,
          maxPauseGap: req.body?.maxPauseGap,
          maxMergeLimit: req.body?.maxMergeLimit,
          language: req.body?.language || 'zh'
        });
        subtitles = Array.isArray(groqResult) ? groqResult : (groqResult.segments || []);
        detectedLanguage = Array.isArray(groqResult) ? null : (groqResult.language || null);

        formatTerminalLog('SERVER:RESULT', `Successfully processed transcription with Groq Cloud [${model}]`, {
          engine: 'groq',
          subtitlesCount: subtitles.length,
          file: originalFilename
        });
      } else if (isDeepgram) {
        // Route to Deepgram Commercial Specialist API
        const deepgramApiKey = req.body?.deepgramApiKey || req.body?.apiKey || process.env.DEEPGRAM_API_KEY;
        formatTerminalLog('SERVER:ROUTE', `Routing transcription to Deepgram API (model: ${model})`);
        const dgResult = await deepgramService.transcribeAudio(effectiveAudioPath, {
          model,
          apiKey: deepgramApiKey,
          originalFilename,
          vadThreshold: req.body?.vadThreshold,
          maxPauseGap: req.body?.maxPauseGap,
          maxMergeLimit: req.body?.maxMergeLimit,
          language: req.body?.language || 'zh'
        });
        subtitles = Array.isArray(dgResult) ? dgResult : (dgResult.segments || []);
        detectedLanguage = Array.isArray(dgResult) ? null : (dgResult.language || null);

        formatTerminalLog('SERVER:RESULT', `Successfully processed transcription with Deepgram [${model}]`, {
          engine: 'deepgram',
          subtitlesCount: subtitles.length,
          file: originalFilename
        });
      } else {
        // Route to Faster-Whisper Local Engine (Offline CPU)
        // Normalize model name (e.g. 'medium', 'large-v2', 'large-v3', 'base', 'small')
        let localModel = model;
        if (localModel === 'whisper' || !localModel) localModel = 'base';
        
        formatTerminalLog('SERVER:ROUTE', `Routing transcription to Faster-Whisper Local Engine (model: ${localModel})`);
        const whisperResult = await whisperService.transcribeAudio(effectiveAudioPath, {
          model: localModel,
          vad: req.body?.vad !== '0' && req.body?.vad !== false,
          vadThreshold: req.body?.vadThreshold,
          maxPauseGap: req.body?.maxPauseGap,
          maxMergeLimit: req.body?.maxMergeLimit,
          language: req.body?.language || 'zh'
        });
        subtitles = Array.isArray(whisperResult) ? whisperResult : (whisperResult.segments || []);
        detectedLanguage = Array.isArray(whisperResult) ? null : (whisperResult.language || null);

        formatTerminalLog('SERVER:RESULT', `Successfully processed transcription with Faster-Whisper [${localModel}]`, {
          engine: 'faster-whisper',
          subtitlesCount: subtitles.length,
          file: originalFilename
        });
      }

      res.status(200).json({
        success: true,
        data: subtitles,
        language: detectedLanguage,
      });
    } catch (error) {
      formatTerminalLog('SERVER:ERROR', `Transcription error: ${error.message}`);
      next(error);
    } finally {
      // Clean up temp audio file
      if (isTempFile && effectiveAudioPath && fs.existsSync(effectiveAudioPath)) {
        fs.unlink(effectiveAudioPath, (err) => {
          if (err) console.warn('Could not delete temp audio file:', err.message);
        });
      }
      if (req.file && req.file.path && req.file.path !== effectiveAudioPath && fs.existsSync(req.file.path)) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.warn('Could not delete temp uploaded file:', err.message);
        });
      }
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
   * Free Google Translate (No API key needed)
   */
  async translateWithGoogle(req, res, next) {
    try {
      const googleTranslateService = require('../services/google-translate.service');
      const { subtitles, sourceLanguage } = req.body || {};

      if (!Array.isArray(subtitles) || subtitles.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'មិនមាន Subtitles សម្រាប់បកប្រែទេ (Missing subtitles)'
        });
      }

      formatTerminalLog('SERVER:GOOGLE_TRANSLATE', `Received ${subtitles.length} lines for Free Google Translation`);

      const translated = await googleTranslateService.translateSubtitles(subtitles, {
        sourceLanguage: sourceLanguage || null
      });

      res.status(200).json({
        success: true,
        data: translated
      });
    } catch (error) {
      formatTerminalLog('SERVER:GOOGLE_TRANSLATE_ERR', error.message);
      next(error);
    }
  }

  /**
   * Check if Gemini API Key is configured on client or server
   */
  checkKeyStatus(req, res) {
    try {
      const keyManager = require('../services/key-manager.service');
      const customKey = req.query.customKey || req.body?.customKey || null;
      const hasKey = keyManager.hasConfiguredKeys(customKey);
      res.status(200).json({
        success: true,
        hasGeminiKey: hasKey
      });
    } catch (error) {
      res.status(200).json({
        success: true,
        hasGeminiKey: false
      });
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
          message: 'មិនមានទិន្នន័យ Subtitles សម្រាប់ Generate Voice ទេ'
        });
      }

      formatTerminalLog('SERVER:TTS', `Received voice generation request for ${items.length} subtitle items`);

      const isStream = req.query.stream === 'true' || req.headers.accept === 'text/event-stream' || req.body?.stream === true;

      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        if (typeof res.flushHeaders === 'function') {
          res.flushHeaders();
        }

        const onProgress = (data) => {
          try {
            res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
          } catch (_) {}
        };

        try {
          const result = await ttsService.generateVoices(items, onProgress);
          const validResults = (result.results || []).filter(r => r && r.success);
          res.write(`data: ${JSON.stringify({
            type: 'done',
            success: true,
            count: validResults.length,
            total: items.length,
            data: result.results
          })}\n\n`);
          res.end();
        } catch (err) {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            success: false,
            message: err.message
          })}\n\n`);
          res.end();
        }
        return;
      }

      const result = await ttsService.generateVoices(items);

      res.status(200).json({
        success: true,
        count: result.count,
        total: items.length,
        data: result.results
      });
    } catch (error) {
      formatTerminalLog('SERVER:TTS_ERR', `Voice generation error: ${error.message}`);
      next(error);
    }
  }

  /**
   * Pre-mixes all generated voice clips into a full-timeline Master Audio track matching videoDuration
   */
  async assembleMasterVoice(req, res, next) {
    try {
      const { videoUrl, subtitles, videoDuration, dubVolume } = req.body || {};

      if (!Array.isArray(subtitles) || subtitles.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'មិនមាន Subtitles សម្រាប់ផ្គុំ Master Audio ទេ'
        });
      }

      formatTerminalLog('SERVER:ASSEMBLE_MASTER', `Received request to assemble Master Timeline Voice Audio (${subtitles.length} clips)...`);

      const result = await videoRendererService.buildTimelineMasterAudio({
        videoUrl,
        subtitles,
        videoDuration: parseFloat(videoDuration) || 0,
        dubVolume: parseFloat(dubVolume) || 1.0
      });

      res.status(200).json({
        success: true,
        message: 'ផ្គុំ Master Timeline Audio ជោគជ័យ!',
        data: result
      });
    } catch (error) {
      formatTerminalLog('SERVER:ASSEMBLE_MASTER_ERR', `Assemble master error: ${error.message}`);
      next(error);
    }
  }

  async generateDubbedVideo(req, res, next) {
    try {
      const { videoUrl, subtitles, settings, masterAudioUrl } = req.body || {};

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

      const mergedSettings = {
        ...(settings || {}),
        masterAudioUrl: settings?.masterAudioUrl || masterAudioUrl || null
      };

      const result = await videoRendererService.renderDubbedVideo({
        videoUrl,
        subtitles,
        settings: mergedSettings,
        masterAudioUrl: mergedSettings.masterAudioUrl
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
   * Get active video export progress
   */
  getExportProgress(req, res) {
    try {
      const progress = videoRendererService.getExportProgress();
      res.status(200).json({
        success: true,
        data: progress
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
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
      const projectPath = path.join(config.storageDir, 'projects', 'autosave_project.json');

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
      const projectDir = path.join(config.storageDir, 'projects');
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
      const options = req.body || {};
      const result = historyService.clearAllHistory(options);
      res.status(200).json({
        success: true,
        message: 'បានសម្អាតទិន្នន័យ និង Cache ទាំងអស់ជោគជ័យ',
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

  /**
   * Get system dependencies & updates status (FFmpeg, Python, edge-tts, faster-whisper, etc.)
   */
  async getSystemDependencies(req, res, next) {
    try {
      const forceRefresh = req.query.force === 'true';
      const status = await systemUpdaterService.getDependenciesStatus(forceRefresh);
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a specific Python package in .venv via pip
   */
  async updateSystemPackage(req, res, next) {
    try {
      const { package: pkgName } = req.body || {};
      if (!pkgName) {
        return res.status(400).json({
          success: false,
          message: 'សូមបញ្ជាក់ឈ្មោះកញ្ចប់ដែលត្រូវអាប់ដេត (Package name required)'
        });
      }
      const result = await systemUpdaterService.updatePythonPackage(pkgName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 1-Click Update for all core AI engines (edge-tts + faster-whisper)
   */
  async updateAllAiEngines(req, res, next) {
    try {
      const result = await systemUpdaterService.updateAllAiEngines();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DubberController();
