# SEO Scoring Calibration Guide

## Overview

This document explains the calibrated scoring model used in the SEO audit tool to ensure conservative, defensible scores that match professional SEO tools.

## Performance Scoring (10% weight)

### Measurement Methods

1. **PageSpeed API (Measured - Preferred)**
   - Mobile score: 70% weight
   - Desktop score: 30% weight
   - Confidence: `MEASURED`
   - Min score: Based on actual PageSpeed data

2. **Load Time Estimation (Estimated - Fallback)**
   - Base score: 50/100 (conservative starting point)
   - Fast sites (< 1000ms): +30 points → 80/100
   - Very fast (< 500ms): +20 more → 100/100
   - Slow sites (> 2000ms): -20 points → 30/100
   - Very slow (> 3000ms): -15 points → 15/100
   - Critical slow (> 5000ms): -15 points → 0/100... but **minimum enforced at 30/100**
   - Confidence: `ESTIMATED`
   - **Never returns 0** - minimum of 30/100 to avoid misleading scores

### Scoring Bands

| Score | Rating | Description |
|-------|--------|-------------|
| 90-100 | Excellent | Site loads very fast across mobile and desktop |
| 70-89 | Good | Performance is solid with minor optimization opportunities |
| 50-69 | Needs Improvement | Notable performance issues impacting user experience |
| 0-49 | Poor | Severe performance problems require immediate attention |

## Authority & Backlinks Scoring (10% weight)

### Limitations

**CRITICAL:** This analyzer measures "trust signals" NOT true "domain authority"

True authority metrics (Moz DA, Ahrefs DR, referring domains) require paid API access. Without these APIs:
- **Maximum score is capped at 60/100**
- Score is labeled as `ESTIMATED`
- Report clearly states: "Trust signals only - Full authority requires Moz/Ahrefs API"

### Trust Signal Components

Weights when no backlink API:
- Social media presence: 15%
- Trust pages (Privacy, Terms, About, Contact): 30%
- Contact information: 25%
- Security (HTTPS): 30%
- Backlink indicators: 0% (not counted without API)

### Scoring Formula

```javascript
// Social media (0-100)
platforms === 0: 0%
platforms === 1: 15%
platforms === 2: 35%
platforms === 3: 60%
platforms === 4: 80%
platforms >= 5: 100%

// Trust pages (0-100)
pages === 0: 0%
pages === 1: 20%
pages === 2: 40%
pages === 3: 65%
pages >= 4: 100%

// Contact methods (0-100)
methods === 0: 0%
methods === 1: 30%
methods === 2: 65%
methods >= 3: 100%

// Security
HTTPS: 100%
No HTTPS: 0%

// Final Score
uncappedScore = weighted average
finalScore = Math.min(60, uncappedScore) // Cap at 60 without backlink API
```

### With Backlink API (Future)

When Moz or Ahrefs API is integrated:
- Cap removed (can score up to 100)
- Backlink indicators weight: 40%
- Domain Authority / Domain Rating directly used
- Referring domains count factored in
- Confidence: `MEASURED`

## Technical SEO Scoring (25% weight)

### Component Weights

- Sitemap: 20%
- Robots.txt: 15%
- SSL/HTTPS: 30%
- Mobile responsive: 20%
- Structured data: 10%
- Canonical tags: 5%

### Scoring Details

**Sitemap:**
- Exists: 100
- Missing: 0

**Robots.txt:**
- Exists + sitemap reference: 100
- Exists + no sitemap reference: 60
- Blocks all crawlers: 0
- Missing: 20

**SSL:**
- HTTPS enabled: 100
- No HTTPS: 0

**Mobile Responsive:**
- 100% pages with viewport: 100%
- < 90% pages: 80% of percentage (20% penalty)

**Structured Data:**
- Score = percentage of pages with schema

**Canonical Tags:**
- Score = percentage of pages with canonical

### Conservative Penalties

Technical SEO is weighted heavily (25%) because it's fundamental:
- Missing SSL is critical (30% of category score)
- Missing sitemap is high severity (20% of category score)
- Mobile issues penalized heavily if < 90% coverage

## Content Quality Scoring (20% weight)

### Component Weights

- Content volume: 35%
- Keyword cannibalization: 25%
- Readability: 20%
- FAQ sections: 10%
- Multimedia presence: 10%

### Scoring Details

**Content Volume:**
- Score = % of pages with 300+ words

**Keyword Cannibalization:**
- Base: 100
- Penalty: -15 points per cannibalization issue detected
- Example: 3 issues → 100 - 45 = 55

**Readability:**
- Score = % of pages with good readability

**FAQ Sections:**
- 0 FAQs: 0 (no free points)
- 1+ FAQs: min(100, percentage + 20) (bonus)

**Multimedia:**
- < 50% pages with images: 70% penalty
- Score = percentage * 0.7 if < 50%, otherwise percentage

### Why Conservative

Content scoring is intentionally strict:
- Having 300-word pages doesn't mean content is good
- Keyword cannibalization heavily penalized (was -10, now -15)
- FAQ sections are bonus, not requirement (no free 60%)

## On-Page SEO Scoring

Component weights and scoring:
- Title tags: Based on completeness and optimization
- Meta descriptions: Coverage and quality
- Heading structure: H1 usage and hierarchy
- Image optimization: Alt text coverage
- Internal linking: Link structure and depth

## Local SEO Scoring

Component weights:
- NAP (Name, Address, Phone) consistency
- Google Business Profile optimization
- Local schema markup
- Location pages optimization
- Local citations and directory presence

## Overall Score Calculation

Weighted average of all categories:

```
Overall Score = (
  Technical SEO × 0.25 +
  On-Page SEO × 0.20 +
  Content Quality × 0.20 +
  Performance × 0.10 +
  Authority × 0.10 +
  Local SEO × 0.15
)
```

### Rating Bands

| Score | Rating | Description |
|-------|--------|-------------|
| 90-100 | Excellent | Site is well-optimized with minor improvements possible |
| 70-89 | Good | Solid SEO foundation with room for optimization |
| 50-69 | Needs Improvement | Significant issues requiring attention |
| 0-49 | Poor | Critical problems severely impacting SEO |

## Confidence Indicators

Every category score includes measurement confidence:

- **MEASURED** (Green): Based on direct measurements from crawl or API
  - Technical SEO (crawl data)
  - On-Page SEO (crawl data)
  - Content Quality (crawl data)
  - Performance (if PageSpeed API configured)

- **ESTIMATED** (Yellow): Based on fallback analysis or limited data
  - Performance (load-time estimation without API)
  - Authority (trust signals without backlink API)

- **NOT MEASURED** (Red): Requires external API not configured
  - Currently not used, but reserved for future metrics

## Calibration Notes

### Why Scores Are Conservative

Professional SEO tools (Moz, Ahrefs, SEMrush) use conservative scoring because:
1. **Credibility** - Inflated scores hurt reputation
2. **Expectations** - Lower scores = more room to demonstrate improvement
3. **Measurement** - Without full data, be cautious

### Common Score Ranges by Site Type

**New sites (< 1 year):**
- Technical: 60-75
- Authority: 20-40 (limited without backlink API)
- Content: 50-70
- Overall: 45-60

**Established sites (2-5 years):**
- Technical: 75-85
- Authority: 35-55 (capped without API)
- Content: 65-80
- Overall: 60-75

**Well-optimized sites:**
- Technical: 85-95
- Authority: 50-60 (capped without API)
- Content: 75-90
- Overall: 75-85

### Never Happens

- ❌ Performance score of 0 (minimum 30)
- ❌ Authority score > 60 without backlink API
- ❌ 100/100 overall score (unrealistic without perfect execution)
- ❌ "Excellent" rating for sites with critical issues

## Future Enhancements

When APIs are integrated:

1. **Moz API:**
   - Domain Authority (DA)
   - Page Authority (PA)
   - Spam Score
   - Linking Root Domains

2. **Ahrefs API:**
   - Domain Rating (DR)
   - URL Rating (UR)
   - Referring Domains
   - Organic Keywords

3. **SEMrush API:**
   - Authority Score
   - Organic Traffic
   - Keyword Rankings
   - Backlink Metrics

These would:
- Increase Authority category weight from 10% to 15%
- Remove 60/100 cap on Authority score
- Change confidence from ESTIMATED to MEASURED
- Provide competitive analysis data

---

**Version:** 3.0
**Last Updated:** 2025-02-16
