import logger from '../../config/logger.js';

/**
 * Local SEO Analyzer
 *
 * Analyzes local SEO factors:
 * - NAP (Name, Address, Phone) consistency across pages
 * - Google Business Profile mentions
 * - LocalBusiness schema markup
 * - Location keywords in content
 * - Geographic targeting signals
 *
 * Weight: 10% of overall score
 */
class LocalSEOAnalyzer {
  constructor(auditId, domain, pages) {
    this.auditId = auditId;
    this.domain = domain;
    this.pages = pages;
    this.issues = [];
    this.checks = {};
  }

  /**
   * Run all local SEO checks
   * @returns {Promise<Object>} Analysis results
   */
  async analyze() {
    logger.info({ auditId: this.auditId }, 'Starting Local SEO analysis');

    try {
      // Run all checks
      this.checkLocalBusinessSchema();
      this.checkNAPConsistency();
      this.checkGoogleBusinessProfile();
      this.checkLocationKeywords();
      this.checkGeographicTargeting();

      // Calculate category score
      const categoryScore = this.calculateScore();

      const result = {
        category: 'LOCAL_SEO',
        categoryScore,
        weight: 0.10,
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
      }, 'Local SEO analysis completed');

      return result;
    } catch (err) {
      logger.error({ err, auditId: this.auditId }, 'Local SEO analysis failed');
      throw err;
    }
  }

  /**
   * Check for LocalBusiness schema markup
   */
  checkLocalBusinessSchema() {
    const pagesWithLocalSchema = [];
    let localBusinessSchemaFound = false;

    for (const page of this.pages) {
      const schemaTypes = page.schemaTypes || [];

      // Check for LocalBusiness or its subtypes
      const hasLocalBusiness = schemaTypes.some(type =>
        type === 'LocalBusiness' ||
        type === 'Restaurant' ||
        type === 'Store' ||
        type === 'Hotel' ||
        type === 'Dentist' ||
        type === 'Attorney' ||
        type === 'RealEstateAgent' ||
        type === 'AutoDealer'
      );

      if (hasLocalBusiness) {
        pagesWithLocalSchema.push({
          url: page.url,
          schemaTypes: schemaTypes.filter(t => t.includes('Business') || t.includes('Organization'))
        });
        localBusinessSchemaFound = true;
      }
    }

    this.checks.localBusinessSchema = {
      found: localBusinessSchemaFound,
      pagesWithSchema: pagesWithLocalSchema.length,
      examples: pagesWithLocalSchema.slice(0, 3),
      status: localBusinessSchemaFound ? 'pass' : 'warning'
    };

    if (!localBusinessSchemaFound) {
      this.issues.push({
        type: 'missing_local_business_schema',
        severity: 'high',
        title: 'Missing LocalBusiness Schema',
        description: 'No LocalBusiness schema markup found. This helps search engines understand your business location.',
        recommendation: 'Add LocalBusiness schema markup with name, address, phone, hours, and geo-coordinates to your homepage or contact page.',
        affectedPages: 0
      });
    }

    logger.debug({
      auditId: this.auditId,
      found: localBusinessSchemaFound,
      pagesWithSchema: pagesWithLocalSchema.length
    }, 'LocalBusiness schema checked');
  }

  /**
   * Check NAP (Name, Address, Phone) consistency
   */
  checkNAPConsistency() {
    const phoneNumbers = new Set();
    const addresses = new Set();
    const businessNames = new Set();

    const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const addressPattern = /\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|highway|hwy|square|sq|trail|trl|drive|dr|court|ct|parkway|pkwy|circle|cir|boulevard|blvd)/gi;

    let pagesWithPhone = 0;
    let pagesWithAddress = 0;

    for (const page of this.pages) {
      const html = page.html || '';

      // Extract phone numbers
      const phones = html.match(phonePattern);
      if (phones) {
        pagesWithPhone++;
        phones.forEach(phone => {
          // Normalize phone number
          const normalized = phone.replace(/\D/g, '');
          if (normalized.length >= 10) {
            phoneNumbers.add(normalized.slice(-10)); // Last 10 digits
          }
        });
      }

      // Extract addresses
      const addrs = html.match(addressPattern);
      if (addrs) {
        pagesWithAddress++;
        addrs.forEach(addr => addresses.add(addr.toLowerCase().trim()));
      }

      // Extract business name from Organization schema
      const schemaTypes = page.schemaTypes || [];
      if (schemaTypes.includes('Organization') || schemaTypes.includes('LocalBusiness')) {
        // Business name would be in schema - we'd need to parse JSON-LD to extract it
        // For now, use page title as proxy for homepage
        if (page.path === '/' && page.title) {
          businessNames.add(page.title);
        }
      }
    }

    const hasConsistentPhone = phoneNumbers.size <= 1;
    const hasConsistentAddress = addresses.size <= 2; // Allow slight variations
    const hasPhone = phoneNumbers.size > 0;
    const hasAddress = addresses.size > 0;

    this.checks.napConsistency = {
      hasPhone,
      hasAddress,
      phoneVariations: phoneNumbers.size,
      addressVariations: addresses.size,
      pagesWithPhone,
      pagesWithAddress,
      isConsistent: hasConsistentPhone && hasConsistentAddress,
      status: (hasPhone && hasAddress && hasConsistentPhone && hasConsistentAddress) ? 'pass' : 'warning'
    };

    // Add issues
    if (!hasPhone || !hasAddress) {
      this.issues.push({
        type: 'incomplete_nap',
        severity: 'high',
        title: 'Incomplete NAP Information',
        description: `Missing ${!hasPhone ? 'phone number' : ''} ${!hasPhone && !hasAddress ? 'and' : ''} ${!hasAddress ? 'address' : ''} on website.`,
        recommendation: 'Add complete business name, address, and phone number (NAP) to your website, especially on contact and footer sections.',
        affectedPages: 0
      });
    }

    if (!hasConsistentPhone && hasPhone) {
      this.issues.push({
        type: 'inconsistent_phone',
        severity: 'medium',
        title: 'Inconsistent Phone Numbers',
        description: `${phoneNumbers.size} different phone numbers found across pages. NAP must be consistent for local SEO.`,
        recommendation: 'Use the same phone number format consistently across all pages.',
        affectedPages: pagesWithPhone
      });
    }

    if (!hasConsistentAddress && hasAddress) {
      this.issues.push({
        type: 'inconsistent_address',
        severity: 'medium',
        title: 'Inconsistent Addresses',
        description: `${addresses.size} different address formats found. NAP must be consistent for local SEO.`,
        recommendation: 'Use the exact same address format across all pages and match it with your Google Business Profile.',
        affectedPages: pagesWithAddress
      });
    }

    logger.debug({
      auditId: this.auditId,
      hasPhone,
      hasAddress,
      phoneVariations: phoneNumbers.size,
      addressVariations: addresses.size
    }, 'NAP consistency checked');
  }

  /**
   * Check for Google Business Profile mentions
   */
  checkGoogleBusinessProfile() {
    let hasGoogleMapsEmbed = false;
    let hasGoogleBusinessLink = false;
    let hasReviewsLink = false;

    for (const page of this.pages) {
      const html = page.html || '';

      // Check for Google Maps embed
      if (html.includes('maps.google.com') || html.includes('google.com/maps')) {
        hasGoogleMapsEmbed = true;
      }

      // Check for Google Business link
      if (html.includes('business.google.com') || html.includes('google.com/business')) {
        hasGoogleBusinessLink = true;
      }

      // Check for review links
      if (html.includes('review') || html.includes('reviews')) {
        hasReviewsLink = true;
      }

      if (hasGoogleMapsEmbed && hasGoogleBusinessLink && hasReviewsLink) break;
    }

    this.checks.googleBusinessProfile = {
      hasGoogleMapsEmbed,
      hasGoogleBusinessLink,
      hasReviewsLink,
      status: hasGoogleMapsEmbed ? 'pass' : 'warning'
    };

    if (!hasGoogleMapsEmbed && this.detectBusinessType() !== 'saas') {
      this.issues.push({
        type: 'no_google_maps',
        severity: 'medium',
        title: 'No Google Maps Embed',
        description: 'No Google Maps embed or Google Business Profile link found. Even for digital businesses, a Google Business Profile helps you appear in Google\'s knowledge panel and local search results.',
        recommendation: 'Embed a Google Map of your business location on your contact or about page.',
        affectedPages: 0
      });
    }

    if (!hasReviewsLink) {
      this.issues.push({
        type: 'no_reviews_link',
        severity: 'low',
        title: 'No Reviews Section',
        description: 'No customer reviews section found. Reviews build trust and improve local SEO.',
        recommendation: 'Add a link to your Google Business reviews or display testimonials on your website.',
        affectedPages: 0
      });
    }

    logger.debug({
      auditId: this.auditId,
      hasGoogleMapsEmbed,
      hasReviewsLink
    }, 'Google Business Profile checked');
  }

  /**
   * Check for location keywords in content
   */
  checkLocationKeywords() {
    const locationKeywords = [
      'near me', 'local', 'city', 'town', 'state', 'zip', 'area',
      'neighborhood', 'downtown', 'location', 'directions', 'visit us'
    ];

    let pagesWithLocationKeywords = 0;
    const examplesFound = new Set();

    for (const page of this.pages) {
      const title = (page.title || '').toLowerCase();
      const metaDescription = (page.metaDescription || '').toLowerCase();
      const h1Tags = (page.h1Tags || []).map(h => h.toLowerCase());

      const allText = [title, metaDescription, ...h1Tags].join(' ');

      for (const keyword of locationKeywords) {
        if (allText.includes(keyword)) {
          pagesWithLocationKeywords++;
          examplesFound.add(keyword);
          break;
        }
      }
    }

    const percentageWithLocation = this.pages.length > 0
      ? Math.round((pagesWithLocationKeywords / this.pages.length) * 100)
      : 0;

    this.checks.locationKeywords = {
      pagesWithKeywords: pagesWithLocationKeywords,
      percentageWithLocation,
      keywordsFound: Array.from(examplesFound),
      status: percentageWithLocation >= 30 ? 'pass' : 'warning'
    };

    if (percentageWithLocation < 30 && this.detectBusinessType() !== 'saas') {
      this.issues.push({
        type: 'missing_location_keywords',
        severity: 'medium',
        title: 'Limited Location Keywords',
        description: `Only ${percentageWithLocation}% of pages include location keywords. Local businesses should emphasize their geographic area.`,
        recommendation: 'Include your city, state, or service area in titles, headings, and content. Example: "Best Pizza in [City Name]".',
        affectedPages: this.pages.length - pagesWithLocationKeywords
      });
    }

    logger.debug({
      auditId: this.auditId,
      percentageWithLocation,
      keywordsFound: Array.from(examplesFound)
    }, 'Location keywords checked');
  }

  /**
   * Check geographic targeting signals
   */
  checkGeographicTargeting() {
    const homepage = this.pages.find(p => p.path === '/') || this.pages[0];

    let hasGeoMeta = false;
    let hasLocationInTitle = false;

    if (homepage) {
      const html = homepage.html || '';
      const title = (homepage.title || '').toLowerCase();

      // Check for geo meta tags
      if (html.includes('geo.position') || html.includes('geo.placename') || html.includes('geo.region')) {
        hasGeoMeta = true;
      }

      // Check for location in title
      const locationPatterns = [
        /\b(new york|los angeles|chicago|houston|phoenix|san antonio|san diego|dallas|san jose|austin)\b/i,
        /\b[A-Z][a-z]+,\s*[A-Z]{2}\b/ // City, ST format
      ];

      for (const pattern of locationPatterns) {
        if (pattern.test(title)) {
          hasLocationInTitle = true;
          break;
        }
      }
    }

    this.checks.geographicTargeting = {
      hasGeoMeta,
      hasLocationInTitle,
      status: hasLocationInTitle ? 'pass' : 'info'
    };

    if (!hasLocationInTitle && this.detectBusinessType() !== 'saas') {
      this.issues.push({
        type: 'no_location_in_title',
        severity: 'low',
        title: 'No Geographic Location in Homepage Title',
        description: 'Homepage title doesn\'t include city or service area. This helps with local search.',
        recommendation: 'Include your city or service area in the homepage title tag. Example: "[Business Name] - [City, State]".',
        affectedPages: 1
      });
    }

    logger.debug({
      auditId: this.auditId,
      hasGeoMeta,
      hasLocationInTitle
    }, 'Geographic targeting checked');
  }

  /**
   * Detect whether the site is likely a SaaS/B2B/digital business
   * rather than a local brick-and-mortar business.
   * Returns 'saas', 'ecommerce', or 'local'
   */
  detectBusinessType() {
    const homepage = this.pages.find(p => p.path === '/' || p.path === '') || this.pages[0];
    if (!homepage) return 'local';

    const titleLower = (homepage.title || '').toLowerCase();
    const h1Lower = (homepage.h1Tags || []).join(' ').toLowerCase();
    const metaLower = (homepage.metaDescription || '').toLowerCase();
    const allText = `${titleLower} ${h1Lower} ${metaLower}`;

    const saasSignals = [
      'platform', 'software', 'saas', 'app', 'api', 'dashboard', 'subscription',
      'free trial', 'sign up', 'get started', 'sign in', 'log in', 'pricing',
      'workforce', 'upskill', 'elearning', 'e-learning', 'lms', 'crm', 'erp',
      'solution', 'enterprise', 'integration', 'automation', 'workflow', 'cloud'
    ];

    const localSignals = [
      'restaurant', 'salon', 'clinic', 'dentist', 'lawyer', 'attorney', 'plumber',
      'electrician', 'contractor', 'store', 'shop', 'cafe', 'hotel', 'gym',
      'near me', 'serving', 'located in', 'visit us'
    ];

    const saasScore = saasSignals.filter(s => allText.includes(s)).length;
    const localScore = localSignals.filter(s => allText.includes(s)).length;

    if (saasScore >= 2 && saasScore > localScore) return 'saas';
    if (localScore >= 2) return 'local';
    return 'local'; // default to local
  }

  /**
   * Calculate Local SEO score
   */
  calculateScore() {
    const businessType = this.detectBusinessType();

    // For SaaS/digital businesses, local NAP and location checks are less relevant
    // They should be scored on: schema presence, social proof/reviews, brand consistency
    const isSaaS = businessType === 'saas';

    const weights = isSaaS ? {
      // SaaS/B2B: emphasise schema and reviews over NAP/location
      localBusinessSchema: 15,  // Reduced (LocalBusiness schema is less critical for SaaS)
      napConsistency: 10,        // Much reduced (no physical address expected)
      googleBusinessProfile: 25, // Important even for SaaS — Google shows business in knowledge panel
      locationKeywords: 10,      // Less important
      geographicTargeting: 5,    // Largely irrelevant for SaaS
      // Bonus weight for digital presence
      digitalPresence: 35        // New: covers reviews mention, trust signals, online citations
    } : {
      // Traditional local business: full weight on NAP and location
      localBusinessSchema: 30,
      napConsistency: 30,
      googleBusinessProfile: 20,
      locationKeywords: 15,
      geographicTargeting: 5,
      digitalPresence: 0
    };

    let totalScore = 0;
    let totalWeight = 0;

    // LocalBusiness schema score
    if (this.checks.localBusinessSchema) {
      const score = this.checks.localBusinessSchema.found ? 100 : 0;
      if (weights.localBusinessSchema > 0) {
        totalScore += score * weights.localBusinessSchema;
        totalWeight += weights.localBusinessSchema;
      }
    }

    // NAP consistency score
    if (this.checks.napConsistency) {
      let score = 0;
      if (this.checks.napConsistency.hasPhone) score += 30;
      if (this.checks.napConsistency.hasAddress) score += 30;
      if (this.checks.napConsistency.isConsistent) score += 40;
      // For SaaS, give partial credit even without physical NAP
      if (isSaaS && score === 0) score = 40; // SaaS companies don't need phone/address
      totalScore += score * weights.napConsistency;
      totalWeight += weights.napConsistency;
    }

    // Google Business Profile score
    if (this.checks.googleBusinessProfile) {
      let score = 0;
      if (this.checks.googleBusinessProfile.hasGoogleMapsEmbed) score += 60;
      if (this.checks.googleBusinessProfile.hasReviewsLink) score += 40;
      totalScore += score * weights.googleBusinessProfile;
      totalWeight += weights.googleBusinessProfile;
    }

    // Location keywords score
    if (this.checks.locationKeywords) {
      const score = Math.min(100, this.checks.locationKeywords.percentageWithLocation * 2);
      totalScore += score * weights.locationKeywords;
      totalWeight += weights.locationKeywords;
    }

    // Geographic targeting score
    if (this.checks.geographicTargeting && weights.geographicTargeting > 0) {
      let score = 0;
      if (this.checks.geographicTargeting.hasLocationInTitle) score += 70;
      if (this.checks.geographicTargeting.hasGeoMeta) score += 30;
      totalScore += score * weights.geographicTargeting;
      totalWeight += weights.geographicTargeting;
    }

    // Digital presence score (SaaS only)
    if (isSaaS && weights.digitalPresence > 0) {
      // Score based on what digital signals we CAN detect
      let score = 40; // Base score for having a website
      // Having some pages (blog, about, resources) is a positive signal
      const pageCount = this.pages.length;
      if (pageCount >= 5) score += 20;
      if (pageCount >= 10) score += 20;
      // Schema presence is a positive signal
      const hasAnySchema = this.pages.some(p => (p.schemaTypes || []).length > 0);
      if (hasAnySchema) score += 20;
      totalScore += Math.min(100, score) * weights.digitalPresence;
      totalWeight += weights.digitalPresence;
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

export default LocalSEOAnalyzer;
