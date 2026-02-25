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
      this.checkEEATSignals();
      this.checkBlogFeaturedOnHomepage();
      this.checkTrustSignals();

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
        checks: {
          ...this.checks,
          measurementMethod: 'crawl-analysis',
          confidence: 'measured'
        }
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
    // Determine threshold based on page type
    function getWordCountThreshold(url) {
      const lower = (url || '').toLowerCase();
      if (/\/(blog|article|post|news|guide|resource)s?\//.test(lower)) return 600;
      if (/\/(service|product|solution|offering)s?\//.test(lower)) return 800;
      return 300;
    }

    const thinContent = [];
    const goodContent = [];
    let totalWords = 0;

    for (const page of this.pages) {
      const wordCount = page.wordCount || 0;
      totalWords += wordCount;

      const threshold = getWordCountThreshold(page.url);
      if (wordCount < threshold && page.path !== '/') {
        thinContent.push({
          url: page.url,
          wordCount,
          threshold
        });
      } else if (wordCount >= threshold) {
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
        description: `${thinContent.length} pages have less than their recommended minimum word count (blog: 600+, service: 800+, other: 300+). Thin content can negatively impact SEO rankings.`,
        recommendation: 'Expand content to meet the recommended minimum for each page type. Add valuable, relevant information.',
        affectedPages: thinContent.length,
        examples: thinContent.slice(0, 5),
        evidence: thinContent.slice(0, 5).map(item => ({
          url: item.url,
          detail: `${item.wordCount} words (minimum: ${item.threshold})`
        }))
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
        examples: similarTitles.slice(0, 3),
        evidence: similarTitles.slice(0, 3).map(item => ({
          url: null,
          detail: `Keyword "${item.keyword}" appears in ${item.pageCount} titles (e.g., ${item.pages.slice(0, 2).map(p => p.title).join(', ')})`
        }))
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
        severity: 'medium',
        title: 'No FAQ Sections Detected',
        description: 'No FAQ sections or FAQPage schema found on any page. FAQ content targets "People Also Ask" featured snippets and improves dwell time. This is a significant missed opportunity for organic traffic.',
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
        examples: pagesWithoutImages.slice(0, 5),
        evidence: pagesWithoutImages.slice(0, 5).map(url => ({
          url,
          detail: 'No images found'
        }))
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageWithImages,
      avgImagesPerPage
    }, 'Multimedia presence checked');
  }

  /**
   * Check E-E-A-T signals (Expertise, Experience, Authoritativeness, Trust)
   */
  checkEEATSignals() {
    const pagesWithSignals = [];
    const pagesLacking = [];

    for (const page of this.pages) {
      const wordCount = page.wordCount || 0;
      const h2Tags = page.h2Tags || [];
      const h3Tags = page.h3Tags || [];
      const title = page.title || '';
      const imageCount = page.imageCount || 0;

      const allHeadings = [...h2Tags, ...h3Tags].join(' ').toLowerCase();

      // Author signals: headings mentioning authorship
      const authorSignals = /author|written by|by |about the author/.test(allHeadings);

      // Date signals: title or headings contain a year or update/publish keywords
      const combinedText = (title + ' ' + allHeadings).toLowerCase();
      const dateSignals = /20(2[0-9]|[3-9]\d)|updated|published/.test(combinedText);

      // Citation signals: substantial content with supporting media
      const citationSignals = wordCount > 600 && imageCount > 0;

      const hasSignals = authorSignals || dateSignals || citationSignals;

      if (hasSignals) {
        pagesWithSignals.push(page);
      } else if (wordCount > 400) {
        pagesLacking.push({ url: page.url, wordCount });
      }
    }

    this.checks.eeatSignals = {
      totalPages: this.pages.length,
      pagesWithSignals: pagesWithSignals.length,
      pagesLackingSignals: pagesLacking.length,
      status: pagesLacking.length === 0 ? 'pass' : 'warning'
    };

    if (pagesLacking.length > 0) {
      this.issues.push({
        type: 'weak_eeat_signals',
        severity: 'medium',
        title: 'Weak E-E-A-T Signals',
        description: `${pagesLacking.length} substantial page(s) lack visible credibility signals such as author attribution, publication dates, or supporting media. Google's E-E-A-T guidelines reward demonstrable expertise.`,
        recommendation: 'Add author bylines, publication/update dates, and supporting images or citations to key content pages. Consider adding an "About the Author" section.',
        affectedPages: pagesLacking.length,
        examples: pagesLacking.slice(0, 5).map(p => ({ url: p.url, detail: `${p.wordCount} words, no author/date signals` }))
      });
    }

    logger.debug({
      auditId: this.auditId,
      pagesWithSignals: pagesWithSignals.length,
      pagesLackingSignals: pagesLacking.length
    }, 'E-E-A-T signals checked');
  }

  /**
   * Check whether blog content is featured on the homepage
   */
  checkBlogFeaturedOnHomepage() {
    const blogPages = this.pages.filter(p =>
      /\/(blog|article|post|news|insights|resources?)s?\//i.test(p.url || '') &&
      (p.title || '').length > 0
    );

    const homepage = this.pages.find(p =>
      p.path === '/' ||
      (p.url || '').replace(/^https?:\/\/[^/]+\/?$/, '') === ''
    );

    // Check if homepage headings reference blog/news topics
    const homepageH2s = (homepage?.h2Tags || []).map(h => h.toLowerCase());
    const homepageBlogSignals = homepageH2s.some(h =>
      /blog|news|article|insight|resource|learn|latest|recent/i.test(h)
    );

    this.checks.blogFeaturedOnHomepage = {
      blogPagesFound: blogPages.length,
      blogTitles: blogPages.slice(0, 3).map(p => p.title || p.path),
      homepageFound: !!homepage,
      homepageBlogSignals,
      status: (blogPages.length === 0 || homepageBlogSignals) ? 'pass' : 'warning'
    };

    if (blogPages.length >= 2 && !homepageBlogSignals) {
      const blogTitleExamples = blogPages.slice(0, 2).map(p => `"${p.title || p.path}"`).join(', ');
      this.issues.push({
        type: 'blog_not_featured_on_homepage',
        severity: 'medium',
        title: 'Blog / Insights Not Featured on Homepage',
        description: `${blogPages.length} blog/article pages found (e.g. ${blogTitleExamples}) but the homepage doesn't appear to surface recent content. Featuring blog posts on the homepage improves engagement, internal linking, and E-E-A-T signals.`,
        recommendation: 'Add a "Recent Posts", "Latest Insights", or "From the Blog" section to your homepage featuring your 3 most recent articles with titles, dates, and links.',
        affectedPages: 1,
        evidence: blogPages.slice(0, 3).map(p => ({ url: p.url, detail: p.title || 'Blog post' }))
      });
    }

    logger.debug({
      auditId: this.auditId,
      blogPagesFound: blogPages.length,
      homepageBlogSignals
    }, 'Blog featured on homepage checked');
  }

  /**
   * Check for trust signals: testimonials, case studies, social proof, review sections
   */
  checkTrustSignals() {
    const testimonialPatterns = /testimonial|review|case.?stud|client|customer|success.?stor/i;
    const trustPagePaths = /\/(about|team|clients?|partners?|testimonials?|reviews?|case.?stud)/i;

    const pagesWithTrustContent = this.pages.filter(p =>
      trustPagePaths.test(p.path || '') ||
      testimonialPatterns.test(p.title || '') ||
      (p.h1Tags || []).some(h => testimonialPatterns.test(h)) ||
      (p.h2Tags || []).some(h => testimonialPatterns.test(h))
    );

    const hasTestimonials = pagesWithTrustContent.some(p =>
      /testimonial|review/i.test(p.path || '') || /testimonial|review/i.test(p.title || '')
    );
    const hasCaseStudies = pagesWithTrustContent.some(p =>
      /case.?stud/i.test(p.path || '') || /case.?stud/i.test(p.title || '')
    );
    const hasAboutTeam = pagesWithTrustContent.some(p =>
      /\/(about|team)/i.test(p.path || '')
    );

    this.checks.trustSignals = {
      pagesWithTrustContent: pagesWithTrustContent.length,
      hasTestimonials,
      hasCaseStudies,
      hasAboutTeam,
      status: pagesWithTrustContent.length > 0 ? 'pass' : 'warning'
    };

    const missingSignals = [];
    if (!hasTestimonials) missingSignals.push('customer testimonials with names and companies');
    if (!hasCaseStudies) missingSignals.push('case studies with measurable results');
    if (!hasAboutTeam) missingSignals.push('About / Team page showing real people');

    if (missingSignals.length >= 2) {
      this.issues.push({
        type: 'weak_trust_signals',
        severity: 'medium',
        title: 'Weak Social Proof & Trust Signals',
        description: `Missing: ${missingSignals.join('; ')}. Trust signals are a key E-E-A-T ranking factor — Google rewards sites that demonstrate real expertise and customer validation.`,
        recommendation: 'Add named customer testimonials (with company + role), at least 3 case studies with specific metrics (e.g. "19% reduction in turnover"), and an About/Team page with real team member photos.',
        affectedPages: 0,
        evidence: [{ url: null, detail: 'Add trust content to validate expertise and build conversion trust' }]
      });
    }

    logger.debug({
      auditId: this.auditId,
      pagesWithTrustContent: pagesWithTrustContent.length,
      hasTestimonials,
      hasCaseStudies
    }, 'Trust signals checked');
  }

  /**
   * Calculate Content Quality score
   * More conservative scoring to match professional SEO tools
   */
  calculateScore() {
    const weights = {
      contentVolume: 35,
      keywordCannibalization: 25, // Increased from 20 - this is critical
      readability: 15, // Reduced from 20 - check is simplistic
      faqSections: 5, // Reduced from 10 to accommodate eeatSignals
      multimediaPresence: 5, // Reduced from 10 to accommodate eeatSignals
      eeatSignals: 10,
      trustSignals: 5
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
      // More aggressive penalty for cannibalization
      const issues = this.checks.keywordCannibalization.potentialIssues;
      let score = 100;
      if (issues > 0) score = Math.max(0, 100 - (issues * 15)); // Increased penalty from 10 to 15

      totalScore += score * weights.keywordCannibalization;
      totalWeight += weights.keywordCannibalization;
    }

    // Readability score
    if (this.checks.readability) {
      totalScore += this.checks.readability.percentageGood * weights.readability;
      totalWeight += weights.readability;
    }

    // FAQ sections score (more realistic - no free points)
    if (this.checks.faqSections) {
      // 0 FAQs = 0%, not 60%! FAQs are a bonus, not a requirement
      // But having them is a strong positive signal
      const percentageWithFAQ = this.checks.faqSections.percentageWithFAQ || 0;
      const score = percentageWithFAQ > 0 ? Math.min(100, percentageWithFAQ + 20) : 0;

      totalScore += score * weights.faqSections;
      totalWeight += weights.faqSections;
    }

    // Multimedia presence score (more conservative)
    if (this.checks.multimediaPresence) {
      // Penalize low image usage more heavily
      const percentageWithImages = this.checks.multimediaPresence.percentageWithImages || 0;
      let score = percentageWithImages;
      if (percentageWithImages < 50) score = percentageWithImages * 0.7; // 30% penalty

      totalScore += score * weights.multimediaPresence;
      totalWeight += weights.multimediaPresence;
    }

    // E-E-A-T signals score
    if (this.checks.eeatSignals) {
      const { pagesLackingSignals, totalPages } = this.checks.eeatSignals;
      const score = pagesLackingSignals === 0
        ? 100
        : Math.max(0, 100 - (pagesLackingSignals / (totalPages || 1)) * 100);

      totalScore += score * weights.eeatSignals;
      totalWeight += weights.eeatSignals;
    }

    // Trust signals score
    if (this.checks.trustSignals) {
      const score = this.checks.trustSignals.pagesWithTrustContent > 0 ? 100 : 30;
      totalScore += score * weights.trustSignals;
      totalWeight += weights.trustSignals;
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
