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
 */
class OnPageSEOAnalyzer {
  constructor(auditId, domain, pages) {
    this.auditId = auditId;
    this.domain = domain;
    this.pages = pages;
    this.issues = [];
    this.checks = {};
  }

  /**
   * Run all on-page SEO checks
   * @returns {Promise<Object>} Analysis results
   */
  async analyze() {
    logger.info({ auditId: this.auditId }, 'Starting On-Page SEO analysis');

    try {
      // Run all checks
      this.checkTitleTags();
      this.checkMetaDescriptions();
      this.checkHeadingStructure();
      this.checkURLStructure();
      this.checkImageOptimization();
      this.checkInternalLinking();

      // Calculate category score
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

  /**
   * Check title tags
   */
  checkTitleTags() {
    const titleIssues = {
      missing: [],
      tooShort: [],
      tooLong: [],
      duplicates: []
    };

    const titleMap = new Map(); // Track duplicates

    for (const page of this.pages) {
      const title = page.title;
      const titleLength = page.titleLength || 0;

      // Missing title
      if (!title || title.trim() === '') {
        titleIssues.missing.push(page.url);
        continue;
      }

      // Title too short (< 30 characters)
      if (titleLength < 30) {
        titleIssues.tooShort.push({
          url: page.url,
          title,
          length: titleLength
        });
      }

      // Title too long (> 60 characters)
      if (titleLength > 60) {
        titleIssues.tooLong.push({
          url: page.url,
          title,
          length: titleLength
        });
      }

      // Track for duplicates
      if (!titleMap.has(title)) {
        titleMap.set(title, []);
      }
      titleMap.get(title).push(page.url);
    }

    // Find duplicates
    for (const [title, urls] of titleMap.entries()) {
      if (urls.length > 1) {
        titleIssues.duplicates.push({
          title,
          urls,
          count: urls.length
        });
      }
    }

    // Calculate percentage with good titles
    const goodTitles = this.pages.length - titleIssues.missing.length - titleIssues.tooShort.length - titleIssues.tooLong.length;
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

    // Add issues
    if (titleIssues.missing.length > 0) {
      this.issues.push({
        type: 'missing_title_tags',
        severity: 'critical',
        title: 'Missing Title Tags',
        description: `${titleIssues.missing.length} pages are missing title tags. Title tags are crucial for SEO.`,
        recommendation: 'Add unique, descriptive title tags (30-60 characters) to all pages.',
        affectedPages: titleIssues.missing.length,
        examples: titleIssues.missing.slice(0, 5)
      });
    }

    if (titleIssues.tooShort.length > 0) {
      this.issues.push({
        type: 'short_title_tags',
        severity: 'medium',
        title: 'Title Tags Too Short',
        description: `${titleIssues.tooShort.length} pages have title tags shorter than 30 characters.`,
        recommendation: 'Expand title tags to 30-60 characters for better optimization.',
        affectedPages: titleIssues.tooShort.length,
        examples: titleIssues.tooShort.slice(0, 3)
      });
    }

    if (titleIssues.tooLong.length > 0) {
      this.issues.push({
        type: 'long_title_tags',
        severity: 'medium',
        title: 'Title Tags Too Long',
        description: `${titleIssues.tooLong.length} pages have title tags longer than 60 characters. They may be truncated in search results.`,
        recommendation: 'Shorten title tags to 30-60 characters to avoid truncation.',
        affectedPages: titleIssues.tooLong.length,
        examples: titleIssues.tooLong.slice(0, 3)
      });
    }

    if (titleIssues.duplicates.length > 0) {
      this.issues.push({
        type: 'duplicate_title_tags',
        severity: 'high',
        title: 'Duplicate Title Tags',
        description: `${titleIssues.duplicates.length} duplicate title tags found across multiple pages. Each page should have a unique title.`,
        recommendation: 'Make each title tag unique and descriptive of the page content.',
        affectedPages: titleIssues.duplicates.reduce((sum, d) => sum + d.count, 0),
        examples: titleIssues.duplicates.slice(0, 3)
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageGood
    }, 'Title tags checked');
  }

  /**
   * Check meta descriptions
   */
  checkMetaDescriptions() {
    const metaIssues = {
      missing: [],
      tooShort: [],
      tooLong: [],
      duplicates: []
    };

    const metaMap = new Map();

    for (const page of this.pages) {
      const meta = page.metaDescription;
      const metaLength = page.metaLength || 0;

      // Missing meta description
      if (!meta || meta.trim() === '') {
        metaIssues.missing.push(page.url);
        continue;
      }

      // Meta too short (< 120 characters)
      if (metaLength < 120) {
        metaIssues.tooShort.push({
          url: page.url,
          description: meta,
          length: metaLength
        });
      }

      // Meta too long (> 160 characters)
      if (metaLength > 160) {
        metaIssues.tooLong.push({
          url: page.url,
          description: meta,
          length: metaLength
        });
      }

      // Track for duplicates
      if (!metaMap.has(meta)) {
        metaMap.set(meta, []);
      }
      metaMap.get(meta).push(page.url);
    }

    // Find duplicates
    for (const [meta, urls] of metaMap.entries()) {
      if (urls.length > 1) {
        metaIssues.duplicates.push({
          description: meta,
          urls,
          count: urls.length
        });
      }
    }

    const goodMeta = this.pages.length - metaIssues.missing.length - metaIssues.tooShort.length - metaIssues.tooLong.length;
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

    // Add issues
    if (metaIssues.missing.length > 0) {
      this.issues.push({
        type: 'missing_meta_descriptions',
        severity: 'high',
        title: 'Missing Meta Descriptions',
        description: `${metaIssues.missing.length} pages are missing meta descriptions.`,
        recommendation: 'Add unique, compelling meta descriptions (120-160 characters) to all pages.',
        affectedPages: metaIssues.missing.length,
        examples: metaIssues.missing.slice(0, 5)
      });
    }

    if (metaIssues.duplicates.length > 0) {
      this.issues.push({
        type: 'duplicate_meta_descriptions',
        severity: 'medium',
        title: 'Duplicate Meta Descriptions',
        description: `${metaIssues.duplicates.length} duplicate meta descriptions found.`,
        recommendation: 'Make each meta description unique and relevant to the page content.',
        affectedPages: metaIssues.duplicates.reduce((sum, d) => sum + d.count, 0),
        examples: metaIssues.duplicates.slice(0, 3)
      });
    }

    logger.debug({ auditId: this.auditId, percentageGood }, 'Meta descriptions checked');
  }

  /**
   * Check heading structure (H1, H2, H3)
   */
  checkHeadingStructure() {
    const headingIssues = {
      missingH1: [],
      multipleH1: [],
      emptyH1: []
    };

    for (const page of this.pages) {
      const h1Tags = page.h1Tags || [];

      // Missing H1
      if (h1Tags.length === 0) {
        headingIssues.missingH1.push(page.url);
      }
      // Multiple H1 tags
      else if (h1Tags.length > 1) {
        headingIssues.multipleH1.push({
          url: page.url,
          h1Tags,
          count: h1Tags.length
        });
      }
      // Empty H1
      else if (h1Tags[0].trim() === '') {
        headingIssues.emptyH1.push(page.url);
      }
    }

    const goodHeadings = this.pages.length - headingIssues.missingH1.length - headingIssues.multipleH1.length - headingIssues.emptyH1.length;
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

    // Add issues
    if (headingIssues.missingH1.length > 0) {
      this.issues.push({
        type: 'missing_h1',
        severity: 'high',
        title: 'Missing H1 Tags',
        description: `${headingIssues.missingH1.length} pages are missing H1 tags.`,
        recommendation: 'Add a single, descriptive H1 tag to each page that summarizes the main topic.',
        affectedPages: headingIssues.missingH1.length,
        examples: headingIssues.missingH1.slice(0, 5)
      });
    }

    if (headingIssues.multipleH1.length > 0) {
      this.issues.push({
        type: 'multiple_h1',
        severity: 'medium',
        title: 'Multiple H1 Tags',
        description: `${headingIssues.multipleH1.length} pages have multiple H1 tags. Each page should have only one H1.`,
        recommendation: 'Consolidate to a single H1 tag per page. Use H2-H6 for subheadings.',
        affectedPages: headingIssues.multipleH1.length,
        examples: headingIssues.multipleH1.slice(0, 3)
      });
    }

    logger.debug({ auditId: this.auditId, percentageGood }, 'Heading structure checked');
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

    for (const page of this.pages) {
      const url = page.url;
      const path = page.path || '/';

      // URL too long (> 100 characters)
      if (url.length > 100) {
        urlIssues.tooLong.push({
          url,
          length: url.length
        });
      }

      // Has query parameters (except homepage)
      if (url.includes('?') && path !== '/') {
        urlIssues.hasParameters.push(url);
      }

      // Not descriptive (too short path or random characters)
      if (path.length < 3 && path !== '/') {
        urlIssues.notDescriptive.push(url);
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
      status: percentageGood >= 80 ? 'pass' : 'warning'
    };

    // Add issues
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

    logger.debug({ auditId: this.auditId, percentageGood }, 'URL structure checked');
  }

  /**
   * Check image optimization
   */
  checkImageOptimization() {
    let totalImages = 0;
    const pagesWithImages = [];

    for (const page of this.pages) {
      const imageCount = page.imageCount || 0;
      totalImages += imageCount;

      if (imageCount > 0) {
        pagesWithImages.push({
          url: page.url,
          imageCount
        });
      }
    }

    const avgImagesPerPage = this.pages.length > 0
      ? Math.round(totalImages / this.pages.length)
      : 0;

    this.checks.imageOptimization = {
      totalPages: this.pages.length,
      totalImages,
      pagesWithImages: pagesWithImages.length,
      avgImagesPerPage,
      status: 'info' // Placeholder - need HTML to check alt tags
    };

    // Note: We can't check alt text without parsing HTML in detail
    // This would be enhanced in a future iteration with Puppeteer

    logger.debug({
      auditId: this.auditId,
      totalImages,
      avgImagesPerPage
    }, 'Image optimization checked');
  }

  /**
   * Check internal linking
   */
  checkInternalLinking() {
    let totalLinks = 0;
    const pagesWithFewLinks = [];

    for (const page of this.pages) {
      const linkCount = page.linkCount || 0;
      totalLinks += linkCount;

      // Flag pages with very few internal links (< 3)
      if (linkCount < 3 && page.path !== '/') {
        pagesWithFewLinks.push({
          url: page.url,
          linkCount
        });
      }
    }

    const avgLinksPerPage = this.pages.length > 0
      ? Math.round(totalLinks / this.pages.length)
      : 0;

    this.checks.internalLinking = {
      totalPages: this.pages.length,
      totalLinks,
      avgLinksPerPage,
      pagesWithFewLinks: pagesWithFewLinks.length,
      status: avgLinksPerPage >= 5 ? 'pass' : 'warning'
    };

    if (pagesWithFewLinks.length > 0) {
      this.issues.push({
        type: 'poor_internal_linking',
        severity: 'low',
        title: 'Poor Internal Linking',
        description: `${pagesWithFewLinks.length} pages have fewer than 3 internal links.`,
        recommendation: 'Add more contextual internal links to improve site navigation and SEO.',
        affectedPages: pagesWithFewLinks.length,
        examples: pagesWithFewLinks.slice(0, 5)
      });
    }

    logger.debug({
      auditId: this.auditId,
      avgLinksPerPage
    }, 'Internal linking checked');
  }

  /**
   * Calculate On-Page SEO score
   */
  calculateScore() {
    const weights = {
      titleTags: 25,
      metaDescriptions: 20,
      headingStructure: 20,
      urlStructure: 15,
      imageOptimization: 10,
      internalLinking: 10
    };

    let totalScore = 0;
    let totalWeight = 0;

    // Title tags score
    if (this.checks.titleTags) {
      totalScore += this.checks.titleTags.percentageGood * weights.titleTags;
      totalWeight += weights.titleTags;
    }

    // Meta descriptions score
    if (this.checks.metaDescriptions) {
      totalScore += this.checks.metaDescriptions.percentageGood * weights.metaDescriptions;
      totalWeight += weights.metaDescriptions;
    }

    // Heading structure score
    if (this.checks.headingStructure) {
      totalScore += this.checks.headingStructure.percentageGood * weights.headingStructure;
      totalWeight += weights.headingStructure;
    }

    // URL structure score
    if (this.checks.urlStructure) {
      totalScore += this.checks.urlStructure.percentageGood * weights.urlStructure;
      totalWeight += weights.urlStructure;
    }

    // Image optimization score (placeholder - assume 70% for now)
    if (this.checks.imageOptimization) {
      totalScore += 70 * weights.imageOptimization;
      totalWeight += weights.imageOptimization;
    }

    // Internal linking score
    if (this.checks.internalLinking) {
      const linkScore = Math.min(100, (this.checks.internalLinking.avgLinksPerPage / 10) * 100);
      totalScore += linkScore * weights.internalLinking;
      totalWeight += weights.internalLinking;
    }

    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

    return Math.max(0, Math.min(100, finalScore));
  }

  /**
   * Get rating based on score
   */
  getRating(score) {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'needs improvement';
    return 'poor';
  }
}

export default OnPageSEOAnalyzer;
