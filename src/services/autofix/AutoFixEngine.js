import { PrismaClient } from '@prisma/client';
import { SanityCMSAdapter } from './SanityCMSAdapter.js';
import logger from '../../config/logger.js';

const prisma = new PrismaClient();

// ============================================================================
// ISSUE TYPE → SANITY FIELD MAPPING
// Maps SEO audit issue types to the specific Sanity document + field to patch.
// documentType = Sanity _type value, fieldPath = dot-notation field path
// ============================================================================
const ISSUE_FIELD_MAP = {
  // ── Meta description ──────────────────────────────────────────────────────
  missing_meta_description:  { documentType: 'seoSettings', fieldPath: 'metaDescription' },
  missing_meta_descriptions: { documentType: 'seoSettings', fieldPath: 'metaDescription' },
  description_too_short:     { documentType: 'seoSettings', fieldPath: 'metaDescription' },
  description_too_long:      { documentType: 'seoSettings', fieldPath: 'metaDescription' },

  // ── Page title ────────────────────────────────────────────────────────────
  missing_title:             { documentType: 'seoSettings', fieldPath: 'metaTitle' },
  missing_title_tags:        { documentType: 'seoSettings', fieldPath: 'metaTitle' },
  title_missing:             { documentType: 'seoSettings', fieldPath: 'metaTitle' },
  title_too_short:           { documentType: 'seoSettings', fieldPath: 'metaTitle' },
  title_too_long:            { documentType: 'seoSettings', fieldPath: 'metaTitle' },

  // ── Open Graph ────────────────────────────────────────────────────────────
  missing_og_tags:           { documentType: 'seoSettings', fieldPath: 'ogTitle' },
  missing_og_title:          { documentType: 'seoSettings', fieldPath: 'ogTitle' },
  missing_og_description:    { documentType: 'seoSettings', fieldPath: 'ogDescription' },

  // ── Twitter card ──────────────────────────────────────────────────────────
  missing_twitter_tags:      { documentType: 'seoSettings', fieldPath: 'twitterCardType' },
  missing_twitter_card:      { documentType: 'seoSettings', fieldPath: 'twitterCardType' },

  // ── Canonical URL ─────────────────────────────────────────────────────────
  missing_canonical:         { documentType: 'seoSettings', fieldPath: 'canonicalUrl' },
  missing_canonical_tags:    { documentType: 'seoSettings', fieldPath: 'canonicalUrl' },
  canonical_mismatch:        { documentType: 'seoSettings', fieldPath: 'canonicalUrl' },
  wrong_canonical_tags:      { documentType: 'seoSettings', fieldPath: 'canonicalUrl' },

  // ── Robots indexing ───────────────────────────────────────────────────────
  noindex_set:               { documentType: 'seoSettings', fieldPath: 'robotsSettings.index' },
  robots_noindex:            { documentType: 'seoSettings', fieldPath: 'robotsSettings.index' },

  // ── Analytics IDs ─────────────────────────────────────────────────────────
  missing_ga:                { documentType: 'seoSettings', fieldPath: 'googleAnalyticsId' },
  missing_google_analytics:  { documentType: 'seoSettings', fieldPath: 'googleAnalyticsId' },
  missing_gtm:               { documentType: 'seoSettings', fieldPath: 'googleTagManagerId' },

  // ── Image alt (hero) ──────────────────────────────────────────────────────
  missing_image_alt:         { documentType: 'pageContent', fieldPath: 'heroSection.image.alt' },
  images_missing_alt:        { documentType: 'pageContent', fieldPath: 'heroSection.image.alt' },

  // ── Hero / page H1 ────────────────────────────────────────────────────────
  missing_h1:                { documentType: 'pageContent', fieldPath: 'heroSection.title' },
  multiple_h1:               { documentType: 'pageContent', fieldPath: 'heroSection.title' },

  // ── Structured data / NAP ─────────────────────────────────────────────────
  limited_structured_data:   { documentType: 'seoSettings', fieldPath: 'structuredData.organizationName' },
  incomplete_nap:            { documentType: 'seoSettings', fieldPath: 'structuredData.organizationName' },
  inconsistent_address:      { documentType: 'seoSettings', fieldPath: 'structuredData.organizationName' },
  missing_local_business_schema: { documentType: 'seoSettings', fieldPath: 'structuredData.organizationName' },

  // ── Twitter handle ────────────────────────────────────────────────────────
  missing_twitter_handle:    { documentType: 'seoSettings', fieldPath: 'twitterHandle' },

  // ── Robots / sitemap (allow indexing) ─────────────────────────────────────
  robots_blocking:           { documentType: 'seoSettings', fieldPath: 'robotsSettings.index' },
  robots_blocks_all:         { documentType: 'seoSettings', fieldPath: 'robotsSettings.index' },
  missing_robots:            { documentType: 'seoSettings', fieldPath: 'robotsSettings.index' },
};

export class AutoFixEngine {
  /**
   * @param {object} opts
   * @param {string} opts.projectId  - Sanity project ID
   * @param {string} [opts.dataset]  - Sanity dataset (default: 'production')
   * @param {string} opts.token      - Sanity API write token
   */
  constructor({ projectId, dataset = 'production', token }) {
    this.adapter = new SanityCMSAdapter({ projectId, dataset, token });
  }

  // ============================================================================
  // GENERATE FIXES
  // Scan audit results for fixable issues and store AutoFix records in DB.
  // ============================================================================
  async generateFixes(auditId) {
    const audit = await prisma.seoAudit.findUnique({
      where: { id: auditId },
      include: { results: true, pages: true },
    });
    if (!audit) throw new Error(`Audit ${auditId} not found`);

    // Fetch current Sanity documents
    const [seoSettings] = await this.adapter.getDocumentsByType('seoSettings');
    const [pageContent] = await this.adapter.getDocumentsByType('pageContent');
    const sanityDocs = { seoSettings, pageContent };

    const homepage = this._findHomepage(audit.pages);
    const fixes = [];

    for (const result of audit.results) {
      const issues = this._parseIssues(result.issues);

      for (const issue of issues) {
        const mapping = ISSUE_FIELD_MAP[issue.type];
        if (!mapping) continue;

        // Skip if a fix already exists for this audit + issue type + field
        const existing = await prisma.autoFix.findFirst({
          where: { auditId, issueType: issue.type, fieldPath: mapping.fieldPath },
        });
        if (existing) continue;

        const sanityDoc = sanityDocs[mapping.documentType];
        const currentValue = SanityCMSAdapter.getFieldValue(sanityDoc, mapping.fieldPath);
        const proposedValue = this._generateProposedValue({
          issue,
          mapping,
          audit,
          homepage,
          currentValue,
        });
        if (!proposedValue) continue;
        // Skip no-op: proposed value is identical to what's already in Sanity
        if (String(proposedValue).trim() === String(currentValue ?? '').trim()) continue;

        fixes.push({
          auditId,
          issueType: issue.type,
          severity: issue.severity || 'medium',
          title: `Fix: ${issue.title || issue.type.replace(/_/g, ' ')}`,
          description: issue.description || null,
          documentType: mapping.documentType,
          documentId: sanityDoc?._id || null,
          fieldPath: mapping.fieldPath,
          currentValue: currentValue != null ? String(currentValue) : null,
          proposedValue: String(proposedValue),
        });

        // If this is an OG issue, also generate an ogDescription fix
        if (issue.type === 'missing_og_tags' && !fixes.find(f => f.fieldPath === 'ogDescription')) {
          const descValue = this._generateProposedValue({
            issue: { ...issue, type: 'missing_og_description' },
            mapping: { documentType: 'seoSettings', fieldPath: 'ogDescription' },
            audit,
            homepage,
            currentValue: SanityCMSAdapter.getFieldValue(sanityDoc, 'ogDescription'),
          });
          if (descValue) {
            fixes.push({
              auditId,
              issueType: 'missing_og_description',
              severity: issue.severity || 'medium',
              title: 'Fix: Missing OG Description',
              description: 'Add an Open Graph description for better social media sharing.',
              documentType: 'seoSettings',
              documentId: sanityDoc?._id || null,
              fieldPath: 'ogDescription',
              currentValue: null,
              proposedValue: String(descValue),
            });
          }
        }
      }
    }

    if (fixes.length > 0) {
      await prisma.autoFix.createMany({ data: fixes });
      logger.info({ auditId, count: fixes.length }, 'AutoFix records generated');
    }

    return fixes.length;
  }

  // ============================================================================
  // APPLY FIX
  // Applies an APPROVED fix to Sanity (creates a draft — not published automatically).
  // ============================================================================
  async applyFix(fixId) {
    const fix = await prisma.autoFix.findUnique({ where: { id: fixId } });
    if (!fix) throw new Error(`Fix ${fixId} not found`);
    if (fix.status !== 'APPROVED') {
      throw new Error(`Fix must be APPROVED before applying. Current status: ${fix.status}`);
    }
    if (!fix.documentId) {
      throw new Error(`Fix ${fixId} has no Sanity documentId — re-generate fixes after confirming the Sanity document exists`);
    }

    try {
      const setFields = SanityCMSAdapter.buildSetObject(fix.fieldPath, fix.proposedValue);
      await this.adapter.patchDocument(fix.documentId, setFields);

      await prisma.autoFix.update({
        where: { id: fixId },
        data: { status: 'APPLIED', appliedAt: new Date(), errorMessage: null },
      });

      logger.info({ fixId, fieldPath: fix.fieldPath, docId: fix.documentId }, 'AutoFix applied to Sanity (draft created)');
      return {
        success: true,
        message: 'Draft created in Sanity. Review and publish in Sanity Studio to make it live.',
        fieldPath: fix.fieldPath,
        documentId: fix.documentId,
      };
    } catch (err) {
      await prisma.autoFix.update({
        where: { id: fixId },
        data: { status: 'FAILED', errorMessage: err.message },
      });
      throw err;
    }
  }

  // ============================================================================
  // PUBLISH FIX
  // Applies a fix directly to the live published Sanity document — no draft,
  // no Studio step required. Use for unambiguous, safe changes only.
  // ============================================================================
  async publishFix(fixId) {
    const fix = await prisma.autoFix.findUnique({ where: { id: fixId } });
    if (!fix) throw new Error(`Fix ${fixId} not found`);
    if (fix.status === 'PUBLISHED') return { success: true, message: 'Already published live.', fieldPath: fix.fieldPath, documentId: fix.documentId };
    if (fix.status === 'REJECTED') throw new Error(`Fix ${fixId} has been rejected`);
    if (!fix.documentId) throw new Error(`Fix ${fixId} has no Sanity documentId`);

    try {
      const setFields = SanityCMSAdapter.buildSetObject(fix.fieldPath, fix.proposedValue);
      await this.adapter.publishDocument(fix.documentId, setFields);

      await prisma.autoFix.update({
        where: { id: fixId },
        data: { status: 'PUBLISHED', appliedAt: new Date(), publishedAt: new Date(), errorMessage: null },
      });

      logger.info({ fixId, fieldPath: fix.fieldPath, docId: fix.documentId }, 'AutoFix published live to Sanity');
      return {
        success: true,
        message: 'Fix published live. The change is now on your website.',
        fieldPath: fix.fieldPath,
        documentId: fix.documentId,
      };
    } catch (err) {
      await prisma.autoFix.update({
        where: { id: fixId },
        data: { status: 'FAILED', errorMessage: err.message },
      });
      throw err;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  _findHomepage(pages) {
    return pages.find(p => {
      try { return new URL(p.url).pathname === '/'; } catch { return false; }
    }) || pages[0] || null;
  }

  _parseIssues(issuesField) {
    if (Array.isArray(issuesField)) return issuesField;
    try { return JSON.parse(issuesField || '[]'); } catch { return []; }
  }

  /**
   * Generate a sensible proposed value for each fixable field.
   * Uses real page data from the audit wherever possible.
   */
  _generateProposedValue({ issue, mapping, audit, homepage, currentValue }) {
    const domain = audit.domain;

    switch (mapping.fieldPath) {
      case 'metaDescription': {
        // Prefer the actual page meta description if it's a good length
        if (homepage?.metaDescription) {
          const len = homepage.metaDescription.length;
          if (len >= 120 && len <= 160) return homepage.metaDescription;
          if (len > 10) {
            // Trim if too long
            const trimmed = homepage.metaDescription.slice(0, 155).replace(/\s\S*$/, '');
            if (trimmed.length >= 80) return trimmed + '…';
          }
        }
        // Generic fallback using site title
        const siteTitle = homepage?.title || domain;
        return `${siteTitle} — Learn about our solutions and how we help you achieve your goals. Explore our services today.`;
      }

      case 'metaTitle': {
        if (homepage?.title) {
          const len = homepage.title.length;
          if (len >= 30 && len <= 60) return homepage.title;
          if (len > 60) return homepage.title.slice(0, 57) + '…';
          // Too short — append domain
          return `${homepage.title} | ${domain}`;
        }
        return `${domain} | Professional Services`;
      }

      case 'ogTitle': {
        return homepage?.title || `${domain} | Professional Services`;
      }

      case 'ogDescription': {
        if (homepage?.metaDescription && homepage.metaDescription.length >= 60) {
          return homepage.metaDescription.slice(0, 200);
        }
        return `${homepage?.title || domain} — Explore our solutions and discover how we can help you succeed.`;
      }

      case 'canonicalUrl': {
        return `https://${domain}/`;
      }

      case 'twitterCardType': {
        return 'summary_large_image';
      }

      case 'robotsSettings.index': {
        return true;
      }

      case 'googleAnalyticsId': {
        // Cannot guess the GA ID — return null so no fix is proposed
        return null;
      }

      case 'googleTagManagerId': {
        return null;
      }

      case 'heroSection.image.alt': {
        return homepage?.title
          ? `${homepage.title} — hero image`
          : `${domain} hero image`;
      }

      case 'heroSection.title': {
        // Use the actual page H1/title from the crawled homepage
        if (homepage?.title) return homepage.title;
        return `${domain} — AI-Powered Healthcare Solutions`;
      }

      case 'structuredData.organizationName': {
        // Only suggest a name when the field is truly empty — a domain-derived
        // guess cannot improve an existing value (e.g. "Expand Health" → "Expandhealth")
        if (currentValue) return null;
        const stripped = domain.replace(/^www\./i, '');
        const parts = stripped.split('.');
        const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
        return name.charAt(0).toUpperCase() + name.slice(1);
      }

      case 'twitterHandle': {
        // Cannot guess handle — skip
        return null;
      }

      default:
        return null;
    }
  }
}
