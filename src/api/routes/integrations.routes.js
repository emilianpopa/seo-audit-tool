/**
 * CMS Integration Routes
 *
 * POST /api/integrations/connect          — Connect a WordPress site
 * GET  /api/integrations/:domain          — Check integration status
 * DELETE /api/integrations/:domain        — Disconnect integration
 * POST /api/integrations/:domain/fix      — Apply single fix
 * POST /api/integrations/:domain/fix/bulk — Apply multiple fixes (max 50)
 */
import express from 'express';
import { z } from 'zod';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';
import { encrypt } from '../../utils/encryption.js';
import WordPressService from '../../services/integrations/WordPressService.js';

const router = express.Router();

// ─── Validation Schemas ──────────────────────────────────────────────────────

const ConnectSchema = z.object({
  domain: z.string().min(3),
  platform: z.enum(['wordpress']),
  apiUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1) // Application Password (never stored in plaintext)
});

const FixSchema = z.object({
  auditId: z.string().optional(),
  pageUrl: z.string().url(),
  field: z.enum(['title', 'metaDescription', 'h1']),
  newValue: z.string().min(1).max(500)
});

const BulkFixSchema = z.object({
  auditId: z.string().optional(),
  fixes: z.array(z.object({
    pageUrl: z.string().url(),
    field: z.enum(['title', 'metaDescription', 'h1']),
    newValue: z.string().min(1).max(500)
  })).min(1).max(50)
});

// ─── In-Memory Integration Store ────────────────────────────────────────────
// NOTE: For production use, move this to a proper DB table with Prisma.
// Using a simple Map for now since no DB migration is needed for the MVP.
const integrationStore = new Map(); // key: domain → integration config

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/integrations/connect
 * Connect a CMS (WordPress for now). Tests connection before saving.
 */
router.post('/connect', async (req, res) => {
  try {
    const parsed = ConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { domain, platform, apiUrl, username, password } = parsed.data;

    if (platform !== 'wordpress') {
      return res.status(400).json({ error: 'Only WordPress is supported for auto-fix at this time.' });
    }

    // Encrypt password before storing
    const encryptedCreds = encrypt(password);

    const integration = { apiUrl, username, encryptedCreds, seoPluginType: 'none' };
    const wpService = new WordPressService(integration);

    // Test connection
    const connectionTest = await wpService.testConnection();
    if (!connectionTest.success) {
      return res.status(401).json({
        error: 'WordPress connection failed',
        details: connectionTest.error,
        hint: 'Check that: (1) the URL is correct, (2) the user exists, (3) you are using an Application Password (not your regular password). Generate one at: WordPress Admin → Users → Profile → Application Passwords'
      });
    }

    // Detect SEO plugin
    const seoPlugin = await wpService.detectSEOPlugin();
    integration.seoPluginType = seoPlugin;

    // Store integration (in production: save to DB)
    integrationStore.set(domain, {
      domain,
      platform,
      apiUrl,
      username,
      encryptedCreds,
      seoPluginType: seoPlugin,
      connectedAt: new Date().toISOString(),
      user: connectionTest.user
    });

    logger.info({ domain, platform, seoPlugin }, 'CMS integration connected');

    res.json({
      success: true,
      domain,
      platform,
      apiUrl,
      seoPlugin,
      user: connectionTest.user,
      capabilities: {
        updateTitle: true,
        updateMetaDescription: seoPlugin !== 'none',
        autoFix: true
      }
    });
  } catch (err) {
    logger.error({ err }, 'Integration connect failed');
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/integrations/:domain
 * Get integration status for a domain.
 */
router.get('/:domain', (req, res) => {
  const domain = req.params.domain.replace(/^www\./, '');
  const integration = integrationStore.get(domain);

  if (!integration) {
    return res.json({
      connected: false,
      domain,
      message: 'No integration configured. Use POST /api/integrations/connect to set up auto-fix.'
    });
  }

  // Don't return encrypted creds
  const { encryptedCreds, ...safe } = integration;
  res.json({ connected: true, ...safe });
});

/**
 * DELETE /api/integrations/:domain
 * Disconnect an integration.
 */
router.delete('/:domain', (req, res) => {
  const domain = req.params.domain.replace(/^www\./, '');
  const existed = integrationStore.delete(domain);
  res.json({ success: existed, domain });
});

/**
 * POST /api/integrations/:domain/fix
 * Apply a single fix to one page.
 */
router.post('/:domain/fix', async (req, res) => {
  try {
    const domain = req.params.domain.replace(/^www\./, '');
    const integration = integrationStore.get(domain);

    if (!integration) {
      return res.status(404).json({
        error: `No integration found for ${domain}. Connect first via POST /api/integrations/connect`
      });
    }

    const parsed = FixSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { pageUrl, field, newValue } = parsed.data;
    const wpService = new WordPressService(integration);

    // Find the post
    const urlPath = pageUrl.replace(/^https?:\/\/[^/]+/, '');
    const post = await wpService.findByPath(urlPath);

    if (!post) {
      return res.status(404).json({ error: `Page not found in WordPress: ${urlPath}` });
    }

    let result;
    if (field === 'title') {
      result = await wpService.updateTitle(post.type, post.id, newValue);
    } else if (field === 'metaDescription') {
      result = await wpService.updateMetaDescription(post.type, post.id, newValue);
    } else {
      return res.status(400).json({ error: `Field "${field}" is not supported for auto-fix yet.` });
    }

    if (!result.success) {
      return res.status(422).json({ error: result.error });
    }

    logger.info({ domain, pageUrl, field }, 'Fix applied via WordPress API');

    res.json({
      success: true,
      pageUrl,
      field,
      newValue,
      wordpressPost: post,
      updated: result.updated
    });
  } catch (err) {
    logger.error({ err }, 'Single fix failed');
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/integrations/:domain/fix/bulk
 * Apply up to 50 fixes in sequence.
 */
router.post('/:domain/fix/bulk', async (req, res) => {
  try {
    const domain = req.params.domain.replace(/^www\./, '');
    const integration = integrationStore.get(domain);

    if (!integration) {
      return res.status(404).json({
        error: `No integration found for ${domain}. Connect first via POST /api/integrations/connect`
      });
    }

    const parsed = BulkFixSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { fixes } = parsed.data;
    const wpService = new WordPressService(integration);

    logger.info({ domain, fixCount: fixes.length }, 'Starting bulk fix');

    const results = await wpService.bulkApplyFixes(domain, fixes);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    logger.info({ domain, successCount, failCount }, 'Bulk fix completed');

    res.json({
      success: failCount === 0,
      domain,
      total: results.length,
      applied: successCount,
      failed: failCount,
      results
    });
  } catch (err) {
    logger.error({ err }, 'Bulk fix failed');
    res.status(500).json({ error: err.message });
  }
});

export default router;
