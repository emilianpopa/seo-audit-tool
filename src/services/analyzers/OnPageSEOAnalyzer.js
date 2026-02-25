import * as cheerio from 'cheerio';
import logger from '../../config/logger.js';

/**
 * On-Page SEO Analyzer
 *
 * Analyzes on-page SEO factors:
 * - Title tags (length, uniqueness, optimization)
 * - Meta descriptions (length, presence, duplicates)
 * - Heading structure (H1 uniqueness, hierarchy)
 * - URL structure (length, descriptiveness)
 * - Image optimization (alt text)
 * - Internal linking
 *
 * Weight: 20% of overall score
 *
 * Each issue now carries a `specifics` array with per-page
 * current→suggested pairs, enabling before/after report tables.
 */
class OnPageSEOAnalyzer {
  constructor(auditId, domain, pages) {
    this.auditId = auditId;
    this.domain = domain;
    this.pages = pages;
    this.issues = [];
    this.checks = {};
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /** Extract brand name from domain, e.g. "getthrivin.com" → "GetThrivin" */
  _domainBrand() {
    const base = this.domain.replace(/^www\./, '').split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  /**
   * Build a suggested 50–60 character title for a page.
   * Uses H1 as the primary signal, falls back to current title.
   */
  _suggestTitle(page, currentTitle) {
    const h1 = (page.h1Tags && page.h1Tags[0] && page.h1Tags[0].trim()) || '';
    const brand = this._domainBrand();
    const suffix = ` | ${brand}`;

    let base = h1 || currentTitle || '';

    // Remove existing brand suffixes from base to avoid duplication
    base = base.replace(new RegExp(`\\s*[|\\-–—]\\s*${brand}.*$`, 'i'), '').trim();

    if (!base) return `${brand} - Professional Services${suffix}`;

    const candidate = `${base}${suffix}`;

    if (candidate.length <= 60) {
      // If too short, that's fine — better than truncating
      return candidate;
    }

    // Truncate base to fit within 60 chars
    const maxBase = 60 - suffix.length - 3; // 3 for "..."
    const truncated = base.length > maxBase
      ? base.substring(0, base.lastIndexOf(' ', maxBase) || maxBase) + '...'
      : base;

    return `${truncated}${suffix}`;
  }

  /**
   * Build a suggested 130–155 character meta description for a page.
   * Uses H1 + page path to craft a descriptive sentence.
   */
  _suggestMeta(page) {
    const h1 = (page.h1Tags && page.h1Tags[0] && page.h1Tags[0].trim()) || '';
    const brand = this._domainBrand();
    const path = (page.path || '/').replace(/\//g, ' ').replace(/-/g, ' ').trim();

    let suggestion;
    if (h1) {
      suggestion = `${h1} — Learn more on ${brand}. We provide expert guidance and resources to help you achieve your goals. Get started today.`;
    } else if (path && path !== '') {
      const pageContext = path.charAt(0).toUpperCase() + path.slice(1);
      suggestion = `${pageContext} at ${brand}. Discover our expert approach and see how we can help you succeed. Explore our resources now.`;
    } else {
      suggestion = `Welcome to ${brand}. Discover our expert services and see how we can help you achieve your goals. Start your journey today.`;
    }

    if (suggestion.length > 160) return suggestion.substring(0, 157) + '...';
    if (suggestion.length < 120) {
      suggestion = suggestion.replace('.', `. Trusted by thousands of clients.`);
    }
    return suggestion.substring(0, 160);
  }

  /**
   * Derive a human-readable alt text suggestion from an image src.
   * e.g. "/uploads/2024/getthrivin-coach-session.jpg" → "Getthrivin coach session"
   */
  _altFromSrc(src) {
    try {
      // Get the filename portion
      const filename = src.split('/').pop().split('?')[0];
      const nameNoExt = filename.replace(/\.[a-z]{2,5}$/i, '');

      const cleaned = nameNoExt
        .replace(/[-_]/g, ' ')
        .replace(/\b\d{8,}\b/g, '') // remove long timestamps
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleaned) return 'Image';
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    } catch {
      return 'Image';
    }
  }

  // ─── Analysis Entry Point ────────────────────────────────────────────────────

  /**
   * Run all on-page SEO checks
   * @returns {Promise<Object>} Analysis results
   */
  async analyze() {
    logger.info({ auditId: this.auditId }, 'Starting On-Page SEO analysis');

    try {
      this.checkTitleTags();
      this.checkMetaDescriptions();
      this.checkHeadingStructure();
      this.checkHeadingHierarchy();
      this.checkURLStructure();
      this.checkImageOptimization();
      this.checkInternalLinking();

      const categoryScore = this.calculateScore();

      const result = {
        category: 'ON_PAGE_SEO',
        categoryScore,
        weight: 0.20,
        rating: this.getRating(categoryScore),
        issues: this.issues,
        issueCount: this.issues.length,
        criticalCount: this.issues.filter(i => i.severity === 'critical').length,
        highCount: this.issues.filter(i => i.severity === 'high').length,
        mediumCount: this.issues.filter(i => i.severity === 'medium').length,
        lowCount: this.issues.filter(i => i.severity === 'low').length,
        checks: this.checks
      };

      logger.info({
        auditId: this.auditId,
        score: categoryScore,
        issueCount: this.issues.length
      }, 'On-Page SEO analysis completed');

      return result;
    } catch (err) {
      logger.error({ err, auditId: this.auditId }, 'On-Page SEO analysis failed');
      throw err;
    }
  }

  // ─── Checks ─────────────────────────────────────────────────────────────────

  /**
   * Check title tags — builds before/after specifics for each affected page
   */
  checkTitleTags() {
    const titleIssues = {
      missing: [],
      tooShort: [],
      tooLong: [],
      duplicates: []
    };

    const titleMap = new Map();

    // Specifics collectors (per-page current→suggested pairs)
    const missingSpecifics = [];
    const tooShortSpecifics = [];
    const tooLongSpecifics = [];

    for (const page of this.pages) {
      const title = page.title;
      const titleLength = page.titleLength || 0;

      if (!title || title.trim() === '') {
        titleIssues.missing.push(page.url);
        const suggested = this._suggestTitle(page, '');
        missingSpecifics.push({
          url: page.url,
          field: 'title',
          current: { value: '(none)', length: 0 },
          suggested: { value: suggested, length: suggested.length, copyPasteReady: true },
          context: page.h1Tags && page.h1Tags[0] ? `Derived from H1: "${page.h1Tags[0]}"` : 'No H1 found — use page topic'
        });
        continue;
      }

      if (titleLength < 30) {
        titleIssues.tooShort.push({ url: page.url, title, length: titleLength });
        const suggested = this._suggestTitle(page, title);
        tooShortSpecifics.push({
          url: page.url,
          field: 'title',
          current: { value: title, length: titleLength },
          suggested: { value: suggested, length: suggested.length, copyPasteReady: true },
          context: `Current is only ${titleLength} chars — target 50–60`
        });
      }

      if (titleLength > 60) {
        titleIssues.tooLong.push({ url: page.url, title, length: titleLength });
        const suggested = this._suggestTitle(page, title);
        tooLongSpecifics.push({
          url: page.url,
          field: 'title',
          current: { value: title, length: titleLength },
          suggested: { value: suggested, length: suggested.length, copyPasteReady: true },
          context: `Current is ${titleLength} chars — truncated to ≤60`
        });
      }

      if (!titleMap.has(title)) titleMap.set(title, []);
      titleMap.get(title).push(page.url);
    }

    for (const [title, urls] of titleMap.entries()) {
      if (urls.length > 1) {
        titleIssues.duplicates.push({ title, urls, count: urls.length });
      }
    }

    const goodTitles = this.pages.length
      - titleIssues.missing.length
      - titleIssues.tooShort.length
      - titleIssues.tooLong.length;
    const percentageGood = this.pages.length > 0
      ? Math.round((goodTitles / this.pages.length) * 100)
      : 0;

    this.checks.titleTags = {
      totalPages: this.pages.length,
      goodTitles,
      percentageGood,
      missingCount: titleIssues.missing.length,
      tooShortCount: titleIssues.tooShort.length,
      tooLongCount: titleIssues.tooLong.length,
      duplicateCount: titleIssues.duplicates.length,
      status: percentageGood >= 80 ? 'pass' : 'fail'
    };

    if (titleIssues.missing.length > 0) {
      this.issues.push({
        type: 'missing_title_tags',
        severity: 'critical',
        title: 'Missing Title Tags',
        description: `${titleIssues.missing.length} pages are missing title tags. Title tags are crucial for SEO.`,
        recommendation: 'Add unique, descriptive title tags (50–60 characters) to all pages.',
        affectedPages: titleIssues.missing.length,
        examples: titleIssues.missing.slice(0, 5),
        specifics: missingSpecifics.slice(0, 10)
      });
    }

    if (titleIssues.tooShort.length > 0) {
      this.issues.push({
        type: 'short_title_tags',
        severity: 'medium',
        title: 'Title Tags Too Short',
        description: `${titleIssues.tooShort.length} pages have title tags shorter than 30 characters.`,
        recommendation: 'Expand title tags to 50–60 characters, adding brand name and primary keyword.',
        affectedPages: titleIssues.tooShort.length,
        examples: titleIssues.tooShort.slice(0, 3),
        specifics: tooShortSpecifics.slice(0, 10)
      });
    }

    if (titleIssues.tooLong.length > 0) {
      this.issues.push({
        type: 'long_title_tags',
        severity: 'medium',
        title: 'Title Tags Too Long',
        description: `${titleIssues.tooLong.length} pages have title tags longer than 60 characters. They may be truncated in search results.`,
        recommendation: 'Shorten title tags to 50–60 characters to avoid truncation in SERPs.',
        affectedPages: titleIssues.tooLong.length,
        examples: titleIssues.tooLong.slice(0, 3),
        specifics: tooLongSpecifics.slice(0, 10)
      });
    }

    if (titleIssues.duplicates.length > 0) {
      const dupSpecifics = titleIssues.duplicates.slice(0, 5).map(d => ({
        url: d.urls[0],
        field: 'title',
        current: { value: d.title, length: d.title.length },
        suggested: { value: `(unique title for each of the ${d.count} pages)`, copyPasteReady: false },
        context: `Same title used on ${d.count} pages: ${d.urls.slice(0, 3).map(u => u.replace(/https?:\/\/[^/]+/, '')).join(', ')}`
      }));
      this.issues.push({
        type: 'duplicate_title_tags',
        severity: 'high',
        title: 'Duplicate Title Tags',
        description: `${titleIssues.duplicates.length} duplicate title tags found across multiple pages.`,
        recommendation: 'Make each title tag unique and descriptive of the page content.',
        affectedPages: titleIssues.duplicates.reduce((sum, d) => sum + d.count, 0),
        examples: titleIssues.duplicates.slice(0, 3),
        specifics: dupSpecifics
      });
    }

    logger.debug({ auditId: this.auditId, percentageGood }, 'Title tags checked');
  }

  /**
   * Check meta descriptions — builds before/after specifics for each affected page
   */
  checkMetaDescriptions() {
    const metaIssues = {
      missing: [],
      tooShort: [],
      tooLong: [],
      duplicates: []
    };

    const metaMap = new Map();
    const missingSpecifics = [];
    const tooShortSpecifics = [];
    const tooLongSpecifics = [];

    for (const page of this.pages) {
      const meta = page.metaDescription;
      const metaLength = page.metaLength || 0;

      if (!meta || meta.trim() === '') {
        metaIssues.missing.push(page.url);
        const suggested = this._suggestMeta(page);
        missingSpecifics.push({
          url: page.url,
          field: 'metaDescription',
          current: { value: '(none)', length: 0 },
          suggested: { value: suggested, length: suggested.length, copyPasteReady: true },
          context: page.h1Tags && page.h1Tags[0] ? `Based on H1: "${page.h1Tags[0]}"` : 'No H1 — describe the page topic'
        });
        continue;
      }

      if (metaLength < 120) {
        metaIssues.tooShort.push({ url: page.url, description: meta, length: metaLength });
        const suggested = this._suggestMeta(page);
        tooShortSpecifics.push({
          url: page.url,
          field: 'metaDescription',
          current: { value: meta, length: metaLength },
          suggested: { value: suggested, length: suggested.length, copyPasteReady: true },
          context: `Current is ${metaLength} chars — target 130–155`
        });
      }

      if (metaLength > 160) {
        metaIssues.tooLong.push({ url: page.url, description: meta, length: metaLength });
        const truncated = meta.substring(0, 157) + '...';
        tooLongSpecifics.push({
          url: page.url,
          field: 'metaDescription',
          current: { value: meta, length: metaLength },
          suggested: { value: truncated, length: truncated.length, copyPasteReady: true },
          context: `Trimmed at word boundary to 157 chars`
        });
      }

      if (!metaMap.has(meta)) metaMap.set(meta, []);
      metaMap.get(meta).push(page.url);
    }

    for (const [meta, urls] of metaMap.entries()) {
      if (urls.length > 1) {
        metaIssues.duplicates.push({ description: meta, urls, count: urls.length });
      }
    }

    const goodMeta = this.pages.length
      - metaIssues.missing.length
      - metaIssues.tooShort.length
      - metaIssues.tooLong.length;
    const percentageGood = this.pages.length > 0
      ? Math.round((goodMeta / this.pages.length) * 100)
      : 0;

    this.checks.metaDescriptions = {
      totalPages: this.pages.length,
      goodMeta,
      percentageGood,
      missingCount: metaIssues.missing.length,
      tooShortCount: metaIssues.tooShort.length,
      tooLongCount: metaIssues.tooLong.length,
      duplicateCount: metaIssues.duplicates.length,
      status: percentageGood >= 80 ? 'pass' : 'fail'
    };

    if (metaIssues.missing.length > 0) {
      this.issues.push({
        type: 'missing_meta_descriptions',
        severity: 'high',
        title: 'Missing Meta Descriptions',
        description: `${metaIssues.missing.length} pages are missing meta descriptions.`,
        recommendation: 'Add unique, compelling meta descriptions (130–155 characters) to all pages.',
        affectedPages: metaIssues.missing.length,
        examples: metaIssues.missing.slice(0, 5),
        specifics: missingSpecifics.slice(0, 10)
      });
    }

    if (metaIssues.tooShort.length > 0) {
      this.issues.push({
        type: 'short_meta_descriptions',
        severity: 'low',
        title: 'Meta Descriptions Too Short',
        description: `${metaIssues.tooShort.length} pages have meta descriptions shorter than 120 characters.`,
        recommendation: 'Expand meta descriptions to 130–155 characters with a clear value proposition.',
        affectedPages: metaIssues.tooShort.length,
        examples: metaIssues.tooShort.slice(0, 3),
        specifics: tooShortSpecifics.slice(0, 10)
      });
    }

    if (metaIssues.tooLong.length > 0) {
      this.issues.push({
        type: 'long_meta_descriptions',
        severity: 'low',
        title: 'Meta Descriptions Too Long',
        description: `${metaIssues.tooLong.length} pages have meta descriptions longer than 160 characters.`,
        recommendation: 'Shorten meta descriptions to 130–155 characters to prevent truncation.',
        affectedPages: metaIssues.tooLong.length,
        examples: metaIssues.tooLong.slice(0, 3),
        specifics: tooLongSpecifics.slice(0, 10)
      });
    }

    if (metaIssues.duplicates.length > 0) {
      const dupSpecifics = metaIssues.duplicates.slice(0, 5).map(d => ({
        url: d.urls[0],
        field: 'metaDescription',
        current: { value: d.description, length: d.description.length },
        suggested: { value: `(unique description for each of the ${d.count} pages)`, copyPasteReady: false },
        context: `Same description used on ${d.count} pages`
      }));
      this.issues.push({
        type: 'duplicate_meta_descriptions',
        severity: 'medium',
        title: 'Duplicate Meta Descriptions',
        description: `${metaIssues.duplicates.length} duplicate meta descriptions found.`,
        recommendation: 'Make each meta description unique and relevant to the page content.',
        affectedPages: metaIssues.duplicates.reduce((sum, d) => sum + d.count, 0),
        examples: metaIssues.duplicates.slice(0, 3),
        specifics: dupSpecifics
      });
    }

    logger.debug({ auditId: this.auditId, percentageGood }, 'Meta descriptions checked');
  }

  /**
   * Check heading structure — records existing H1s for before/after display
   */
  checkHeadingStructure() {
    const headingIssues = {
      missingH1: [],
      multipleH1: [],
      emptyH1: []
    };

    const missingSpecifics = [];
    const multipleSpecifics = [];

    for (const page of this.pages) {
      const h1Tags = page.h1Tags || [];

      if (h1Tags.length === 0) {
        headingIssues.missingH1.push(page.url);
        const suggestedH1 = page.title
          ? page.title.split(/\s*[|–—]\s*/)[0].replace(/\s+-\s+.*$/, '').trim()
          : this._domainBrand() + ' — Main Heading';
        missingSpecifics.push({
          url: page.url,
          field: 'h1',
          current: { value: '(none)', length: 0 },
          suggested: { value: suggestedH1, length: suggestedH1.length, copyPasteReady: true },
          context: page.title ? `Derived from title tag: "${page.title}"` : 'No title available'
        });
      } else if (h1Tags.length > 1) {
        headingIssues.multipleH1.push({ url: page.url, h1Tags, count: h1Tags.length });
        multipleSpecifics.push({
          url: page.url,
          field: 'h1',
          current: { value: h1Tags.join(' | '), length: h1Tags.join(' | ').length },
          suggested: { value: h1Tags[0], length: h1Tags[0].length, copyPasteReady: true },
          context: `Keep only the first H1; convert others to H2: ${h1Tags.slice(1).map(h => `"${h}"`).join(', ')}`
        });
      } else if (h1Tags[0].trim() === '') {
        headingIssues.emptyH1.push(page.url);
      }
    }

    const goodHeadings = this.pages.length
      - headingIssues.missingH1.length
      - headingIssues.multipleH1.length
      - headingIssues.emptyH1.length;
    const percentageGood = this.pages.length > 0
      ? Math.round((goodHeadings / this.pages.length) * 100)
      : 0;

    this.checks.headingStructure = {
      totalPages: this.pages.length,
      goodHeadings,
      percentageGood,
      missingH1Count: headingIssues.missingH1.length,
      multipleH1Count: headingIssues.multipleH1.length,
      emptyH1Count: headingIssues.emptyH1.length,
      status: percentageGood >= 90 ? 'pass' : 'fail'
    };

    if (headingIssues.missingH1.length > 0) {
      this.issues.push({
        type: 'missing_h1',
        severity: 'high',
        title: 'Missing H1 Tags',
        description: `${headingIssues.missingH1.length} pages are missing H1 tags.`,
        recommendation: 'Add a single, descriptive H1 tag to each page summarizing the main topic.',
        affectedPages: headingIssues.missingH1.length,
        examples: headingIssues.missingH1.slice(0, 5),
        specifics: missingSpecifics.slice(0, 8)
      });
    }

    if (headingIssues.multipleH1.length > 0) {
      this.issues.push({
        type: 'multiple_h1',
        severity: 'high',
        title: 'Multiple H1 Tags',
        description: headingIssues.multipleH1.length === 1
          ? `1 page has ${headingIssues.multipleH1[0].count} H1 tags: "${headingIssues.multipleH1[0].h1Tags.slice(0,2).join('" and "')}"${headingIssues.multipleH1[0].h1Tags.length > 2 ? ` (+${headingIssues.multipleH1[0].h1Tags.length-2} more)` : ''}. Each page should have only one H1.`
          : `${headingIssues.multipleH1.length} pages have multiple H1 tags. Each page should have only one H1.`,
        recommendation: 'Keep only the primary H1; convert all others to H2 or H3 subheadings.',
        affectedPages: headingIssues.multipleH1.length,
        examples: headingIssues.multipleH1.slice(0, 3),
        specifics: multipleSpecifics.slice(0, 8)
      });
    }

    logger.debug({ auditId: this.auditId, percentageGood }, 'Heading structure checked');
  }

  /**
   * Check heading hierarchy (H2s present, H3s only after H2s, etc.)
   */
  checkHeadingHierarchy() {
    const hierarchyIssues = [];

    for (const page of this.pages) {
      const h1Tags = page.h1Tags || [];
      const h2Tags = page.h2Tags || [];
      const h3Tags = page.h3Tags || [];

      // Pages with substantial content (H1 present) should have H2s for structure
      if (h1Tags.length === 1 && h2Tags.length === 0 && (page.wordCount || 0) > 400) {
        hierarchyIssues.push({
          url: page.url,
          issue: 'missing_h2',
          detail: `No H2 subheadings on page with ${page.wordCount} words and H1: "${h1Tags[0]}"`
        });
      }

      // H3s without any H2s is a hierarchy violation
      if (h3Tags.length > 0 && h2Tags.length === 0) {
        const alreadyAdded = hierarchyIssues.some(i => i.url === page.url);
        if (!alreadyAdded) {
          hierarchyIssues.push({
            url: page.url,
            issue: 'h3_without_h2',
            detail: `${h3Tags.length} H3 tag${h3Tags.length > 1 ? 's' : ''} found but no H2 tags — skipped heading level`
          });
        }
      }
    }

    this.checks.headingHierarchy = {
      totalPages: this.pages.length,
      issuesCount: hierarchyIssues.length,
      status: hierarchyIssues.length === 0 ? 'pass' : 'warning'
    };

    if (hierarchyIssues.length > 0) {
      const missingH2Count = hierarchyIssues.filter(i => i.issue === 'missing_h2').length;
      const h3WithoutH2Count = hierarchyIssues.filter(i => i.issue === 'h3_without_h2').length;

      let desc = '';
      if (missingH2Count > 0) desc += `${missingH2Count} page${missingH2Count > 1 ? 's have' : ' has'} no H2 subheadings despite substantial content. `;
      if (h3WithoutH2Count > 0) desc += `${h3WithoutH2Count} page${h3WithoutH2Count > 1 ? 's use' : ' uses'} H3 tags without H2 tags (skipped heading level).`;

      this.issues.push({
        type: 'heading_hierarchy_issues',
        severity: 'medium',
        title: 'Heading Hierarchy Issues',
        description: desc.trim(),
        recommendation: 'Use H2 for main sections and H3 for sub-sections within H2 blocks. Never skip heading levels (e.g. H1 → H3 without H2).',
        affectedPages: hierarchyIssues.length,
        evidence: hierarchyIssues.slice(0, 4).map(i => ({ url: i.url, detail: i.detail }))
      });
    }

    logger.debug({ auditId: this.auditId, issuesCount: hierarchyIssues.length }, 'Heading hierarchy checked');
  }

  /**
   * Check URL structure
   */
  checkURLStructure() {
    const urlIssues = {
      tooLong: [],
      hasParameters: [],
      notDescriptive: []
    };
    const deepURLs = [];

    for (const page of this.pages) {
      const url = page.url;
      const path = page.path || '/';

      if (url.length > 100) {
        urlIssues.tooLong.push({ url, length: url.length });
      }

      if (url.includes('?') && path !== '/') {
        urlIssues.hasParameters.push(url);
      }

      if (path.length < 3 && path !== '/') {
        urlIssues.notDescriptive.push(url);
      }

      const depth = (path.replace(/\/$/, '').match(/\//g) || []).length;
      if (depth >= 4) {
        deepURLs.push({ url, depth });
      }
    }

    const goodURLs = this.pages.length - urlIssues.tooLong.length - urlIssues.hasParameters.length;
    const percentageGood = this.pages.length > 0
      ? Math.round((goodURLs / this.pages.length) * 100)
      : 0;

    this.checks.urlStructure = {
      totalPages: this.pages.length,
      goodURLs,
      percentageGood,
      tooLongCount: urlIssues.tooLong.length,
      hasParametersCount: urlIssues.hasParameters.length,
      deepURLCount: deepURLs.length,
      status: percentageGood >= 80 ? 'pass' : 'warning'
    };

    if (urlIssues.tooLong.length > 0) {
      this.issues.push({
        type: 'urls_too_long',
        severity: 'low',
        title: 'URLs Too Long',
        description: `${urlIssues.tooLong.length} pages have URLs longer than 100 characters.`,
        recommendation: 'Shorten URLs to be more concise while remaining descriptive.',
        affectedPages: urlIssues.tooLong.length,
        examples: urlIssues.tooLong.slice(0, 3)
      });
    }

    if (urlIssues.hasParameters.length > 0) {
      this.issues.push({
        type: 'urls_with_parameters',
        severity: 'medium',
        title: 'URLs With Query Parameters',
        description: `${urlIssues.hasParameters.length} pages have query parameters in URLs.`,
        recommendation: 'Use clean, SEO-friendly URLs without query parameters when possible.',
        affectedPages: urlIssues.hasParameters.length,
        examples: urlIssues.hasParameters.slice(0, 5)
      });
    }

    if (deepURLs.length > 0) {
      this.issues.push({
        type: 'deep_url_structure',
        severity: 'low',
        title: 'Deep URL Structure',
        description: `${deepURLs.length} URL${deepURLs.length > 1 ? 's are' : ' is'} ${deepURLs.length > 1 ? 'more than' : ''} 4+ levels deep (e.g. "${deepURLs[0].url.replace(/^https?:\/\/[^/]+/, '')}")${deepURLs.length > 1 ? ` and ${deepURLs.length - 1} more` : ''}. Flat URL structures are preferred by search engines.`,
        recommendation: 'Flatten URL hierarchy to a maximum of 3 levels. Use 301 redirects for any restructured URLs.',
        affectedPages: deepURLs.length,
        evidence: deepURLs.slice(0, 4).map(p => ({ url: p.url, detail: `${p.depth} levels deep` }))
      });
    }

    logger.debug({ auditId: this.auditId, percentageGood }, 'URL structure checked');
  }

  /**
   * Check image optimization — detects images missing alt text with src-based suggestions
   */
  checkImageOptimization() {
    let totalImages = 0;
    let totalMissingAlt = 0;
    const pagesWithMissingAlt = [];

    // Specifics: list of {url, imageSrc, suggested} for missing alts
    const altSpecifics = [];

    for (const page of this.pages) {
      const html = page.html;
      if (!html) {
        totalImages += page.imageCount || 0;
        continue;
      }

      const $ = cheerio.load(html);
      const imgs = $('img');
      const pageImageCount = imgs.length;
      totalImages += pageImageCount;

      let pageMissingAlt = 0;
      const pageAltIssues = [];

      imgs.each((_, el) => {
        const alt = $(el).attr('alt');
        if (alt === undefined || alt === null || alt.trim() === '') {
          pageMissingAlt++;
          const src = $(el).attr('src') || $(el).attr('data-src') || '';
          // Collect up to 3 per page for the specifics list
          if (pageAltIssues.length < 3) {
            pageAltIssues.push({
              src: src.replace(/^https?:\/\/[^/]+/, ''), // strip domain
              suggestedAlt: this._altFromSrc(src)
            });
          }
        }
      });

      totalMissingAlt += pageMissingAlt;

      if (pageMissingAlt > 0) {
        pagesWithMissingAlt.push({
          url: page.url,
          missingAlt: pageMissingAlt,
          totalImages: pageImageCount
        });

        // Add up to 3 image specifics per page (total cap: 15)
        if (altSpecifics.length < 15) {
          for (const img of pageAltIssues) {
            altSpecifics.push({
              url: page.url,
              field: 'alt',
              imageSrc: img.src,
              current: { value: '' },
              suggested: { value: img.suggestedAlt, copyPasteReady: true },
              context: `Image: ${img.src.split('/').pop().split('?')[0] || 'unknown'}`
            });
          }
        }
      }
    }

    const percentageWithAlt = totalImages > 0
      ? Math.round(((totalImages - totalMissingAlt) / totalImages) * 100)
      : 100;

    this.checks.imageOptimization = {
      totalPages: this.pages.length,
      totalImages,
      totalMissingAlt,
      percentageWithAlt,
      pagesWithMissingAlt: pagesWithMissingAlt.length,
      status: percentageWithAlt >= 90 ? 'pass' : 'fail'
    };

    if (totalMissingAlt > 0) {
      const severity = totalMissingAlt > 10 ? 'high' : 'medium';
      this.issues.push({
        type: 'images_missing_alt_text',
        severity,
        title: 'Images Missing Alt Text',
        description: `${totalMissingAlt} image${totalMissingAlt !== 1 ? 's' : ''} across ${pagesWithMissingAlt.length} page${pagesWithMissingAlt.length !== 1 ? 's' : ''} are missing alt text. Alt text is essential for accessibility and image SEO.`,
        recommendation: 'Add descriptive alt text to all content images. Use empty alt="" only for purely decorative images.',
        affectedPages: pagesWithMissingAlt.length,
        examples: pagesWithMissingAlt.slice(0, 5),
        specifics: altSpecifics
      });
    }

    logger.debug({
      auditId: this.auditId,
      totalImages,
      totalMissingAlt,
      percentageWithAlt
    }, 'Image optimization checked');
  }

  /**
   * Check internal linking
   */
  checkInternalLinking() {
    let totalLinks = 0;
    const weakLinkingPages = [];

    for (const page of this.pages) {
      const linkCount = page.linkCount || 0;
      const wordCount = page.wordCount || 0;
      totalLinks += linkCount;

      // Flag content-rich pages with insufficient linking
      if (page.path !== '/' && wordCount > 400 && linkCount < 5) {
        weakLinkingPages.push({ url: page.url, linkCount, wordCount });
      }
    }

    const avgLinksPerPage = this.pages.length > 0
      ? Math.round(totalLinks / this.pages.length)
      : 0;

    this.checks.internalLinking = {
      totalPages: this.pages.length,
      totalLinks,
      avgLinksPerPage,
      pagesWithWeakLinking: weakLinkingPages.length,
      status: weakLinkingPages.length === 0 ? 'pass' : 'warning'
    };

    if (weakLinkingPages.length > 0) {
      this.issues.push({
        type: 'weak_internal_linking',
        severity: 'medium',
        title: 'Weak Internal Linking',
        description: `${weakLinkingPages.length} content-rich page${weakLinkingPages.length > 1 ? 's have' : ' has'} fewer than 5 internal links despite substantial content. Google distributes PageRank through internal links — sparse linking leaves pages under-ranked.`,
        recommendation: 'Add 3–5 contextual internal links per 500 words of content. Link from main content paragraphs (not just navigation) using descriptive anchor text containing target keywords.',
        affectedPages: weakLinkingPages.length,
        examples: weakLinkingPages.slice(0, 5),
        evidence: weakLinkingPages.slice(0, 5).map(p => ({
          url: p.url,
          detail: `Only ${p.linkCount} link${p.linkCount !== 1 ? 's' : ''} in ${p.wordCount} words of content`
        }))
      });
    }

    logger.debug({ auditId: this.auditId, avgLinksPerPage }, 'Internal linking checked');
  }

  // ─── Scoring ─────────────────────────────────────────────────────────────────

  calculateScore() {
    const weights = {
      titleTags: 25,
      metaDescriptions: 20,
      headingStructure: 20,
      urlStructure: 10,
      imageOptimization: 10,
      internalLinking: 10,
      headingHierarchy: 5
    };

    let totalScore = 0;
    let totalWeight = 0;

    if (this.checks.titleTags) {
      totalScore += this.checks.titleTags.percentageGood * weights.titleTags;
      totalWeight += weights.titleTags;
    }

    if (this.checks.metaDescriptions) {
      totalScore += this.checks.metaDescriptions.percentageGood * weights.metaDescriptions;
      totalWeight += weights.metaDescriptions;
    }

    if (this.checks.headingStructure) {
      totalScore += this.checks.headingStructure.percentageGood * weights.headingStructure;
      totalWeight += weights.headingStructure;
    }

    if (this.checks.urlStructure) {
      totalScore += this.checks.urlStructure.percentageGood * weights.urlStructure;
      totalWeight += weights.urlStructure;
    }

    if (this.checks.imageOptimization) {
      const imgScore = this.checks.imageOptimization.totalImages === 0
        ? 100
        : this.checks.imageOptimization.percentageWithAlt;
      totalScore += imgScore * weights.imageOptimization;
      totalWeight += weights.imageOptimization;
    }

    if (this.checks.internalLinking) {
      const { pagesWithWeakLinking: weakLinkingPages, totalPages } = this.checks.internalLinking;
      const linkScore = weakLinkingPages === 0
        ? 100
        : Math.max(0, 100 - (weakLinkingPages / (totalPages || 1)) * 100);
      totalScore += linkScore * weights.internalLinking;
      totalWeight += weights.internalLinking;
    }

    if (this.checks.headingHierarchy) {
      const { issuesCount, totalPages } = this.checks.headingHierarchy;
      const score = issuesCount === 0 ? 100 : Math.max(0, 100 - (issuesCount / (totalPages || 1)) * 100);
      totalScore += score * weights.headingHierarchy;
      totalWeight += weights.headingHierarchy;
    }

    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    return Math.max(0, Math.min(100, finalScore));
  }

  getRating(score) {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'needs improvement';
    return 'poor';
  }
}

export default OnPageSEOAnalyzer;
