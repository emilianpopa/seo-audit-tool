import logger from '../../config/logger.js';

/**
 * Authority & Backlinks Analyzer
 *
 * Analyzes domain authority and trust signals:
 * - Social media presence (Facebook, Twitter, LinkedIn, Instagram)
 * - Trust signals (Privacy Policy, Terms of Service, Contact Page, About Page)
 * - Security indicators (SSL certificate)
 * - Basic backlink indicators (limited without paid APIs)
 *
 * Weight: 15% of overall score
 *
 * Note: Full backlink analysis requires Moz/Ahrefs API integration
 */
class AuthorityAnalyzer {
  constructor(auditId, domain, pages) {
    this.auditId = auditId;
    this.domain = domain;
    this.pages = pages;
    this.issues = [];
    this.checks = {};
  }

  /**
   * Run all authority checks
   * @returns {Promise<Object>} Analysis results
   */
  async analyze() {
    logger.info({ auditId: this.auditId }, 'Starting Authority analysis');

    try {
      // Run all checks
      this.checkSocialMediaPresence();
      this.checkTrustSignals();
      this.checkContactInformation();
      this.checkSecurityIndicators();
      this.checkBacklinkIndicators();

      // Calculate category score
      const categoryScore = this.calculateScore();

      const result = {
        category: 'AUTHORITY_BACKLINKS',
        categoryScore,
        weight: 0.15,
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
      }, 'Authority analysis completed');

      return result;
    } catch (err) {
      logger.error({ err, auditId: this.auditId }, 'Authority analysis failed');
      throw err;
    }
  }

  /**
   * Check social media presence
   * Detects links to major social platforms
   */
  checkSocialMediaPresence() {
    const socialPlatforms = {
      facebook: false,
      twitter: false,
      linkedin: false,
      instagram: false,
      youtube: false,
      pinterest: false
    };

    const socialPatterns = {
      facebook: /facebook\.com\/|fb\.com\//i,
      twitter: /twitter\.com\/|x\.com\//i,
      linkedin: /linkedin\.com\//i,
      instagram: /instagram\.com\//i,
      youtube: /youtube\.com\/|youtu\.be\//i,
      pinterest: /pinterest\.com\//i
    };

    // Check all pages for social media links
    for (const page of this.pages) {
      const html = page.html || '';

      for (const [platform, pattern] of Object.entries(socialPatterns)) {
        if (pattern.test(html)) {
          socialPlatforms[platform] = true;
        }
      }

      // Also check Open Graph tags
      const openGraphTags = page.openGraphTags || {};
      if (openGraphTags['og:url']) {
        for (const [platform, pattern] of Object.entries(socialPatterns)) {
          if (pattern.test(openGraphTags['og:url'])) {
            socialPlatforms[platform] = true;
          }
        }
      }

      // Also check Twitter tags
      const twitterTags = page.twitterTags || {};
      if (twitterTags['twitter:site'] || twitterTags['twitter:creator']) {
        socialPlatforms.twitter = true;
      }
    }

    const platformsFound = Object.values(socialPlatforms).filter(Boolean).length;
    const platformList = Object.entries(socialPlatforms)
      .filter(([_, found]) => found)
      .map(([platform]) => platform);

    this.checks.socialMedia = {
      platforms: socialPlatforms,
      platformsFound,
      platformList,
      status: platformsFound >= 2 ? 'pass' : 'warning'
    };

    // Add issues
    if (platformsFound === 0) {
      this.issues.push({
        type: 'no_social_media',
        severity: 'medium',
        title: 'No Social Media Presence Detected',
        description: 'No links to social media profiles found. Social signals can help build authority.',
        recommendation: 'Add links to your business social media profiles (Facebook, Twitter, LinkedIn, etc.) in the footer or header.',
        affectedPages: 0
      });
    } else if (platformsFound < 2) {
      this.issues.push({
        type: 'limited_social_media',
        severity: 'low',
        title: 'Limited Social Media Presence',
        description: `Only ${platformsFound} social media platform found. Consider expanding your social presence.`,
        recommendation: 'Establish presence on at least 2-3 major social platforms relevant to your audience.',
        affectedPages: 0
      });
    }

    logger.debug({
      auditId: this.auditId,
      platformsFound,
      platforms: platformList
    }, 'Social media presence checked');
  }

  /**
   * Check trust signals (Privacy Policy, Terms, About, etc.)
   */
  checkTrustSignals() {
    const trustPages = {
      privacyPolicy: false,
      termsOfService: false,
      aboutPage: false,
      contactPage: false
    };

    // Check for trust pages
    for (const page of this.pages) {
      const url = page.url.toLowerCase();
      const title = (page.title || '').toLowerCase();
      const path = (page.path || '').toLowerCase();

      // Privacy Policy
      if (url.includes('privacy') || title.includes('privacy policy') || path.includes('privacy')) {
        trustPages.privacyPolicy = true;
      }

      // Terms of Service
      if (url.includes('terms') || title.includes('terms') || path.includes('terms')) {
        trustPages.termsOfService = true;
      }

      // About Page
      if (url.includes('about') || title.includes('about') || path.includes('about')) {
        trustPages.aboutPage = true;
      }

      // Contact Page
      if (url.includes('contact') || title.includes('contact') || path.includes('contact')) {
        trustPages.contactPage = true;
      }
    }

    const trustPagesFound = Object.values(trustPages).filter(Boolean).length;
    const trustPagesList = Object.entries(trustPages)
      .filter(([_, found]) => found)
      .map(([page]) => page);

    this.checks.trustSignals = {
      pages: trustPages,
      trustPagesFound,
      trustPagesList,
      status: trustPagesFound >= 3 ? 'pass' : 'warning'
    };

    // Add issues
    if (!trustPages.privacyPolicy) {
      this.issues.push({
        type: 'missing_privacy_policy',
        severity: 'high',
        title: 'Missing Privacy Policy',
        description: 'No privacy policy page found. This is essential for user trust and GDPR compliance.',
        recommendation: 'Create a privacy policy page explaining how you collect, use, and protect user data.',
        affectedPages: 0
      });
    }

    if (!trustPages.contactPage) {
      this.issues.push({
        type: 'missing_contact_page',
        severity: 'medium',
        title: 'Missing Contact Page',
        description: 'No contact page found. Users need a way to reach you.',
        recommendation: 'Create a contact page with email, phone, or contact form.',
        affectedPages: 0
      });
    }

    if (!trustPages.aboutPage) {
      this.issues.push({
        type: 'missing_about_page',
        severity: 'low',
        title: 'Missing About Page',
        description: 'No about page found. An about page helps build credibility.',
        recommendation: 'Create an about page describing your business, mission, and team.',
        affectedPages: 0
      });
    }

    logger.debug({
      auditId: this.auditId,
      trustPagesFound,
      pages: trustPagesList
    }, 'Trust signals checked');
  }

  /**
   * Check contact information (phone, email, address)
   */
  checkContactInformation() {
    let hasEmail = false;
    let hasPhone = false;
    let hasAddress = false;

    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const addressPattern = /\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|highway|hwy|square|sq|trail|trl|drive|dr|court|ct|parkway|pkwy|circle|cir|boulevard|blvd)/i;

    // Check all pages for contact info
    for (const page of this.pages) {
      const html = page.html || '';

      if (emailPattern.test(html)) hasEmail = true;
      if (phonePattern.test(html)) hasPhone = true;
      if (addressPattern.test(html)) hasAddress = true;

      // Also check schema.org markup
      const schemaTypes = page.schemaTypes || [];
      if (schemaTypes.includes('Organization') || schemaTypes.includes('LocalBusiness')) {
        // Likely has structured contact info
        hasEmail = true;
        hasPhone = true;
        hasAddress = true;
      }

      if (hasEmail && hasPhone && hasAddress) break;
    }

    const contactMethodsFound = [hasEmail, hasPhone, hasAddress].filter(Boolean).length;

    this.checks.contactInformation = {
      hasEmail,
      hasPhone,
      hasAddress,
      contactMethodsFound,
      status: contactMethodsFound >= 2 ? 'pass' : 'warning'
    };

    if (contactMethodsFound === 0) {
      this.issues.push({
        type: 'no_contact_info',
        severity: 'high',
        title: 'No Contact Information Found',
        description: 'No email, phone, or address found on the website.',
        recommendation: 'Add contact information (email, phone, or address) to build trust and credibility.',
        affectedPages: 0
      });
    } else if (contactMethodsFound < 2) {
      this.issues.push({
        type: 'limited_contact_info',
        severity: 'medium',
        title: 'Limited Contact Information',
        description: `Only ${contactMethodsFound} contact method found. Provide multiple ways to reach you.`,
        recommendation: 'Add at least 2 contact methods (email, phone, address) for better accessibility.',
        affectedPages: 0
      });
    }

    logger.debug({
      auditId: this.auditId,
      hasEmail,
      hasPhone,
      hasAddress
    }, 'Contact information checked');
  }

  /**
   * Check security indicators
   */
  checkSecurityIndicators() {
    const homepage = this.pages.find(p => p.path === '/') || this.pages[0];
    const hasSSL = homepage?.url?.startsWith('https://') || false;

    // Check for security-related headers (if available)
    // Note: This would require response headers from crawler
    const securityScore = hasSSL ? 100 : 0;

    this.checks.security = {
      hasSSL,
      securityScore,
      status: hasSSL ? 'pass' : 'fail'
    };

    if (!hasSSL) {
      this.issues.push({
        type: 'no_ssl_authority',
        severity: 'critical',
        title: 'No HTTPS - Security Risk',
        description: 'Website not using HTTPS. This severely damages trust and authority.',
        recommendation: 'Install SSL certificate and enable HTTPS for all pages.',
        affectedPages: this.pages.length
      });
    }

    logger.debug({
      auditId: this.auditId,
      hasSSL
    }, 'Security indicators checked');
  }

  /**
   * Check backlink indicators
   * Limited analysis without paid APIs
   */
  checkBacklinkIndicators() {
    // Without Moz/Ahrefs API, we can only provide general guidance
    // Check if site has basic linking structure that would support backlinks

    let internalLinksTotal = 0;
    let externalLinksFound = false;

    for (const page of this.pages) {
      const linkCount = page.linkCount || 0;
      internalLinksTotal += linkCount;

      // Check if page has external links (basic check)
      const html = page.html || '';
      if (html.includes('http://') || html.includes('https://')) {
        externalLinksFound = true;
      }
    }

    const avgInternalLinks = this.pages.length > 0
      ? Math.round(internalLinksTotal / this.pages.length)
      : 0;

    this.checks.backlinkIndicators = {
      avgInternalLinks,
      externalLinksFound,
      hasLinkStructure: avgInternalLinks >= 5,
      status: 'info'
    };

    // Add informational note
    this.issues.push({
      type: 'backlink_analysis_limited',
      severity: 'low',
      title: 'Backlink Analysis Limited',
      description: 'Full backlink analysis requires Moz or Ahrefs API integration.',
      recommendation: 'For comprehensive backlink analysis, integrate Moz API or Ahrefs API. Focus on earning quality backlinks through content marketing and outreach.',
      affectedPages: 0
    });

    if (avgInternalLinks < 5) {
      this.issues.push({
        type: 'weak_link_structure',
        severity: 'medium',
        title: 'Weak Internal Link Structure',
        description: `Average of ${avgInternalLinks} internal links per page. Strong linking helps authority flow.`,
        recommendation: 'Improve internal linking to distribute page authority. Aim for 5-10 contextual internal links per page.',
        affectedPages: 0
      });
    }

    logger.debug({
      auditId: this.auditId,
      avgInternalLinks,
      externalLinksFound
    }, 'Backlink indicators checked');
  }

  /**
   * Calculate Authority score
   */
  calculateScore() {
    const weights = {
      socialMedia: 20,
      trustSignals: 30,
      contactInformation: 20,
      security: 20,
      backlinkIndicators: 10
    };

    let totalScore = 0;
    let totalWeight = 0;

    // Social media score
    if (this.checks.socialMedia) {
      const score = Math.min(100, (this.checks.socialMedia.platformsFound / 4) * 100);
      totalScore += score * weights.socialMedia;
      totalWeight += weights.socialMedia;
    }

    // Trust signals score
    if (this.checks.trustSignals) {
      const score = (this.checks.trustSignals.trustPagesFound / 4) * 100;
      totalScore += score * weights.trustSignals;
      totalWeight += weights.trustSignals;
    }

    // Contact information score
    if (this.checks.contactInformation) {
      const score = (this.checks.contactInformation.contactMethodsFound / 3) * 100;
      totalScore += score * weights.contactInformation;
      totalWeight += weights.contactInformation;
    }

    // Security score
    if (this.checks.security) {
      totalScore += this.checks.security.securityScore * weights.security;
      totalWeight += weights.security;
    }

    // Backlink indicators score
    if (this.checks.backlinkIndicators) {
      const score = this.checks.backlinkIndicators.hasLinkStructure ? 70 : 40;
      totalScore += score * weights.backlinkIndicators;
      totalWeight += weights.backlinkIndicators;
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

export default AuthorityAnalyzer;
