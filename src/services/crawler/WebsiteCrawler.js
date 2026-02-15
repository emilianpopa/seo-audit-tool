import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { isSameDomain, resolveUrl, extractPath } from '../../utils/urlUtils.js';
import logger from '../../config/logger.js';

class WebsiteCrawler {
  constructor(options = {}) {
    this.maxPages = options.maxPages || 50;
    this.maxDepth = options.maxDepth || 3;
    this.delay = options.delay || 500; // ms between requests
    this.timeout = options.timeout || 10000; // request timeout
    this.userAgent = options.userAgent || 'SEO-Audit-Bot/1.0';

    // Tracking
    this.visited = new Set();
    this.queue = [];
    this.results = [];
  }

  /**
   * Crawl website starting from startUrl
   * @param {string} startUrl - Starting URL
   * @returns {Promise<Array>} Array of crawled pages
   */
  async crawl(startUrl) {
    logger.info({ url: startUrl, maxPages: this.maxPages }, 'Starting crawl');

    this.visited.clear();
    this.queue = [{ url: startUrl, depth: 0 }];
    this.results = [];

    while (this.queue.length > 0 && this.visited.size < this.maxPages) {
      const { url, depth } = this.queue.shift();

      // Skip if already visited
      if (this.visited.has(url)) {
        continue;
      }

      // Skip if max depth exceeded
      if (depth > this.maxDepth) {
        continue;
      }

      // Fetch and parse page
      try {
        const pageData = await this.fetchPage(url);
        pageData.depth = depth;

        this.visited.add(url);
        this.results.push(pageData);

        // Extract and queue links (only if not at max depth)
        if (depth < this.maxDepth && this.visited.size < this.maxPages) {
          const links = this.extractLinks(pageData.html, url, startUrl);
          for (const link of links) {
            if (!this.visited.has(link) && this.queue.length + this.visited.size < this.maxPages) {
              this.queue.push({ url: link, depth: depth + 1 });
            }
          }
        }

        // Rate limiting - delay between requests
        if (this.delay > 0) {
          await this.sleep(this.delay);
        }

        logger.debug({
          url,
          depth,
          statusCode: pageData.statusCode,
          visited: this.visited.size,
          queued: this.queue.length
        }, 'Page crawled');
      } catch (err) {
        logger.warn({ url, err: err.message }, 'Failed to crawl page');

        // Still add to results with error
        this.visited.add(url);
        this.results.push({
          url,
          depth,
          statusCode: 0,
          error: err.message
        });
      }
    }

    logger.info({
      startUrl,
      pagesCrawled: this.results.length,
      pagesSkipped: this.queue.length
    }, 'Crawl completed');

    return this.results;
  }

  /**
   * Fetch and parse a single page
   * @param {string} url - Page URL
   * @returns {Promise<Object>} Page data
   */
  async fetchPage(url) {
    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // Accept client errors
      });

      const loadTime = Date.now() - startTime;
      const html = response.data;
      const $ = cheerio.load(html);

      // Extract metadata
      const metadata = this.extractMetadata($, url);

      return {
        url,
        path: extractPath(url),
        statusCode: response.status,
        loadTime,
        size: Buffer.byteLength(html, 'utf8'),
        html,
        ...metadata
      };
    } catch (err) {
      logger.error({ url, err: err.message }, 'Failed to fetch page');
      throw err;
    }
  }

  /**
   * Extract metadata from parsed HTML
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} url - Page URL
   * @returns {Object} Metadata
   */
  extractMetadata($, url) {
    // Title
    const title = $('title').first().text().trim();
    const titleLength = title.length;

    // Meta description
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';
    const metaLength = metaDescription.length;

    // Headings
    const h1Tags = [];
    $('h1').each((i, el) => {
      h1Tags.push($(el).text().trim());
    });

    const h2Tags = [];
    $('h2').each((i, el) => {
      h2Tags.push($(el).text().trim());
    });

    const h3Tags = [];
    $('h3').each((i, el) => {
      h3Tags.push($(el).text().trim());
    });

    // Canonical
    const canonical = $('link[rel="canonical"]').attr('href') || '';

    // Robots meta
    const robotsMeta = $('meta[name="robots"]').attr('content') || '';

    // Schema.org structured data
    const schemaScripts = [];
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const jsonData = JSON.parse($(el).html());
        schemaScripts.push(jsonData);
      } catch (e) {
        // Invalid JSON, skip
      }
    });

    const hasSchema = schemaScripts.length > 0;
    const schemaTypes = schemaScripts.map(s => s['@type']).filter(Boolean);

    // Open Graph tags
    const openGraphTags = {};
    $('meta[property^="og:"]').each((i, el) => {
      const property = $(el).attr('property');
      const content = $(el).attr('content');
      if (property && content) {
        openGraphTags[property] = content;
      }
    });

    // Twitter Card tags
    const twitterTags = {};
    $('meta[name^="twitter:"]').each((i, el) => {
      const name = $(el).attr('name');
      const content = $(el).attr('content');
      if (name && content) {
        twitterTags[name] = content;
      }
    });

    // Word count (body text only)
    const bodyText = $('body').text();
    const wordCount = bodyText.split(/\s+/).filter(word => word.length > 0).length;

    // Image count
    const imageCount = $('img').length;

    // Link count
    const linkCount = $('a').length;

    return {
      title,
      titleLength,
      metaDescription,
      metaLength,
      h1Tags,
      h2Tags,
      h3Tags,
      canonical,
      robotsMeta,
      hasSchema,
      schemaTypes,
      openGraphTags: Object.keys(openGraphTags).length > 0 ? openGraphTags : null,
      twitterTags: Object.keys(twitterTags).length > 0 ? twitterTags : null,
      wordCount,
      imageCount,
      linkCount
    };
  }

  /**
   * Extract links from page
   * @param {string} html - Page HTML
   * @param {string} baseUrl - Base URL for resolving relative links
   * @param {string} startUrl - Original starting URL (to enforce same-domain)
   * @returns {Array<string>} Array of absolute URLs
   */
  extractLinks(html, baseUrl, startUrl) {
    const $ = cheerio.load(html);
    const links = [];

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      // Skip anchors, mailto, tel, javascript
      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        return;
      }

      try {
        // Resolve relative URLs
        const absoluteUrl = resolveUrl(baseUrl, href);

        // Only include same-domain links
        if (isSameDomain(absoluteUrl, startUrl)) {
          // Remove hash
          const url = new URL(absoluteUrl);
          url.hash = '';

          links.push(url.toString());
        }
      } catch (err) {
        // Invalid URL, skip
      }
    });

    // Deduplicate
    return [...new Set(links)];
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default WebsiteCrawler;
