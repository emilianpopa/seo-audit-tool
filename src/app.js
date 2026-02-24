import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './config/logger.js';
import { errorResponse, HTTP_STATUS } from './utils/responseFormatter.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import auditRoutes from './api/routes/audit.routes.js';
import healthRoutes from './api/routes/health.routes.js';
import reportRoutes from './api/routes/report.routes.js';
import integrationRoutes from './api/routes/integrations.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's reverse proxy to read client IPs from X-Forwarded-For headers
// This prevents all users from sharing the same rate limit bucket
app.set('trust proxy', true);

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
// STATIC FILES
// ============================================================================

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================================
// ROUTES
// ============================================================================

app.use('/api/health', healthRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/integrations', integrationRoutes);

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
