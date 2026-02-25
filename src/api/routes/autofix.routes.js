import express from 'express';
import { PrismaClient } from '@prisma/client';
import { AutoFixEngine } from '../../services/autofix/AutoFixEngine.js';
import { successResponse, errorResponse } from '../../utils/responseFormatter.js';
import logger from '../../config/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

function getEngine() {
  const projectId = process.env.SANITY_PROJECT_ID || 'rtt3hnlz';
  const dataset = process.env.SANITY_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!token) throw new Error('SANITY_API_TOKEN environment variable is not set');
  return new AutoFixEngine({ projectId, dataset, token });
}

// ============================================================================
// GET /api/autofix/:auditId/fixes
// List all AutoFix records for an audit.
// Query params: ?status=PENDING|APPROVED|REJECTED|APPLIED|FAILED
// ============================================================================
router.get('/:auditId/fixes', async (req, res, next) => {
  try {
    const { auditId } = req.params;
    const { status } = req.query;

    const where = { auditId };
    if (status) where.status = status.toUpperCase();

    const fixes = await prisma.autoFix.findMany({
      where,
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    res.json(successResponse(fixes, `Found ${fixes.length} fix${fixes.length !== 1 ? 'es' : ''}`));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/:auditId/fixes/generate
// Scan audit results and generate AutoFix records for fixable issues.
// ============================================================================
router.post('/:auditId/fixes/generate', async (req, res, next) => {
  try {
    const { auditId } = req.params;
    const engine = getEngine();
    const count = await engine.generateFixes(auditId);
    res.json(successResponse({ auditId, generated: count }, `Generated ${count} potential fix${count !== 1 ? 'es' : ''}`));
  } catch (err) {
    logger.error({ err, auditId: req.params.auditId }, 'Failed to generate fixes');
    next(err);
  }
});

// ============================================================================
// GET /api/autofix/fixes/:fixId
// Get a single fix by ID.
// ============================================================================
router.get('/fixes/:fixId', async (req, res, next) => {
  try {
    const fix = await prisma.autoFix.findUnique({ where: { id: req.params.fixId } });
    if (!fix) return res.status(404).json(errorResponse('Fix not found', 'NOT_FOUND'));
    res.json(successResponse(fix));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/fixes/:fixId/approve
// Mark a PENDING fix as APPROVED (ready to apply).
// ============================================================================
router.post('/fixes/:fixId/approve', async (req, res, next) => {
  try {
    const fix = await prisma.autoFix.findUnique({ where: { id: req.params.fixId } });
    if (!fix) return res.status(404).json(errorResponse('Fix not found', 'NOT_FOUND'));
    if (fix.status !== 'PENDING') {
      return res.status(400).json(errorResponse(`Cannot approve a fix with status ${fix.status}`, 'INVALID_STATUS'));
    }

    const updated = await prisma.autoFix.update({
      where: { id: req.params.fixId },
      data: { status: 'APPROVED' },
    });
    res.json(successResponse(updated, 'Fix approved — ready to apply'));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/fixes/:fixId/reject
// Mark a PENDING fix as REJECTED.
// ============================================================================
router.post('/fixes/:fixId/reject', async (req, res, next) => {
  try {
    const fix = await prisma.autoFix.findUnique({ where: { id: req.params.fixId } });
    if (!fix) return res.status(404).json(errorResponse('Fix not found', 'NOT_FOUND'));

    const updated = await prisma.autoFix.update({
      where: { id: req.params.fixId },
      data: { status: 'REJECTED' },
    });
    res.json(successResponse(updated, 'Fix rejected'));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/fixes/:fixId/apply
// Apply an APPROVED fix to Sanity (creates a draft — not published automatically).
// The user reviews and publishes in Sanity Studio.
// ============================================================================
router.post('/fixes/:fixId/apply', async (req, res, next) => {
  try {
    const engine = getEngine();
    const result = await engine.applyFix(req.params.fixId);
    res.json(successResponse(result, result.message));
  } catch (err) {
    logger.error({ err, fixId: req.params.fixId }, 'Failed to apply fix');
    next(err);
  }
});

export default router;
