/**
 * CMS Detector
 *
 * Detects the content management system powering a website by examining:
 *  - HTTP response headers (Server, X-Powered-By, X-Generator, etc.)
 *  - HTML source patterns (class names, data attributes, comments, generator meta)
 *  - Cookie names
 *
 * Returns a structured detection result with confidence level and,
 * for WordPress, the likely REST API base URL.
 */

const CMS_SIGNALS = {
  wordpress: {
    name: 'WordPress',
    signals: [
      // Header signals
      { type: 'header', key: 'x-powered-by', pattern: /wordpress/i, weight: 10 },
      { type: 'header', key: 'link', pattern: /rel="https:\/\/api\.w\.org\//i, weight: 10 },
      // Meta tag signals
      { type: 'html', pattern: /<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*wordpress/i, weight: 10 },
      // HTML class / path signals
      { type: 'html', pattern: /\/wp-content\//i, weight: 8 },
      { type: 'html', pattern: /\/wp-includes\//i, weight: 8 },
      { type: 'html', pattern: /\/wp-json\//i, weight: 8 },
      { type: 'html', pattern: /class=["'][^"']*wp-[a-z]/i, weight: 4 },
      { type: 'html', pattern: /<!--\s*This site is optimized with the Yoast/i, weight: 6 },
      { type: 'html', pattern: /<!-- This site uses the Google Analytics/i, weight: 2 },
      // Cookie signals
      { type: 'cookie', pattern: /wordpress_/i, weight: 10 },
      { type: 'cookie', pattern: /wp-settings/i, weight: 8 }
    ],
    maxScore: 60
  },

  webflow: {
    name: 'Webflow',
    signals: [
      { type: 'header', key: 'x-wf-site', pattern: /.+/, weight: 10 },
      { type: 'html', pattern: /data-wf-site=/i, weight: 10 },
      { type: 'html', pattern: /webflow\.com\/css\//i, weight: 8 },
      { type: 'html', pattern: /webflow\.js/i, weight: 8 },
      { type: 'html', pattern: /<meta[^>]+generator[^>]+Webflow/i, weight: 10 }
    ],
    maxScore: 30
  },

  shopify: {
    name: 'Shopify',
    signals: [
      { type: 'header', key: 'x-shopify-stage', pattern: /.+/, weight: 10 },
      { type: 'html', pattern: /cdn\.shopify\.com/i, weight: 10 },
      { type: 'html', pattern: /Shopify\.theme/i, weight: 10 },
      { type: 'html', pattern: /myshopify\.com/i, weight: 8 },
      { type: 'cookie', pattern: /shopify_/i, weight: 6 }
    ],
    maxScore: 30
  },

  squarespace: {
    name: 'Squarespace',
    signals: [
      { type: 'html', pattern: /static\d*\.squarespace\.com/i, weight: 10 },
      { type: 'html', pattern: /data-squarespace-/i, weight: 10 },
      { type: 'html', pattern: /\/squarespace-assets\//i, weight: 8 },
      { type: 'header', key: 'server', pattern: /Squarespace/i, weight: 10 }
    ],
    maxScore: 30
  },

  wix: {
    name: 'Wix',
    signals: [
      { type: 'html', pattern: /static\.wixstatic\.com/i, weight: 10 },
      { type: 'html', pattern: /wix-code-/i, weight: 8 },
      { type: 'html', pattern: /<meta[^>]+generator[^>]+Wix\.com/i, weight: 10 },
      { type: 'header', key: 'x-wix-request-id', pattern: /.+/, weight: 10 }
    ],
    maxScore: 30
  },

  hubspot: {
    name: 'HubSpot',
    signals: [
      { type: 'html', pattern: /hs-scripts\.com/i, weight: 10 },
      { type: 'html', pattern: /hubspot\.com\/\/hs-script-loader/i, weight: 10 },
      { type: 'html', pattern: /data-hs-/i, weight: 6 },
      { type: 'cookie', pattern: /hubspotutk/i, weight: 8 }
    ],
    maxScore: 28
  }
};

class CMSDetector {
  /**
   * Detect CMS from the homepage fetch data.
   *
   * @param {Object} options
   * @param {Object} options.headers - Response headers (lowercased keys)
   * @param {string} options.html    - Raw HTML of the page
   * @param {string} options.cookies - Raw Set-Cookie header string (optional)
   * @returns {{platform: string|null, confidence: string, confidencePct: number, apiUrl: string|null, rawSignals: Object}}
   */
  static detect({ headers = {}, html = '', cookies = '' } = {}) {
    const scores = {};
    const matchedSignals = {};

    for (const [cmsKey, cms] of Object.entries(CMS_SIGNALS)) {
      let score = 0;
      matchedSignals[cmsKey] = [];

      for (const signal of cms.signals) {
        let matched = false;

        if (signal.type === 'header') {
          const headerVal = headers[signal.key] || '';
          if (signal.pattern.test(headerVal)) {
            matched = true;
          }
        } else if (signal.type === 'html') {
          if (signal.pattern.test(html)) {
            matched = true;
          }
        } else if (signal.type === 'cookie') {
          if (signal.pattern.test(cookies)) {
            matched = true;
          }
        }

        if (matched) {
          score += signal.weight;
          matchedSignals[cmsKey].push({ type: signal.type, weight: signal.weight });
        }
      }

      scores[cmsKey] = score;
    }

    // Find the CMS with the highest score
    let bestCms = null;
    let bestScore = 0;

    for (const [cmsKey, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestCms = cmsKey;
      }
    }

    // Minimum score threshold to claim a detection
    if (bestScore < 8) {
      return {
        platform: null,
        confidence: 'none',
        confidencePct: 0,
        apiUrl: null,
        rawSignals: matchedSignals
      };
    }

    const cms = CMS_SIGNALS[bestCms];
    const confidencePct = Math.min(100, Math.round((bestScore / cms.maxScore) * 100));

    let confidence;
    if (confidencePct >= 70) confidence = 'high';
    else if (confidencePct >= 40) confidence = 'medium';
    else confidence = 'low';

    // Build WordPress REST API URL if detected
    let apiUrl = null;
    if (bestCms === 'wordpress') {
      // Try to extract base URL from Link header or html
      const linkHeader = headers['link'] || '';
      const apiMatch = linkHeader.match(/^<(https?:\/\/[^>]+)\/wp\/v2/);
      if (apiMatch) {
        apiUrl = apiMatch[1] + '/wp-json';
      }
      // Fallback: extract domain from html wp-content URL
      if (!apiUrl) {
        const domainMatch = html.match(/https?:\/\/([^/]+)\/wp-content\//);
        if (domainMatch) {
          apiUrl = `https://${domainMatch[1]}/wp-json`;
        }
      }
    }

    return {
      platform: cms.name,
      platformKey: bestCms,
      confidence,
      confidencePct,
      apiUrl,
      rawSignals: matchedSignals[bestCms] || []
    };
  }
}

export default CMSDetector;
