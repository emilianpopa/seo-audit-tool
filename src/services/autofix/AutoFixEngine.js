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
  missing_meta_descriptions: { documentType: 'pageSeo',     fieldPath: 'metaDescription', perPage: true },
  description_too_short:     { documentType: 'seoSettings', fieldPath: 'metaDescription' },
  description_too_long:      { documentType: 'seoSettings', fieldPath: 'metaDescription' },

  // ── Page title ────────────────────────────────────────────────────────────
  missing_title:             { documentType: 'seoSettings', fieldPath: 'metaTitle' },
  missing_title_tags:        { documentType: 'pageSeo',     fieldPath: 'metaTitle',       perPage: true },
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
  canonical_mismatch:        { documentType: 'seoSettings', fieldPath: 'canonicalUrl' },
  // Per-page canonical tags — each affected page gets its own pageSeo.canonical fix
  missing_canonical_tags:    { documentType: 'pageSeo', fieldPath: 'canonical', perPage: true },
  wrong_canonical_tags:      { documentType: 'pageSeo', fieldPath: 'canonical', perPage: true },

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
  missing_h1:                { documentType: 'pageSeo',     fieldPath: 'metaTitle',       perPage: true },
  multiple_h1:               { documentType: 'pageContent', fieldPath: 'heroSection.title' },

  // ── Structured data / NAP ─────────────────────────────────────────────────
  // limited_structured_data = pages lack schema markup; generate a complete Organization JSON-LD
  limited_structured_data:       { documentType: 'seoSettings', fieldPath: 'localBusinessSchema' },
  missing_local_business_schema: { documentType: 'seoSettings', fieldPath: 'localBusinessSchema' },

  // ── FAQ content ───────────────────────────────────────────────────────────
  no_faq_sections:           { documentType: 'seoSettings', fieldPath: 'faqNotes' },

  // ── Per-page content briefs ───────────────────────────────────────────────
  thin_content:              { documentType: 'pageSeo', fieldPath: 'contentBrief', perPage: true },
  weak_eeat_signals:         { documentType: 'pageSeo', fieldPath: 'eeatBrief',    perPage: true },

  // ── Twitter handle ────────────────────────────────────────────────────────
  missing_twitter_handle:    { documentType: 'seoSettings', fieldPath: 'twitterHandle' },

  // ── Robots / sitemap ──────────────────────────────────────────────────────
  robots_blocking:           { documentType: 'seoSettings', fieldPath: 'robotsSettings.index' },
  missing_robots:            { documentType: 'seoSettings', fieldPath: 'robotsSettings.index' },
  // robots_blocks_all = the robots.txt file itself is blocking crawlers (server-level issue).
  // robotsSettings.index is already true in Sanity; we store developer guidance instead.
  robots_blocks_all:         { documentType: 'seoSettings', fieldPath: 'robotsGuidance' },

  // ── Local SEO ─────────────────────────────────────────────────────────────
  incomplete_nap:            { documentType: 'seoSettings', fieldPath: 'localBusinessSchema' },
  inconsistent_address:      { documentType: 'seoSettings', fieldPath: 'localBusinessSchema' },
  inconsistent_phone:        { documentType: 'seoSettings', fieldPath: 'localBusinessSchema' },
  no_google_maps:            { documentType: 'seoSettings', fieldPath: 'googleMapsUrl' },
  no_location_in_title:      { documentType: 'seoSettings', fieldPath: 'metaTitle' },
  missing_location_keywords: { documentType: 'seoSettings', fieldPath: 'locationKeywords' },
  no_reviews_link:           { documentType: 'seoSettings', fieldPath: 'reviewsUrl' },

  // ── Content Quality ───────────────────────────────────────────────────────
  low_avg_word_count:        { documentType: 'seoSettings', fieldPath: 'contentStrategy' },

  // ── Authority & Backlinks ─────────────────────────────────────────────────
  missing_contact_page:      { documentType: 'seoSettings', fieldPath: 'contactPageGuidance' },
  missing_about_page:        { documentType: 'seoSettings', fieldPath: 'aboutPageGuidance' },

  // ── Technical SEO (mobile viewport meta tag) ──────────────────────────────
  // additionalMetaTags is the real field the frontend reads — append the viewport tag to it
  mobile_not_optimized:      { documentType: 'seoSettings', fieldPath: 'additionalMetaTags', arrayAppend: true },
  no_structured_data:        { documentType: 'pageSeo',     fieldPath: 'structuredDataGuidance', perPage: true },
};

// Common slug → human label mapping for compound slugs without separators
const SLUG_LABEL_MAP = {
  privacypolicy:       'Privacy Policy',
  enduseragreement:    'End User Agreement',
  termsofservice:      'Terms of Service',
  termsandconditions:  'Terms and Conditions',
  cookiepolicy:        'Cookie Policy',
  refundpolicy:        'Refund Policy',
  accessibilitypolicy: 'Accessibility Policy',
  aboutus:             'About Us',
  contactus:           'Contact Us',
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

        if (mapping.perPage) {
          // ── Per-page fix: create one AutoFix record per affected URL ──────
          // Extract evidence URLs from issue.evidence or issue.examples
          const evidenceUrls = [];
          if (Array.isArray(issue.evidence) && issue.evidence.length) {
            for (const e of issue.evidence.slice(0, 10)) {
              if (e.url) evidenceUrls.push(e.url);
            }
          } else if (Array.isArray(issue.examples) && issue.examples.length) {
            for (const u of issue.examples.slice(0, 10)) {
              if (typeof u === 'string') evidenceUrls.push(u);
              else if (u && typeof u === 'object' && u.url) evidenceUrls.push(u.url);
            }
          }

          for (const evidenceUrl of evidenceUrls) {
            let slug;
            try { slug = new URL(evidenceUrl).pathname; } catch { continue; }

            // Skip if a fix already exists for this audit + issue type + field + page
            const existingPage = await prisma.autoFix.findFirst({
              where: { auditId, issueType: issue.type, fieldPath: mapping.fieldPath, pageUrl: evidenceUrl },
            });
            if (existingPage) continue;

            // Get or create the pageSeo Sanity doc for this slug
            let sanityDocId;
            try {
              sanityDocId = await this.adapter.getOrCreatePageSeoDoc(slug);
            } catch (e) {
              logger.warn({ err: e, slug }, 'Failed to get/create pageSeo doc — skipping');
              continue;
            }

            // Fetch current value from the pageSeo doc
            let currentPageValue = null;
            try {
              const pageDoc = await this.adapter.getDocument(sanityDocId);
              currentPageValue = SanityCMSAdapter.getFieldValue(pageDoc, mapping.fieldPath);
            } catch { /* ignore — doc may not yet have the field */ }

            const proposedValue = this._generateProposedValue({
              issue,
              mapping,
              audit,
              homepage,
              currentValue: currentPageValue,
              pageUrl: evidenceUrl,
            });
            if (!proposedValue) continue;
            if (String(proposedValue).trim() === String(currentPageValue ?? '').trim()) continue;

            fixes.push({
              auditId,
              issueType: issue.type,
              severity: issue.severity || 'medium',
              title: `Fix: ${issue.title || issue.type.replace(/_/g, ' ')} — ${slug}`,
              description: issue.description || null,
              documentType: mapping.documentType,
              documentId: sanityDocId,
              fieldPath: mapping.fieldPath,
              pageUrl: evidenceUrl,
              currentValue: currentPageValue != null ? String(currentPageValue) : null,
              proposedValue: String(proposedValue),
            });
          }
        } else {
          // ── Global fix: one record per field (not per issue type) ─────────
          // Use field-level dedup: if ANY fix for this audit+field already exists, skip.
          // This prevents duplicate proposals when two issue types map to the same field.
          const existing = await prisma.autoFix.findFirst({
            where: { auditId, fieldPath: mapping.fieldPath },
          });
          if (existing) continue;

          const sanityDoc = sanityDocs[mapping.documentType];
          let currentValue = SanityCMSAdapter.getFieldValue(sanityDoc, mapping.fieldPath);

          // For array-append fields: stringify the array for storage, check if item already present
          if (mapping.arrayAppend) {
            const arr = Array.isArray(currentValue) ? currentValue : [];
            // Check if viewport tag already exists in additionalMetaTags
            if (mapping.fieldPath === 'additionalMetaTags') {
              const hasViewport = arr.some(item => item && item.name === 'viewport');
              if (hasViewport) continue;
            }
            currentValue = arr.length ? JSON.stringify(arr) : null;
          }

          const proposedValue = this._generateProposedValue({
            issue,
            mapping,
            audit,
            homepage,
            currentValue,
          });
          if (!proposedValue) continue;
          // Skip no-op: proposed value is identical to what's already in Sanity
          if (!mapping.arrayAppend && String(proposedValue).trim() === String(currentValue ?? '').trim()) continue;

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
      const arrayAppendFields = ['additionalMetaTags'];
      if (arrayAppendFields.includes(fix.fieldPath)) {
        let items;
        try { items = JSON.parse(fix.proposedValue); } catch { items = [fix.proposedValue]; }
        if (!Array.isArray(items)) items = [items];
        await this.adapter.appendToArray(fix.documentId, fix.fieldPath, items);
      } else {
        const setFields = SanityCMSAdapter.buildSetObject(fix.fieldPath, fix.proposedValue);
        await this.adapter.patchDocument(fix.documentId, setFields);
      }

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
      const arrayAppendFields = ['additionalMetaTags'];
      if (arrayAppendFields.includes(fix.fieldPath)) {
        let items;
        try { items = JSON.parse(fix.proposedValue); } catch { items = [fix.proposedValue]; }
        if (!Array.isArray(items)) items = [items];
        await this.adapter.publishAppendToArray(fix.documentId, fix.fieldPath, items);
      } else {
        const setFields = SanityCMSAdapter.buildSetObject(fix.fieldPath, fix.proposedValue);
        await this.adapter.publishDocument(fix.documentId, setFields);
      }

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
   * @param {object} opts
   * @param {string} [opts.pageUrl]  - full URL of the specific page (for perPage fixes)
   */
  _generateProposedValue({ issue, mapping, audit, homepage, currentValue, pageUrl }) {
    const domain = audit.domain;

    switch (mapping.fieldPath) {
      case 'metaDescription': {
        // Per-page: generate a page-specific description
        if (pageUrl) {
          let slug;
          try { slug = new URL(pageUrl).pathname; } catch { slug = null; }
          const pageLabel = slug
            ? slug.replace(/^\//, '').replace(/[-_]/g, ' ')
            : null;
          const brand = homepage?.title?.split(/[-|—]/)[0]?.trim() || domain;
          if (pageLabel) {
            const clean = pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1);
            return `${clean} for ${brand}. Learn more about our policies and terms on this page.`;
          }
        }
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
        // Special case: homepage title needs location/service area keyword
        if (issue.type === 'no_location_in_title') {
          if (!currentValue) {
            const nameRaw = domain.split('.')[0];
            const nameCap = nameRaw.charAt(0).toUpperCase() + nameRaw.slice(1);
            return `${nameCap} | Online Health Platform`;
          }
          // Only modify if title has room and doesn't already mention online/virtual
          if (currentValue.length <= 45 && !currentValue.includes('Online') && !currentValue.includes('Virtual')) {
            return `${currentValue} | Online`;
          }
          return null; // Too long or already has location keyword
        }

        // Per-page: derive a page-specific title from the slug
        if (pageUrl) {
          let slug;
          try { slug = new URL(pageUrl).pathname; } catch { slug = null; }
          const rawSlug = slug ? slug.replace(/^\//, '') : null;
          // Look up known compound slugs first (e.g. 'privacypolicy' → 'Privacy Policy')
          const knownLabel = rawSlug ? SLUG_LABEL_MAP[rawSlug.toLowerCase()] : null;
          const pageLabel = knownLabel
            || (rawSlug ? rawSlug.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2') : null);
          const brand = homepage?.title?.split(/[-|—]/)[0]?.trim() || domain;
          if (pageLabel) {
            const clean = pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1);
            return `${clean} — ${brand}`;
          }
        }
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

      case 'localBusinessSchema': {
        // Generate a complete Organization JSON-LD snippet.
        // Always generate — even if a value already exists — to provide better coverage.
        const stripped = domain.replace(/^www\./i, '');
        const parts = stripped.split('.');
        const orgName = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
        const name = orgName.charAt(0).toUpperCase() + orgName.slice(1);

        const needsPhone = issue.type === 'incomplete_nap' || issue.type === 'inconsistent_phone';
        const needsAddress = issue.type === 'incomplete_nap' || issue.type === 'inconsistent_address';
        const needsFull = issue.type === 'limited_structured_data' || issue.type === 'missing_local_business_schema';

        const schemaObj = {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name,
          url: `https://${domain}`,
          sameAs: [],
        };

        if (needsPhone || needsFull) {
          schemaObj.telephone = '+XX-XXX-XXX-XXXX  ← UPDATE with real phone number';
        }

        if (needsAddress || needsFull) {
          schemaObj.address = {
            '@type': 'PostalAddress',
            streetAddress: 'UPDATE: street address',
            addressLocality: 'City',
            addressRegion: 'Region',
            postalCode: '00000',
            addressCountry: 'GB',
          };
        }

        if (needsFull) {
          schemaObj.contactPoint = {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: `support@${stripped}`,
          };
        }

        return JSON.stringify(schemaObj, null, 2);
      }

      case 'faqNotes': {
        // Generate FAQ implementation guide with sample questions
        const brand = homepage?.title?.split(/[-|—]/)[0]?.trim() || domain;
        return `Add a FAQ section to your homepage and key service pages. Suggested questions:\n\n` +
          `Q: What does ${brand} do?\nA: [Describe your main service in 1–2 sentences]\n\n` +
          `Q: How does pricing work?\nA: [Explain pricing tiers or contact-for-quote]\n\n` +
          `Q: How long does onboarding / setup take?\nA: [Typical timeline]\n\n` +
          `Q: What makes ${brand} different?\nA: [Key differentiators vs competitors]\n\n` +
          `Q: How can I get started?\nA: [Step-by-step getting-started guide]\n\n` +
          `Implementation: mark up each Q&A with FAQPage JSON-LD schema and validate at schema.org/validator.`;
      }

      case 'contentBrief': {
        // Per-page content expansion brief
        let slug;
        try { slug = pageUrl ? new URL(pageUrl).pathname : null; } catch { slug = null; }
        const pageLabel = slug
          ? slug.replace(/^\//, '').replace(/[-_/]/g, ' ').trim() || 'homepage'
          : 'this page';
        const clean = pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1);
        return `Content expansion brief for "${clean}":\n\n` +
          `1. Expand total word count to 600–900+ words\n` +
          `2. Add 3–5 new H2 sections covering related subtopics\n` +
          `3. Include a numbered list or bullet points for scannability\n` +
          `4. Add 2–3 internal links to related service/blog pages\n` +
          `5. Include a clear call-to-action (CTA) at the end\n` +
          `6. Add at least one supporting image with descriptive alt text`;
      }

      case 'eeatBrief': {
        // Per-page E-E-A-T improvement tasks
        return `E-E-A-T credibility improvements needed:\n\n` +
          `1. Add author byline with full name and relevant credentials/title\n` +
          `2. Include publication date and "Last updated" date\n` +
          `3. Link to at least 2 authoritative external sources (gov, academic, industry)\n` +
          `4. Add supporting images, charts, or data visualisations\n` +
          `5. If blog/article: add an "About the Author" section with bio and headshot\n` +
          `6. Ensure the page has a clear editorial owner responsible for accuracy`;
      }

      case 'googleMapsUrl': {
        // Don't overwrite existing value
        if (currentValue) return null;
        return `https://maps.google.com/maps?q=${encodeURIComponent(domain)}`;
      }

      case 'locationKeywords': {
        if (currentValue) return null;
        const domainPrefix = domain.split('.')[0];
        return `Service area keywords to add across pages:\n- Consider adding your primary city/region to page titles and H1s\n- For telehealth/online services: "online", "virtual", "remote", "nationwide"\n- Add to homepage H1, About page, and Contact page\n- Example: "${domainPrefix} | Online Health Platform"\n- Check Google Search Console for location-based queries driving traffic`;
      }

      case 'reviewsUrl': {
        if (currentValue) return null;
        const reviewSlug = domain.replace(/\.(io|com|co).*$/, '');
        return `https://g.page/${reviewSlug}/review`;
      }

      case 'contactPageGuidance': {
        if (currentValue) return null;
        return `Contact page is missing. Create a /contact page with:\n1. Business email address\n2. Contact form (name, email, message fields)\n3. Response time expectation (e.g., "We reply within 24 hours")\n4. Physical address if applicable\n5. Social media links\n6. For SaaS: link to demo booking calendar (Calendly, Cal.com)`;
      }

      case 'aboutPageGuidance': {
        if (currentValue) return null;
        return `About page is missing. Create a /about page with:\n1. Company mission and story\n2. Team members with photos and bios (builds E-E-A-T)\n3. Founding year and milestones\n4. Press mentions or certifications\n5. Company values\n6. For healthcare: credentials, certifications, regulatory compliance`;
      }

      case 'contentStrategy': {
        if (currentValue) return null;
        return `Content expansion strategy (average word count is low):\n1. Homepage: aim for 800-1200 words — expand the hero section, add feature descriptions, testimonials\n2. Service pages: aim for 600-1000 words — explain the problem you solve, methodology, outcomes\n3. Add a blog section with 3-5 posts (500+ words each) targeting FAQ keywords\n4. Avoid keyword stuffing — write for humans first\n5. Include data, statistics, and case studies where possible`;
      }

      case 'additionalMetaTags': {
        // Return a JSON array item to be appended to the additionalMetaTags array.
        // The frontend reads this array and injects each {name, content} as a <meta> tag.
        return JSON.stringify([{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]);
      }

      case 'canonical': {
        // Per-page self-referencing canonical URL
        if (!pageUrl) return null;
        try {
          const parsed = new URL(pageUrl);
          // Always use www. prefix for consistency
          const host = parsed.hostname.startsWith('www.') ? parsed.hostname : `www.${parsed.hostname}`;
          return `https://${host}${parsed.pathname}`;
        } catch {
          return null;
        }
      }

      case 'robotsGuidance': {
        // The robots.txt file is blocking all crawlers — this is a server-level fix.
        // We store guidance notes in Sanity for the developer.
        if (currentValue) return null;
        return `⚠️ Your robots.txt is blocking all search engine crawlers.\n\nTo fix:\n1. Update your robots.txt file (usually at https://${domain}/robots.txt)\n2. Replace "Disallow: /" with "Disallow:" (empty value = allow all)\n3. Add a Sitemap line: Sitemap: https://${domain}/sitemap.xml\n\nCorrect robots.txt:\n  User-agent: *\n  Disallow:\n  Sitemap: https://${domain}/sitemap.xml\n\nThis CANNOT be fixed via Sanity — it requires a server/hosting configuration change.`;
      }

      case 'viewportGuidance': {
        if (currentValue) return null;
        return `Viewport meta tag is missing from some pages. Add to every HTML page <head>:\n<meta name="viewport" content="width=device-width, initial-scale=1">\nThis is critical for mobile SEO. Check your CMS template/layout file that renders the <head> section.`;
      }

      case 'structuredDataGuidance': {
        // Per-page structured data guidance
        let pageName = 'this page';
        if (pageUrl) {
          try {
            const parsed = new URL(pageUrl);
            pageName = parsed.pathname.replace(/^\//, '').replace(/-/g, ' ') || 'this page';
          } catch { /* ignore */ }
        }
        return `Add structured data to ${pageName}:\n- Service pages: use Service schema\n- Blog posts: use Article schema with author and datePublished\n- Product pages: use Product schema with price and availability\n- Minimum: add BreadcrumbList schema to all pages\nSee: https://schema.org for type definitions`;
      }

      default:
        return null;
    }
  }
}
