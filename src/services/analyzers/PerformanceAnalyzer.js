import axios from 'axios';
import logger from '../../config/logger.js';

/**
 * Performance Analyzer
 *
 * Analyzes website performance using Google PageSpeed Insights API:
 * - Mobile and Desktop performance scores
 * - Core Web Vitals (LCP, FID, CLS)
 * - First Contentful Paint (FCP)
 * - Time to Interactive (TTI)
 * - Performance opportunities and diagnostics
 *
 * Weight: 10% of overall score
 */
class PerformanceAnalyzer {
  constructor(auditId, domain, pages) {
    this.auditId = auditId;
    this.domain = domain;
    this.pages = pages;
    this.issues = [];
    this.checks = {};
    this.apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  }

  /**
   * Run all performance checks
   * @returns {Promise<Object>} Analysis results
   */
  async analyze() {
    logger.info({ auditId: this.auditId }, 'Starting Performance analysis');

    try {
      // ALWAYS calculate load-time estimation as fallback
      this.calculateLoadTimeEstimation();

      // Check if API key is configured
      if (!this.apiKey) {
        logger.warn({ auditId: this.auditId }, 'Google PageSpeed API key not configured');

        // Return fallback analysis without API
        return this.getFallbackAnalysis();
      }

      // Analyze homepage performance (mobile and desktop)
      const homepage = this.pages.find(p => p.path === '/') || this.pages[0];
      if (!homepage) {
        return this.getFallbackAnalysis();
      }

      // Run PageSpeed tests
      const [mobileResults, desktopResults] = await Promise.all([
        this.runPageSpeedTest(homepage.url, 'mobile'),
        this.runPageSpeedTest(homepage.url, 'desktop')
      ]);

      // Process results
      this.processPageSpeedResults(mobileResults, desktopResults);

      // Calculate category score
      const categoryScore = this.calculateScore();

      const result = {
        category: 'PERFORMANCE',
        categoryScore,
        weight: 0.10,
        rating: this.getRating(categoryScore),
        issues: this.issues,
        issueCount: this.issues.length,
        criticalCount: this.issues.filter(i => i.severity === 'critical').length,
        highCount: this.issues.filter(i => i.severity === 'high').length,
        mediumCount: this.issues.filter(i => i.severity === 'medium').length,
        lowCount: this.issues.filter(i => i.severity === 'low').length,
        checks: {
          ...this.checks,
          measurementMethod: this.checks.pageSpeed ? 'pagespeed-api' : 'load-time-estimation',
          confidence: this.checks.pageSpeed ? 'measured' : 'estimated'
        }
      };

      logger.info({
        auditId: this.auditId,
        score: categoryScore,
        issueCount: this.issues.length
      }, 'Performance analysis completed');

      return result;
    } catch (err) {
      logger.error({ err, auditId: this.auditId }, 'Performance analysis failed');

      // Return fallback on error
      return this.getFallbackAnalysis();
    }
  }

  /**
   * Run PageSpeed Insights test
   * @param {string} url - Page URL
   * @param {string} strategy - 'mobile' or 'desktop'
   */
  async runPageSpeedTest(url, strategy = 'mobile') {
    try {
      const PAGESPEED_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

      logger.debug({
        auditId: this.auditId,
        url,
        strategy
      }, 'Running PageSpeed test');

      const response = await axios.get(PAGESPEED_URL, {
        params: {
          url,
          strategy,
          key: this.apiKey,
          category: ['performance', 'seo']
        },
        timeout: 60000 // 60 seconds timeout
      });

      return response.data;
    } catch (err) {
      logger.error({
        err: err.message,
        auditId: this.auditId,
        url,
        strategy
      }, 'PageSpeed test failed');

      // Return null on error
      return null;
    }
  }

  /**
   * Process PageSpeed results
   */
  processPageSpeedResults(mobileResults, desktopResults) {
    // Extract scores
    const mobileScore = mobileResults?.lighthouseResult?.categories?.performance?.score
      ? Math.round(mobileResults.lighthouseResult.categories.performance.score * 100)
      : null;

    const desktopScore = desktopResults?.lighthouseResult?.categories?.performance?.score
      ? Math.round(desktopResults.lighthouseResult.categories.performance.score * 100)
      : null;

    const seoScore = mobileResults?.lighthouseResult?.categories?.seo?.score
      ? Math.round(mobileResults.lighthouseResult.categories.seo.score * 100)
      : null;

    // Extract Core Web Vitals (mobile)
    const mobileAudits = mobileResults?.lighthouseResult?.audits || {};

    const lcp = this.extractMetric(mobileAudits['largest-contentful-paint']);
    const fid = this.extractMetric(mobileAudits['max-potential-fid']);
    const cls = this.extractMetric(mobileAudits['cumulative-layout-shift']);
    const fcp = this.extractMetric(mobileAudits['first-contentful-paint']);
    const tti = this.extractMetric(mobileAudits['interactive']);
    const speedIndex = this.extractMetric(mobileAudits['speed-index']);

    this.checks.pageSpeed = {
      mobile: {
        score: mobileScore,
        lcp,
        fid,
        cls,
        fcp,
        tti,
        speedIndex
      },
      desktop: {
        score: desktopScore
      },
      seoScore,
      status: (mobileScore && mobileScore >= 50) ? 'pass' : 'fail'
    };

    // Add issues based on scores
    if (mobileScore !== null && mobileScore < 50) {
      this.issues.push({
        type: 'poor_mobile_performance',
        severity: 'critical',
        title: 'Poor Mobile Performance',
        description: `Mobile performance score is ${mobileScore}/100. This significantly impacts user experience and SEO.`,
        recommendation: 'Optimize images, minify resources, enable compression, and reduce server response time.',
        affectedPages: 1,
        evidence: [{
          url: homepage.url,
          detail: `PageSpeed Mobile Score: ${mobileScore}/100`
        }]
      });
    } else if (mobileScore !== null && mobileScore < 90) {
      this.issues.push({
        type: 'mobile_performance_needs_improvement',
        severity: mobileScore < 70 ? 'high' : 'medium',
        title: 'Mobile Performance Needs Improvement',
        description: `Mobile performance score is ${mobileScore}/100. There's room for optimization.`,
        recommendation: 'Review PageSpeed Insights recommendations and implement high-impact optimizations.',
        affectedPages: 1,
        evidence: [{
          url: homepage.url,
          detail: `PageSpeed Mobile Score: ${mobileScore}/100`
        }]
      });
    }

    if (desktopScore !== null && desktopScore < 80) {
      this.issues.push({
        type: 'desktop_performance_issues',
        severity: desktopScore < 50 ? 'high' : 'medium',
        title: 'Desktop Performance Issues',
        description: `Desktop performance score is ${desktopScore}/100.`,
        recommendation: 'Optimize for desktop performance: leverage browser caching, optimize CSS/JS delivery.',
        affectedPages: 1
      });
    }

    // Core Web Vitals issues
    if (lcp && lcp.value > 2500) {
      this.issues.push({
        type: 'poor_lcp',
        severity: lcp.value > 4000 ? 'high' : 'medium',
        title: 'Slow Largest Contentful Paint (LCP)',
        description: `LCP is ${lcp.displayValue}. Good LCP is under 2.5 seconds.`,
        recommendation: 'Optimize server response times, resource load times, and client-side rendering.',
        affectedPages: 1
      });
    }

    if (cls && cls.value > 0.1) {
      this.issues.push({
        type: 'high_cls',
        severity: cls.value > 0.25 ? 'high' : 'medium',
        title: 'High Cumulative Layout Shift (CLS)',
        description: `CLS is ${cls.displayValue}. Good CLS is under 0.1.`,
        recommendation: 'Add size attributes to images/videos, avoid inserting content above existing content.',
        affectedPages: 1
      });
    }

    if (fcp && fcp.value > 1800) {
      this.issues.push({
        type: 'slow_fcp',
        severity: 'medium',
        title: 'Slow First Contentful Paint (FCP)',
        description: `FCP is ${fcp.displayValue}. Good FCP is under 1.8 seconds.`,
        recommendation: 'Eliminate render-blocking resources, minify CSS, and optimize fonts.',
        affectedPages: 1
      });
    }

    // Check for specific opportunities from PageSpeed
    this.extractOpportunities(mobileAudits);

    logger.debug({
      auditId: this.auditId,
      mobileScore,
      desktopScore,
      lcp: lcp?.displayValue,
      cls: cls?.displayValue
    }, 'PageSpeed results processed');
  }

  /**
   * Extract metric from PageSpeed audit
   */
  extractMetric(audit) {
    if (!audit) return null;

    return {
      value: audit.numericValue || 0,
      displayValue: audit.displayValue || 'N/A',
      score: audit.score !== null ? Math.round(audit.score * 100) : null
    };
  }

  /**
   * Extract opportunities from PageSpeed audits
   */
  extractOpportunities(audits) {
    const opportunities = [];

    // Check for unused CSS
    if (audits['unused-css-rules']?.details?.overallSavingsMs > 500) {
      opportunities.push({
        type: 'unused_css',
        title: 'Remove Unused CSS',
        savingsMs: audits['unused-css-rules'].details.overallSavingsMs
      });
    }

    // Check for unoptimized images
    if (audits['uses-optimized-images']?.details?.overallSavingsBytes > 100000) {
      opportunities.push({
        type: 'unoptimized_images',
        title: 'Optimize Images',
        savingsKb: Math.round(audits['uses-optimized-images'].details.overallSavingsBytes / 1024)
      });
    }

    // Check for WebP
    if (audits['uses-webp-images']?.score < 1) {
      opportunities.push({
        type: 'use_webp',
        title: 'Serve Images in Next-Gen Formats (WebP)',
        savingsKb: Math.round((audits['uses-webp-images']?.details?.overallSavingsBytes || 0) / 1024)
      });
    }

    // Check for text compression
    if (audits['uses-text-compression']?.score < 1) {
      opportunities.push({
        type: 'enable_compression',
        title: 'Enable Text Compression (GZIP/Brotli)',
        savingsKb: Math.round((audits['uses-text-compression']?.details?.overallSavingsBytes || 0) / 1024)
      });
    }

    this.checks.opportunities = opportunities;

    // Add issues for major opportunities
    for (const opp of opportunities) {
      if (opp.savingsKb > 500 || opp.savingsMs > 1000) {
        this.issues.push({
          type: opp.type,
          severity: 'medium',
          title: opp.title,
          description: `Potential savings: ${opp.savingsKb ? opp.savingsKb + ' KB' : opp.savingsMs + ' ms'}`,
          recommendation: 'Implement this optimization for improved performance.',
          affectedPages: 1
        });
      }
    }
  }

  /**
   * Calculate load-time based performance estimation
   * Always called as fallback, even when PageSpeed API is available
   */
  calculateLoadTimeEstimation() {
    // Analyze based on load times from crawler
    let avgLoadTime = 0;
    let totalLoadTime = 0;
    let pagesWithLoadTime = 0;

    for (const page of this.pages) {
      if (page.loadTime) {
        totalLoadTime += page.loadTime;
        pagesWithLoadTime++;
      }
    }

    avgLoadTime = pagesWithLoadTime > 0
      ? Math.round(totalLoadTime / pagesWithLoadTime)
      : 0;

    this.checks.loadTimes = {
      avgLoadTime,
      pagesAnalyzed: pagesWithLoadTime,
      status: avgLoadTime < 2000 ? 'pass' : 'fail'
    };

    // Estimate score based on HTTP response time only (not full browser render).
    // loadTime measures TTFB+transfer — real LCP is typically 3-10x higher.
    // Cap at 65 so we never report an inflated score without real PageSpeed data.
    let estimatedScore = 45; // Start conservative
    if (avgLoadTime < 800) estimatedScore += 15;
    if (avgLoadTime < 400) estimatedScore += 5;
    if (avgLoadTime > 2000) estimatedScore -= 10;
    if (avgLoadTime > 3000) estimatedScore -= 10;
    if (avgLoadTime > 5000) estimatedScore -= 10;

    this.checks.estimatedScore = Math.max(0, Math.min(65, estimatedScore));

    logger.debug({
      auditId: this.auditId,
      avgLoadTime,
      estimatedScore: this.checks.estimatedScore
    }, 'Load-time estimation calculated');
  }

  /**
   * Get fallback analysis when API is not available
   */
  getFallbackAnalysis() {
    logger.info({ auditId: this.auditId }, 'Using fallback performance analysis');

    const avgLoadTime = this.checks.loadTimes?.avgLoadTime || 0;
    const pagesWithLoadTime = this.checks.loadTimes?.pagesAnalyzed || 0;
    const estimatedScore = this.checks.estimatedScore || 45;

    if (avgLoadTime > 3000) {
      this.issues.push({
        type: 'slow_load_times',
        severity: 'high',
        title: 'Slow Page Load Times',
        description: `Average page load time is ${avgLoadTime}ms. Target is under 3000ms.`,
        recommendation: 'Optimize server response times, enable caching, compress resources, and optimize images.',
        affectedPages: pagesWithLoadTime,
        evidence: [{
          url: null,
          detail: `Average load time: ${avgLoadTime}ms across ${pagesWithLoadTime} pages`
        }]
      });
    }

    this.issues.push({
      type: 'api_key_missing',
      severity: 'low',
      title: 'PageSpeed API Not Configured',
      description: 'Google PageSpeed Insights API key not configured. Using fallback analysis.',
      recommendation: 'Add GOOGLE_PAGESPEED_API_KEY to .env for detailed performance metrics.',
      affectedPages: 0,
      evidence: [{
        url: null,
        detail: 'Set GOOGLE_PAGESPEED_API_KEY environment variable'
      }]
    });

    // estimatedScore is already capped at 65 in calculateLoadTimeEstimation()
    const finalScore = Math.max(20, estimatedScore);

    return {
      category: 'PERFORMANCE',
      categoryScore: finalScore,
      weight: 0.10,
      rating: this.getRating(finalScore),
      issues: this.issues,
      issueCount: this.issues.length,
      criticalCount: this.issues.filter(i => i.severity === 'critical').length,
      highCount: this.issues.filter(i => i.severity === 'high').length,
      mediumCount: this.issues.filter(i => i.severity === 'medium').length,
      lowCount: this.issues.filter(i => i.severity === 'low').length,
      checks: {
        ...this.checks,
        measurementMethod: 'fallback',
        confidence: 'estimated'
      }
    };
  }

  /**
   * Calculate Performance score
   * Uses PageSpeed scores if available and valid, otherwise falls back to load-time estimation
   */
  calculateScore() {
    // If we have PageSpeed scores, use those
    if (this.checks.pageSpeed) {
      const mobileScore = this.checks.pageSpeed.mobile?.score;
      const desktopScore = this.checks.pageSpeed.desktop?.score;

      // Only use PageSpeed scores if we have valid data (not null/undefined)
      // If both are missing or 0, fall back to load-time estimation
      if (mobileScore !== null && mobileScore !== undefined && mobileScore > 0) {
        // Use desktop score if available, otherwise use mobile score for both
        const effectiveDesktop = (desktopScore !== null && desktopScore !== undefined)
          ? desktopScore
          : mobileScore;

        // Weight mobile more heavily (70/30)
        const weightedScore = (mobileScore * 0.7) + (effectiveDesktop * 0.3);

        logger.debug({
          auditId: this.auditId,
          mobileScore,
          desktopScore: effectiveDesktop,
          weightedScore: Math.round(weightedScore)
        }, 'Using PageSpeed scores');

        return Math.round(weightedScore);
      } else {
        // PageSpeed API returned but scores are null/0 - fall back to load-time
        logger.warn({
          auditId: this.auditId,
          mobileScore,
          desktopScore
        }, 'PageSpeed scores invalid, falling back to load-time estimation');
      }
    }

    // Fall back to load-time estimation (capped at 65 — TTFB only, not real render time)
    const estimatedScore = this.checks.estimatedScore || 45;
    const finalScore = Math.max(20, estimatedScore);

    logger.debug({
      auditId: this.auditId,
      estimatedScore,
      finalScore
    }, 'Using load-time estimation for performance score');

    return finalScore;
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

export default PerformanceAnalyzer;
