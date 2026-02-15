import logger from '../../config/logger.js';

/**
 * Content Quality Analyzer
 *
 * Analyzes content quality factors:
 * - Content volume (word count per page)
 * - Keyword cannibalization detection
 * - Readability assessment (simplified)
 * - FAQ sections detection
 * - Multimedia presence
 *
 * Weight: 20% of overall score
 */
class ContentQualityAnalyzer {
  constructor(auditId, domain, pages) {
    this.auditId = auditId;
    this.domain = domain;
    this.pages = pages;
    this.issues = [];
    this.checks = {};
  }

  /**
   * Run all content quality checks
   * @returns {Promise<Object>} Analysis results
   */
  async analyze() {
    logger.info({ auditId: this.auditId }, 'Starting Content Quality analysis');

    try {
      // Run all checks
      this.checkContentVolume();
      this.checkKeywordCannibalization();
      this.checkReadability();
      this.checkFAQSections();
      this.checkMultimediaPresence();

      // Calculate category score
      const categoryScore = this.calculateScore();

      const result = {
        category: 'CONTENT_QUALITY',
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
      }, 'Content Quality analysis completed');

      return result;
    } catch (err) {
      logger.error({ err, auditId: this.auditId }, 'Content Quality analysis failed');
      throw err;
    }
  }

  /**
   * Check content volume (word count)
   */
  checkContentVolume() {
    const thinContent = [];
    const goodContent = [];
    let totalWords = 0;

    for (const page of this.pages) {
      const wordCount = page.wordCount || 0;
      totalWords += wordCount;

      // Thin content: < 300 words
      if (wordCount < 300 && page.path !== '/') {
        thinContent.push({
          url: page.url,
          wordCount
        });
      } else if (wordCount >= 300) {
        goodContent.push(page.url);
      }
    }

    const avgWordCount = this.pages.length > 0
      ? Math.round(totalWords / this.pages.length)
      : 0;

    const percentageGood = this.pages.length > 0
      ? Math.round((goodContent.length / this.pages.length) * 100)
      : 0;

    this.checks.contentVolume = {
      totalPages: this.pages.length,
      totalWords,
      avgWordCount,
      goodContent: goodContent.length,
      thinContent: thinContent.length,
      percentageGood,
      status: percentageGood >= 70 ? 'pass' : 'fail'
    };

    // Add issues
    if (thinContent.length > 0) {
      const severity = thinContent.length > (this.pages.length * 0.5) ? 'high' : 'medium';

      this.issues.push({
        type: 'thin_content',
        severity,
        title: 'Thin Content Issues',
        description: `${thinContent.length} pages have less than 300 words. Thin content can negatively impact SEO.`,
        recommendation: 'Expand content to at least 300-500 words per page. Add valuable, relevant information.',
        affectedPages: thinContent.length,
        examples: thinContent.slice(0, 5)
      });
    }

    if (avgWordCount < 400) {
      this.issues.push({
        type: 'low_avg_word_count',
        severity: 'medium',
        title: 'Low Average Word Count',
        description: `Average word count is ${avgWordCount} words. Consider adding more comprehensive content.`,
        recommendation: 'Aim for 500-1000 words per page for better SEO performance.',
        affectedPages: 0
      });
    }

    logger.debug({
      auditId: this.auditId,
      avgWordCount,
      percentageGood
    }, 'Content volume checked');
  }

  /**
   * Check for keyword cannibalization
   * Detects pages with very similar titles
   */
  checkKeywordCannibalization() {
    const titleWords = new Map(); // Track common title words
    const similarTitles = [];

    // Extract title keywords (words > 4 characters)
    for (const page of this.pages) {
      const title = page.title || '';
      const words = title
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 4);

      for (const word of words) {
        if (!titleWords.has(word)) {
          titleWords.set(word, []);
        }
        titleWords.get(word).push({
          url: page.url,
          title: page.title
        });
      }
    }

    // Find keywords appearing in multiple page titles
    for (const [word, pages] of titleWords.entries()) {
      if (pages.length >= 3) {
        // Same keyword in 3+ titles might indicate cannibalization
        similarTitles.push({
          keyword: word,
          pageCount: pages.length,
          pages: pages.slice(0, 5)
        });
      }
    }

    this.checks.keywordCannibalization = {
      totalPages: this.pages.length,
      potentialIssues: similarTitles.length,
      status: similarTitles.length === 0 ? 'pass' : 'warning'
    };

    if (similarTitles.length > 0) {
      this.issues.push({
        type: 'keyword_cannibalization',
        severity: 'medium',
        title: 'Potential Keyword Cannibalization',
        description: `${similarTitles.length} keywords appear in multiple page titles, which may indicate keyword cannibalization.`,
        recommendation: 'Review pages targeting the same keywords and consolidate or differentiate them.',
        affectedPages: 0,
        examples: similarTitles.slice(0, 3)
      });
    }

    logger.debug({
      auditId: this.auditId,
      potentialIssues: similarTitles.length
    }, 'Keyword cannibalization checked');
  }

  /**
   * Check readability (simplified)
   * Uses average sentence and word length as proxy
   */
  checkReadability() {
    const readabilityIssues = [];

    for (const page of this.pages) {
      const wordCount = page.wordCount || 0;
      const title = page.title || '';

      // Very basic readability check: title length
      if (title.length > 0 && wordCount > 0) {
        const titleWords = title.split(/\s+/).length;

        // Title too complex (> 15 words)
        if (titleWords > 15) {
          readabilityIssues.push({
            url: page.url,
            issue: 'complex_title',
            titleWords
          });
        }
      }
    }

    const percentageGood = this.pages.length > 0
      ? Math.round(((this.pages.length - readabilityIssues.length) / this.pages.length) * 100)
      : 0;

    this.checks.readability = {
      totalPages: this.pages.length,
      goodReadability: this.pages.length - readabilityIssues.length,
      percentageGood,
      status: percentageGood >= 80 ? 'pass' : 'warning'
    };

    if (readabilityIssues.length > 0) {
      this.issues.push({
        type: 'readability_issues',
        severity: 'low',
        title: 'Readability Concerns',
        description: `${readabilityIssues.length} pages may have readability issues (complex titles).`,
        recommendation: 'Simplify titles and content for better user experience and SEO.',
        affectedPages: readabilityIssues.length,
        examples: readabilityIssues.slice(0, 3)
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageGood
    }, 'Readability checked');
  }

  /**
   * Check for FAQ sections
   * Detects FAQ schema or FAQ-related headings
   */
  checkFAQSections() {
    const pagesWithFAQ = [];

    for (const page of this.pages) {
      const schemaTypes = page.schemaTypes || [];
      const h2Tags = page.h2Tags || [];
      const h3Tags = page.h3Tags || [];

      // Check for FAQ schema
      const hasFAQSchema = schemaTypes.includes('FAQPage');

      // Check for FAQ-related headings
      const allHeadings = [...h2Tags, ...h3Tags].join(' ').toLowerCase();
      const hasFAQHeading = allHeadings.includes('faq') ||
                           allHeadings.includes('frequently asked') ||
                           allHeadings.includes('questions');

      if (hasFAQSchema || hasFAQHeading) {
        pagesWithFAQ.push({
          url: page.url,
          hasFAQSchema,
          hasFAQHeading
        });
      }
    }

    const percentageWithFAQ = this.pages.length > 0
      ? Math.round((pagesWithFAQ.length / this.pages.length) * 100)
      : 0;

    this.checks.faqSections = {
      totalPages: this.pages.length,
      pagesWithFAQ: pagesWithFAQ.length,
      percentageWithFAQ,
      status: percentageWithFAQ > 0 ? 'pass' : 'info'
    };

    if (pagesWithFAQ.length === 0) {
      this.issues.push({
        type: 'no_faq_sections',
        severity: 'low',
        title: 'No FAQ Sections Detected',
        description: 'No FAQ sections found. FAQ pages can improve user experience and SEO.',
        recommendation: 'Consider adding FAQ sections with FAQPage schema markup to relevant pages.',
        affectedPages: 0
      });
    }

    logger.debug({
      auditId: this.auditId,
      pagesWithFAQ: pagesWithFAQ.length
    }, 'FAQ sections checked');
  }

  /**
   * Check multimedia presence
   * Analyzes image usage across pages
   */
  checkMultimediaPresence() {
    const pagesWithImages = [];
    const pagesWithoutImages = [];
    let totalImages = 0;

    for (const page of this.pages) {
      const imageCount = page.imageCount || 0;
      totalImages += imageCount;

      if (imageCount > 0) {
        pagesWithImages.push(page.url);
      } else if (page.path !== '/') {
        pagesWithoutImages.push(page.url);
      }
    }

    const percentageWithImages = this.pages.length > 0
      ? Math.round((pagesWithImages.length / this.pages.length) * 100)
      : 0;

    const avgImagesPerPage = this.pages.length > 0
      ? Math.round(totalImages / this.pages.length)
      : 0;

    this.checks.multimediaPresence = {
      totalPages: this.pages.length,
      totalImages,
      pagesWithImages: pagesWithImages.length,
      pagesWithoutImages: pagesWithoutImages.length,
      percentageWithImages,
      avgImagesPerPage,
      status: percentageWithImages >= 60 ? 'pass' : 'warning'
    };

    if (percentageWithImages < 60) {
      this.issues.push({
        type: 'limited_multimedia',
        severity: 'low',
        title: 'Limited Multimedia Content',
        description: `Only ${percentageWithImages}% of pages have images. Visual content improves engagement.`,
        recommendation: 'Add relevant images, infographics, or videos to enhance content quality.',
        affectedPages: pagesWithoutImages.length,
        examples: pagesWithoutImages.slice(0, 5)
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageWithImages,
      avgImagesPerPage
    }, 'Multimedia presence checked');
  }

  /**
   * Calculate Content Quality score
   */
  calculateScore() {
    const weights = {
      contentVolume: 35,
      keywordCannibalization: 20,
      readability: 20,
      faqSections: 10,
      multimediaPresence: 15
    };

    let totalScore = 0;
    let totalWeight = 0;

    // Content volume score
    if (this.checks.contentVolume) {
      totalScore += this.checks.contentVolume.percentageGood * weights.contentVolume;
      totalWeight += weights.contentVolume;
    }

    // Keyword cannibalization score (inverse - fewer issues = better)
    if (this.checks.keywordCannibalization) {
      const score = this.checks.keywordCannibalization.potentialIssues === 0
        ? 100
        : Math.max(0, 100 - (this.checks.keywordCannibalization.potentialIssues * 10));
      totalScore += score * weights.keywordCannibalization;
      totalWeight += weights.keywordCannibalization;
    }

    // Readability score
    if (this.checks.readability) {
      totalScore += this.checks.readability.percentageGood * weights.readability;
      totalWeight += weights.readability;
    }

    // FAQ sections score (bonus for having them)
    if (this.checks.faqSections) {
      const score = this.checks.faqSections.percentageWithFAQ > 0 ? 100 : 60;
      totalScore += score * weights.faqSections;
      totalWeight += weights.faqSections;
    }

    // Multimedia presence score
    if (this.checks.multimediaPresence) {
      totalScore += this.checks.multimediaPresence.percentageWithImages * weights.multimediaPresence;
      totalWeight += weights.multimediaPresence;
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

export default ContentQualityAnalyzer;
