import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import logger from './config/logger.js';
import { errorResponse, HTTP_STATUS } from './utils/responseFormatter.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import auditRoutes from './api/routes/audit.routes.js';
import healthRoutes from './api/routes/health.routes.js';
import reportRoutes from './api/routes/report.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (applied to all routes except health)
app.use('/api/audit', apiLimiter);
app.use('/api/report', apiLimiter);

// HTTP logging
app.use(pinoHttp({ logger }));

// ============================================================================
// ROUTES
// ============================================================================

app.use('/api/health', healthRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/report', reportRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SEO Audit Tool API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      audit: '/api/audit',
      report: '/api/report'
    }
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json(
    errorResponse(`Route ${req.method} ${req.path} not found`, 'NOT_FOUND')
  );
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error({
    err,
    method: req.method,
    url: req.url,
    body: req.body
  }, 'Unhandled error');

  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json(
    errorResponse(message, err.code || 'INTERNAL_ERROR', err.details)
  );
});

// ============================================================================
// SERVER START
// ============================================================================

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info({
      port: PORT,
      env: process.env.NODE_ENV || 'development'
    }, 'SEO Audit Tool API server started');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

export default app;
