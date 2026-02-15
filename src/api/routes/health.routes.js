import express from 'express';
import prisma from '../../config/database.js';
import redis from '../../config/redis.js';
import { successResponse, errorResponse, HTTP_STATUS } from '../../utils/responseFormatter.js';

const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'seo-audit-tool',
      version: '1.0.0'
    };

    res.json(successResponse(health));
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Health check failed', 'HEALTH_CHECK_ERROR')
    );
  }
});

/**
 * GET /api/health/detailed
 * Detailed health check with database and Redis status
 */
router.get('/detailed', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'seo-audit-tool',
      version: '1.0.0',
      checks: {}
    };

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`;
      health.checks.database = {
        status: 'healthy',
        message: 'PostgreSQL connected'
      };
    } catch (err) {
      health.status = 'unhealthy';
      health.checks.database = {
        status: 'unhealthy',
        message: err.message
      };
    }

    // Check Redis
    try {
      await redis.ping();
      health.checks.redis = {
        status: 'healthy',
        message: 'Redis connected'
      };
    } catch (err) {
      health.status = 'unhealthy';
      health.checks.redis = {
        status: 'unhealthy',
        message: err.message
      };
    }

    const statusCode = health.status === 'healthy'
      ? HTTP_STATUS.OK
      : HTTP_STATUS.SERVICE_UNAVAILABLE;

    res.status(statusCode).json(successResponse(health));
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Detailed health check failed', 'HEALTH_CHECK_ERROR')
    );
  }
});

export default router;
