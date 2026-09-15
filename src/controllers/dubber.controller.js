const dubberService = require('../services/dubber.service');

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
}

module.exports = new DubberController();
