/**
 * WordPress Integration Service
 *
 * Provides methods to read and update SEO metadata on WordPress pages/posts
 * via the WordPress REST API, with support for:
 *  - Yoast SEO (_yoast_wpseo_title, _yoast_wpseo_metadesc)
 *  - RankMath (rank_math_title, rank_math_description)
 *  - Native WordPress post fields (post_title for H1 equivalent)
 *
 * Authentication: WordPress Application Passwords (base64 user:password)
 */
import axios from 'axios';
import { decrypt } from '../../utils/encryption.js';
import logger from '../../config/logger.js';

class WordPressService {
  /**
   * @param {Object} integration - Integration record from DB
   * @param {string} integration.apiUrl   - e.g. "https://example.com/wp-json"
   * @param {string} integration.username - WordPress username
   * @param {string} integration.encryptedCreds - Encrypted application password
   * @param {string} [integration.seoPluginType] - 'yoast' | 'rankmath' | 'none'
   */
  constructor(integration) {
    this.apiUrl = integration.apiUrl.replace(/\/$/, '');
    this.username = integration.username;
    this.seoPlugin = integration.seoPluginType || 'none';

    // Decrypt credentials
    const password = decrypt(integration.encryptedCreds);
    const token = Buffer.from(`${this.username}:${password}`).toString('base64');

    this.client = axios.create({
      baseURL: this.apiUrl + '/wp/v2',
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
  }

  /**
   * Test connection by fetching current user info.
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
   */
  async testConnection() {
    try {
      const res = await this.client.get('/users/me');
      return { success: true, user: { id: res.data.id, name: res.data.name } };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.message || err.message
      };
    }
  }

  /**
   * Detect which SEO plugin is active.
   * Returns 'yoast', 'rankmath', or 'none'.
   * Requires manage_options capability (admin user).
   */
  async detectSEOPlugin() {
    try {
      const res = await this.client.get(`${this.apiUrl}/wp-json/wp/v2/plugins`, {
        params: { status: 'active', per_page: 50 }
      });
      const plugins = res.data || [];
      const pluginSlugs = plugins.map(p => (p.plugin || '').toLowerCase());

      if (pluginSlugs.some(s => s.includes('wordpress-seo'))) return 'yoast';
      if (pluginSlugs.some(s => s.includes('seo-by-rank-math'))) return 'rankmath';
      return 'none';
    } catch {
      // Plugin list requires admin — fall back to detection by meta field
      return this.seoPlugin || 'none';
    }
  }

  /**
   * Find a WordPress post or page by its URL path.
   * Tries pages first, then posts.
   *
   * @param {string} urlPath - e.g. "/about" or "/blog/my-post"
   * @returns {Promise<{id: number, type: 'page'|'post', title: string}|null>}
   */
  async findByPath(urlPath) {
    const slug = urlPath.replace(/^\//, '').replace(/\/$/, '') || '';

    // Try pages
    try {
      const res = await this.client.get('/pages', {
        params: { slug, _fields: 'id,slug,title,link', per_page: 5 }
      });
      if (res.data.length > 0) {
        const page = res.data[0];
        return { id: page.id, type: 'page', title: page.title?.rendered || '' };
      }
    } catch (err) {
      logger.warn({ slug, err: err.message }, 'WP pages lookup failed');
    }

    // Try posts
    try {
      const res = await this.client.get('/posts', {
        params: { slug, _fields: 'id,slug,title,link', per_page: 5 }
      });
      if (res.data.length > 0) {
        const post = res.data[0];
        return { id: post.id, type: 'post', title: post.title?.rendered || '' };
      }
    } catch (err) {
      logger.warn({ slug, err: err.message }, 'WP posts lookup failed');
    }

    return null;
  }

  /**
   * Update the SEO title for a page/post.
   * Sets both the Yoast/RankMath meta title and the native post title
   * (native title is used as the H1 in most themes).
   *
   * @param {string} postType - 'page' | 'post'
   * @param {number} postId
   * @param {string} newTitle - The new SEO title (50–60 chars)
   * @returns {Promise<{success: boolean, updated?: Object, error?: string}>}
   */
  async updateTitle(postType, postId, newTitle) {
    const endpoint = `/${postType}s/${postId}`;
    const meta = {};

    if (this.seoPlugin === 'yoast') {
      meta._yoast_wpseo_title = newTitle;
    } else if (this.seoPlugin === 'rankmath') {
      meta.rank_math_title = newTitle;
    }

    try {
      const res = await this.client.post(endpoint, {
        title: newTitle,  // Updates the native <title> / H1 in most themes
        meta
      });
      return {
        success: true,
        updated: { id: res.data.id, title: res.data.title?.rendered }
      };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.message || err.message
      };
    }
  }

  /**
   * Update the SEO meta description for a page/post.
   *
   * @param {string} postType - 'page' | 'post'
   * @param {number} postId
   * @param {string} newDescription - The new meta description (130–155 chars)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateMetaDescription(postType, postId, newDescription) {
    const endpoint = `/${postType}s/${postId}`;
    const meta = {};

    if (this.seoPlugin === 'yoast') {
      meta._yoast_wpseo_metadesc = newDescription;
    } else if (this.seoPlugin === 'rankmath') {
      meta.rank_math_description = newDescription;
    } else {
      // No SEO plugin — can't set meta description via REST API
      return {
        success: false,
        error: 'No supported SEO plugin detected. Install Yoast SEO or RankMath to enable meta description editing.'
      };
    }

    try {
      const res = await this.client.post(endpoint, { meta });
      return { success: true, updated: { id: res.data.id } };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.message || err.message
      };
    }
  }

  /**
   * Bulk apply fixes from an array of fix instructions.
   * Each fix: { pageUrl, field, newValue }
   *
   * @param {string} domain - The site domain for resolving paths
   * @param {Array<{pageUrl: string, field: string, newValue: string}>} fixes
   * @returns {Promise<Array<{pageUrl, field, success, error?}>>}
   */
  async bulkApplyFixes(domain, fixes) {
    const results = [];

    for (const fix of fixes.slice(0, 50)) { // Hard cap at 50 per request
      try {
        const urlPath = fix.pageUrl.replace(/^https?:\/\/[^/]+/, '');
        const post = await this.findByPath(urlPath);

        if (!post) {
          results.push({ pageUrl: fix.pageUrl, field: fix.field, success: false, error: 'Page not found in WordPress' });
          continue;
        }

        let result;
        if (fix.field === 'title') {
          result = await this.updateTitle(post.type, post.id, fix.newValue);
        } else if (fix.field === 'metaDescription') {
          result = await this.updateMetaDescription(post.type, post.id, fix.newValue);
        } else {
          result = { success: false, error: `Unknown field: ${fix.field}` };
        }

        results.push({ pageUrl: fix.pageUrl, field: fix.field, ...result });

        // Polite delay between writes
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        results.push({ pageUrl: fix.pageUrl, field: fix.field, success: false, error: err.message });
      }
    }

    return results;
  }
}

export default WordPressService;
