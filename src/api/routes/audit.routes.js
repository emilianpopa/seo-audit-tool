import express from 'express';
import { z } from 'zod';
import { isValidUrl, normalizeUrl, extractDomain } from '../../utils/urlUtils.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  paginatedResponse,
  HTTP_STATUS
} from '../../utils/responseFormatter.js';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';
import { queueAudit } from '../../config/queue.js';
import { auditCreationLimiter } from '../../middleware/rateLimiter.js';

const startAuditSchema = z.object({
  targetUrl: z.string().min(1, 'Target URL is required'),
  config: z.object({
    maxPages: z.number().int().min(1).max(200).optional(),
    crawlDepth: z.number().int().min(1).max(10).optional()
  }).optional().default({})
});

const router = express.Router();

/**
 * POST /api/audit/start
 * Start a new SEO audit
 */
router.post('/start', auditCreationLimiter, async (req, res) => {
  try {
    const parsed = startAuditSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }));
      return res.status(HTTP_STATUS.VALIDATION_ERROR).json(validationErrorResponse(errors));
    }

    const { targetUrl, config } = parsed.data;

    if (!isValidUrl(targetUrl)) {
      return res.status(HTTP_STATUS.VALIDATION_ERROR).json(
        validationErrorResponse([{ field: 'targetUrl', message: 'Invalid URL format' }])
      );
    }

    const normalizedUrl = normalizeUrl(targetUrl);
    const domain = extractDomain(normalizedUrl);

    // Create audit record
    const audit = await prisma.seoAudit.create({
      data: {
        userId: 'default-user', // TODO: Get from auth
        targetUrl: normalizedUrl,
        domain,
        status: 'PENDING',
        config: config || {}
      }
    });

    // Queue audit job with BullMQ
    await queueAudit(audit.id, config);

    logger.info({ auditId: audit.id, url: normalizedUrl }, 'Audit created and queued');

    res.status(HTTP_STATUS.CREATED).json(
      successResponse({
        auditId: audit.id,
        status: audit.status,
        targetUrl: audit.targetUrl,
        estimatedTime: '1-3 minutes',
        createdAt: audit.createdAt
      }, 'Audit queued successfully')
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to create audit');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Failed to create audit', 'AUDIT_CREATE_ERROR')
    );
  }
});

/**
 * GET /api/audit/:id/status
 * Get audit status and progress
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    const audit = await prisma.seoAudit.findUnique({
      where: { id },
      select: {
        id: true,
        targetUrl: true,
        status: true,
        progress: true,
        overallScore: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        errorMessage: true
      }
    });

    if (!audit) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        notFoundResponse('Audit', id)
      );
    }

    const response = {
      auditId: audit.id,
      targetUrl: audit.targetUrl,
      status: audit.status,
      progress: audit.progress,
      ...(audit.overallScore && { overallScore: audit.overallScore }),
      ...(audit.startedAt && { startedAt: audit.startedAt }),
      ...(audit.completedAt && { completedAt: audit.completedAt }),
      createdAt: audit.createdAt,
      ...(audit.errorMessage && { error: audit.errorMessage })
    };

    res.json(successResponse(response));
  } catch (error) {
    logger.error({ err: error, auditId: req.params.id }, 'Failed to get audit status');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Failed to retrieve audit status', 'AUDIT_STATUS_ERROR')
    );
  }
});

/**
 * GET /api/audit/:id/report
 * Get complete audit report
 */
router.get('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;

    const audit = await prisma.seoAudit.findUnique({
      where: { id },
      include: {
        results: true,
        pages: {
          take: 10 // Limit pages in response
        },
        recommendations: {
          orderBy: [
            { priority: 'asc' },
            { effortLevel: 'asc' }
          ]
        }
      }
    });

    if (!audit) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        notFoundResponse('Audit', id)
      );
    }

    if (audit.status !== 'COMPLETED') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        errorResponse('Audit is not completed yet', 'AUDIT_NOT_COMPLETED')
      );
    }

    // Format category scores
    const categoryScores = {};
    for (const result of audit.results) {
      categoryScores[result.category] = {
        score: result.categoryScore,
        weight: parseFloat(result.weight),
        rating: result.rating,
        issues: result.issues,
        issueCount: result.issueCount,
        criticalCount: result.criticalCount,
        highCount: result.highCount,
        mediumCount: result.mediumCount,
        lowCount: result.lowCount
      };
    }

    // Group recommendations by phase
    const roadmap = {
      quickWins: audit.recommendations.filter(r => r.effortLevel === 'QUICK_WIN'),
      shortTerm: audit.recommendations.filter(r => r.phase === 'short-term'),
      mediumTerm: audit.recommendations.filter(r => r.phase === 'medium-term'),
      longTerm: audit.recommendations.filter(r => r.phase === 'long-term')
    };

    // Extract CMS detection from metadata
    const cmsDetection = audit.metadata?.cmsDetection || null;

    const response = {
      auditId: audit.id,
      targetUrl: audit.targetUrl,
      domain: audit.domain,
      overallScore: audit.overallScore,
      scoreRating: audit.scoreRating,
      completedAt: audit.completedAt,
      cmsDetection,
      categoryScores,
      recommendations: audit.recommendations.map(r => ({
        priority: r.priority,
        category: r.category,
        title: r.title,
        description: r.description,
        implementation: r.implementation,
        expectedImpact: r.expectedImpact,
        effortLevel: r.effortLevel,
        estimatedHours: r.estimatedHours,
        phase: r.phase
      })),
      roadmap,
      pagesAnalyzed: await prisma.seoAuditPage.count({ where: { auditId: id } })
    };

    res.json(successResponse(response));
  } catch (error) {
    logger.error({ err: error, auditId: req.params.id }, 'Failed to get audit report');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Failed to retrieve audit report', 'AUDIT_REPORT_ERROR')
    );
  }
});

/**
 * GET /api/audit/history
 * Get audit history (paginated)
 */
router.get('/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const status = req.query.status; // Optional filter

    const skip = (page - 1) * limit;

    const where = {
      userId: 'default-user', // TODO: Get from auth
      ...(status && { status })
    };

    const [audits, total] = await Promise.all([
      prisma.seoAudit.findMany({
        where,
        select: {
          id: true,
          targetUrl: true,
          domain: true,
          status: true,
          overallScore: true,
          scoreRating: true,
          createdAt: true,
          completedAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.seoAudit.count({ where })
    ]);

    res.json(paginatedResponse(audits, page, limit, total));
  } catch (error) {
    logger.error({ err: error }, 'Failed to get audit history');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Failed to retrieve audit history', 'AUDIT_HISTORY_ERROR')
    );
  }
});

/**
 * DELETE /api/audit/:id
 * Delete an audit
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const audit = await prisma.seoAudit.findUnique({
      where: { id },
      select: { id: true, status: true }
    });

    if (!audit) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        notFoundResponse('Audit', id)
      );
    }

    // Don't allow deletion of in-progress audits
    if (audit.status === 'IN_PROGRESS') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        errorResponse('Cannot delete audit in progress', 'AUDIT_IN_PROGRESS')
      );
    }

    await prisma.seoAudit.delete({ where: { id } });

    logger.info({ auditId: id }, 'Audit deleted');

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    logger.error({ err: error, auditId: req.params.id }, 'Failed to delete audit');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Failed to delete audit', 'AUDIT_DELETE_ERROR')
    );
  }
});

export default router;
