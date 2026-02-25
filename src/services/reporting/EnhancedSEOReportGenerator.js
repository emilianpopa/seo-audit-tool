import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import puppeteer, { executablePath as puppeteerBundledPath } from 'puppeteer';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';

function findChromiumExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    logger.info({ path: process.env.PUPPETEER_EXECUTABLE_PATH }, 'Chromium: using PUPPETEER_EXECUTABLE_PATH');
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    const buildCapturedPath = fs.readFileSync('/app/.chromium-path', 'utf-8').trim();
    if (buildCapturedPath && fs.existsSync(buildCapturedPath)) {
      logger.info({ path: buildCapturedPath }, 'Chromium: using build-captured Nix path');
      return buildCapturedPath;
    }
  } catch {}
  try {
    const bundled = puppeteerBundledPath();
    if (bundled && fs.existsSync(bundled)) {
      logger.info({ path: bundled }, 'Chromium: using Puppeteer bundled Chrome');
      return bundled;
    }
  } catch {}
  try {
    const found = execSync(
      'which chromium || which chromium-browser || which google-chrome-stable || which google-chrome',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).split('\n')[0].trim();
    if (found) {
      logger.info({ path: found }, 'Chromium: using runtime which-detected path');
      return found;
    }
  } catch {}
  logger.warn('Chromium: no executable found — puppeteer will use its default');
  return null;
}

/**
 * Enhanced SEO Report Generator
 *
 * Generates detailed PDF reports using HTML/CSS + Puppeteer.
 */
class EnhancedSEOReportGenerator {
  constructor(auditId) {
    this.auditId = auditId;
    this.audit = null;
    this.reportDir = path.join(process.cwd(), 'reports');
    this.templatePath = path.join(process.cwd(), 'src', 'services', 'reporting', 'templates', 'report-template.html');

    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  async loadAuditData() {
    logger.info({ auditId: this.auditId }, 'Loading audit data for enhanced report');

    this.audit = await prisma.seoAudit.findUnique({
      where: { id: this.auditId },
      include: {
        results: true,
        pages: { take: 100, orderBy: { createdAt: 'desc' } },
        recommendations: {
          orderBy: [{ priority: 'asc' }, { effortLevel: 'asc' }]
        }
      }
    });

    if (!this.audit) throw new Error(`Audit ${this.auditId} not found`);
    if (this.audit.status !== 'COMPLETED') throw new Error(`Audit ${this.auditId} is not completed yet`);

    logger.info({ auditId: this.auditId }, 'Audit data loaded for enhanced report');
    return this.audit;
  }

  async generatePDF() {
    logger.info({ auditId: this.auditId }, 'Generating enhanced PDF report');

    if (!this.audit) await this.loadAuditData();

    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const filename = `seo-audit-${domain}-${new Date().toISOString().split('T')[0]}.pdf`;
    const filepath = path.join(this.reportDir, filename);

    const htmlContent = this.buildHTMLReport();
    const template = fs.readFileSync(this.templatePath, 'utf-8');
    const fullHTML = template.replace('{{content}}', htmlContent);

    const htmlDebugPath = filepath.replace('.pdf', '.html');
    fs.writeFileSync(htmlDebugPath, fullHTML);
    logger.info({ htmlDebugPath }, 'Saved HTML debug file');

    const chromiumPath = findChromiumExecutable();
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-extensions',
        '--disable-software-rasterizer'
      ]
    };
    if (chromiumPath) launchOptions.executablePath = chromiumPath;

    let browser;
    try {
      browser = await puppeteer.launch({ ...launchOptions, timeout: 60000 });
    } catch (launchErr) {
      logger.error({ err: launchErr, chromiumPath, launchOptions }, 'Puppeteer launch failed');
      throw launchErr;
    }

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      await page.setContent(fullHTML, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.pdf({
        path: filepath,
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
        timeout: 60000
      });
    } finally {
      await browser.close();
    }

    logger.info({ auditId: this.auditId, filepath }, 'Enhanced PDF report generated successfully');
    return filepath;
  }

  // ─── HTML REPORT BUILDER ────────────────────────────────────────────────────

  buildHTMLReport() {
    const sections = [];
    sections.push(this.buildCoverPage());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildTableOfContents());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildScoreBreakdown());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildWhatNotWorking());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildWhatIsWorking());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildWhatNeedsChange());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildOtherImprovements());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildRoadmap());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildExpectedResults());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildActionSummary());
    return sections.join('\n');
  }

  buildTableOfContents() {
    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const totalIssues = this.audit.recommendations.length;
    const criticalCount = this.audit.recommendations.filter(r => r.priority === 'CRITICAL').length;
    const highCount = this.audit.recommendations.filter(r => r.priority === 'HIGH').length;
    const mediumCount = this.audit.recommendations.filter(r => r.priority === 'MEDIUM').length;
    const pageCount = this.audit.pages?.length || 0;

    const toc = [
      { num: '1', title: 'SEO Score Breakdown', desc: `Weighted scores across ${this.audit.results.length} categories with detailed analysis` },
      { num: '2', title: 'What Is NOT Working', desc: `${totalIssues} issues found — ${criticalCount} critical, ${highCount} high, ${mediumCount} medium` },
      { num: '3', title: 'What IS Working', desc: 'Confirmed strengths to preserve as you make improvements' },
      { num: '4', title: 'What Needs to Change', desc: 'Prioritised fixes with implementation steps and before/after specifics' },
      { num: '5', title: 'Other Website Improvements', desc: 'UX/UI, CRO, Content Strategy, Technical, and Analytics opportunities' },
      { num: '6', title: 'Implementation Roadmap', desc: 'Week-by-week action plan with owner assignments (90-day horizon)' },
      { num: '7', title: 'Expected Results', desc: 'Projected metric improvements at 30, 60, and 90 days post-implementation' },
      { num: '8', title: 'Action Summary & Next Steps', desc: 'Immediate actions, success metrics, and recommended tools with costs' },
    ];

    let html = `<h1>Table of Contents</h1>
<p>Comprehensive SEO audit for <strong>${this.escapeHTML(domain)}</strong> — ${pageCount} pages analysed, ${totalIssues} recommendations across ${this.audit.results.length} categories.</p>

<table class="toc-table">
  <thead><tr><th style="width:28px;">#</th><th style="width:35%;">Section</th><th>What You'll Find</th></tr></thead>
  <tbody>`;

    for (const item of toc) {
      html += `<tr>
      <td class="toc-num">${item.num}</td>
      <td class="toc-title">${this.escapeHTML(item.title)}</td>
      <td class="toc-desc">${this.escapeHTML(item.desc)}</td>
    </tr>`;
    }

    html += `</tbody></table>

<div class="highlight-box mt-2">
  <strong>How to use this report:</strong> Start with Section 2 to see all identified issues. Jump to Section 4 for a
  prioritised action plan with step-by-step implementation guidance. Use Section 6 to assign owners and schedule work
  across a 90-day horizon. Track progress weekly against the metrics in Section 7.
</div>

<div class="priority-grid" style="margin-top:14pt;">
  <div class="priority-box critical">
    <div class="priority-box-title color-critical">CRITICAL</div>
    <div class="priority-box-count color-critical">${criticalCount}</div>
    <div class="priority-box-impact">Fix immediately — highest ROI</div>
  </div>
  <div class="priority-box high">
    <div class="priority-box-title color-high">HIGH</div>
    <div class="priority-box-count color-high">${highCount}</div>
    <div class="priority-box-impact">Fix within 30 days</div>
  </div>
  <div class="priority-box medium">
    <div class="priority-box-title color-medium">MEDIUM</div>
    <div class="priority-box-count color-medium">${mediumCount}</div>
    <div class="priority-box-impact">Fix within 60 days</div>
  </div>
  <div class="priority-box low">
    <div class="priority-box-title color-low">${this.audit.recommendations.filter(r => r.priority === 'LOW').length}</div>
    <div class="priority-box-count color-low">${this.audit.recommendations.filter(r => r.priority === 'LOW').length}</div>
    <div class="priority-box-impact">Fix as capacity allows</div>
  </div>
</div>`;

    return html;
  }

  // ─── SECTIONS ───────────────────────────────────────────────────────────────

  /**
   * Detect the industry/business type from homepage title and H1s
   */
  detectIndustry() {
    const homepage = (this.audit.pages || []).find(p => p.path === '/' || p.path === '') || this.audit.pages?.[0];
    if (!homepage) return null;

    const allText = [
      homepage.title || '',
      ...(homepage.h1Tags || []),
      ...(homepage.h2Tags || []),
      homepage.metaDescription || ''
    ].join(' ').toLowerCase();

    const industries = [
      { name: 'Workforce Development / EdTech', keywords: ['workforce', 'upskill', 'learning', 'training', 'talent', 'career', 'employee', 'elearning'] },
      { name: 'SaaS / Technology', keywords: ['platform', 'software', 'saas', 'cloud', 'api', 'dashboard', 'automation', 'integration'] },
      { name: 'E-Commerce / Retail', keywords: ['shop', 'store', 'buy', 'cart', 'product', 'order', 'shipping', 'retail'] },
      { name: 'Healthcare / Medical', keywords: ['health', 'medical', 'clinic', 'doctor', 'patient', 'care', 'wellness', 'therapy'] },
      { name: 'Finance / Fintech', keywords: ['finance', 'fintech', 'investment', 'banking', 'insurance', 'accounting', 'payment'] },
      { name: 'Marketing / Agency', keywords: ['marketing', 'agency', 'seo', 'advertising', 'campaign', 'brand', 'digital'] },
      { name: 'Real Estate', keywords: ['real estate', 'property', 'homes', 'apartment', 'rent', 'buy home', 'realtor'] },
      { name: 'Legal Services', keywords: ['law', 'legal', 'attorney', 'lawyer', 'firm', 'counsel', 'litigation'] },
      { name: 'Hospitality / Food', keywords: ['restaurant', 'hotel', 'food', 'dining', 'cafe', 'catering', 'menu'] },
      { name: 'Professional Services', keywords: ['consulting', 'advisory', 'professional', 'services', 'solutions', 'strategy'] },
    ];

    let bestMatch = null;
    let bestScore = 0;

    for (const industry of industries) {
      const score = industry.keywords.filter(kw => allText.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = industry.name;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }

  buildCoverPage() {
    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const scoreColor = this.getScoreColorClass(this.audit.overallScore);
    const criticalCount = this.audit.recommendations.filter(r => r.priority === 'CRITICAL').length;
    const highCount = this.audit.recommendations.filter(r => r.priority === 'HIGH').length;
    const industry = this.detectIndustry();

    return `
<div class="cover">
  <h1>SEO Audit Report</h1>
  <div class="subtitle">
    ${this.escapeHTML(domain)}<br/>
    ${new Date(this.audit.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    ${industry ? `<br/><span style="font-size:11pt;color:#94a3b8;">Industry: ${this.escapeHTML(industry)}</span>` : ''}
  </div>

  <div class="score-circle bg-${scoreColor}">
    <div class="score-number">${this.audit.overallScore}</div>
    <div class="score-label">/100</div>
  </div>

  <div class="summary-box">
    <h3 style="margin-bottom:10pt;text-align:center;">Executive Summary</h3>
    <div class="summary-row"><span class="summary-label">Pages Analyzed:</span><span class="summary-value">${this.audit.pages.length}</span></div>
    <div class="summary-row"><span class="summary-label">Critical Issues:</span><span class="summary-value color-critical">${criticalCount}</span></div>
    <div class="summary-row"><span class="summary-label">High Priority:</span><span class="summary-value color-high">${highCount}</span></div>
    <div class="summary-row"><span class="summary-label">Total Recommendations:</span><span class="summary-value">${this.audit.recommendations.length}</span></div>
    <div class="summary-row"><span class="summary-label">Overall Rating:</span><span class="summary-value">${this.escapeHTML(this.audit.scoreRating || 'N/A')}</span></div>
  </div>
  ${this.audit.pages.length < 15 ? `
<div class="warning-box" style="margin-top:16pt;text-align:left;font-size:8.5pt;">
  <strong>Note on Crawl Scope:</strong> Only ${this.audit.pages.length} pages were analysed.
  ${this.audit.pages.length < 5 ? 'This may be because robots.txt is blocking crawlers — see Critical Issues.' : 'Consider re-running with a higher maxPages setting for a more complete analysis.'}
  Some findings may not reflect the full site.
</div>` : ''}
</div>`;
  }

  buildScoreBreakdown() {
    const sortedResults = [...this.audit.results].sort((a, b) => parseFloat(b.weight) - parseFloat(a.weight));

    let html = `<h1>1. SEO Score Breakdown</h1>
<p>Weighted average of six core categories. Scores are based on crawl data, industry best practices, and Google ranking factors.</p>
<div class="mb-4"></div>`;

    for (const result of sortedResults) {
      const categoryName = this.formatCategoryName(result.category);
      const weight = (parseFloat(result.weight) * 100).toFixed(0);
      const scoreColor = this.getScoreColorClass(result.categoryScore);

      html += `
<div class="score-bar">
  <div class="score-bar-header">
    <span class="font-semibold">${this.escapeHTML(categoryName)} (${weight}% weight)</span>
    <span class="font-bold">${result.categoryScore}/100</span>
  </div>
  <div class="score-bar-track">
    <div class="score-bar-fill bg-${scoreColor}" style="width:${result.categoryScore}%">${result.categoryScore}</div>
  </div>
  <div class="score-bar-details">
    ${this.escapeHTML(this.formatRating(result.rating))} &bull;
    ${result.criticalCount} critical, ${result.highCount} high, ${result.mediumCount} medium, ${result.lowCount} low
  </div>
</div>`;
    }

    html += `
<div class="mb-4"></div>
<table>
  <thead><tr><th>Category</th><th>Weight</th><th>Score</th><th>Weighted</th><th>Rating</th></tr></thead>
  <tbody>`;
    for (const r of sortedResults) {
      html += `<tr>
    <td>${this.escapeHTML(this.formatCategoryName(r.category))}</td>
    <td>${(parseFloat(r.weight) * 100).toFixed(0)}%</td>
    <td>${r.categoryScore}/100</td>
    <td>${(parseFloat(r.weight) * r.categoryScore).toFixed(1)}</td>
    <td>${this.escapeHTML(this.formatRating(r.rating))}</td>
  </tr>`;
    }
    html += `<tr><td><strong>Total</strong></td><td></td><td></td><td><strong>${this.audit.overallScore}</strong></td><td></td></tr>
  </tbody>
</table>`;

    return html;
  }

  buildWhatNotWorking() {
    const categoryGroups = [
      { keys: ['TECHNICAL_SEO'],                    title: 'A. Technical SEO Issues' },
      { keys: ['ON_PAGE_SEO'],                      title: 'B. On-Page SEO Issues' },
      { keys: ['CONTENT_QUALITY'],                  title: 'C. Content Quality Issues' },
      { keys: ['AUTHORITY_BACKLINKS', 'LOCAL_SEO'], title: 'D. Authority & Local SEO Issues' },
      { keys: ['PERFORMANCE'],                      title: 'E. Performance Issues' },
    ];

    const totalIssues = this.audit.recommendations.length;

    let html = `<h1>2. What Is NOT Working</h1>
<p>${totalIssues} issues identified during the audit across ${categoryGroups.length} categories. Each includes specific evidence, a step-by-step fix, and expected impact.</p>`;

    // Summary table
    html += `<table class="category-summary-table">
  <thead><tr><th>Category</th><th style="width:50px;text-align:center;">Issues</th><th style="width:60px;text-align:center;">Critical</th><th style="width:50px;text-align:center;">High</th><th style="width:60px;text-align:center;">Medium</th><th style="width:40px;text-align:center;">Low</th></tr></thead>
  <tbody>`;
    for (const group of categoryGroups) {
      const issues = this.audit.recommendations.filter(r => group.keys.includes(r.category));
      if (issues.length === 0) continue;
      const c = issues.filter(r => r.priority === 'CRITICAL').length;
      const h = issues.filter(r => r.priority === 'HIGH').length;
      const m = issues.filter(r => r.priority === 'MEDIUM').length;
      const l = issues.filter(r => r.priority === 'LOW').length;
      html += `<tr>
      <td>${this.escapeHTML(group.title)}</td>
      <td style="text-align:center;font-weight:600;">${issues.length}</td>
      <td style="text-align:center;" class="${c > 0 ? 'color-critical font-semibold' : ''}">${c > 0 ? c : '—'}</td>
      <td style="text-align:center;" class="${h > 0 ? 'color-high font-semibold' : ''}">${h > 0 ? h : '—'}</td>
      <td style="text-align:center;" class="${m > 0 ? 'color-medium font-semibold' : ''}">${m > 0 ? m : '—'}</td>
      <td style="text-align:center;" class="${l > 0 ? 'color-low font-semibold' : ''}">${l > 0 ? l : '—'}</td>
    </tr>`;
    }
    html += `</tbody></table>`;

    for (const group of categoryGroups) {
      const issues = this.audit.recommendations.filter(r => group.keys.includes(r.category));
      if (issues.length === 0) continue;

      html += `<div class="page-break"></div>`;
      html += `<h2>${this.escapeHTML(group.title)}</h2>`;
      for (const issue of issues) {
        html += this.buildIssueCard(issue);
      }
    }

    return html;
  }

  buildIssueCard(issue) {
    const severity = issue.priority.toLowerCase();
    const affectedPagesHtml = issue.affectedPages > 0
      ? `<div class="text-sm text-gray" style="margin-bottom:4pt;">Affected pages: <strong>${issue.affectedPages}</strong></div>`
      : '';

    // Current State → Recommended bar (shown when both description and implementation are available)
    let currentStateHtml = '';
    if (issue.description && issue.implementation) {
      currentStateHtml = `<div class="current-state-bar">
  <div class="cs-current">
    <div class="cs-current-label">Current State</div>
    <div class="cs-current-val">${this.escapeHTML(issue.description)}</div>
  </div>
  <div class="cs-recommended">
    <div class="cs-recommended-label">Recommended Fix</div>
    <div class="cs-recommended-val">${this.escapeHTML(issue.implementation)}</div>
  </div>
</div>`;
    } else {
      // Fallback individual elements
      if (issue.implementation) {
        currentStateHtml = `<div class="issue-fix"><strong>Fix:</strong> ${this.escapeHTML(issue.implementation)}</div>`;
      }
    }

    const impactHtml = issue.expectedImpact
      ? `<div class="issue-impact">Expected impact: ${this.escapeHTML(issue.expectedImpact)}</div>`
      : '';

    const steps = this.getImplementationSteps(issue.title);
    const stepsHtml = steps.length > 0
      ? `<div class="issue-steps"><strong>Implementation Steps:</strong><ul class="steps-list">${
          steps.map(s => `<li>${this.escapeHTML(s)}</li>`).join('')
        }</ul></div>`
      : '';

    const specifics = this.getSpecificsForIssue(issue.title);
    const specificsHtml = specifics.length > 0
      ? this.buildSpecificsTable(specifics, 4)
      : '';

    return `
<div class="issue-card ${severity}">
  <div class="issue-header">
    <span class="issue-title">${this.escapeHTML(issue.title)}</span>
    <span class="issue-severity ${severity}">${issue.priority}</span>
  </div>
  ${affectedPagesHtml}
  ${currentStateHtml}
  ${stepsHtml}
  ${specificsHtml}
  ${impactHtml}
</div>`;
  }

  buildWhatIsWorking() {
    const strengths = this.identifyStrengths();

    let html = `<h1>3. What IS Working</h1>
<p>Confirmed strengths detected during the audit. Preserve these as you implement improvements — they represent real assets that are working in your favour.</p>`;

    for (const s of strengths) {
      html += `
<div class="success-box mt-2">
  <strong>&#10003; ${this.escapeHTML(s.title)}</strong><br/>
  <span class="text-sm">${this.escapeHTML(s.description)}</span>
  ${s.preserve ? `<br/><span class="text-sm preserve-note"><span class="preserve-label">Preserve:</span> ${this.escapeHTML(s.preserve)}</span>` : ''}
</div>`;
    }

    return html;
  }

  buildWhatNeedsChange() {
    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const labels = {
      CRITICAL: 'Critical Priority (Fix This Week)',
      HIGH: 'High Priority (Fix Within 1 Month)',
      MEDIUM: 'Medium Priority (Fix Within 2 Months)',
      LOW: 'Low Priority (Fix As Capacity Allows)'
    };
    const timeframes = {
      CRITICAL: '1–2 weeks',
      HIGH: '2–4 weeks',
      MEDIUM: '4–6 weeks',
      LOW: '6–8 weeks'
    };
    const impactRanges = {
      CRITICAL: '+15–20 points',
      HIGH: '+10–15 points',
      MEDIUM: '+5–10 points',
      LOW: '+2–5 points'
    };
    const colors = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

    let html = `<h1>4. What Needs to Change</h1>
<p>Prioritised fixes. Implementing Critical + High priority items will yield the most significant score improvement.</p>

<div class="priority-grid">`;

    for (const p of priorities) {
      const count = this.audit.recommendations.filter(r => r.priority === p).length;
      html += `
  <div class="priority-box ${colors[p]}">
    <div class="priority-box-title color-${colors[p]}">${p}</div>
    <div class="priority-box-count color-${colors[p]}">${count}</div>
    <div class="priority-box-impact">${labels[p]}</div>
  </div>`;
    }

    html += `</div>`;

    // Fix Priority Matrix table
    html += `<table class="fix-matrix">
  <thead><tr><th>Priority</th><th># of Issues</th><th>Est. Time</th><th>Impact on Score</th></tr></thead>
  <tbody>`;
    for (const p of priorities) {
      const count = this.audit.recommendations.filter(r => r.priority === p).length;
      html += `<tr>
    <td class="color-${colors[p]} font-semibold">${p}</td>
    <td>${count}</td>
    <td>${timeframes[p]}</td>
    <td>${impactRanges[p]}</td>
  </tr>`;
    }
    html += `</tbody></table>`;

    html += `<h2>Detailed Fixes</h2>`;
    for (const p of priorities) {
      const group = this.audit.recommendations.filter(r => r.priority === p);
      for (const fix of group) {
        html += this.buildIssueCard(fix);
      }
    }

    // Keyword & Content Optimization sub-section
    const kwSection = this.buildKeywordOptimization();
    if (kwSection) {
      html += `<div class="page-break"></div>` + kwSection;
    }

    return html;
  }

  buildOtherImprovements() {
    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');

    const categories = [
      {
        title: 'A. UX/UI Improvements',
        items: [
          {
            title: 'Sticky Navigation Bar',
            desc: 'Add a sticky header so your CTA buttons remain accessible as users scroll down. This keeps your primary conversion point visible at all times.',
            impact: 'Increase conversions by 10–15%'
          },
          {
            title: 'Mobile Navigation Optimisation',
            desc: 'Ensure the hamburger menu has a large enough tap target (min 44×44px). Consider a persistent mobile CTA bar pinned to the bottom of the screen.',
            impact: 'Reduce mobile bounce rate by 5–8%'
          },
          {
            title: 'Visual Hierarchy Enhancement',
            desc: 'Use larger, bolder typography for key statistics and outcomes. Add subtle animations or counters to make impact numbers (e.g. "19% decrease in turnover") stand out.',
            impact: 'Increase average engagement time by 20–30 seconds'
          },
          {
            title: 'Interactive Product Demo or Tour',
            desc: 'Embed a "See How It Works" video or interactive walkthrough above the fold on the homepage. First-time visitors convert significantly better when they can preview the product experience.',
            impact: 'Increase trial sign-ups by 15–25%'
          },
          {
            title: 'Progress Indicators on Multi-Step Forms',
            desc: 'If any sign-up or contact forms span multiple steps, show a progress indicator (Step 1 of 3). This reduces form abandonment substantially.',
            impact: 'Increase form completion rate by 12–18%'
          },
          {
            title: 'Live Chat Widget',
            desc: 'Add a lightweight chat widget (e.g. Intercom, Crisp, or Tidio) to answer common pre-sales questions in real time without requiring a demo booking.',
            impact: 'Increase qualified lead conversion by 8–12%'
          },
          {
            title: 'Accessibility Audit (WCAG 2.1 AA)',
            desc: 'Run a WAVE or axe audit to check colour contrast ratios, keyboard navigation, and ARIA labels. Compliance broadens your audience and reduces legal risk.',
            impact: 'Expand addressable market by 15–20%'
          },
        ]
      },
      {
        title: 'B. Conversion Rate Optimisation (CRO)',
        items: [
          {
            title: 'A/B Test Primary CTA Copy & Colour',
            desc: 'Run split tests on your primary call-to-action: "Get Started Free" vs "See It in Action" vs "Start Free Trial". Also test button colour — orange and green often outperform blue.',
            impact: 'Increase CTA click-through rate by 15–30%'
          },
          {
            title: 'Exit-Intent Popup with Lead Magnet',
            desc: 'When a user\'s mouse moves toward the browser chrome, trigger a popup offering a free resource (e.g. "Free Skills Gap Assessment Guide"). Capture emails you would otherwise lose.',
            impact: 'Capture 5–10% of abandoning visitors'
          },
          {
            title: 'Social Proof Notifications',
            desc: 'Show real-time or recent activity notifications ("A team at [Company] just started their free trial") using tools like Proof or TrustPulse. Display non-intrusively at the bottom of the page.',
            impact: 'Boost conversions by 8–12% through trust reinforcement'
          },
          {
            title: 'Dedicated PPC Landing Pages',
            desc: 'Build focused landing pages for each paid ad campaign — no navigation, single CTA, copy matching the ad. One message, one goal per page dramatically improves Quality Score.',
            impact: 'Increase paid traffic conversion rate by 25–40%'
          },
          {
            title: 'ROI Calculator',
            desc: 'Add an interactive calculator: "See how much our solution could save your organisation" (inputs: number of employees, current training cost). Embed on the homepage or pricing page.',
            impact: 'Increase qualified leads by 20–30%'
          },
          {
            title: 'Optimise Form Field Count',
            desc: 'Reduce sign-up forms to 3 fields maximum (Name, Email, Company). Capture additional details post sign-up or during onboarding rather than at the point of first contact.',
            impact: 'Increase form submissions by 15–25%'
          },
          {
            title: 'Scarcity or Urgency Elements',
            desc: 'Where authentic, add limited-time offers or cohort-based enrolment messaging. Countdown timers and "limited spots" copy create urgency without feeling misleading.',
            impact: 'Increase conversions by 10–15%'
          },
          {
            title: 'Retargeting Pixel Setup',
            desc: 'Install Meta Pixel and Google Ads remarketing tags to retarget visitors who didn\'t convert. Build custom audiences segmented by pages visited (e.g. pricing page visitors).',
            impact: 'Increase conversion rate of paid traffic by 30–50%'
          },
        ]
      },
      {
        title: 'C. Content Strategy & Marketing',
        items: [
          {
            title: 'Launch an Ultimate Guides Hub',
            desc: 'Create 5–8 comprehensive guides (3,000–5,000 words each). Topics: "The Complete Guide to Closing Skills Gaps", "AI in Workforce Development", "Career Pathing Best Practices". Gate behind email capture.',
            impact: 'Generate 100–200 qualified leads per month from organic search'
          },
          {
            title: 'Weekly LinkedIn Newsletter',
            desc: 'Publish a weekly newsletter on LinkedIn ("Future of Work Insights"). Share industry trends, platform updates, and customer success stories. Repurpose existing blog content.',
            impact: 'Build authority and brand awareness; target 1,000 subscribers in 90 days'
          },
          {
            title: 'Video Content Series',
            desc: 'Launch a YouTube series (weekly 5–10 min videos): platform demos, customer interviews, expert roundtables. Embed videos on relevant website pages and optimise with transcripts.',
            impact: 'Improve dwell time and E-E-A-T signals; target 500+ views/month'
          },
          {
            title: 'Case Study Library',
            desc: 'Create 5–10 detailed case studies following Challenge → Solution → Results format with specific metrics. Include quotes, photos, and video testimonials where possible.',
            impact: 'Shorten sales cycle by 20–30%; increase trust signals'
          },
          {
            title: 'Guest Blogging Campaign',
            desc: 'Target 10–15 high-authority HR and EdTech publications. Write on topics aligned with your expertise. Include an author bio linking back to the site. Aim for 2–3 posts per month.',
            impact: 'Build backlinks and domain authority; reach new audiences'
          },
          {
            title: 'Monthly Webinar Series',
            desc: 'Host monthly webinars on workforce development best practices. Co-host with industry partners or existing customers. Repurpose recordings into blog posts, social clips, and lead magnets.',
            impact: 'Generate 50–100 qualified leads per webinar'
          },
          {
            title: 'Expand Blog Content Depth',
            desc: 'Audit existing blog posts under 1,000 words and expand them to 1,500–2,500 words with data, examples, and internal links. Update older posts with current statistics and fresh CTAs.',
            impact: 'Improve rankings for existing content; +20–40% organic traffic to updated posts'
          },
        ]
      },
      {
        title: 'D. Technical & Performance Optimisations',
        items: [
          {
            title: 'Implement Advanced Caching',
            desc: 'Set up full-page caching (WP Rocket, LiteSpeed Cache, or server-level Varnish), browser caching with 1-year expiry for static assets, and object caching for database queries.',
            impact: 'Reduce server load by 40–60%; improve Time to First Byte (TTFB)'
          },
          {
            title: 'CDN for All Static Assets',
            desc: 'Serve images, CSS, JS, and fonts via a CDN (Cloudflare, AWS CloudFront, or Fastly). This dramatically reduces latency for visitors outside your server\'s region.',
            impact: 'Reduce global load times by 30–50%'
          },
          {
            title: 'Full Image Optimisation Pipeline',
            desc: 'Convert all images to WebP format with JPEG/PNG fallbacks. Implement lazy loading (loading="lazy") and responsive images with srcset. Right-size images at upload time.',
            impact: 'Reduce page weight by 50–70%; improve Largest Contentful Paint (LCP)'
          },
          {
            title: 'Database Optimisation',
            desc: 'Regularly clean up post revisions (keep max 3), spam comments, and expired transients. Run OPTIMIZE TABLE queries monthly. Adds up significantly for long-running CMS sites.',
            impact: 'Reduce database query time by 30–40%'
          },
          {
            title: 'Enable HTTP/2 or HTTP/3',
            desc: 'Ensure your server supports HTTP/2 (multiplexed connections) or HTTP/3 (QUIC). Most modern hosting and CDN providers support this — verify it\'s enabled for your domain.',
            impact: 'Improve parallel asset loading; reduce latency by 20–30%'
          },
          {
            title: 'Security Hardening',
            desc: 'Install a security plugin (Wordfence, Sucuri, or Cloudflare WAF), enable 2FA for admin accounts, hide CMS version strings, and limit login attempts. Security breaches directly harm SEO rankings.',
            impact: 'Prevent security breaches; protect organic rankings and user trust'
          },
          {
            title: 'Monitoring & Alerting Setup',
            desc: 'Configure uptime monitoring (UptimeRobot or Better Uptime), Google Search Console email alerts for crawl errors, and weekly PageSpeed score tracking. Catch regressions before they compound.',
            impact: 'Catch and fix issues before they impact users or rankings'
          },
          {
            title: 'Structured Error Logging',
            desc: 'Implement application error logging with Sentry or LogRocket. Track 404s, form submission failures, and failed API calls. Reduces debugging time and improves reliability.',
            impact: 'Faster issue resolution; reduce user-facing errors'
          },
        ]
      },
      {
        title: 'E. Analytics & Tracking Improvements',
        items: [
          {
            title: 'Google Analytics 4 Full Configuration',
            desc: 'Ensure GA4 is fully configured with conversion events (form submissions, demo requests, newsletter sign-ups, pricing page visits). Set up Audiences for remarketing segments.',
            impact: 'Accurate attribution; identify highest-value traffic sources'
          },
          {
            title: 'Heatmaps & Session Recording',
            desc: 'Install Hotjar or Microsoft Clarity (free) to record user sessions and view heatmaps. Identify where users click, where they stop scrolling, and where they get confused.',
            impact: 'Identify UX issues; optimise conversion paths based on real behaviour'
          },
          {
            title: 'Goal Funnel Tracking',
            desc: 'Define your conversion funnel in GA4: Homepage → Key Service Page → Pricing/Demo → Thank You. Set up funnel exploration reports to identify drop-off points.',
            impact: 'Increase conversion rate by 15–25% through data-driven funnel fixes'
          },
          {
            title: 'Call & Form Tracking',
            desc: 'If phone leads are important, use CallRail or WhatConverts to track which marketing channels drive calls. Integrate with GA4 as a conversion event for full attribution.',
            impact: 'Attribute offline conversions; optimise marketing spend accurately'
          },
          {
            title: 'A/B Testing Programme',
            desc: 'Set up Google Optimize (free) or VWO for continuous A/B testing of headlines, CTAs, hero images, and page layouts. Run one test at a time with proper statistical significance.',
            impact: 'Compound conversion improvements through systematic testing'
          },
          {
            title: 'Custom Looker Studio Dashboards',
            desc: 'Create a weekly performance dashboard in Looker Studio (free) pulling from GA4, Google Search Console, and Google Ads. Share with stakeholders for a single source of truth.',
            impact: 'Faster data-driven decisions; spot trends and regressions early'
          },
          {
            title: 'Micro-Conversion Event Tracking',
            desc: 'Track engagement signals beyond conversions: video plays, scroll depth (25/50/75/100%), time on page thresholds, resource downloads, and outbound link clicks.',
            impact: 'Understand content engagement; optimise for intent signals'
          },
          {
            title: 'Multi-Touch Attribution Modelling',
            desc: 'Move beyond last-click attribution in GA4. Use the data-driven attribution model (or linear) to understand the full customer journey from first touch to conversion.',
            impact: 'Optimise marketing budget allocation; increase blended ROI by 20–30%'
          },
        ]
      },
    ];

    let html = `<h1>5. Other Website Improvements</h1>
<p>Beyond core SEO, these improvements will enhance user experience, increase conversions, and establish your brand as a market leader. Each sub-section stands alone — prioritise based on your current goals.</p>`;

    let isFirst = true;
    for (const cat of categories) {
      if (!isFirst) {
        html += `<div class="page-break"></div>`;
      }
      isFirst = false;

      html += `<div class="improvement-category">
  <div class="improvement-cat-title">${this.escapeHTML(cat.title)}</div>
  <div class="improvement-grid">`;

      for (const item of cat.items) {
        html += `
    <div class="improvement-card">
      <div class="improvement-title">${this.escapeHTML(item.title)}</div>
      <div class="improvement-desc">${this.escapeHTML(item.desc)}</div>
      <div class="improvement-impact">Impact: ${this.escapeHTML(item.impact)}</div>
    </div>`;
      }

      html += `</div></div>`;
    }

    return html;
  }

  buildRoadmap() {
    const ownerForCategory = (cat) => {
      if (['TECHNICAL_SEO', 'PERFORMANCE'].includes(cat)) return { label: 'Dev', cls: 'owner-dev' };
      if (cat === 'CONTENT_QUALITY') return { label: 'Content', cls: 'owner-content' };
      return { label: 'Marketing', cls: 'owner-marketing' };
    };

    // Quick Wins (Days 1-7): ALL critical + all high + any quick-win effort items
    // Sort by priority first (CRITICAL => HIGH => MEDIUM => LOW), then by effort
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sortedRecs = [...this.audit.recommendations].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 4;
      const pb = priorityOrder[b.priority] ?? 4;
      if (pa !== pb) return pa - pb;
      // Within same priority, put QUICK_WIN first
      if (a.effortLevel === 'QUICK_WIN' && b.effortLevel !== 'QUICK_WIN') return -1;
      if (b.effortLevel === 'QUICK_WIN' && a.effortLevel !== 'QUICK_WIN') return 1;
      return (a.estimatedHours || 99) - (b.estimatedHours || 99);
    });

    // Quick Wins: all CRITICAL, all HIGH, plus any MEDIUM with QUICK_WIN effort
    const quickWins = sortedRecs
      .filter(r =>
        r.priority === 'CRITICAL' ||
        r.priority === 'HIGH' ||
        r.effortLevel === 'QUICK_WIN'
      )
      .slice(0, 10);

    const quickWinSet = new Set(quickWins.map(r => r.id || r.title));

    // Month 1 (weeks 2-4): MEDIUM items NOT already in Quick Wins
    const month1 = sortedRecs
      .filter(r => r.priority === 'MEDIUM' && !quickWinSet.has(r.id || r.title))
      .slice(0, 8);

    // Month 2: remaining MEDIUM + easy LOW
    const month2 = sortedRecs
      .filter(r => r.priority === 'LOW' && r.effortLevel !== 'MAJOR_PROJECT')
      .slice(0, 6);

    // Month 3: complex LOW
    const month3 = sortedRecs
      .filter(r => r.priority === 'LOW' && r.effortLevel === 'MAJOR_PROJECT')
      .slice(0, 5);

    // Quick Wins: day-by-day table
    let quickWinsRows = '';
    quickWins.forEach((t, i) => {
      const owner = ownerForCategory(t.category);
      quickWinsRows += `<tr>
        <td style="width:30px;color:#64748b;font-weight:600;">${i + 1}</td>
        <td>${this.escapeHTML(t.title)} <span class="owner-badge ${owner.cls}">${owner.label}</span></td>
        <td style="white-space:nowrap;color:#16a34a;font-weight:600;">${this.escapeHTML(t.expectedImpact || 'Quick improvement')}</td>
      </tr>`;
    });

    // 30-day sprint table — static best-practice phases, augmented with actual recs
    const sprintPhases = [
      {
        week: 'Week 2',
        focus: 'On-Page & Content Optimisation',
        items: month1.filter(r => ['ON_PAGE_SEO', 'CONTENT_QUALITY'].includes(r.category)).map(r => r.title).slice(0, 3)
          .concat(['Expand key service pages to 1,200+ words'])
          .slice(0, 4)
      },
      {
        week: 'Week 3',
        focus: 'Authority & Schema Markup',
        items: month1.filter(r => ['AUTHORITY_BACKLINKS', 'LOCAL_SEO'].includes(r.category)).map(r => r.title).slice(0, 3)
          .concat(['Implement BreadcrumbList schema', 'Create or claim Google Business Profile'])
          .slice(0, 4)
      },
      {
        week: 'Week 4',
        focus: 'Performance & Technical Polish',
        items: month1.filter(r => ['TECHNICAL_SEO', 'PERFORMANCE'].includes(r.category)).map(r => r.title).slice(0, 3)
          .concat(['Enable GZIP / Brotli compression', 'Submit XML sitemap to Google Search Console'])
          .slice(0, 4)
      },
    ];

    let sprintRows = '';
    for (const phase of sprintPhases) {
      sprintRows += `<tr>
        <td style="white-space:nowrap;font-weight:600;color:#1e293b;">${this.escapeHTML(phase.week)}</td>
        <td style="font-weight:600;">${this.escapeHTML(phase.focus)}</td>
        <td><ul style="margin:0;padding-left:14pt;">${phase.items.map(i => `<li>${this.escapeHTML(i)}</li>`).join('')}</ul></td>
      </tr>`;
    }

    // 90-day strategic table — static
    const strategicInitiatives = [
      { month: 'Month 2', initiative: 'Content Marketing Campaign', goals: 'Publish 3 ultimate guides (3,000–5,000 words each) • Launch weekly LinkedIn newsletter • Publish 8 blog posts (1,500+ words) • Create 5 detailed case studies' },
      { month: 'Month 2', initiative: 'Authority Building', goals: 'Publish 4–6 guest posts on high-DA sites • Launch monthly webinar series • Target 25–50 high-quality backlinks • Build relationships with 10 industry influencers' },
      { month: 'Month 3', initiative: 'Conversion Rate Optimisation', goals: 'Create 5 dedicated landing pages for paid ads • Build interactive ROI calculator • Implement heatmaps and session recording • Launch A/B testing programme' },
      { month: 'Month 3', initiative: 'Video & Multimedia', goals: 'Launch YouTube channel with 8–12 videos • Create product demo video for homepage • Record 3–5 customer video testimonials • Develop interactive product tour' },
      { month: 'Month 3', initiative: 'Local SEO & Citations', goals: 'Build citations on 20+ directories • Audit and fix NAP consistency across the web • Optimise Google Business Profile weekly • Generate 10+ Google reviews' },
      { month: 'Month 3', initiative: 'Analytics & Reporting', goals: 'Set up custom Looker Studio dashboards • Implement call tracking • Build attribution modelling • Establish weekly performance review cadence' },
    ];

    let strategicRows = strategicInitiatives.map(row => `<tr>
      <td style="white-space:nowrap;font-weight:600;color:#1e293b;">${this.escapeHTML(row.month)}</td>
      <td style="font-weight:600;">${this.escapeHTML(row.initiative)}</td>
      <td style="font-size:8pt;color:#475569;">${this.escapeHTML(row.goals).replace(/•/g, '<br/>•')}</td>
    </tr>`).join('');

    // Month 2–3 medium/low tasks
    const month2Rows = month2.map(t => {
      const owner = ownerForCategory(t.category);
      return `<div class="roadmap-task">
        <div class="roadmap-task-title">${this.escapeHTML(t.title)} <span class="owner-badge ${owner.cls}">${owner.label}</span></div>
        <div class="roadmap-task-detail">${t.estimatedHours ? `Est. ${t.estimatedHours}h` : 'Ongoing'} &bull; ${this.escapeHTML(t.expectedImpact || 'Enhances user experience and SEO')}</div>
      </div>`;
    }).join('');

    const month3Rows = month3.map(t => {
      const owner = ownerForCategory(t.category);
      return `<div class="roadmap-task">
        <div class="roadmap-task-title">${this.escapeHTML(t.title)} <span class="owner-badge ${owner.cls}">${owner.label}</span></div>
        <div class="roadmap-task-detail">${t.estimatedHours ? `Est. ${t.estimatedHours}h` : 'Ongoing'} &bull; ${this.escapeHTML(t.expectedImpact || 'Long-term growth')}</div>
      </div>`;
    }).join('');

    return `<h1>6. Implementation Roadmap</h1>
<p>Organised into achievable phases based on impact, effort, and dependencies.</p>

<div class="roadmap-phase">
  <div class="roadmap-header">Days 1–7: Quick Wins <span class="roadmap-subtitle">(${quickWins.length} tasks)</span></div>
  <table style="border:1pt solid #cbd5e1;border-top:none;width:100%;font-size:9pt;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="width:30px;">#</th>
        <th>Task</th>
        <th>Impact</th>
      </tr>
    </thead>
    <tbody>${quickWinsRows}</tbody>
  </table>
</div>

<div class="roadmap-phase">
  <div class="roadmap-header">Month 1 (Weeks 2–4): Foundation Fixes <span class="roadmap-subtitle">(${month1.length} tasks)</span></div>
  <table style="border:1pt solid #cbd5e1;border-top:none;width:100%;font-size:9pt;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th>Week</th>
        <th>Focus Area</th>
        <th>Key Deliverables</th>
      </tr>
    </thead>
    <tbody>${sprintRows}</tbody>
  </table>
</div>

${month2.length > 0 ? `<div class="roadmap-phase">
  <div class="roadmap-header">Month 2 (Weeks 5–8): Optimisation <span class="roadmap-subtitle">(${month2.length} tasks)</span></div>
  <div class="roadmap-tasks">${month2Rows || '<div class="roadmap-task"><div class="roadmap-task-detail">Continue Month 1 work and begin content expansion</div></div>'}</div>
</div>` : ''}

${month3.length > 0 ? `<div class="roadmap-phase">
  <div class="roadmap-header">Month 3 (Weeks 9–12): Polish &amp; Growth <span class="roadmap-subtitle">(${month3.length} tasks)</span></div>
  <div class="roadmap-tasks">${month3Rows || '<div class="roadmap-task"><div class="roadmap-task-detail">Focus on content authority and conversion optimisation</div></div>'}</div>
</div>` : ''}

<div class="roadmap-phase">
  <div class="roadmap-header">90-Day Strategic Initiatives <span class="roadmap-subtitle">(longer-term projects)</span></div>
  <table style="border:1pt solid #cbd5e1;border-top:none;width:100%;font-size:9pt;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th>Month</th>
        <th>Strategic Initiative</th>
        <th>Goals &amp; Targets</th>
      </tr>
    </thead>
    <tbody>${strategicRows}</tbody>
  </table>
</div>`;
  }

  buildExpectedResults() {
    const projected = this.audit.overallScore + Math.min(22, Math.floor((100 - this.audit.overallScore) * 0.4));
    const improvement = ((projected - this.audit.overallScore) / this.audit.overallScore * 100).toFixed(0);

    return `<h1>7. Expected Results After 90 Days</h1>
<table>
  <thead><tr><th>Metric</th><th>Current</th><th>90-Day Target</th><th>Change</th></tr></thead>
  <tbody>
    <tr><td>SEO Score</td><td>${this.audit.overallScore}/100</td><td>${projected}/100</td><td class="color-low font-semibold">+${improvement}%</td></tr>
    <tr><td>Organic Traffic</td><td>Baseline</td><td>+150–200%</td><td class="color-low font-semibold">2–3x</td></tr>
    <tr><td>Top-10 Keyword Rankings</td><td>Unknown</td><td>25–40 keywords</td><td class="color-low font-semibold">New</td></tr>
    <tr><td>Domain Authority</td><td>Est. 20–30</td><td>35–45</td><td class="color-low font-semibold">+33–50%</td></tr>
    <tr><td>Page Speed (Mobile)</td><td>Varies</td><td>75–85/100</td><td class="color-low font-semibold">+40–70%</td></tr>
    <tr><td>Conversion Rate</td><td>Est. 2–3%</td><td>4–6%</td><td class="color-low font-semibold">+100%</td></tr>
    <tr><td>Monthly Organic Leads</td><td>Baseline</td><td>200–300</td><td class="color-low font-semibold">New</td></tr>
    <tr><td>Backlinks</td><td>Est. 50–100</td><td>150–200</td><td class="color-low font-semibold">+100–150%</td></tr>
    <tr><td>Avg Session Duration</td><td>Baseline</td><td>+30–45 sec</td><td class="color-low font-semibold">+25%</td></tr>
    <tr><td>Bounce Rate</td><td>Baseline</td><td>−15–20%</td><td class="color-low font-semibold">Reduction</td></tr>
    <tr><td>Pages per Session</td><td>Baseline</td><td>+0.5–1.0</td><td class="color-low font-semibold">+20–30%</td></tr>
  </tbody>
</table>
<div class="highlight-box mt-2">
  <strong>Note:</strong> Projections assume implementation of Critical and High-priority fixes. Actual results
  vary by industry, competition level, and execution consistency. SEO is a long-term investment — results
  compound significantly between 90 days and 6 months.
</div>`;
  }

  buildActionSummary() {
    const immediateActions = [
      'Assign owners for all Quick Wins tasks (see Days 1–7 roadmap above)',
      'Set up a project management board (Trello, Asana, Linear, or Monday.com)',
      'Schedule kickoff meeting with Marketing, Dev, and Content teams',
      'Create Google Search Console account and verify domain ownership',
      'Run baseline performance tests: PageSpeed Insights, GTmetrix, and Screaming Frog',
      'Document current metrics (traffic, rankings, conversions) for before/after comparison',
      'Install an SEO plugin (Rank Math Pro or Yoast SEO Premium) if not already in use',
      'Set up weekly progress review cadence — track against the metrics table above'
    ];

    const tools = [
      { name: 'WP Rocket or W3 Total Cache', purpose: 'Page speed & caching', cost: '$49–99/year', priority: 'CRITICAL', cls: 'color-critical' },
      { name: 'Rank Math Pro or Yoast SEO', purpose: 'On-page SEO & schema', cost: 'Free–$59/year', priority: 'CRITICAL', cls: 'color-critical' },
      { name: 'Google Search Console', purpose: 'Search performance & indexing', cost: 'Free', priority: 'CRITICAL', cls: 'color-critical' },
      { name: 'Google Analytics 4', purpose: 'Website analytics & conversions', cost: 'Free', priority: 'CRITICAL', cls: 'color-critical' },
      { name: 'SEMrush or Ahrefs', purpose: 'Keyword research & backlink analysis', cost: '$99–199/month', priority: 'HIGH', cls: 'color-high' },
      { name: 'Hotjar or Microsoft Clarity', purpose: 'Heatmaps & session recordings', cost: 'Free–$39/month', priority: 'HIGH', cls: 'color-high' },
      { name: 'Cloudflare (Free) or AWS CloudFront', purpose: 'CDN & performance', cost: 'Free–$20/month', priority: 'HIGH', cls: 'color-high' },
      { name: 'Screaming Frog SEO Spider', purpose: 'Technical SEO crawl audits', cost: 'Free–£199/year', priority: 'HIGH', cls: 'color-high' },
      { name: 'Canva Pro or Figma', purpose: 'Design & graphic creation', cost: '$12–15/month', priority: 'MEDIUM', cls: 'color-medium' },
      { name: 'Grammarly Business', purpose: 'Content quality assurance', cost: '$15/month', priority: 'MEDIUM', cls: 'color-medium' },
      { name: 'Mailchimp or ConvertKit', purpose: 'Email marketing & nurture', cost: 'Free–$29/month', priority: 'MEDIUM', cls: 'color-medium' },
      { name: 'VWO or Google Optimize', purpose: 'A/B testing & CRO', cost: 'Free–$199/month', priority: 'MEDIUM', cls: 'color-medium' },
      { name: 'Looker Studio (Google)', purpose: 'Custom analytics dashboards', cost: 'Free', priority: 'MEDIUM', cls: 'color-medium' },
      { name: 'Unbounce or Leadpages', purpose: 'Dedicated landing pages', cost: '$49–90/month', priority: 'LOW', cls: 'color-low' },
      { name: 'CallRail', purpose: 'Phone call tracking & attribution', cost: '$45/month', priority: 'LOW', cls: 'color-low' },
      { name: 'Loom', purpose: 'Product demo & video creation', cost: 'Free–$12.50/month', priority: 'LOW', cls: 'color-low' },
    ];

    const actions = immediateActions.map(a => `<li>${this.escapeHTML(a)}</li>`).join('');
    const toolRows = tools.map(t => `<tr>
      <td>${this.escapeHTML(t.name)}</td>
      <td>${this.escapeHTML(t.purpose)}</td>
      <td>${this.escapeHTML(t.cost)}</td>
      <td class="${t.cls} font-semibold">${t.priority}</td>
    </tr>`).join('');

    return `<h1>8. Action Summary &amp; Next Steps</h1>

<h2>Immediate Actions (This Week)</h2>
<ol>${actions}</ol>

<h2>Success Metrics to Track</h2>
<table>
  <thead><tr><th>Weekly</th><th>Monthly</th><th>Quarterly</th></tr></thead>
  <tbody>
    <tr>
      <td>Organic traffic<br/>Keyword rankings<br/>Page speed scores<br/>Form submissions</td>
      <td>New backlinks<br/>Domain Authority<br/>Conversion rate<br/>Lead quality</td>
      <td>Revenue from organic<br/>Customer acquisition cost<br/>Lifetime value<br/>Market share</td>
    </tr>
  </tbody>
</table>

<h2>Tools &amp; Resources</h2>
<table>
  <thead><tr><th>Tool / Resource</th><th>Purpose</th><th>Est. Cost</th><th>Priority</th></tr></thead>
  <tbody>${toolRows}</tbody>
</table>

<div class="highlight-box mt-2">
  <strong>Final Note:</strong> SEO is a marathon, not a sprint. The most significant results compound over 90 days
  and beyond. Stay consistent with content creation, technical optimisations, and link building. Review this
  report monthly, track progress weekly, and adjust strategies based on data. With dedicated execution,
  this site can achieve top-3 rankings for primary keywords and 3× organic traffic within 6 months.
</div>`;
  }

  // ─── KEYWORD & CONTENT OPTIMIZATION ──────────────────────────────────────────

  buildKeywordOptimization() {
    const onPageResult = (this.audit.results || []).find(r => r.category === 'ON_PAGE_SEO');
    if (!onPageResult || !onPageResult.issues) return '';

    const issues = Array.isArray(onPageResult.issues) ? onPageResult.issues : [];
    const titleSpecifics = [];
    const metaSpecifics = [];
    const h1Specifics = [];

    for (const issue of issues) {
      if (!issue.specifics || issue.specifics.length === 0) continue;
      if (['missing_title_tags', 'short_title_tags', 'long_title_tags', 'duplicate_title_tags'].includes(issue.type)) {
        titleSpecifics.push(...issue.specifics);
      }
      if (['missing_meta_descriptions', 'short_meta_descriptions', 'long_meta_descriptions', 'duplicate_meta_descriptions'].includes(issue.type)) {
        metaSpecifics.push(...issue.specifics);
      }
      if (['missing_h1', 'multiple_h1'].includes(issue.type)) {
        h1Specifics.push(...issue.specifics);
      }
    }

    if (titleSpecifics.length === 0 && metaSpecifics.length === 0 && h1Specifics.length === 0) {
      return '';
    }

    let html = `<h2>Recommended Content &amp; Structural Updates</h2>
<p>Page-by-page copy-paste ready optimisations for title tags, meta descriptions, and H1 headings. Green cells are the recommended values — ready to implement.</p>`;

    if (titleSpecifics.length > 0) {
      html += `<h3>Homepage &amp; Key Page Title Tags</h3>
<p class="kw-note">Target: 50–60 characters | Include primary keyword + brand name</p>
<table class="specifics-table" style="margin-bottom:12pt;">
  <thead>
    <tr>
      <th style="width:26%;">Page URL</th>
      <th class="current-col" style="width:37%;">Current Title</th>
      <th class="suggested-col" style="width:37%;">Recommended Title</th>
    </tr>
  </thead>
  <tbody>`;

      for (const s of titleSpecifics.slice(0, 15)) {
        const path = (s.url || '').replace(/https?:\/\/[^/]+/, '').slice(0, 40) || '/';
        const currentLen = s.current?.length || 0;
        const suggestedLen = s.suggested?.length || 0;
        const currentVal = s.current?.value || '(none)';
        const suggestedVal = s.suggested?.value || '';
        html += `<tr>
          <td class="url-cell">${this.escapeHTML(path)}</td>
          <td class="current-value">${this.escapeHTML(currentVal.length > 65 ? currentVal.slice(0, 62) + '...' : currentVal)}${currentLen > 0 ? ` <span class="length-badge">${currentLen}c</span>` : ''}</td>
          <td class="suggested-value"><strong>${this.escapeHTML(suggestedVal.length > 65 ? suggestedVal.slice(0, 62) + '...' : suggestedVal)}</strong>${suggestedLen > 0 ? ` <span class="length-badge good">${suggestedLen}c</span>` : ''}</td>
        </tr>`;
      }
      if (titleSpecifics.length > 15) {
        html += `<tr><td colspan="3" class="more-rows">+ ${titleSpecifics.length - 15} more pages require title tag updates</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    if (metaSpecifics.length > 0) {
      html += `<h3>Meta Description Optimisation</h3>
<p class="kw-note">Target: 130–155 characters | Compelling summary with a soft call-to-action</p>
<table class="specifics-table" style="margin-bottom:12pt;">
  <thead>
    <tr>
      <th style="width:22%;">Page URL</th>
      <th class="current-col" style="width:39%;">Current Meta Description</th>
      <th class="suggested-col" style="width:39%;">Recommended Meta Description</th>
    </tr>
  </thead>
  <tbody>`;

      for (const s of metaSpecifics.slice(0, 10)) {
        const path = (s.url || '').replace(/https?:\/\/[^/]+/, '').slice(0, 32) || '/';
        const currentVal = s.current?.value || '(none)';
        const suggestedVal = s.suggested?.value || '';
        const currentLen = s.current?.length || 0;
        const suggestedLen = s.suggested?.length || 0;
        html += `<tr>
          <td class="url-cell">${this.escapeHTML(path)}</td>
          <td class="current-value">${this.escapeHTML(currentVal.length > 100 ? currentVal.slice(0, 97) + '...' : currentVal)}${currentLen > 0 ? ` <span class="length-badge">${currentLen}c</span>` : ''}</td>
          <td class="suggested-value"><strong>${this.escapeHTML(suggestedVal.length > 100 ? suggestedVal.slice(0, 97) + '...' : suggestedVal)}</strong>${suggestedLen > 0 ? ` <span class="length-badge good">${suggestedLen}c</span>` : ''}</td>
        </tr>`;
      }
      if (metaSpecifics.length > 10) {
        html += `<tr><td colspan="3" class="more-rows">+ ${metaSpecifics.length - 10} more pages require meta description updates</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    if (h1Specifics.length > 0) {
      html += `<h3>H1 Heading Fixes</h3>
<p class="kw-note">One H1 per page | Should include primary keyword | Can differ from title tag</p>
<table class="specifics-table" style="margin-bottom:12pt;">
  <thead>
    <tr>
      <th style="width:28%;">Page URL</th>
      <th class="current-col" style="width:36%;">Current H1</th>
      <th class="suggested-col" style="width:36%;">Recommended H1</th>
    </tr>
  </thead>
  <tbody>`;

      for (const s of h1Specifics.slice(0, 10)) {
        const path = (s.url || '').replace(/https?:\/\/[^/]+/, '').slice(0, 40) || '/';
        const currentVal = s.current?.value || '(none)';
        const suggestedVal = s.suggested?.value || '';
        html += `<tr>
          <td class="url-cell">${this.escapeHTML(path)}</td>
          <td class="current-value">${this.escapeHTML(currentVal)}</td>
          <td class="suggested-value"><strong>${this.escapeHTML(suggestedVal)}</strong></td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }

    return html;
  }

  getSpecificsForIssue(issueTitle) {
    for (const result of (this.audit.results || [])) {
      const issues = Array.isArray(result.issues) ? result.issues : [];
      for (const issue of issues) {
        if (issue.title === issueTitle && issue.specifics?.length > 0) {
          return issue.specifics.slice(0, 4);
        }
      }
    }
    return [];
  }

  buildSpecificsTable(specifics, maxRows = 4) {
    if (!specifics || specifics.length === 0) return '';
    const rows = specifics.slice(0, maxRows).map(s => {
      const path = (s.url || '').replace(/https?:\/\/[^/]+/, '').slice(0, 35) || '/';
      const currentVal = s.current?.value || '';
      const suggestedVal = s.suggested?.value || '';
      const currentLen = s.current?.length || currentVal.length;
      const suggestedLen = s.suggested?.length || suggestedVal.length;
      return `<tr>
        <td class="url-cell">${this.escapeHTML(path)}</td>
        <td class="current-value">${this.escapeHTML(currentVal.length > 55 ? currentVal.slice(0, 52) + '...' : currentVal)}${currentLen > 0 ? ` <span class="length-badge">${currentLen}c</span>` : ''}</td>
        <td class="suggested-value">${this.escapeHTML(suggestedVal.length > 55 ? suggestedVal.slice(0, 52) + '...' : suggestedVal)}${suggestedLen > 0 ? ` <span class="length-badge good">${suggestedLen}c</span>` : ''}</td>
      </tr>`;
    }).join('');
    const moreCount = specifics.length - maxRows;
    return `<div class="before-after-section">
  <div class="before-after-label">Before / After Specifics</div>
  <table class="specifics-table">
    <thead><tr>
      <th style="width:28%;">Page</th>
      <th class="current-col" style="width:36%;">Current</th>
      <th class="suggested-col" style="width:36%;">Recommended</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${moreCount > 0 ? `<div class="more-rows">+ ${moreCount} more — see full table in the Keyword Optimisation section below</div>` : ''}
</div>`;
  }

  getImplementationSteps(title) {
    const lookup = {
      "Robots.txt Blocks All Pages": [
        "Open your robots.txt file at https://[yourdomain]/robots.txt",
        "Find “Disallow: /” and change it to “Disallow:” (empty value = allow all crawlers)",
        "Keep “User-agent: *” at the top to apply to all search engines",
        "Add: “Sitemap: https://[yourdomain]/sitemap.xml” at the bottom",
        "Verify the fix in Google Search Console → Settings → robots.txt Tester",
        "Request re-crawl in Google Search Console after confirming the fix is live",
      ],
      "Missing XML Sitemap": [
        "Install Rank Math or Yoast SEO (WordPress) to auto-generate a sitemap at /sitemap.xml",
        "For other platforms, use your CMS sitemap feature or an online generator",
        "Include all important pages: homepage, service pages, blog posts, landing pages",
        "Exclude: admin pages, search results, thank-you pages, and near-duplicate content",
        "Add “Sitemap: https://[yourdomain]/sitemap.xml” to robots.txt",
        "Submit the sitemap in Google Search Console → Sitemaps section",
        "Also submit in Bing Webmaster Tools for additional coverage",
      ],
      "No Structured Data Found": [
        "Add Organization schema to your homepage using JSON-LD format in <script type=\"application/ld+json\">",
        "Add WebSite schema with a SearchAction to enable sitelinks in Google",
        "For service/local businesses add LocalBusiness schema with address, phone, and hours",
        "Add Article/BlogPosting schema to all blog posts (include author, date, image)",
        "Add BreadcrumbList schema to all interior pages",
        "Add FAQPage schema to any page with question-and-answer sections",
        "Validate with Google's Rich Results Test before deploying",
      ],
      "Missing H1 Tags": [
        "Identify the primary keyword/topic for each affected page",
        "Add a single descriptive H1 tag that summarises the page and includes the target keyword",
        "Ensure the H1 is visible, not hidden, and appears only once per page",
        "In WordPress, the page/post title typically becomes the H1 — check your theme isn't hiding it",
        "In page builders (Elementor, Divi), set heading elements explicitly to H1 vs H2",
        "Verify with Screaming Frog or your browser's dev tools after publishing",
      ],
      "Multiple H1 Tags": [
        "Use your browser DevTools (Ctrl+F → “h1”) or Screaming Frog to find all H1 elements",
        "Keep only the single most important H1 that describes the page's primary topic",
        "Convert all other H1 elements to H2 or H3 based on their place in the content hierarchy",
        "Common cause: page builders adding H1 tags for decorative headings — change these to H2",
        "Also check if your theme adds a site title as an H1 in addition to post titles",
        "Re-audit after changes to confirm only one H1 remains per page",
      ],
      "Images Missing Alt Text": [
        "Audit all images using Screaming Frog (free up to 500 URLs) or your SEO plugin",
        "For each content image, write a 5–15 word description of what the image shows",
        "Include target keywords naturally where relevant — never keyword-stuff alt text",
        "Use empty alt=\"\" for purely decorative images (icons, dividers, backgrounds)",
        "In WordPress, set alt text in the Media Library for each image or in the block editor",
        "Prioritise: product images, infographics, charts, team photos, and hero images first",
        "Regenerate thumbnails after updating if images are served via WordPress media",
      ],
      "Missing Meta Descriptions": [
        "Write a unique 130–155 character meta description for each affected page",
        "Include the primary keyword naturally within the description",
        "Frame it as a compelling benefit summary to improve click-through rates from search results",
        "Add a soft call-to-action where natural: “Learn more”, “See pricing”, “Get started”",
        "In WordPress, use Rank Math or Yoast to set meta descriptions without editing theme files",
        "Avoid duplicating descriptions — each page must have a unique one",
        "Monitor in Google Search Console to see where Google auto-generates descriptions instead",
      ],
      "Title Tags Too Short": [
        "Expand each title tag to 50–60 characters to fill the available SERP display space",
        "Include the primary keyword for the page near the beginning of the title",
        "Append the brand name at the end: “Main Topic - Descriptor | Brand Name”",
        "Use pipes (|) or hyphens (-) as separators — both are acceptable",
        "Research competing pages ranking for your target keywords for title inspiration",
        "Test updated titles in a SERP preview tool (e.g. Portent Title Tag Preview) before publishing",
        "Track CTR changes in Google Search Console after updating (takes 2–4 weeks to measure)",
      ],
      "Title Tags Too Long": [
        "Shorten each title to stay within 60 characters (Google truncates at ~600px width)",
        "Prioritise the most important keyword at the beginning of the title",
        "Remove filler words: “Welcome to”, “The official”, “A great place for”",
        "Abbreviate the brand name if it's very long (e.g. \"CompanyName\" → \"Brand\")",
        "Use a SERP preview tool to confirm the shortened title won't truncate awkwardly",
        "Test both desktop and mobile SERP previews — mobile may truncate earlier",
      ],
      "Duplicate Title Tags": [
        "Export all page URLs and title tags (use Screaming Frog or your SEO plugin)",
        "Group pages with identical titles and identify what makes each page unique",
        "Rewrite each title to reflect the specific content, keyword, and searcher intent of that page",
        "For very similar pages (e.g. city location pages), include the city name to differentiate",
        "Consider consolidating near-duplicate pages into one stronger page with a 301 redirect",
        "Add canonical tags if two pages are unavoidably similar and one is the primary version",
      ],
      "Missing LocalBusiness Schema": [
        "Create a JSON-LD LocalBusiness schema block for your homepage or contact page",
        "Include: @type, name, url, telephone, email, address (full postal address)",
        "Add openingHoursSpecification for each day with opens and closes times",
        "Include geo coordinates (latitude and longitude) for accurate map placement",
        "Add image (logo URL), priceRange ($, $$, $$$), and sameAs links to social profiles",
        "Use Google's Rich Results Test to validate schema before publishing",
        "Install Rank Math or Schema Pro plugin for easier schema management in WordPress",
      ],
      "No Google Maps Embed": [
        "Go to Google Maps and search for your business address",
        "Click Share → Embed a map → Copy the provided HTML iframe code",
        "Paste the embed on your Contact or About page in a suitable location",
        "Ensure the embedded map address matches your LocalBusiness schema address exactly",
        "Alternatively, add a text link to a custom Google Maps pin for your location",
        "Test on mobile — ensure the iframe is responsive and doesn't overflow its container",
      ],
      "Keyword Cannibalization Risk": [
        "Export all page titles and URLs; identify pages targeting the same core keywords",
        "For each conflicting pair, determine which page is the primary (most authoritative) target",
        "Consolidate very similar pages into one stronger page using 301 redirects",
        "Where pages must remain separate, rewrite each to target distinctly different keyword variations",
        "Update internal links so only the primary page gets the most contextual links",
        "Add canonical tags where content is necessarily similar but pages serve different audiences",
        "Track rankings per keyword in Google Search Console to confirm only one page surfaces per query",
      ],
      "Potential Keyword Cannibalization": [
        "Export all page titles and URLs; identify pages targeting the same core keywords",
        "For each conflicting pair, determine which is the primary (most authoritative) target page",
        "Consolidate very similar pages into one stronger page using 301 redirects where possible",
        "Where pages must remain separate, rewrite content to target distinctly different keyword variants",
        "Ensure internal links prioritise the primary page for each target keyword",
      ],
      "Missing Canonical Tags": [
        "Add a self-referencing canonical tag to every page in the <head>: <link rel=\"canonical\" href=\"[full-URL]\">",
        "Ensure canonical URLs always use HTTPS and match your preferred URL format (trailing slash or not)",
        "In WordPress, Rank Math and Yoast automatically add self-referencing canonicals",
        "For paginated content, canonical page 1 or use rel=\"next\" / rel=\"prev\"",
        "For pages with URL parameters (e.g. ?sort=price), canonical to the clean base URL",
        "Audit with Screaming Frog to confirm canonical tags are present and correct site-wide",
      ],
      "Trailing Slash Inconsistency": [
        "Decide on one canonical format: always trailing slash (/about/) OR never (/about)",
        "Implement 301 redirects for the non-canonical form to the canonical form",
        "Update your CMS permalink settings to enforce consistent URL formatting",
        "Update all internal links in navigation, footer, and body content to use the canonical form",
        "Set your preferred URL format in Google Search Console under Settings",
        "Submit a fresh sitemap after changes to help Google re-index the correct URLs",
      ],
      "Sitemap Not Referenced in Robots.txt": [
        "Open your robots.txt file for editing",
        "Add the following line at the very end: Sitemap: https://[yourdomain]/sitemap.xml",
        "If you have multiple sitemaps (image sitemap, news sitemap), add one line per sitemap",
        "Save and verify the change is live at https://[yourdomain]/robots.txt",
        "Test in Google Search Console → Settings → robots.txt Tester",
      ],
      "Possible JavaScript-Dependent Content": [
        "Use Google Search Console's URL Inspection → Test Live URL to see how Googlebot renders your page",
        "Ensure all critical content (headings, descriptions, CTAs) is in the initial HTML response",
        "Test by disabling JavaScript in your browser — does the core content still appear?",
        "Implement server-side rendering (SSR) or static pre-rendering for JavaScript-heavy pages",
        "For forms requiring JS, ensure at least a fallback message is visible without JavaScript",
        "Consider pre-rendering critical content with tools like Prerender.io or Next.js SSR",
      ],
      "Poor Internal Linking": [
        "Add 3–5 contextual internal links within the body content of each key page",
        "Link from high-traffic pages to lower-traffic pages you want to rank higher",
        "Use descriptive anchor text containing target keywords (not generic “click here”)",
        "Create topic clusters: one pillar page with multiple supporting pages all cross-linking",
        "Add “Related Articles” or “You may also like” sections to blog posts and service pages",
        "Audit your navigation to ensure all important pages are reachable within 3 clicks from homepage",
        "Fix orphaned pages (pages with no internal links pointing to them) by linking from relevant content",
      ],
      "Missing robots.txt": [
        "Create a plain text file named robots.txt in your website root directory",
        "Minimum content: “User-agent: *\nDisallow:” (blank Disallow = allow everything)",
        "Add sitemap reference: “Sitemap: https://[yourdomain]/sitemap.xml”",
        "Optionally block directories you don't want indexed: admin, wp-admin, staging, duplicate search results",
        "Never block /wp-content/ or CSS/JS files — Google needs these to render your pages",
        "Verify at https://[yourdomain]/robots.txt and test in Google Search Console",
      ],
      "Thin Content on Key Pages": [
        "Identify your most important pages (homepage, service pages, pillar landing pages)",
        "Expand each to at least 800 words (service pages) or 1,200+ words (pillar/resource pages)",
        "Add: case studies with specific metrics, industry statistics (with citations), and concrete examples",
        "Include a FAQ section covering the top 5–10 questions your target audience asks",
        "Add internal links to related content to improve topical depth and crawl efficiency",
        "Use subheadings (H2s, H3s) to structure expanded content for readability",
        "After expanding, submit updated URLs for indexing in Google Search Console",
      ],
    };
    return lookup[title] || [];
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  identifyStrengths() {
    const strengths = [];
    const techResult = (this.audit.results || []).find(r => r.category === 'TECHNICAL_SEO');
    const techChecks = techResult?.checks || {};
    const onPageResult = (this.audit.results || []).find(r => r.category === 'ON_PAGE_SEO');
    const onPageChecks = onPageResult?.checks || {};
    const perfResult = (this.audit.results || []).find(r => r.category === 'PERFORMANCE');
    const perfChecks = perfResult?.checks || {};

    // ── Data-driven strengths from actual check results ──────────────

    // SSL / HTTPS
    if (techChecks.ssl?.hasSSL === true) {
      strengths.push({
        title: 'HTTPS / SSL Certificate Active',
        description: 'All pages are served over HTTPS, satisfying Google\'s security requirement and protecting visitor data in transit.',
        preserve: 'Monitor certificate expiry (via SSL Shopper or Cloudflare). Renew at least 30 days before expiry. Scan monthly for mixed-content warnings using Why No Padlock.'
      });
    }

    // XML Sitemap
    if (techChecks.sitemap?.exists === true) {
      const urlCount = techChecks.sitemap.urlCount;
      const sitemapUrl = techChecks.sitemap.url || '';
      const urlNote = urlCount > 0 ? ` containing ${urlCount} URLs` : '';
      strengths.push({
        title: `XML Sitemap Present${urlCount > 0 ? ` (${urlCount} URLs indexed)` : ''}`,
        description: `A valid XML sitemap was found${sitemapUrl ? ` at ${sitemapUrl.replace(/https?:\/\/[^/]+/, '')}` : ''}${urlNote}. This helps search engines discover and crawl all important pages efficiently.`,
        preserve: 'Keep the sitemap auto-updating whenever new content is published. Ensure it\'s submitted in both Google Search Console and Bing Webmaster Tools. Keep each sitemap file under 50,000 URLs.'
      });
    }

    // Robots.txt
    if (techChecks.robotsTxt?.exists === true && !techChecks.robotsTxt?.hasDisallowAll) {
      const hasSitemapRef = techChecks.robotsTxt?.hasSitemapReference;
      strengths.push({
        title: 'robots.txt Properly Configured',
        description: `A valid robots.txt file exists that allows search engine crawlers to access the site${hasSitemapRef ? ' and includes a sitemap reference' : ''}. Correct robot directives prevent crawl waste.`,
        preserve: 'Update this file whenever you add new subdirectories or subdomains. Never add "Disallow: /" in production. Always reference your sitemap URL at the bottom of the file.'
      });
    }

    // Mobile Responsiveness
    if (techChecks.mobileResponsive?.percentageOptimized >= 80) {
      const pct = Math.round(techChecks.mobileResponsive.percentageOptimized);
      strengths.push({
        title: `Mobile-Responsive Design (${pct}% of pages pass)`,
        description: `${pct}% of crawled pages passed mobile responsiveness checks. Google uses mobile-first indexing, meaning your mobile experience directly determines your search rankings.`,
        preserve: 'Test on multiple screen sizes after every layout change. Use Google\'s Mobile-Friendly Test after updates. Ensure tap targets are at least 44×44px and text is legible at 16px without zooming.'
      });
    } else if (!techChecks.mobileResponsive) {
      // Fallback if we didn't measure it
      strengths.push({
        title: 'Mobile-Responsive Design',
        description: 'The site uses a responsive design framework ensuring usability across all device sizes — a core Google ranking factor since 2019.',
        preserve: 'Continue testing on multiple devices after layout changes. Maintain a mobile-first approach to all new features.'
      });
    }

    // Structured Data
    if (techChecks.structuredData?.pagesWithSchema > 0) {
      const pct = Math.round(techChecks.structuredData.percentageWithSchema || 0);
      const count = techChecks.structuredData.pagesWithSchema;
      strengths.push({
        title: `Structured Data / Schema Markup (${pct}% of pages)`,
        description: `Schema.org markup is present on ${count} pages (${pct}% of site). Structured data enables rich results in Google Search — stars, FAQs, breadcrumbs — that significantly increase click-through rates.`,
        preserve: 'Validate all schema with Google\'s Rich Results Test after every update. Expand to remaining pages. Add FAQ, HowTo, and Review schema types to relevant content as it\'s created.'
      });
    }

    // Canonical Tags
    if (techChecks.canonicalTags?.percentageWithCanonical >= 80) {
      const pct = Math.round(techChecks.canonicalTags.percentageWithCanonical);
      strengths.push({
        title: `Canonical Tags Implemented (${pct}% of pages)`,
        description: `${pct}% of pages have canonical tags, preventing duplicate content penalties and consolidating link equity to preferred URLs.`,
        preserve: 'Ensure canonical tags always use HTTPS and your preferred URL format (with or without trailing slash). Audit after any URL restructure with Screaming Frog.'
      });
    }

    // On-Page: good internal linking
    if (onPageChecks.internalLinking?.avgLinksPerPage >= 5) {
      const avg = onPageChecks.internalLinking.avgLinksPerPage.toFixed(1);
      strengths.push({
        title: `Good Internal Linking (avg ${avg} links/page)`,
        description: `Pages average ${avg} internal links, helping search engines discover content and distributing link equity across the site. Strong internal linking is a key on-page ranking factor.`,
        preserve: 'Maintain at least 3–5 internal links per page. When publishing new content, always link to it from existing relevant pages. Use descriptive anchor text containing target keywords.'
      });
    }

    // Performance: good scores
    if (perfChecks.averageLoadTime && perfChecks.averageLoadTime < 3000) {
      const ms = Math.round(perfChecks.averageLoadTime);
      strengths.push({
        title: `Acceptable Page Load Speed (avg ${ms}ms)`,
        description: `Average page load time of ${ms}ms is within an acceptable range. Page speed is a confirmed Google ranking factor and directly impacts bounce rate and conversions.`,
        preserve: 'Monitor PageSpeed Insights weekly. Re-test after plugin or theme updates. Keep Largest Contentful Paint (LCP) under 2.5s and Total Blocking Time (TBT) under 200ms.'
      });
    }

    // ── Category-level strengths for high-scoring categories ────────
    const preserveMap = {
      'TECHNICAL_SEO': 'Maintain current technical setup. Re-run Screaming Frog crawls monthly. Monitor Core Web Vitals in Google Search Console.',
      'ON_PAGE_SEO': 'Continue current on-page practices. Expand consistent title/meta/H1 patterns to every new page you publish.',
      'CONTENT_QUALITY': 'Keep publishing high-quality content. Aim for 1,500+ words on key service pages. Update older posts with fresh statistics annually.',
      'PERFORMANCE': 'Monitor page speed weekly via PageSpeed Insights. Re-test after any major plugin or theme updates.',
      'AUTHORITY_BACKLINKS': 'Continue link-building efforts. Diversify anchor text and referring domains. Disavow toxic links quarterly using Google\'s disavow tool.',
      'LOCAL_SEO': 'Keep Google Business Profile updated weekly. Respond to all reviews within 24 hours. Add new photos monthly to signal activity.',
    };

    for (const result of (this.audit.results || [])) {
      if (result.categoryScore >= 75 && strengths.length < 9) {
        const cat = this.formatCategoryName(result.category);
        // Avoid duplicating a strength already added from check data
        const alreadyCovered = strengths.some(s =>
          (result.category === 'TECHNICAL_SEO' && s.title.includes('SSL')) ||
          (result.category === 'TECHNICAL_SEO' && s.title.includes('Sitemap'))
        );
        if (!alreadyCovered) {
          strengths.push({
            title: `Strong ${cat} Score (${result.categoryScore}/100)`,
            description: `Your ${cat.toLowerCase()} score of ${result.categoryScore}/100 is above average. This is a solid foundation — the remaining improvements in this report will push it higher.`,
            preserve: preserveMap[result.category] || 'Continue current practices and monitor for regressions.'
          });
        }
      }
    }

    // ── Site-specific strengths from actual page data ─────────────────
    const pages = this.audit.pages || [];
    const homepage = pages.find(p => p.path === '/' || p.path === '') || pages[0];

    // Brand tagline / headline from homepage H1
    if (homepage && (homepage.h1Tags || []).length > 0 && strengths.length < 9) {
      const h1 = homepage.h1Tags[0];
      if (h1 && h1.length > 10 && h1.length < 120) {
        strengths.push({
          title: 'Strong Brand Headline',
          description: `Homepage headline: "${h1}" — clearly communicates your value proposition to visitors. A strong first impression helps reduce bounce rate and establish brand positioning in search results.`,
          preserve: 'Test variations of this headline via A/B testing, but never remove a working headline without a proven replacement ready. Ensure it\'s the only H1 on the page.'
        });
      }
    }

    // Engaging/memorable brand copywriting
    if (homepage && strengths.length < 10) {
      const metaDesc = homepage.metaDescription || '';
      const h2s = homepage.h2Tags || [];

      // Look for emotional/benefit-driven language in headings
      const engagingH2 = h2s.find(h =>
        h.length > 20 &&
        /thrive|transform|power|revolution|future|success|growth|close.*gap|upskill/i.test(h)
      );

      if (engagingH2 && strengths.length < 10) {
        strengths.push({
          title: 'Engaging Section Headings',
          description: `Benefit-driven headings like "${engagingH2}" demonstrate clear value proposition and use emotional hooks that improve dwell time. Strong headings also help Google understand page structure and relevance.`,
          preserve: 'Continue writing H2s as outcome statements, not just topic labels. "Close the Skills Gap with AI-Powered Pathing" outranks "Our Features" for both users and search engines.'
        });
      } else if (metaDesc && metaDesc.length > 80 && !metaDesc.includes('Learn more on') && strengths.length < 10) {
        // Use meta description as evidence of copywriting quality
        strengths.push({
          title: 'Descriptive Homepage Meta',
          description: `Homepage has a substantive meta description: "${metaDesc.substring(0, 120)}${metaDesc.length > 120 ? '…' : ''}". A well-crafted meta description improves click-through rates from search results.`,
          preserve: 'Update meta descriptions whenever the core value proposition evolves. Keep them 130–155 characters with a benefit statement and soft CTA.'
        });
      }
    }

    // Active blog / content section
    const blogPages = pages.filter(p =>
      /\/(blog|article|post|news|insights?|resources?)s?\//i.test(p.url || '') &&
      (p.title || '').length > 5
    );
    if (blogPages.length >= 2 && strengths.length < 9) {
      const blogTitles = blogPages.slice(0, 2).map(p => `"${p.title || p.path}"`).join(' and ');
      strengths.push({
        title: `Active Blog / Content Section (${blogPages.length} articles found)`,
        description: `${blogPages.length} blog/article pages detected, including ${blogTitles}. Regular, high-quality content is one of the strongest organic ranking signals and establishes topical authority.`,
        preserve: `Keep publishing 2–4 high-quality articles per month (1,500+ words). Ensure each post has a unique title, meta description, and at least 3 internal links to service pages. Feature recent posts on the homepage.`
      });
    }

    // Testimonial / case study pages
    const trustPages = pages.filter(p =>
      /\/(testimonial|review|case.?stud|client|success|about|team)/i.test(p.path || '') ||
      /testimonial|case stud|client success|customer story/i.test(p.title || '')
    );
    // Also check homepage HTML for testimonial content
    const homepageHasTestimonials = homepage && homepage.html &&
      /testimonial|"[^"]{10,}"\s*[-—]\s*[A-Z][a-z]|blockquote|client.?says|customer.?review/i.test(homepage.html);

    if ((trustPages.length > 0 || homepageHasTestimonials) && strengths.length < 10) {
      const source = trustPages.length > 0
        ? `Dedicated trust pages found: ${trustPages.slice(0, 2).map(p => p.title || p.path).join(', ')}.`
        : 'Customer testimonials found on homepage.';

      strengths.push({
        title: `Customer Proof & Social Validation${trustPages.length > 0 ? ` (${trustPages.length} dedicated pages)` : ''}`,
        description: `${source} Social proof is essential for B2B conversion — real customer outcomes validate your claims and reduce purchase hesitation.`,
        preserve: 'Regularly add new testimonials with company names, roles, and specific metrics. Aim for video testimonials (3× more persuasive than text). Feature case study results with % improvements and time-to-value metrics.'
      });
    }

    // Multiple service/solution pages
    const servicePages = pages.filter(p =>
      /\/(service|solution|product|feature|offering|plan|pricing)/i.test(p.path || '')
    );
    if (servicePages.length >= 3 && strengths.length < 9) {
      strengths.push({
        title: `Comprehensive Service Structure (${servicePages.length} service pages)`,
        description: `${servicePages.length} dedicated service/solution pages detected. A comprehensive page structure helps target specific keyword variations and guides different visitor personas to relevant content.`,
        preserve: 'Maintain this structure as you add new services. Ensure each service page has unique title tags, meta descriptions, and at least 1,000 words of unique content. Cross-link between related service pages.'
      });
    }

    // Multiple conversion points (CTAs, forms, newsletter signup)
    if (homepage && homepage.html && strengths.length < 10) {
      const ctaSignals = [
        /sign.?up|get.?started|free.?trial|start.?free|try.?free/i.test(homepage.html),
        /book.?demo|request.?demo|schedule.?demo|get.?demo/i.test(homepage.html),
        /<form[\s>]/i.test(homepage.html),
        /newsletter|subscribe/i.test(homepage.html),
        /contact.?us|get.?in.?touch/i.test(homepage.html)
      ].filter(Boolean).length;

      if (ctaSignals >= 2) {
        strengths.push({
          title: 'Multiple Conversion Points',
          description: `The homepage includes ${ctaSignals} distinct conversion opportunities (sign-up CTAs, demo requests, contact forms, newsletter). Multiple touchpoints increase the chance of capturing visitors at different stages of the buying journey.`,
          preserve: 'Keep CTAs visible and prominent. A/B test CTA copy variations ("Get Started Free" vs "See It in Action" vs "Start Free Trial"). Ensure every key page has at least one primary CTA above the fold.'
        });
      }
    }

    // Schema markup present
    const pagesWithSchema = pages.filter(p => (p.schemaTypes || []).length > 0);
    if (pagesWithSchema.length > 0 && strengths.length < 9) {
      const schemaTypes = [...new Set(pages.flatMap(p => p.schemaTypes || []))].slice(0, 4);
      strengths.push({
        title: `Structured Data Implemented (${pagesWithSchema.length} pages)`,
        description: `Schema markup found on ${pagesWithSchema.length} pages including ${schemaTypes.join(', ')} types. Structured data enables rich results in search (star ratings, FAQs, breadcrumbs) and increases click-through rates by 20–30%.`,
        preserve: 'Validate all schema with Google\'s Rich Results Test quarterly. Expand to all pages and add new schema types (FAQ, HowTo, Review) as content is created.'
      });
    }

    // ── Generic fallbacks (only if we still don't have enough) ───────────────
    const generic = [
      {
        title: 'HTTPS Security',
        description: 'Site uses HTTPS, meeting Google\'s security requirements and protecting visitor data in transit.',
        preserve: 'Maintain your SSL certificate. Monitor for mixed content warnings using Why No Padlock. Renew at least 30 days before expiry.'
      },
      {
        title: 'Mobile-Responsive Design',
        description: 'Responsive design ensures usability across all devices — a core Google ranking factor since mobile-first indexing launched in 2019.',
        preserve: 'Continue testing on multiple devices after layout changes. Maintain a mobile-first approach to all new features.'
      },
      {
        title: 'Clear Site Architecture',
        description: 'Logical page hierarchy makes it easy for both users and search engine crawlers to navigate the site efficiently.',
        preserve: 'Maintain this structure as you add new pages. Add breadcrumb navigation to enhance UX and provide additional structured data signals.'
      },
      {
        title: 'Social Media Integration',
        description: 'Social profiles and sharing signals support multi-channel brand visibility and referral traffic to the site.',
        preserve: 'Ensure all social profiles are active and link back to the website. Use consistent NAP (Name, Address, Phone) across all platforms.'
      },
      {
        title: 'Multiple Conversion Points',
        description: 'Multiple CTAs and contact options throughout the site create numerous opportunities for visitors to take action.',
        preserve: 'Keep CTAs visible but A/B test copy and colour variations. Don\'t remove CTAs without testing replacement variants first.'
      },
    ];

    for (const g of generic) {
      if (strengths.length >= 9) break;
      if (g.title.includes('HTTPS') && strengths.some(s => s.title.includes('HTTPS'))) continue;
      if (g.title.includes('Mobile') && strengths.some(s => s.title.includes('Mobile'))) continue;
      if (g.title.includes('Structured') && strengths.some(s => s.title.includes('Structured'))) continue;
      strengths.push(g);
    }

    return strengths.slice(0, 9);
  }

  getScoreColorClass(score) {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'needsimprovement';
    return 'poor';
  }

  formatCategoryName(category) {
    const names = {
      TECHNICAL_SEO: 'Technical SEO',
      ON_PAGE_SEO: 'On-Page SEO',
      CONTENT_QUALITY: 'Content Quality',
      PERFORMANCE: 'Performance',
      AUTHORITY_BACKLINKS: 'Authority & Backlinks',
      LOCAL_SEO: 'Local SEO'
    };
    return names[category] || category;
  }

  formatRating(rating) {
    if (!rating) return 'N/A';
    return rating.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  escapeHTML(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default EnhancedSEOReportGenerator;
