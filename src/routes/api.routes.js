const express = require('express');
const router = express.Router();
const dubberController = require('../controllers/dubber.controller');

// Health Check
router.get('/health', dubberController.healthCheck);

// System Status
router.get('/status', dubberController.getStatus);

// Create Dubbing Job
router.post('/jobs', dubberController.createJob);

module.exports = router;
