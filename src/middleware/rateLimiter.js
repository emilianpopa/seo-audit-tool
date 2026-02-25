/**
 * Rate Limiting Middleware
 *
 * Redis-backed distributed rate limiter. Works correctly across multiple
 * instances (Railway horizontal scaling). Falls back to fail-open if Redis
 * is unavailable so a Redis outage never takes down the API.
 */

import redis from '../config/redis.js';
import logger from '../config/logger.js';

// Lua script: atomic INCR + conditional PEXPIRE + TTL read in one round-trip
// Returns [count, pttl_remaining]
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

/**
 * Create a Redis-backed rate limiter middleware
 * @param {Object} options
 * @param {number} options.windowMs  - Window length in ms
 * @param {number} options.max       - Max requests per window
 * @param {string} options.message   - Message when limit exceeded
 * @param {string} options.prefix    - Redis key prefix
 * @param {Function} options.keyGenerator - Function(req) → string key
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 60000,
    max = 10,
    message = 'Too many requests, please try again later.',
    prefix = 'rl:',
    keyGenerator = (req) => req.ip || 'anonymous'
  } = options;

  return async (req, res, next) => {
    const clientKey = `${prefix}${keyGenerator(req)}`;
    const now = Date.now();

    try {
      const [count, ttl] = await redis.eval(RATE_LIMIT_SCRIPT, 1, clientKey, windowMs.toString());
      const resetTime = now + (ttl > 0 ? ttl : windowMs);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());

      if (count > max) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message,
            retryAfter: Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)
          }
        });
      }

      next();
    } catch (err) {
      // Redis unavailable — fail open so a cache outage doesn't kill the API
      logger.warn({ err: err.message, key: clientKey }, 'Rate limiter Redis error - failing open');
      next();
    }
  };
}

/**
 * Audit creation rate limiter
 * Limit: 50 audits per hour per IP/user (configurable via env)
 */
export const auditCreationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.AUDIT_CREATION_LIMIT || '50'),
  message: 'Too many audit requests. Please try again later.',
  prefix: 'rl:audit:',
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous'
});

/**
 * General API rate limiter
 * Limit: 200 requests per 15 minutes per IP (configurable via env)
 */
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.API_RATE_LIMIT || '200'),
  message: 'Too many requests from this IP. Please try again later.',
  prefix: 'rl:api:'
});

/**
 * Report download rate limiter
 * Limit: 50 downloads per hour per IP (configurable via env)
 */
export const reportDownloadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.REPORT_DOWNLOAD_LIMIT || '50'),
  message: 'Too many report downloads. Please try again later.',
  prefix: 'rl:report:'
});
