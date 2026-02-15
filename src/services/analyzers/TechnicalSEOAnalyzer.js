import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import logger from '../../config/logger.js';

/**
 * Technical SEO Analyzer
 *
 * Analyzes technical SEO factors:
 * - Sitemap.xml detection and parsing
 * - robots.txt analysis
 * - SSL certificate validation
 * - Mobile responsiveness
 * - Structured data (Schema.org) detection
 * - Canonical tag validation
 *
 * Weight: 25% of overall score
 */
class TechnicalSEOAnalyzer {
  constructor(auditId, domain, pages) {
    this.auditId = auditId;
    this.domain = domain;
    this.pages = pages; // Array of crawled pages
    this.issues = [];
    this.checks = {};
  }

  /**
   * Run all technical SEO checks
   * @returns {Promise<Object>} Analysis results
   */
  async analyze() {
    logger.info({ auditId: this.auditId }, 'Starting Technical SEO analysis');

    try {
      // Run all checks in parallel
      await Promise.all([
        this.checkSitemap(),
        this.checkRobotsTxt(),
        this.checkSSL(),
        this.checkMobileResponsiveness(),
        this.checkStructuredData(),
        this.checkCanonicalTags()
      ]);

      // Calculate category score
      const categoryScore = this.calculateScore();

      const result = {
        category: 'TECHNICAL_SEO',
        categoryScore,
        weight: 0.25,
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
      }, 'Technical SEO analysis completed');

      return result;
    } catch (err) {
      logger.error({ err, auditId: this.auditId }, 'Technical SEO analysis failed');
      throw err;
    }
  }

  /**
   * Check for sitemap.xml
   */
  async checkSitemap() {
    try {
      const sitemapUrl = `https://${this.domain}/sitemap.xml`;

      const response = await axios.get(sitemapUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 200) {
        // Parse sitemap to count URLs
        const $ = cheerio.load(response.data, { xmlMode: true });
        const urlCount = $('url').length;

        this.checks.sitemap = {
          exists: true,
          url: sitemapUrl,
          urlCount,
          status: 'pass'
        };

        logger.debug({ auditId: this.auditId, urlCount }, 'Sitemap found');
      } else {
        this.checks.sitemap = {
          exists: false,
          status: 'fail'
        };

        this.issues.push({
          type: 'missing_sitemap',
          severity: 'high',
          title: 'Missing XML Sitemap',
          description: 'No sitemap.xml found. This makes it harder for search engines to discover all pages.',
          recommendation: 'Generate sitemap.xml using a plugin or tool, then submit to Google Search Console.',
          affectedPages: 0
        });
      }
    } catch (err) {
      this.checks.sitemap = {
        exists: false,
        status: 'fail',
        error: err.message
      };

      this.issues.push({
        type: 'missing_sitemap',
        severity: 'high',
        title: 'Missing XML Sitemap',
        description: 'No sitemap.xml found. This makes it harder for search engines to discover all pages.',
        recommendation: 'Generate sitemap.xml using a plugin or tool, then submit to Google Search Console.',
        affectedPages: 0
      });
    }
  }

  /**
   * Check robots.txt
   */
  async checkRobotsTxt() {
    try {
      const robotsUrl = `https://${this.domain}/robots.txt`;

      const response = await axios.get(robotsUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 200) {
        const content = response.data;

        // Check for sitemap reference
        const hasSitemapReference = content.toLowerCase().includes('sitemap:');

        // Check for blocking rules
        const hasDisallowAll = content.includes('Disallow: /');

        this.checks.robotsTxt = {
          exists: true,
          url: robotsUrl,
          hasSitemapReference,
          hasDisallowAll,
          status: hasDisallowAll ? 'warning' : 'pass'
        };

        if (hasDisallowAll) {
          this.issues.push({
            type: 'robots_blocks_all',
            severity: 'critical',
            title: 'Robots.txt Blocks All Pages',
            description: 'robots.txt contains "Disallow: /" which blocks search engines from crawling your site.',
            recommendation: 'Remove or modify the "Disallow: /" rule in robots.txt to allow search engine crawling.',
            affectedPages: this.pages.length
          });
        }

        if (!hasSitemapReference && this.checks.sitemap?.exists) {
          this.issues.push({
            type: 'robots_missing_sitemap',
            severity: 'low',
            title: 'Sitemap Not Referenced in Robots.txt',
            description: 'robots.txt does not include a Sitemap: directive.',
            recommendation: 'Add "Sitemap: https://' + this.domain + '/sitemap.xml" to robots.txt.',
            affectedPages: 0
          });
        }

        logger.debug({ auditId: this.auditId }, 'robots.txt found');
      } else {
        this.checks.robotsTxt = {
          exists: false,
          status: 'warning'
        };

        this.issues.push({
          type: 'missing_robots',
          severity: 'medium',
          title: 'Missing robots.txt',
          description: 'No robots.txt file found. While not critical, this file helps control search engine crawling.',
          recommendation: 'Create a robots.txt file with appropriate directives and sitemap reference.',
          affectedPages: 0
        });
      }
    } catch (err) {
      this.checks.robotsTxt = {
        exists: false,
        status: 'warning',
        error: err.message
      };

      this.issues.push({
        type: 'missing_robots',
        severity: 'medium',
        title: 'Missing robots.txt',
        description: 'No robots.txt file found. While not critical, this file helps control search engine crawling.',
        recommendation: 'Create a robots.txt file with appropriate directives and sitemap reference.',
        affectedPages: 0
      });
    }
  }

  /**
   * Check SSL certificate
   */
  async checkSSL() {
    try {
      const httpsUrl = `https://${this.domain}`;

      const response = await axios.get(httpsUrl, {
        timeout: 5000,
        validateStatus: () => true // Accept any status
      });

      this.checks.ssl = {
        hasSSL: true,
        protocol: 'https',
        status: 'pass'
      };

      logger.debug({ auditId: this.auditId }, 'SSL certificate valid');
    } catch (err) {
      this.checks.ssl = {
        hasSSL: false,
        protocol: 'http',
        status: 'fail',
        error: err.message
      };

      this.issues.push({
        type: 'missing_ssl',
        severity: 'critical',
        title: 'No SSL Certificate (HTTPS)',
        description: 'Website is not using HTTPS. This is a major security and SEO issue. Google prioritizes HTTPS sites.',
        recommendation: 'Install an SSL certificate (free options: Let\'s Encrypt) and redirect all HTTP traffic to HTTPS.',
        affectedPages: this.pages.length
      });
    }
  }

  /**
   * Check mobile responsiveness
   * Uses viewport meta tag as a proxy
   */
  checkMobileResponsiveness() {
    let mobileOptimized = 0;
    const pagesWithoutViewport = [];

    for (const page of this.pages) {
      // Check for viewport meta tag
      const hasViewport = page.html?.includes('viewport') || false;

      if (hasViewport) {
        mobileOptimized++;
      } else {
        pagesWithoutViewport.push(page.url);
      }
    }

    const percentageOptimized = this.pages.length > 0
      ? Math.round((mobileOptimized / this.pages.length) * 100)
      : 0;

    this.checks.mobileResponsive = {
      totalPages: this.pages.length,
      mobileOptimized,
      percentageOptimized,
      status: percentageOptimized >= 90 ? 'pass' : 'fail'
    };

    if (percentageOptimized < 90) {
      this.issues.push({
        type: 'mobile_not_optimized',
        severity: percentageOptimized < 50 ? 'critical' : 'high',
        title: 'Mobile Optimization Issues',
        description: `Only ${percentageOptimized}% of pages have proper viewport meta tags for mobile devices.`,
        recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to all pages.',
        affectedPages: pagesWithoutViewport.length,
        examples: pagesWithoutViewport.slice(0, 5)
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageOptimized
    }, 'Mobile responsiveness checked');
  }

  /**
   * Check structured data (Schema.org)
   */
  checkStructuredData() {
    let pagesWithSchema = 0;
    const pagesWithoutSchema = [];
    const schemaTypesFound = new Set();

    for (const page of this.pages) {
      if (page.hasSchema) {
        pagesWithSchema++;

        // Collect schema types
        if (page.schemaTypes && Array.isArray(page.schemaTypes)) {
          page.schemaTypes.forEach(type => schemaTypesFound.add(type));
        }
      } else {
        pagesWithoutSchema.push(page.url);
      }
    }

    const percentageWithSchema = this.pages.length > 0
      ? Math.round((pagesWithSchema / this.pages.length) * 100)
      : 0;

    this.checks.structuredData = {
      totalPages: this.pages.length,
      pagesWithSchema,
      percentageWithSchema,
      schemaTypes: Array.from(schemaTypesFound),
      status: percentageWithSchema >= 50 ? 'pass' : 'warning'
    };

    if (percentageWithSchema === 0) {
      this.issues.push({
        type: 'no_structured_data',
        severity: 'high',
        title: 'No Structured Data Found',
        description: 'No Schema.org structured data detected. Structured data helps search engines understand your content.',
        recommendation: 'Add JSON-LD structured data (Organization, WebSite, Article, etc.) to key pages.',
        affectedPages: this.pages.length
      });
    } else if (percentageWithSchema < 50) {
      this.issues.push({
        type: 'limited_structured_data',
        severity: 'medium',
        title: 'Limited Structured Data Coverage',
        description: `Only ${percentageWithSchema}% of pages have structured data. This is a missed opportunity for rich snippets.`,
        recommendation: 'Expand structured data coverage to more pages, especially product, article, and service pages.',
        affectedPages: pagesWithoutSchema.length,
        examples: pagesWithoutSchema.slice(0, 5)
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageWithSchema,
      schemaTypes: Array.from(schemaTypesFound)
    }, 'Structured data checked');
  }

  /**
   * Check canonical tags
   */
  checkCanonicalTags() {
    let pagesWithCanonical = 0;
    let pagesWithSelfReferencing = 0;
    const pagesWithoutCanonical = [];
    const pagesWithWrongCanonical = [];

    for (const page of this.pages) {
      const canonical = page.canonical;

      if (canonical) {
        pagesWithCanonical++;

        // Check if self-referencing
        if (canonical === page.url || canonical === page.url.replace(/\/$/, '')) {
          pagesWithSelfReferencing++;
        } else {
          pagesWithWrongCanonical.push({
            url: page.url,
            canonical
          });
        }
      } else {
        pagesWithoutCanonical.push(page.url);
      }
    }

    const percentageWithCanonical = this.pages.length > 0
      ? Math.round((pagesWithCanonical / this.pages.length) * 100)
      : 0;

    this.checks.canonicalTags = {
      totalPages: this.pages.length,
      pagesWithCanonical,
      pagesWithSelfReferencing,
      percentageWithCanonical,
      status: percentageWithCanonical >= 80 ? 'pass' : 'warning'
    };

    if (percentageWithCanonical < 80) {
      this.issues.push({
        type: 'missing_canonical_tags',
        severity: 'medium',
        title: 'Missing Canonical Tags',
        description: `Only ${percentageWithCanonical}% of pages have canonical tags. This can lead to duplicate content issues.`,
        recommendation: 'Add self-referencing canonical tags to all pages: <link rel="canonical" href="[page-url]">',
        affectedPages: pagesWithoutCanonical.length,
        examples: pagesWithoutCanonical.slice(0, 5)
      });
    }

    if (pagesWithWrongCanonical.length > 0) {
      this.issues.push({
        type: 'wrong_canonical_tags',
        severity: 'high',
        title: 'Incorrect Canonical Tags',
        description: `${pagesWithWrongCanonical.length} pages have canonical tags pointing to different URLs.`,
        recommendation: 'Review canonical tags to ensure they point to the correct version of each page.',
        affectedPages: pagesWithWrongCanonical.length,
        examples: pagesWithWrongCanonical.slice(0, 3)
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageWithCanonical
    }, 'Canonical tags checked');
  }

  /**
   * Calculate Technical SEO score
   * Weighted scoring based on check results
   */
  calculateScore() {
    const weights = {
      sitemap: 20,
      robotsTxt: 15,
      ssl: 25,
      mobileResponsive: 20,
      structuredData: 10,
      canonicalTags: 10
    };

    let totalScore = 0;
    let totalWeight = 0;

    // Sitemap score
    if (this.checks.sitemap) {
      const score = this.checks.sitemap.exists ? 100 : 0;
      totalScore += score * weights.sitemap;
      totalWeight += weights.sitemap;
    }

    // Robots.txt score
    if (this.checks.robotsTxt) {
      let score = 0;
      if (this.checks.robotsTxt.exists) {
        if (this.checks.robotsTxt.hasDisallowAll) {
          score = 0; // Critical failure
        } else if (this.checks.robotsTxt.hasSitemapReference) {
          score = 100;
        } else {
          score = 70;
        }
      } else {
        score = 50; // Not critical, but should exist
      }
      totalScore += score * weights.robotsTxt;
      totalWeight += weights.robotsTxt;
    }

    // SSL score
    if (this.checks.ssl) {
      const score = this.checks.ssl.hasSSL ? 100 : 0;
      totalScore += score * weights.ssl;
      totalWeight += weights.ssl;
    }

    // Mobile responsive score
    if (this.checks.mobileResponsive) {
      totalScore += this.checks.mobileResponsive.percentageOptimized * weights.mobileResponsive;
      totalWeight += weights.mobileResponsive;
    }

    // Structured data score
    if (this.checks.structuredData) {
      totalScore += this.checks.structuredData.percentageWithSchema * weights.structuredData;
      totalWeight += weights.structuredData;
    }

    // Canonical tags score
    if (this.checks.canonicalTags) {
      totalScore += this.checks.canonicalTags.percentageWithCanonical * weights.canonicalTags;
      totalWeight += weights.canonicalTags;
    }

    // Calculate final score
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

export default TechnicalSEOAnalyzer;
