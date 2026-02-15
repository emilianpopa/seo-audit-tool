/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse and excessive requests
 */

const rateLimiters = new Map();

/**
 * Simple in-memory rate limiter
 * @param {Object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests per window
 * @param {string} options.message - Error message when limit exceeded
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 60000, // 1 minute default
    max = 10, // 10 requests per minute default
    message = 'Too many requests, please try again later.',
    keyGenerator = (req) => req.ip || 'anonymous'
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create rate limit data for this key
    if (!rateLimiters.has(key)) {
      rateLimiters.set(key, {
        count: 0,
        resetTime: now + windowMs
      });
    }

    const limiter = rateLimiters.get(key);

    // Reset if window has passed
    if (now > limiter.resetTime) {
      limiter.count = 0;
      limiter.resetTime = now + windowMs;
    }

    // Increment request count
    limiter.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - limiter.count));
    res.setHeader('X-RateLimit-Reset', new Date(limiter.resetTime).toISOString());

    // Check if limit exceeded
    if (limiter.count > max) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: Math.ceil((limiter.resetTime - now) / 1000) // seconds
        }
      });
    }

    next();
  };
}

/**
 * Audit creation rate limiter
 * Limit: 5 audits per hour per IP
 */
export const auditCreationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many audit requests. Limit: 5 audits per hour.',
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip || 'anonymous';
  }
});

/**
 * General API rate limiter
 * Limit: 100 requests per 15 minutes per IP
 */
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP. Please try again later.'
});

/**
 * Report download rate limiter
 * Limit: 20 downloads per hour per IP
 */
export const reportDownloadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many report downloads. Limit: 20 downloads per hour.'
});

/**
 * Cleanup old rate limit entries (run periodically)
 */
export function cleanupRateLimiters() {
  const now = Date.now();
  for (const [key, limiter] of rateLimiters.entries()) {
    // Remove entries that are older than 2x their reset time
    if (now > limiter.resetTime + (limiter.resetTime - (now - 60000))) {
      rateLimiters.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimiters, 5 * 60 * 1000);
