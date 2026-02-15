import { URL } from 'url';
import validator from 'validator';

/**
 * Validate if string is a valid URL
 * @param {string} urlString - URL to validate
 * @returns {boolean} True if valid
 */
export function isValidUrl(urlString) {
  try {
    if (!urlString || typeof urlString !== 'string') {
      return false;
    }

    // Basic validator check
    if (!validator.isURL(urlString, {
      protocols: ['http', 'https'],
      require_protocol: true
    })) {
      return false;
    }

    // Additional checks
    const url = new URL(urlString);

    // Reject localhost and private IPs (security)
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.')
    ) {
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Normalize URL (remove trailing slash, normalize protocol, etc.)
 * @param {string} urlString - URL to normalize
 * @returns {string} Normalized URL
 */
export function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);

    // Always use https if no protocol specified
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }

    // Remove trailing slash from pathname
    if (url.pathname.endsWith('/') && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // Sort query parameters
    url.searchParams.sort();

    // Remove hash
    url.hash = '';

    return url.toString();
  } catch (err) {
    return urlString;
  }
}

/**
 * Extract domain from URL
 * @param {string} urlString - URL
 * @returns {string} Domain
 */
export function extractDomain(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch (err) {
    return '';
  }
}

/**
 * Resolve relative URL to absolute
 * @param {string} baseUrl - Base URL
 * @param {string} relativeUrl - Relative URL
 * @returns {string} Absolute URL
 */
export function resolveUrl(baseUrl, relativeUrl) {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch (err) {
    return relativeUrl;
  }
}

/**
 * Check if URL belongs to same domain
 * @param {string} url1 - First URL
 * @param {string} url2 - Second URL
 * @returns {boolean} True if same domain
 */
export function isSameDomain(url1, url2) {
  try {
    const domain1 = new URL(url1).hostname;
    const domain2 = new URL(url2).hostname;
    return domain1 === domain2;
  } catch (err) {
    return false;
  }
}

/**
 * Extract path from URL (without domain)
 * @param {string} urlString - URL
 * @returns {string} Path
 */
export function extractPath(urlString) {
  try {
    const url = new URL(urlString);
    return url.pathname + url.search;
  } catch (err) {
    return '/';
  }
}

/**
 * Build sitemap URL from domain
 * @param {string} domain - Domain or base URL
 * @returns {string} Sitemap URL
 */
export function buildSitemapUrl(domain) {
  try {
    const url = new URL(domain);
    url.pathname = '/sitemap.xml';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (err) {
    return '';
  }
}

/**
 * Build robots.txt URL from domain
 * @param {string} domain - Domain or base URL
 * @returns {string} Robots.txt URL
 */
export function buildRobotsTxtUrl(domain) {
  try {
    const url = new URL(domain);
    url.pathname = '/robots.txt';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (err) {
    return '';
  }
}
