import Redis from 'ioredis';
import logger from './logger.js';

// Railway provides REDIS_URL, local dev uses separate host/port
let redis;

if (process.env.REDIS_URL) {
  // Railway/production: use connection string directly
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });
} else {
  // Local development: use host/port/password
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });
}

redis.on('connect', () => {
  const connectionType = process.env.REDIS_URL ? 'REDIS_URL' : 'host/port';
  logger.info({ connectionType }, 'Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await redis.quit();
});

process.on('SIGTERM', async () => {
  await redis.quit();
});

export default redis;

// Export connection function for BullMQ
export function getRedisConnection() {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });
  } else {
    return new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });
  }
}
