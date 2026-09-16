const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const os = require('os');
const dubberController = require('../controllers/dubber.controller');

// Configure multer storage for audio uploads (saved to temp directory)
const upload = multer({
  dest: path.join(os.tmpdir(), 'dubber-uploads'),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  }
});

// Health Check
router.get('/health', dubberController.healthCheck);

// System Status
router.get('/status', dubberController.getStatus);

// Create Dubbing Job
router.post('/jobs', dubberController.createJob);

// AI Transcription with Gemini
router.post('/transcribe', upload.single('audio'), dubberController.transcribe);

// Live Terminal Logging Bridge
router.post('/terminal-log', dubberController.terminalLog);

module.exports = router;
