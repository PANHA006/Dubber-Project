const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const os = require('os');
const dubberController = require('../controllers/dubber.controller');

const fs = require('fs');

// Configure multer storage for audio uploads (saved to temp directory)
const upload = multer({
  dest: path.join(os.tmpdir(), 'dubber-uploads'),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  }
});

// Configure multer storage for persistent video uploads (saved to storage/videos)
const videoStorageDir = path.join(__dirname, '..', '..', 'storage', 'videos');
if (!fs.existsSync(videoStorageDir)) {
  fs.mkdirSync(videoStorageDir, { recursive: true });
}

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videoStorageDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now();
    cb(null, `${base}_${uniqueSuffix}${ext}`);
  }
});

const videoUpload = multer({
  storage: videoStorage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB limit for videos
  }
});

// Health Check
router.get('/health', dubberController.healthCheck);

// System Status
router.get('/status', dubberController.getStatus);

// Local Faster-Whisper Transcription ($0 Offline)
router.post('/transcribe', upload.single('audio'), dubberController.transcribe);

// Gemini AI Translation (Text to Natural Khmer)
router.post('/translate', dubberController.translate);

// Free Google Translate (No API key needed)
router.post('/translate/google', dubberController.translateWithGoogle);

// Gemini API Key Status Check
router.get('/keys/status', dubberController.checkKeyStatus);

// Microsoft Edge TTS Voice Generation (Khmer Speech)
router.post('/generate-voice', dubberController.generateVoice);

// Live Terminal Logging Bridge
router.post('/terminal-log', dubberController.terminalLog);

// Video Upload & Storage Persistence
router.post('/video/upload', videoUpload.single('video'), dubberController.uploadVideo);

// Dubbed Video Generation with FFmpeg
router.post('/video/generate', dubberController.generateDubbedVideo);

// Dubbed Video Export with custom name, path & quality
router.post('/video/export', dubberController.exportVideo);
router.get('/video/export/progress', dubberController.getExportProgress);

// Server-Side Project Persistence (autosave_project.json)
router.get('/project/load', dubberController.getProject);
router.post('/project/save', dubberController.saveProject);

// Dubbed & Exported Video History Management
router.get('/history', dubberController.getHistory);
router.delete('/history/:id', dubberController.deleteHistoryItem);
router.post('/history/clear', dubberController.clearAllHistory);

// RVC Local Character Voice Cloning & Library Management
const rvcTempDir = path.join(__dirname, '..', '..', 'storage', 'temp');
if (!fs.existsSync(rvcTempDir)) {
  fs.mkdirSync(rvcTempDir, { recursive: true });
}
const rvcUpload = multer({
  dest: rvcTempDir,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit for .pth files
  }
});

router.get('/rvc/models', dubberController.listRVCModels);
router.post('/rvc/models/upload', rvcUpload.fields([
  { name: 'pth', maxCount: 1 },
  { name: 'index', maxCount: 1 }
]), dubberController.uploadRVCModel);
router.delete('/rvc/models/:id', dubberController.deleteRVCModel);
router.post('/rvc/test-preview', dubberController.testRVCVoice);

module.exports = router;
