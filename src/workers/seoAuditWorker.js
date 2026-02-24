import 'dotenv/config';
import { Worker } from 'bullmq';
import { getRedisConnection } from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queue.js';
import prisma from '../config/database.js';
import logger from '../config/logger.js';
import WebsiteCrawler from '../services/crawler/WebsiteCrawler.js';
import TechnicalSEOAnalyzer from '../services/analyzers/TechnicalSEOAnalyzer.js';
import OnPageSEOAnalyzer from '../services/analyzers/OnPageSEOAnalyzer.js';
import ContentQualityAnalyzer from '../services/analyzers/ContentQualityAnalyzer.js';
import PerformanceAnalyzer from '../services/analyzers/PerformanceAnalyzer.js';
import AuthorityAnalyzer from '../services/analyzers/AuthorityAnalyzer.js';
import LocalSEOAnalyzer from '../services/analyzers/LocalSEOAnalyzer.js';

/**
 * Process SEO Audit Job
 * @param {Job} job - BullMQ job
 */
async function processAudit(job) {
  const { auditId, config = {} } = job.data;

  logger.info({ auditId, jobId: job.id }, 'Processing audit job');

  try {
    // Update audit status to IN_PROGRESS
    const audit = await prisma.seoAudit.update({
      where: { id: auditId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        progress: 0
      }
    });

    const { targetUrl } = audit;

    // ========================================================================
    // STEP 1: Crawl Website (10% progress)
    // ========================================================================
    await job.updateProgress(5);
    logger.info({ auditId, targetUrl }, 'Step 1: Starting website crawl');

    const crawler = new WebsiteCrawler({
      maxPages: config.maxPages || 50,
      maxDepth: config.crawlDepth || 3,
      delay: 500,
      timeout: 10000
    });

    const { pages: crawledPages, cmsDetection } = await crawler.crawl(targetUrl);

    logger.info({
      auditId,
      pagesCrawled: crawledPages.length,
      cms: cmsDetection?.platform || 'unknown'
    }, 'Website crawl completed');

    await job.updateProgress(10);

    // ========================================================================
    // STEP 2: Save Crawled Pages (15% progress)
    // ========================================================================
    logger.info({ auditId }, 'Step 2: Saving crawled pages');

    // Save pages to database
    for (const page of crawledPages) {
      await prisma.seoAuditPage.create({
        data: {
          auditId,
          url: page.url,
          path: page.path || '/',
          statusCode: page.statusCode || 0,
          depth: page.depth || 0,
          title: page.title || null,
          titleLength: page.titleLength || null,
          metaDescription: page.metaDescription || null,
          metaLength: page.metaLength || null,
          h1Tags: page.h1Tags || [],
          h2Tags: page.h2Tags || [],
          h3Tags: page.h3Tags || [],
          canonical: page.canonical || null,
          robotsMeta: page.robotsMeta || null,
          loadTime: page.loadTime || null,
          size: page.size || null,
          wordCount: page.wordCount || null,
          imageCount: page.imageCount || null,
          linkCount: page.linkCount || null,
          hasSchema: page.hasSchema || false,
          schemaTypes: page.schemaTypes || [],
          openGraphTags: page.openGraphTags || null,
          twitterTags: page.twitterTags || null
        }
      });
    }

    await job.updateProgress(15);

    // ========================================================================
    // STEP 3-8: Run all 6 analyzers in parallel (15% - 85% progress)
    // ========================================================================
    logger.info({ auditId }, 'Steps 3-8: Running all 6 analyzers in parallel');

    const [technicalResult, onPageResult, contentResult, performanceResult, authorityResult, localSEOResult] =
      await Promise.all([
        new TechnicalSEOAnalyzer(auditId, audit.domain, crawledPages).analyze(),
        new OnPageSEOAnalyzer(auditId, audit.domain, crawledPages).analyze(),
        new ContentQualityAnalyzer(auditId, audit.domain, crawledPages).analyze(),
        new PerformanceAnalyzer(auditId, audit.domain, crawledPages).analyze(),
        new AuthorityAnalyzer(auditId, audit.domain, crawledPages).analyze(),
        new LocalSEOAnalyzer(auditId, audit.domain, crawledPages).analyze()
      ]);

    const analyzerResults = [technicalResult, onPageResult, contentResult, performanceResult, authorityResult, localSEOResult];

    await job.updateProgress(85);

    // ========================================================================
    // STEP 9: Save Analyzer Results & Calculate Overall Score (85% - 90%)
    // ========================================================================
    logger.info({ auditId }, 'Step 9: Saving results and calculating overall score');

    // Save each analyzer result to database
    for (const result of analyzerResults) {
      await prisma.seoAuditResult.create({
        data: {
          auditId,
          category: result.category,
          categoryScore: result.categoryScore,
          weight: result.weight,
          rating: result.rating,
          issues: result.issues || [],
          issueCount: result.issueCount || 0,
          criticalCount: result.criticalCount || 0,
          highCount: result.highCount || 0,
          mediumCount: result.mediumCount || 0,
          lowCount: result.lowCount || 0
        }
      });
    }

    // Calculate overall score (weighted average)
    // Formula: sum(categoryScore * weight) for all categories
    // All 6 analyzers implemented with their respective weights:
    // - Technical SEO: 25%
    // - On-Page SEO: 20%
    // - Content Quality: 20%
    // - Performance: 10%
    // - Authority & Backlinks: 15%
    // - Local SEO: 10%
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const result of analyzerResults) {
      totalWeightedScore += result.categoryScore * parseFloat(result.weight);
      totalWeight += parseFloat(result.weight);
    }

    const overallScore = totalWeight > 0
      ? Math.round(totalWeightedScore / totalWeight)
      : 0;

    // Determine rating
    let scoreRating;
    if (overallScore >= 90) scoreRating = 'excellent';
    else if (overallScore >= 70) scoreRating = 'good';
    else if (overallScore >= 50) scoreRating = 'needs improvement';
    else scoreRating = 'poor';

    await job.updateProgress(90);

    logger.info({
      auditId,
      overallScore,
      scoreRating,
      analyzersCompleted: analyzerResults.length
    }, 'Overall score calculated');

    // ========================================================================
    // STEP 10: Generate Recommendations (90% - 95%)
    // ========================================================================
    logger.info({ auditId }, 'Step 10: Generating recommendations');

    // Generate recommendations from all analyzer issues
    let recommendationCount = 0;
    for (const analyzerResult of analyzerResults) {
      const issues = analyzerResult.issues || [];

      for (const issue of issues) {
        recommendationCount++;
        // Map severity to priority
        let priority;
        if (issue.severity === 'critical') priority = 'CRITICAL';
        else if (issue.severity === 'high') priority = 'HIGH';
        else if (issue.severity === 'medium') priority = 'MEDIUM';
        else priority = 'LOW';

        // Determine effort level based on issue type
        let effortLevel = 'MODERATE';
        let estimatedHours = 4;
        let phase = 'short-term';

        // Quick wins (< 2 hours)
        if (['missing_sitemap', 'missing_robots', 'robots_missing_sitemap', 'enable_compression', 'use_webp', 'no_google_maps', 'no_location_in_title', 'no_trust_badges', 'trailing_slash_inconsistency', 'trust_badges_missing_from_homepage'].includes(issue.type)) {
          effortLevel = 'QUICK_WIN';
          estimatedHours = 1;
          phase = 'quick-wins';
        }
        // Moderate effort (2-8 hours)
        else if (['missing_ssl', 'missing_meta_descriptions', 'missing_h1', 'unoptimized_images', 'unused_css', 'missing_privacy_policy', 'missing_contact_page', 'missing_local_business_schema', 'incomplete_nap', 'thin_content', 'thin_content_blog', 'thin_content_service', 'weak_eeat_signals', 'js_dependent_content', 'blog_not_featured_on_homepage', 'no_faq_sections'].includes(issue.type)) {
          effortLevel = 'MODERATE';
          estimatedHours = 3;
          phase = 'short-term';
        }
        // Substantial effort (8+ hours)
        else if (['mobile_not_optimized', 'duplicate_title_tags', 'duplicate_meta_descriptions', 'poor_mobile_performance', 'poor_lcp', 'no_social_media', 'inconsistent_phone', 'inconsistent_address', 'keyword_cannibalization', 'low_avg_word_count'].includes(issue.type)) {
          effortLevel = 'SUBSTANTIAL';
          estimatedHours = 12;
          phase = 'medium-term';
        }

        // Estimate impact
        let expectedImpact;
        if (issue.severity === 'critical') {
          expectedImpact = 'High impact. Expected score increase: +10-20 points.';
        } else if (issue.severity === 'high') {
          expectedImpact = 'Moderate-high impact. Expected score increase: +5-10 points.';
        } else if (issue.severity === 'medium') {
          expectedImpact = 'Moderate impact. Expected score increase: +3-5 points.';
        } else {
          expectedImpact = 'Low impact. Expected score increase: +1-3 points.';
        }

        await prisma.seoAuditRecommendation.create({
          data: {
            auditId,
            category: analyzerResult.category,
            priority,
            title: issue.title,
            description: issue.description,
            implementation: issue.recommendation,
            expectedImpact,
            effortLevel,
            estimatedHours,
            phase,
            affectedPages: issue.affectedPages || 0
          }
        });
      }
    }

    await job.updateProgress(95);

    logger.info({
      auditId,
      recommendationsCreated: recommendationCount
    }, 'Recommendations generated');

    // ========================================================================
    // STEP 11: Mark Audit as Completed (100% progress)
    // ========================================================================
    await prisma.seoAudit.update({
      where: { id: auditId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        overallScore,
        scoreRating,
        completedAt: new Date(),
        // Store CMS detection in metadata
        ...(cmsDetection && {
          metadata: {
            cmsDetection: {
              platform: cmsDetection.platform,
              platformKey: cmsDetection.platformKey,
              confidence: cmsDetection.confidence,
              confidencePct: cmsDetection.confidencePct,
              apiUrl: cmsDetection.apiUrl
            }
          }
        })
      }
    });

    await job.updateProgress(100);

    logger.info({
      auditId,
      overallScore,
      pagesCrawled: crawledPages.length
    }, 'Audit completed successfully');

    return {
      auditId,
      status: 'COMPLETED',
      overallScore,
      pagesCrawled: crawledPages.length
    };
  } catch (err) {
    logger.error({ err, auditId }, 'Audit processing failed');

    // Update audit status to FAILED
    await prisma.seoAudit.update({
      where: { id: auditId },
      data: {
        status: 'FAILED',
        errorMessage: err.message,
        errorDetails: {
          stack: err.stack,
          timestamp: new Date().toISOString()
        },
        completedAt: new Date()
      }
    });

    throw err; // Re-throw to mark job as failed
  }
}

// ============================================================================
// Worker Configuration
// ============================================================================

const worker = new Worker(
  QUEUE_NAMES.SEO_AUDIT,
  processAudit,
  {
    connection: getRedisConnection(),
    concurrency: 3, // Process up to 3 audits simultaneously
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000 // per minute
    }
  }
);

// ============================================================================
// Worker Event Handlers
// ============================================================================

worker.on('completed', (job) => {
  logger.info({
    jobId: job.id,
    auditId: job.data.auditId,
    duration: job.finishedOn - job.processedOn
  }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({
    jobId: job?.id,
    auditId: job?.data?.auditId,
    err: err.message
  }, 'Job failed');
});

worker.on('progress', (job, progress) => {
  logger.debug({
    jobId: job.id,
    auditId: job.data.auditId,
    progress
  }, 'Job progress updated');
});

worker.on('error', (err) => {
  logger.error({ err }, 'Worker error');
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown() {
  logger.info('Shutting down worker...');

  await worker.close();

  logger.info('Worker shut down successfully');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ============================================================================
// Start Worker
// ============================================================================

logger.info({
  queue: QUEUE_NAMES.SEO_AUDIT,
  concurrency: 3
}, 'SEO Audit Worker started');

export default worker;
