import { Queue } from 'bullmq';
import { getRedisConnection } from './redis.js';
import logger from './logger.js';

// Queue names
export const QUEUE_NAMES = {
  SEO_AUDIT: 'seo-audit-queue'
};

// Create SEO Audit queue
export const seoAuditQueue = new Queue(QUEUE_NAMES.SEO_AUDIT, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 7 * 24 * 60 * 60 // Keep for 7 days
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs
      age: 30 * 24 * 60 * 60 // Keep for 30 days
    }
  }
});

seoAuditQueue.on('error', (err) => {
  logger.error({ err, queue: QUEUE_NAMES.SEO_AUDIT }, 'Queue error');
});

/**
 * Add audit job to queue
 * @param {string} auditId - Audit ID
 * @param {Object} config - Audit configuration
 * @returns {Promise<Job>}
 */
export async function queueAudit(auditId, config = {}) {
  try {
    const job = await seoAuditQueue.add(
      'process-audit',
      {
        auditId,
        config
      },
      {
        jobId: auditId, // Use audit ID as job ID for easy tracking
        timeout: 600000 // 10 minutes timeout
      }
    );

    logger.info({
      auditId,
      jobId: job.id,
      queueName: QUEUE_NAMES.SEO_AUDIT
    }, 'Audit job queued');

    return job;
  } catch (err) {
    logger.error({ err, auditId }, 'Failed to queue audit');
    throw err;
  }
}

/**
 * Get job status
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function getJobStatus(jobId) {
  try {
    const job = await seoAuditQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      returnValue: job.returnvalue,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn
    };
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to get job status');
    return null;
  }
}

/**
 * Cancel a job
 * @param {string} jobId - Job ID
 * @returns {Promise<boolean>}
 */
export async function cancelJob(jobId) {
  try {
    const job = await seoAuditQueue.getJob(jobId);

    if (!job) {
      return false;
    }

    await job.remove();
    logger.info({ jobId }, 'Job cancelled');

    return true;
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to cancel job');
    return false;
  }
}

/**
 * Get queue metrics
 * @returns {Promise<Object>}
 */
export async function getQueueMetrics() {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      seoAuditQueue.getWaitingCount(),
      seoAuditQueue.getActiveCount(),
      seoAuditQueue.getCompletedCount(),
      seoAuditQueue.getFailedCount(),
      seoAuditQueue.getDelayedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed
    };
  } catch (err) {
    logger.error({ err }, 'Failed to get queue metrics');
    return null;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await seoAuditQueue.close();
});

process.on('SIGTERM', async () => {
  await seoAuditQueue.close();
});

export default seoAuditQueue;
