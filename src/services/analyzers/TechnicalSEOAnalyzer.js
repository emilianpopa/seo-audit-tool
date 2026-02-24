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

      // Run synchronous checks that depend on crawled page data
      this.checkRedirectConsistency();
      this.checkJSDependentForms();

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
          affectedPages: 0,
          evidence: [{
            url: `https://${this.domain}/sitemap.xml`,
            detail: '404 Not Found'
          }]
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
            affectedPages: this.pages.length,
            evidence: [{
              url: `https://${this.domain}/robots.txt`,
              detail: 'Contains "Disallow: /"'
            }]
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
        examples: pagesWithoutViewport.slice(0, 5),
        evidence: pagesWithoutViewport.slice(0, 5).map(url => ({
          url,
          detail: 'Missing viewport meta tag'
        }))
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
        affectedPages: this.pages.length,
        evidence: [{
          url: null,
          detail: 'No JSON-LD or Microdata schema found on any page'
        }]
      });
    } else if (percentageWithSchema < 50) {
      this.issues.push({
        type: 'limited_structured_data',
        severity: 'medium',
        title: 'Limited Structured Data Coverage',
        description: `Only ${percentageWithSchema}% of pages have structured data. This is a missed opportunity for rich snippets.`,
        recommendation: 'Expand structured data coverage to more pages, especially product, article, and service pages.',
        affectedPages: pagesWithoutSchema.length,
        examples: pagesWithoutSchema.slice(0, 5),
        evidence: pagesWithoutSchema.slice(0, 5).map(url => ({
          url,
          detail: 'Missing structured data'
        }))
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
        examples: pagesWithoutCanonical.slice(0, 5),
        evidence: pagesWithoutCanonical.slice(0, 5).map(url => ({
          url,
          detail: 'Missing canonical tag'
        }))
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
        examples: pagesWithWrongCanonical.slice(0, 3),
        evidence: pagesWithWrongCanonical.slice(0, 3).map(item => ({
          url: item.url,
          detail: `Points to ${item.canonical}`
        }))
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageWithCanonical
    }, 'Canonical tags checked');
  }

  /**
   * Check trailing slash / redirect inconsistency
   * Detects URL paths that appear both with and without a trailing slash
   * across internal links, which can cause redirect chains.
   */
  checkRedirectConsistency() {
    const withSlash = new Set();
    const withoutSlash = new Set();

    for (const page of this.pages) {
      try {
        const parsed = new URL(page.url);
        const path = parsed.pathname;

        if (path === '/') continue;

        if (path.endsWith('/')) {
          withSlash.add(path.slice(0, -1)); // normalise: store without trailing slash
        } else {
          withoutSlash.add(path);
        }
      } catch (_) {
        // ignore unparseable URLs
      }
    }

    // Find paths that appear in both sets
    const inconsistentPaths = [...withSlash].filter(p => withoutSlash.has(p));
    const count = inconsistentPaths.length;
    const totalPages = this.pages.length;

    this.checks.redirectConsistency = {
      totalPages,
      inconsistentPaths: count,
      status: count === 0 ? 'pass' : 'warning'
    };

    if (count > 0) {
      this.issues.push({
        type: 'trailing_slash_inconsistency',
        severity: 'medium',
        title: 'Trailing Slash Inconsistency',
        description: `${count} URL path(s) appear both with and without trailing slash, potentially causing redirect chains.`,
        recommendation: 'Standardise all URLs to either always include or always exclude trailing slashes, and implement 301 redirects for the non-canonical form.',
        affectedPages: count
      });
    }

    logger.debug({
      auditId: this.auditId,
      inconsistentPaths: count
    }, 'Redirect consistency checked');
  }

  /**
   * Check for pages that are likely JavaScript-dependent shells
   * (minimal crawlable content, no schema, no images, not the homepage)
   */
  checkJSDependentForms() {
    const suspectedJSPages = [];

    for (const page of this.pages) {
      try {
        const parsed = new URL(page.url);
        if (parsed.pathname === '/') continue;
      } catch (_) {
        continue;
      }

      const schemaTypes = page.schemaTypes;
      const hasNoSchema = !schemaTypes || (Array.isArray(schemaTypes) && schemaTypes.length === 0);
      const wordCount = page.wordCount || 0;
      const imageCount = page.imageCount || 0;

      if (hasNoSchema && wordCount < 100 && imageCount === 0) {
        suspectedJSPages.push(page);
      }
    }

    this.checks.jsDependentContent = {
      suspectedJSPages: suspectedJSPages.length,
      status: suspectedJSPages.length === 0 ? 'pass' : 'warning'
    };

    if (suspectedJSPages.length > 0) {
      this.issues.push({
        type: 'js_dependent_content',
        severity: 'medium',
        title: 'Possible JavaScript-Dependent Content',
        description: `${suspectedJSPages.length} page(s) appear to have minimal crawlable content, suggesting JavaScript may be required to render key content. Search engines may not index this content.`,
        recommendation: 'Ensure all important page content is available in the static HTML. Use server-side rendering (SSR) or pre-rendering for JavaScript-heavy pages.',
        affectedPages: suspectedJSPages.length,
        examples: suspectedJSPages.slice(0, 5).map(p => ({ url: p.url, detail: `${p.wordCount} words crawled` }))
      });
    }

    logger.debug({
      auditId: this.auditId,
      suspectedJSPages: suspectedJSPages.length
    }, 'JS-dependent content checked');
  }

  /**
   * Calculate Technical SEO score
   * Weighted scoring based on check results
   * More conservative to match professional SEO tools
   */
  calculateScore() {
    const weights = {
      sitemap: 20,
      robotsTxt: 15,
      ssl: 30, // Increased from 25 - critical for SEO
      mobileResponsive: 20,
      structuredData: 5, // Reduced from 10 to accommodate redirectConsistency
      canonicalTags: 5, // Reduced from 10 - less critical
      redirectConsistency: 5 // New: trailing slash / redirect consistency
    };

    let totalScore = 0;
    let totalWeight = 0;

    // Sitemap score (binary - critical for crawlability)
    if (this.checks.sitemap) {
      const score = this.checks.sitemap.exists ? 100 : 0;
      totalScore += score * weights.sitemap;
      totalWeight += weights.sitemap;
    }

    // Robots.txt score (more conservative)
    if (this.checks.robotsTxt) {
      let score = 0;
      if (this.checks.robotsTxt.exists) {
        if (this.checks.robotsTxt.hasDisallowAll) {
          score = 0; // Critical failure - blocks all crawlers
        } else if (this.checks.robotsTxt.hasSitemapReference) {
          score = 100; // Perfect - has robots.txt with sitemap reference
        } else {
          score = 60; // Has robots.txt but missing sitemap reference (reduced from 70)
        }
      } else {
        score = 20; // Missing robots.txt is a problem (reduced from 50)
      }
      totalScore += score * weights.robotsTxt;
      totalWeight += weights.robotsTxt;
    }

    // SSL score (critical for trust and rankings)
    if (this.checks.ssl) {
      const score = this.checks.ssl.hasSSL ? 100 : 0;
      totalScore += score * weights.ssl;
      totalWeight += weights.ssl;
    }

    // Mobile responsive score (conservative - penalize non-mobile-friendly)
    if (this.checks.mobileResponsive) {
      const percentageOptimized = this.checks.mobileResponsive.percentageOptimized || 0;
      // Penalize sites that aren't 100% mobile-optimized
      let score = percentageOptimized;
      if (percentageOptimized < 90) score = percentageOptimized * 0.8; // 20% penalty

      totalScore += score * weights.mobileResponsive;
      totalWeight += weights.mobileResponsive;
    }

    // Structured data score (nice to have, not critical)
    if (this.checks.structuredData) {
      totalScore += this.checks.structuredData.percentageWithSchema * weights.structuredData;
      totalWeight += weights.structuredData;
    }

    // Canonical tags score (important but often missing)
    if (this.checks.canonicalTags) {
      totalScore += this.checks.canonicalTags.percentageWithCanonical * weights.canonicalTags;
      totalWeight += weights.canonicalTags;
    }

    // Redirect consistency score
    if (this.checks.redirectConsistency) {
      const inconsistentPaths = this.checks.redirectConsistency.inconsistentPaths || 0;
      const score = inconsistentPaths === 0 ? 100 : Math.max(0, 100 - inconsistentPaths * 20);
      totalScore += score * weights.redirectConsistency;
      totalWeight += weights.redirectConsistency;
    }

    // Calculate final score
    let finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

    // Critical override: if robots.txt blocks all crawlers the site cannot rank
    if (this.checks.robotsTxt?.hasDisallowAll === true) {
      finalScore = Math.min(finalScore, 45);
    }

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
