import express from 'express';
import { PrismaClient } from '@prisma/client';
import { successResponse, errorResponse } from '../../utils/responseFormatter.js';

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// GET /api/cmsconfig/:domain
// Retrieve the CMS configuration for a domain.
// ============================================================================
router.get('/:domain', async (req, res, next) => {
  try {
    const { domain } = req.params;
    const cfg = await prisma.cMSConfig.findUnique({ where: { domain } });
    if (!cfg) return res.status(404).json(errorResponse(`No CMS config found for domain: ${domain}`, 'NOT_FOUND'));
    // Never expose the token in the response
    const { token: _token, ...safe } = cfg;
    res.json(successResponse({ ...safe, hasToken: !!cfg.token }));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/cmsconfig
// Create or update the CMS configuration for a domain.
// Body: { domain, adapter?, projectId, dataset?, token? }
// ============================================================================
router.post('/', async (req, res, next) => {
  try {
    const { domain, adapter = 'sanity', projectId, dataset = 'production', token } = req.body || {};
    if (!domain) return res.status(400).json(errorResponse('domain is required', 'VALIDATION_ERROR'));
    if (!projectId) return res.status(400).json(errorResponse('projectId is required', 'VALIDATION_ERROR'));

    const data = { adapter, projectId, dataset };
    // Only update the token field if one was explicitly provided
    if (token !== undefined && token !== '') data.token = token;

    const cfg = await prisma.cMSConfig.upsert({
      where:  { domain },
      create: { domain, ...data },
      update: data,
    });

    const { token: _token, ...safe } = cfg;
    res.json(successResponse({ ...safe, hasToken: !!cfg.token }, `CMS config saved for ${domain}`));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// DELETE /api/cmsconfig/:domain
// Remove the CMS configuration for a domain.
// ============================================================================
router.delete('/:domain', async (req, res, next) => {
  try {
    const { domain } = req.params;
    const existing = await prisma.cMSConfig.findUnique({ where: { domain } });
    if (!existing) return res.status(404).json(errorResponse(`No CMS config found for domain: ${domain}`, 'NOT_FOUND'));
    await prisma.cMSConfig.delete({ where: { domain } });
    res.json(successResponse({ domain }, `CMS config removed for ${domain}`));
  } catch (err) {
    next(err);
  }
});

export default router;
