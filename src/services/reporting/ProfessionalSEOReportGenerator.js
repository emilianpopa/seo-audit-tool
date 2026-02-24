import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import puppeteer, { executablePath as puppeteerBundledPath } from 'puppeteer';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';

function findChromiumExecutable() {
  // 1. Explicit env var (highest priority — set in Railway dashboard)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    logger.info({ path: process.env.PUPPETEER_EXECUTABLE_PATH }, 'Chromium: using PUPPETEER_EXECUTABLE_PATH');
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Path captured during nixpacks build phase (which chromium → /app/.chromium-path)
  try {
    const buildCapturedPath = fs.readFileSync('/app/.chromium-path', 'utf-8').trim();
    if (buildCapturedPath && fs.existsSync(buildCapturedPath)) {
      logger.info({ path: buildCapturedPath }, 'Chromium: using build-captured Nix path');
      return buildCapturedPath;
    }
  } catch {}

  // 3. Puppeteer's own bundled Chrome (downloaded during npm install)
  try {
    const bundled = puppeteerBundledPath();
    if (bundled && fs.existsSync(bundled)) {
      logger.info({ path: bundled }, 'Chromium: using Puppeteer bundled Chrome');
      return bundled;
    }
  } catch {}

  // 4. Runtime which chromium (last resort)
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
 * Professional SEO Report Generator
 *
 * Generates consultant-grade PDF reports using HTML/CSS + Puppeteer
 * - Clean 8-12 page layout with proper pagination
 * - Evidence-based findings with specific URLs
 * - Conservative, defensible scoring with confidence indicators
 * - Minimal boilerplate, maximum signal
 */
class ProfessionalSEOReportGenerator {
  constructor(auditId) {
    this.auditId = auditId;
    this.audit = null;
    this.reportDir = path.join(process.cwd(), 'reports');
    this.templatePath = path.join(process.cwd(), 'src', 'services', 'reporting', 'templates', 'report-template.html');

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Load audit data from database
   */
  async loadAuditData() {
    logger.info({ auditId: this.auditId }, 'Loading audit data for professional report');

    this.audit = await prisma.seoAudit.findUnique({
      where: { id: this.auditId },
      include: {
        results: true,
        pages: {
          take: 100,
          orderBy: { createdAt: 'desc' }
        },
        recommendations: {
          orderBy: [
            { priority: 'asc' },
            { effortLevel: 'asc' }
          ]
        }
      }
    });

    if (!this.audit) {
      throw new Error(`Audit ${this.auditId} not found`);
    }

    if (this.audit.status !== 'COMPLETED') {
      throw new Error(`Audit ${this.auditId} is not completed yet`);
    }

    logger.info({ auditId: this.auditId }, 'Audit data loaded for professional report');
    return this.audit;
  }

  /**
   * Generate PDF report using Puppeteer
   */
  async generatePDF() {
    logger.info({ auditId: this.auditId }, 'Generating professional PDF report');

    if (!this.audit) {
      await this.loadAuditData();
    }

    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const filename = `seo-audit-${domain}-${new Date().toISOString().split('T')[0]}.pdf`;
    const filepath = path.join(this.reportDir, filename);

    // Generate HTML content
    const htmlContent = this.buildHTMLReport();

    // Read template
    const template = fs.readFileSync(this.templatePath, 'utf-8');
    const fullHTML = template.replace('{{content}}', htmlContent).replace('{{domain}}', domain);

    // Save HTML for debugging - lets us inspect what Puppeteer receives
    const htmlDebugPath = filepath.replace('.pdf', '.html');
    fs.writeFileSync(htmlDebugPath, fullHTML);
    logger.info({ htmlDebugPath }, 'Saved HTML debug file alongside PDF');

    // Convert to PDF using Puppeteer
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
    if (chromiumPath) {
      launchOptions.executablePath = chromiumPath;
    }

    let browser;
    try {
      browser = await puppeteer.launch({ ...launchOptions, timeout: 60000 });
    } catch (launchErr) {
      logger.error({ err: launchErr, chromiumPath, launchOptions }, 'Puppeteer launch failed');
      throw launchErr;
    }

    try {
      const page = await browser.newPage();
      // Set viewport to A4 width for consistent rendering
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      await page.setContent(fullHTML, { waitUntil: 'networkidle0', timeout: 30000 });

      await page.pdf({
        path: filepath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          right: '12mm',
          bottom: '15mm',
          left: '12mm'
        },
        timeout: 60000
      });
    } finally {
      await browser.close();
    }

    logger.info({ auditId: this.auditId, filepath }, 'Professional PDF report generated successfully');
    return filepath;
  }

  /**
   * Build a Map<issueTitle → specifics[]> from all raw analyzer results.
   * Specifics are stored in the SeoAuditResult.issues JSON column.
   */
  buildSpecificsMap() {
    const map = new Map();
    for (const result of this.audit.results) {
      const issues = Array.isArray(result.issues) ? result.issues : [];
      for (const issue of issues) {
        if (issue.specifics && issue.specifics.length > 0) {
          map.set(issue.title, issue.specifics);
        }
      }
    }
    return map;
  }

  /**
   * Render a before/after comparison table for an issue's specifics.
   * Returns empty string if no specifics.
   */
  buildBeforeAfterTable(specifics, maxRows = 6) {
    if (!specifics || specifics.length === 0) return '';

    const rows = specifics.slice(0, maxRows);
    const isImageIssue = rows[0].field === 'alt' || rows[0].imageSrc != null;

    let html = '<div class="before-after-table">\n';

    if (isImageIssue) {
      html += `
<table class="specifics-table">
  <thead>
    <tr>
      <th>Page</th>
      <th>Image</th>
      <th class="suggested-col">Suggested Alt Text</th>
    </tr>
  </thead>
  <tbody>
`;
      for (const r of rows) {
        const pageUrl = (r.url || '').replace(/https?:\/\/[^/]+/, '') || '/';
        const imgSrc = (r.imageSrc || '').split('/').pop().split('?')[0];
        const alt = this.escapeHTML(r.suggested?.value || '');
        html += `    <tr>
      <td class="url-cell">${this.escapeHTML(this.truncate(pageUrl, 35))}</td>
      <td class="url-cell text-gray">${this.escapeHTML(this.truncate(imgSrc, 30))}</td>
      <td class="suggested-value">${alt}</td>
    </tr>\n`;
      }
    } else {
      html += `
<table class="specifics-table">
  <thead>
    <tr>
      <th>Page</th>
      <th class="current-col">Current</th>
      <th class="suggested-col">Suggested (copy-paste ready)</th>
    </tr>
  </thead>
  <tbody>
`;
      for (const r of rows) {
        const pageUrl = (r.url || '').replace(/https?:\/\/[^/]+/, '') || '/';
        const curVal = this.escapeHTML(this.truncate(r.current?.value || '(empty)', 70));
        const curLen = r.current?.length ? ` <span class="length-badge">${r.current.length}ch</span>` : '';
        const sugVal = this.escapeHTML(this.truncate(r.suggested?.value || '', 70));
        const sugLen = r.suggested?.length ? ` <span class="length-badge good">${r.suggested.length}ch</span>` : '';
        html += `    <tr>
      <td class="url-cell">${this.escapeHTML(this.truncate(pageUrl, 35))}</td>
      <td class="current-value">${curVal}${curLen}</td>
      <td class="suggested-value">${sugVal}${sugLen}</td>
    </tr>\n`;
      }
    }

    html += '  </tbody>\n</table>\n';
    if (specifics.length > maxRows) {
      html += `<div class="more-rows">...and ${specifics.length - maxRows} more pages not shown</div>\n`;
    }
    html += '</div>\n';
    return html;
  }

  /**
   * Build complete HTML report
   */
  buildHTMLReport() {
    const sections = [];

    // Page 1: Cover + Executive Summary
    sections.push(this.buildCoverPage());

    // Page 2: Score Breakdown + Confidence Notes
    sections.push(this.buildScoreBreakdown());

    // What IS Working (positive findings)
    sections.push(this.buildWhatIsWorking(this.audit));

    // Expected Results projection table
    sections.push(this.buildExpectedResults(this.audit));

    // Pages 3-6: Findings by Category (with evidence)
    sections.push(this.buildFindingsByCategory());

    // Keyword & Content Optimisation table (after findings)
    sections.push(this.buildKeywordOptimizationTable(this.audit));

    // Pages 7-8: Priority Backlog + Effort/Impact Matrix
    sections.push(this.buildPriorityBacklog());

    // Pages 9-10: 30/60/90 Day Roadmap
    sections.push(this.buildRoadmap());

    // Other Website Improvements (after roadmap, before tools)
    sections.push(this.buildOtherImprovements());

    // Recommended Tools & Resources
    sections.push(this.buildToolsAndResources());

    // Optional: Appendix (if needed)
    if (this.audit.pages.length > 50) {
      sections.push(this.buildAppendix());
    }

    // Action Summary & Next Steps (closing section)
    sections.push(this.buildActionSummary(this.audit));

    return sections.join('\n');
  }

  /**
   * Build cover page with executive summary
   */
  buildCoverPage() {
    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const criticalCount = this.audit.recommendations.filter(r => r.priority === 'CRITICAL').length;
    const highCount = this.audit.recommendations.filter(r => r.priority === 'HIGH').length;
    const scoreColor = this.getScoreColorClass(this.audit.overallScore);

    return `
<div class="cover">
  <h1>SEO Audit Report</h1>
  <div class="subtitle">
    ${domain}<br/>
    ${new Date(this.audit.completedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}
  </div>

  <div class="score-circle bg-${scoreColor}">
    <div class="score-number">${this.audit.overallScore}</div>
    <div class="score-label">/100</div>
  </div>

  <div class="summary-box">
    <h3 style="margin-bottom: 12pt; text-align: center;">Executive Summary</h3>
    <div class="summary-row">
      <span class="summary-label">Pages Analyzed:</span>
      <span class="summary-value">${this.audit.pages.length}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Critical Issues:</span>
      <span class="summary-value color-critical">${criticalCount}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">High Priority Issues:</span>
      <span class="summary-value color-high">${highCount}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Total Recommendations:</span>
      <span class="summary-value">${this.audit.recommendations.length}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Rating:</span>
      <span class="summary-value">${this.formatRating(this.audit.scoreRating)}</span>
    </div>
  </div>

  <div style="margin-top: 24pt; font-size: 9pt; color: #666; max-width: 400pt;">
    <strong>Quick Wins Available:</strong> ${this.getTopQuickWinsText()}
  </div>
</div>
`;
  }

  /**
   * Build score breakdown with confidence indicators
   */
  buildScoreBreakdown() {
    const sortedResults = [...this.audit.results].sort((a, b) =>
      parseFloat(b.weight) - parseFloat(a.weight)
    );

    let html = `
<h1>1. SEO Score Breakdown</h1>

<p>The SEO score is calculated using a weighted average of six core categories. Each category includes a <strong>measurement confidence indicator</strong> to show whether the score is based on measured data, estimates, or unavailable metrics.</p>

<div class="mb-4"></div>
`;

    // Score bars
    for (const result of sortedResults) {
      const categoryName = this.formatCategoryName(result.category);
      const weight = parseFloat(result.weight) * 100;
      const scoreColor = this.getScoreColorClass(result.categoryScore);
      const confidence = this.getCategoryConfidence(result);

      html += `
<div class="score-bar">
  <div class="score-bar-header">
    <span class="font-semibold">
      ${categoryName} (${weight}% weight)
      <span class="confidence-badge confidence-${confidence.level.toLowerCase()}">${confidence.level}</span>
    </span>
    <span class="font-bold">${result.categoryScore}/100</span>
  </div>
  <div class="score-bar-track">
    <div class="score-bar-fill bg-${scoreColor}" style="width: ${result.categoryScore}%">
      ${result.categoryScore}
    </div>
  </div>
  <div class="score-bar-details">
    ${this.formatRating(result.rating)} •
    ${result.criticalCount} critical, ${result.highCount} high, ${result.mediumCount} medium, ${result.lowCount} low issues
    ${confidence.note ? `<br/>${this.escapeHTML(this.truncate(confidence.note, 120))}` : ''}
  </div>
</div>
`;
    }

    // Confidence legend
    html += `
<div class="mb-4"></div>

<h3>Measurement Confidence</h3>
<ul>
  <li><strong class="confidence-badge confidence-measured">MEASURED</strong> - Score based on direct API measurements or comprehensive crawl data</li>
  <li><strong class="confidence-badge confidence-estimated">ESTIMATED</strong> - Score based on fallback analysis or limited data</li>
  <li><strong class="confidence-badge confidence-notmeasured">NOT MEASURED</strong> - Requires external API (not configured)</li>
</ul>
`;

    return html;
  }

  /**
   * Build findings by category with evidence and before/after tables
   */
  buildFindingsByCategory() {
    let html = '<h1>2. Detailed Findings</h1>\n';
    html += '<p>Each issue includes <strong>specific before/after details</strong> showing exactly what to change on each affected page.</p>\n\n';

    const selectedIssues = this.selectIssuesForReport(this.audit.recommendations);
    const specificsMap = this.buildSpecificsMap();

    const categories = {
      'TECHNICAL_SEO': 'A. Technical SEO',
      'ON_PAGE_SEO': 'B. On-Page SEO',
      'CONTENT_QUALITY': 'C. Content Quality',
      'PERFORMANCE': 'D. Performance',
      'AUTHORITY_BACKLINKS': 'E. Authority & Trust Signals',
      'LOCAL_SEO': 'F. Local SEO'
    };

    for (const [categoryKey, categoryTitle] of Object.entries(categories)) {
      const categoryIssues = selectedIssues.filter(r => r.category === categoryKey);
      if (categoryIssues.length === 0) continue;

      html += `<h2>${categoryTitle}</h2>\n`;

      for (const issue of categoryIssues) {
        const specifics = specificsMap.get(issue.title) || null;
        html += this.buildIssueCard(issue, specifics);
      }

      html += '\n';
    }

    return html;
  }

  /**
   * Build single issue card with before/after specifics table
   * @param {Object} issue - Recommendation record
   * @param {Array|null} specifics - Per-page specifics from analyzer results
   */
  buildIssueCard(issue, specifics = null) {
    const severity = issue.priority.toLowerCase();
    const evidence = this.getIssueEvidence(issue);

    let html = `
<div class="issue-card ${severity}">
  <div class="issue-header">
    <span class="issue-title">${this.escapeHTML(this.truncate(issue.title, 80))}</span>
    <span class="issue-severity ${severity}">${issue.priority}</span>
  </div>
  <div class="issue-description">${this.escapeHTML(this.truncate(issue.description, 300))}</div>
`;

    // Before/After specifics table (highest value — show first)
    if (specifics && specifics.length > 0) {
      html += `  <div class="before-after-section">\n`;
      html += `    <div class="before-after-label">What to change (copy-paste ready):</div>\n`;
      html += this.buildBeforeAfterTable(specifics);
      html += `  </div>\n`;
    } else if (evidence && evidence.length > 0) {
      // Fall back to generic evidence list
      html += `  <div class="issue-evidence">\n    <div class="issue-evidence-label">Affected pages:</div>\n`;
      for (const ev of evidence.slice(0, 3)) {
        if (ev.url) {
          const displayUrl = ev.url.length > 70 ? ev.url.substring(0, 67) + '...' : ev.url;
          html += `    <div class="issue-evidence-url">• ${this.escapeHTML(displayUrl)}${ev.detail ? ` — ${this.escapeHTML(this.truncate(ev.detail, 80))}` : ''}</div>\n`;
        } else if (ev.detail) {
          html += `    <div>• ${this.escapeHTML(this.truncate(ev.detail, 100))}</div>\n`;
        }
      }
      if (issue.affectedPages > 3) {
        html += `    <div class="text-gray">...and ${issue.affectedPages - 3} more pages</div>\n`;
      }
      html += `  </div>\n`;
    }

    // Fix instruction
    if (issue.implementation) {
      html += `  <div class="issue-fix"><strong>How to fix:</strong> ${this.escapeHTML(this.truncate(issue.implementation, 250))}</div>\n`;
    }

    // Impact
    if (issue.expectedImpact) {
      html += `  <div class="issue-impact">Expected impact: ${this.escapeHTML(this.truncate(issue.expectedImpact, 150))}</div>\n`;
    }

    html += `</div>\n`;
    return html;
  }

  /**
   * Build priority backlog with effort/impact matrix
   */
  buildPriorityBacklog() {
    const criticalIssues = this.audit.recommendations.filter(r => r.priority === 'CRITICAL');
    const highIssues = this.audit.recommendations.filter(r => r.priority === 'HIGH');
    const mediumIssues = this.audit.recommendations.filter(r => r.priority === 'MEDIUM');
    const lowIssues = this.audit.recommendations.filter(r => r.priority === 'LOW');

    let html = `
<h1>3. Priority Backlog</h1>

<div class="priority-grid">
  <div class="priority-box critical">
    <div class="priority-box-title color-critical">Critical Priority</div>
    <div class="priority-box-count color-critical">${criticalIssues.length}</div>
    <div class="priority-box-impact">Fix immediately • Est. 1-2 weeks</div>
  </div>
  <div class="priority-box high">
    <div class="priority-box-title color-high">High Priority</div>
    <div class="priority-box-count color-high">${highIssues.length}</div>
    <div class="priority-box-impact">Fix within 1 month • Est. 2-3 weeks</div>
  </div>
  <div class="priority-box medium">
    <div class="priority-box-title color-medium">Medium Priority</div>
    <div class="priority-box-count color-medium">${mediumIssues.length}</div>
    <div class="priority-box-impact">Fix within 2 months • Est. 3-4 weeks</div>
  </div>
  <div class="priority-box low">
    <div class="priority-box-title color-low">Low Priority</div>
    <div class="priority-box-count color-low">${lowIssues.length}</div>
    <div class="priority-box-impact">Fix as capacity allows • Est. 4-6 weeks</div>
  </div>
</div>

<h2>Effort vs Impact Matrix</h2>
<table>
  <thead>
    <tr>
      <th>Priority</th>
      <th>Issue Count</th>
      <th>Est. Effort</th>
      <th>Expected Score Impact</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="color-critical font-semibold">Critical</td>
      <td>${criticalIssues.length}</td>
      <td>1-2 weeks</td>
      <td class="font-semibold">+15-20 points</td>
    </tr>
    <tr>
      <td class="color-high font-semibold">High</td>
      <td>${highIssues.length}</td>
      <td>2-3 weeks</td>
      <td class="font-semibold">+10-15 points</td>
    </tr>
    <tr>
      <td class="color-medium font-semibold">Medium</td>
      <td>${mediumIssues.length}</td>
      <td>3-4 weeks</td>
      <td class="font-semibold">+5-10 points</td>
    </tr>
    <tr>
      <td class="color-low font-semibold">Low</td>
      <td>${lowIssues.length}</td>
      <td>4-6 weeks</td>
      <td class="font-semibold">+2-5 points</td>
    </tr>
  </tbody>
</table>
`;

    return html;
  }

  /**
   * Build realistic 30/60/90 day roadmap
   */
  buildRoadmap() {
    function getTaskOwner(title = '', category = '') {
      const t = title.toLowerCase();
      const c = category.toLowerCase();

      if (t.includes('content') || t.includes('blog') || t.includes('copy') || t.includes('word') || t.includes('faq') || c.includes('content')) return 'Content';
      if (t.includes('image') || t.includes('photo') || t.includes('visual') || t.includes('design') || t.includes('brand')) return 'Design';
      if (t.includes('schema') || t.includes('sitemap') || t.includes('robots') || t.includes('ssl') || t.includes('redirect') || t.includes('javascript') || t.includes('performance') || t.includes('speed') || t.includes('compression') || t.includes('canonical') || t.includes('mobile') || c.includes('technical')) return 'Dev';
      if (t.includes('google') || t.includes('local') || t.includes('backlink') || t.includes('social') || t.includes('review') || t.includes('directory') || t.includes('citation') || c.includes('authority') || c.includes('local')) return 'Marketing';
      if (t.includes('title') || t.includes('meta') || t.includes('heading') || t.includes('url') || t.includes('keyword') || c.includes('on-page')) return 'Marketing';
      return 'Dev';
    }

    function renderOwnerBadge(title, category) {
      const owner = getTaskOwner(title, category);
      const cls = owner.toLowerCase();
      return `<span class="owner-badge owner-${cls}">${owner}</span>`;
    }

    const quickWins = this.audit.recommendations.filter(r => r.effortLevel === 'QUICK_WIN').slice(0, 4);
    const month1 = this.audit.recommendations.filter(r =>
      ['CRITICAL', 'HIGH'].includes(r.priority) && r.effortLevel !== 'QUICK_WIN'
    ).slice(0, 4);
    const month2 = this.audit.recommendations.filter(r =>
      r.priority === 'MEDIUM'
    ).slice(0, 4);
    const month3 = this.audit.recommendations.filter(r =>
      r.priority === 'LOW'
    ).slice(0, 4);

    let html = `
<h1>4. Implementation Roadmap</h1>

<div class="roadmap-phase">
  <div class="roadmap-header">
    Days 1-7: Quick Wins
    <span class="roadmap-subtitle">(${quickWins.length} tasks • Low effort, high impact)</span>
  </div>
  <div class="roadmap-tasks">
`;
    for (const task of quickWins) {
      html += `
    <div class="roadmap-task">
      <div class="roadmap-task-title">${this.escapeHTML(task.title)} ${renderOwnerBadge(task.title, task.category || '')}</div>
      <div class="roadmap-task-detail">
        ${task.estimatedHours ? `Est. ${task.estimatedHours}h` : 'Quick'} •
        ${this.escapeHTML(this.truncate(task.expectedImpact || 'Immediate improvement', 120))}
      </div>
    </div>
`;
    }
    html += `
  </div>
</div>

<div class="roadmap-phase">
  <div class="roadmap-header">
    Month 1 (Weeks 2-4): Foundation Fixes
    <span class="roadmap-subtitle">(${month1.length} tasks • Critical & high priority)</span>
  </div>
  <div class="roadmap-tasks">
`;
    for (const task of month1) {
      html += `
    <div class="roadmap-task">
      <div class="roadmap-task-title">${this.escapeHTML(task.title)} ${renderOwnerBadge(task.title, task.category || '')}</div>
      <div class="roadmap-task-detail">
        ${task.estimatedHours ? `Est. ${task.estimatedHours}h` : 'Medium effort'} •
        ${this.escapeHTML(this.truncate(task.expectedImpact || 'Improves core SEO metrics', 120))}
      </div>
    </div>
`;
    }
    html += `
  </div>
</div>

<div class="roadmap-phase">
  <div class="roadmap-header">
    Month 2 (Weeks 5-8): Optimization
    <span class="roadmap-subtitle">(${month2.length} tasks • Medium priority)</span>
  </div>
  <div class="roadmap-tasks">
`;
    for (const task of month2) {
      html += `
    <div class="roadmap-task">
      <div class="roadmap-task-title">${this.escapeHTML(task.title)} ${renderOwnerBadge(task.title, task.category || '')}</div>
      <div class="roadmap-task-detail">
        ${task.estimatedHours ? `Est. ${task.estimatedHours}h` : 'Standard effort'} •
        ${this.escapeHTML(this.truncate(task.expectedImpact || 'Enhances user experience', 120))}
      </div>
    </div>
`;
    }
    html += `
  </div>
</div>

<div class="roadmap-phase">
  <div class="roadmap-header">
    Month 3 (Weeks 9-12): Polish & Growth
    <span class="roadmap-subtitle">(${month3.length} tasks • Low priority)</span>
  </div>
  <div class="roadmap-tasks">
`;
    for (const task of month3) {
      html += `
    <div class="roadmap-task">
      <div class="roadmap-task-title">${this.escapeHTML(task.title)} ${renderOwnerBadge(task.title, task.category || '')}</div>
      <div class="roadmap-task-detail">
        ${task.estimatedHours ? `Est. ${task.estimatedHours}h` : 'As capacity allows'} •
        ${this.escapeHTML(this.truncate(task.expectedImpact || 'Long-term improvement', 120))}
      </div>
    </div>
`;
    }
    html += `
  </div>
</div>

<div class="highlight-box mt-2">
  <strong>Expected Results (90 days):</strong><br/>
  SEO Score: ${this.audit.overallScore} → ${this.calculate90DayScore()}/100
  (${this.calculateImprovement()}% improvement)<br/>
  Organic Traffic: Baseline → 2-3x increase<br/>
  Keyword Rankings: New top-10 rankings for 20-30 target keywords
</div>
`;

    return html;
  }

  /**
   * Build appendix (optional)
   */
  buildAppendix() {
    const samplePages = this.audit.pages.slice(0, 20);

    let html = `
<h1>Appendix</h1>

<h2>A. Crawl Summary</h2>
<p>Total pages analyzed: ${this.audit.pages.length}</p>

<table>
  <thead>
    <tr>
      <th>Page URL</th>
      <th>Status</th>
      <th>Word Count</th>
      <th>Images</th>
      <th>Load Time</th>
    </tr>
  </thead>
  <tbody>
`;
    for (const page of samplePages) {
      html += `
    <tr>
      <td class="text-xs">${this.escapeHTML(this.truncate(page.path || page.url, 60))}</td>
      <td>${page.statusCode || 'N/A'}</td>
      <td>${page.wordCount || 0}</td>
      <td>${page.imageCount || 0}</td>
      <td>${page.loadTime ? page.loadTime + 'ms' : 'N/A'}</td>
    </tr>
`;
    }
    html += `
  </tbody>
</table>
`;

    if (this.audit.pages.length > 20) {
      html += `<p class="text-sm text-gray mt-2">Showing first 20 of ${this.audit.pages.length} pages analyzed.</p>`;
    }

    return html;
  }

  // ==================== HELPER METHODS ====================

  /**
   * Get category measurement confidence
   */
  getCategoryConfidence(result) {
    const category = result.category;
    const checks = result.checks || {};

    if (category === 'PERFORMANCE') {
      if (checks.pageSpeed && checks.pageSpeed.mobile && checks.pageSpeed.mobile.score !== null) {
        return {
          level: 'MEASURED',
          note: 'Based on Google PageSpeed Insights API'
        };
      } else {
        return {
          level: 'ESTIMATED',
          note: 'Based on load-time analysis (PageSpeed API not configured)'
        };
      }
    }

    if (category === 'AUTHORITY_BACKLINKS') {
      return {
        level: 'ESTIMATED',
        note: 'Trust signals only - Full authority measurement requires Moz/Ahrefs API'
      };
    }

    // Technical, On-Page, Content, Local are measured from crawl
    return {
      level: 'MEASURED',
      note: null
    };
  }

  /**
   * Select most impactful issues for report
   * Limits to ~12-15 issues total for 8-12 page target
   */
  selectIssuesForReport(allRecommendations) {
    const selected = [];

    // Always include all critical (max 5 to be safe)
    const critical = allRecommendations
      .filter(r => r.priority === 'CRITICAL')
      .slice(0, 5);
    selected.push(...critical);

    // High priority - prefer quick wins, then by affected pages
    const high = allRecommendations
      .filter(r => r.priority === 'HIGH')
      .sort((a, b) => {
        if (a.effortLevel === 'QUICK_WIN' && b.effortLevel !== 'QUICK_WIN') return -1;
        if (b.effortLevel === 'QUICK_WIN' && a.effortLevel !== 'QUICK_WIN') return 1;
        return (b.affectedPages || 0) - (a.affectedPages || 0);
      })
      .slice(0, 5);
    selected.push(...high);

    // Medium - only quick wins or high impact (10+ affected pages)
    const medium = allRecommendations
      .filter(r => r.priority === 'MEDIUM')
      .filter(r => r.effortLevel === 'QUICK_WIN' || (r.affectedPages || 0) > 10)
      .slice(0, 3);
    selected.push(...medium);

    return selected.slice(0, 13); // Hard cap at 13 issues
  }

  /**
   * Get evidence for an issue
   */
  getIssueEvidence(issue) {
    // Parse evidence from recommendation data
    // This should be populated by analyzers during the audit
    if (issue.evidence && Array.isArray(issue.evidence)) {
      return issue.evidence;
    }

    // Try to extract from examples if available
    if (issue.examples && Array.isArray(issue.examples)) {
      return issue.examples.map(ex => ({
        url: ex.url || null,
        detail: ex.detail || ex.toString()
      }));
    }

    // Fallback: generic affected pages count
    if (issue.affectedPages > 0) {
      return [{
        url: null,
        detail: `${issue.affectedPages} page(s) affected`
      }];
    }

    return [];
  }

  /**
   * Get top quick wins text
   */
  getTopQuickWinsText() {
    const quickWins = this.audit.recommendations.filter(r => r.effortLevel === 'QUICK_WIN').slice(0, 3);
    if (quickWins.length === 0) return 'Focus on critical issues first';
    return quickWins.map(q => q.title).join(', ');
  }

  /**
   * Calculate 90-day score projection
   */
  calculate90DayScore() {
    const improvement = Math.min(20, Math.floor((100 - this.audit.overallScore) * 0.4));
    return this.audit.overallScore + improvement;
  }

  /**
   * Calculate improvement percentage
   */
  calculateImprovement() {
    const projected = this.calculate90DayScore();
    const improvement = ((projected - this.audit.overallScore) / this.audit.overallScore * 100).toFixed(0);
    return `+${improvement}`;
  }

  /**
   * Get score color class
   */
  getScoreColorClass(score) {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'needsimprovement';
    return 'poor';
  }

  /**
   * Format category name
   */
  formatCategoryName(category) {
    const names = {
      'TECHNICAL_SEO': 'Technical SEO',
      'ON_PAGE_SEO': 'On-Page SEO',
      'CONTENT_QUALITY': 'Content Quality',
      'PERFORMANCE': 'Performance',
      'AUTHORITY_BACKLINKS': 'Authority & Backlinks',
      'LOCAL_SEO': 'Local SEO'
    };
    return names[category] || category;
  }

  /**
   * Format rating
   */
  formatRating(rating) {
    if (!rating) return 'N/A';
    return rating.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  /**
   * Truncate text to a maximum length
   */
  truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Escape HTML
   */
  escapeHTML(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Build "What IS Working" section — positive findings with green checkmark cards
   */
  buildWhatIsWorking(auditData) {
    const checkLabels = {
      ssl: {
        label: 'SSL / HTTPS Active',
        desc: 'Your site uses HTTPS, a confirmed Google ranking signal and trust indicator for users.',
        preserve: 'Maintain your SSL certificate renewal and monitor for mixed-content warnings.'
      },
      sitemap: {
        label: 'XML Sitemap Present',
        desc: 'Search engines can efficiently discover and crawl all your pages.',
        preserve: 'Keep the sitemap updated whenever new pages are added or removed.'
      },
      mobileResponsive: {
        label: 'Mobile-Responsive Design',
        desc: 'Your site adapts to all screen sizes, satisfying Google\'s mobile-first indexing.',
        preserve: 'Continue testing on multiple devices and maintain a mobile-first design approach.'
      },
      robotsTxt: {
        label: 'robots.txt Present',
        desc: 'Search engine crawlers are guided by a robots.txt file.',
        preserve: 'Never add Disallow: / rules without testing their impact in Google Search Console.'
      },
      structuredData: {
        label: 'Structured Data Detected',
        desc: 'Schema markup helps Google understand your content and can unlock rich results.',
        preserve: 'Validate schema regularly with schema.org/validator and expand to new page types.'
      },
      contactInformation: {
        label: 'Contact Information Present',
        desc: 'Visible contact details build trust with both users and search engines.',
        preserve: 'Ensure NAP (Name, Address, Phone) is consistent across all platforms.'
      },
      internalLinking: {
        label: 'Internal Linking Structure',
        desc: 'Internal links distribute page authority and help users navigate your content.',
        preserve: 'Aim for 3–5 contextual internal links per page and avoid orphan pages.'
      },
      titleTags: {
        label: 'Title Tags Present',
        desc: 'All key pages have title tags, which are a primary on-page ranking factor.',
        preserve: 'Keep titles between 50–60 characters and include your primary keyword near the front.'
      },
      metaDescriptions: {
        label: 'Meta Descriptions Present',
        desc: 'Meta descriptions improve click-through rates from search results.',
        preserve: 'Write unique, compelling 130–155 character descriptions for every page.'
      },
      socialMedia: {
        label: 'Social Media Presence',
        desc: 'Active social profiles support brand authority and drive referral traffic.',
        preserve: 'Maintain consistent posting cadence and link all profiles back to the website.'
      },
      privacyPolicy: {
        label: 'Privacy Policy Page',
        desc: 'A privacy policy page builds user trust and is required under GDPR and CCPA.',
        preserve: 'Review and update the policy annually to reflect any data handling changes.'
      },
      // Legacy keys mapped to new richer entries
      canonical: {
        label: 'Canonical Tags Present',
        desc: 'Duplicate content signals are managed to consolidate ranking authority.',
        preserve: 'Audit canonical tags whenever you add new URL parameters or pagination.'
      },
      metaDescription: {
        label: 'Meta Descriptions Present',
        desc: 'Meta descriptions improve click-through rates from search results.',
        preserve: 'Write unique, compelling 130–155 character descriptions for every page.'
      },
      titleTag: {
        label: 'Title Tags Present',
        desc: 'All key pages have title tags, which are a primary on-page ranking factor.',
        preserve: 'Keep titles between 50–60 characters and include your primary keyword near the front.'
      },
      headings: {
        label: 'Heading Structure Present',
        desc: 'Pages use heading hierarchy to help search engines understand content structure.',
        preserve: 'Ensure every page has exactly one H1 and logical H2/H3 sub-headings.'
      },
      compression: {
        label: 'Content Compression Enabled',
        desc: 'GZIP/Brotli compression reduces page weight and improves load speed.',
        preserve: 'Check compression is active after any server or CDN configuration changes.'
      },
      httpsRedirect: {
        label: 'HTTP to HTTPS Redirect',
        desc: 'All HTTP traffic is redirected to the secure HTTPS version of your site.',
        preserve: 'Verify redirect chains remain a single 301 hop after any infrastructure changes.'
      },
      pageSpeed: {
        label: 'Acceptable Page Speed',
        desc: 'Page load performance meets baseline thresholds for a positive user experience.',
        preserve: 'Monitor Core Web Vitals in Google Search Console monthly.'
      },
      images: {
        label: 'Images Optimised',
        desc: 'Site images are appropriately sized and formatted for web delivery.',
        preserve: 'Continue using WebP format and lazy-loading for all new images.'
      },
      hreflang: {
        label: 'Language Tags Present',
        desc: 'Hreflang tags properly signal language and regional targeting to search engines.',
        preserve: 'Update hreflang tags whenever new language variants or regions are added.'
      },
      // Category-level fallbacks
      ON_PAGE_SEO: {
        label: 'Strong On-Page SEO Foundation',
        desc: 'Your on-page optimisation is performing well across title tags, headings, and page structure.',
        preserve: 'Continue following on-page best practices as you create new content.'
      },
      CONTENT_QUALITY: {
        label: 'Good Content Quality',
        desc: 'Content across your site meets quality thresholds for word count and structure.',
        preserve: 'Keep publishing high-quality content and aim for 1,000+ words on key service pages.'
      },
      PERFORMANCE: {
        label: 'Acceptable Page Performance',
        desc: 'Page load times are within an acceptable range.',
        preserve: 'Monitor Core Web Vitals in Google Search Console monthly.'
      },
      AUTHORITY: {
        label: 'Authority Signals Present',
        desc: 'Trust signals and contact information are present across the site.',
        preserve: 'Continue building backlinks from relevant, high-authority sources.'
      }
    };

    const passingItems = [];

    for (const result of (auditData.results || [])) {
      const checks = result.checks || {};

      for (const [key, value] of Object.entries(checks)) {
        if (!checkLabels[key]) continue;

        const isPassing =
          (typeof value === 'object' && value !== null && value.status === 'pass') ||
          (typeof value === 'boolean' && value === true) ||
          (typeof value === 'number' && value >= 70);

        if (isPassing) {
          passingItems.push(checkLabels[key]);
        }
      }

      if ((result.categoryScore || 0) >= 70 && result.category) {
        const categoryKey = (result.category || '').toLowerCase().replace(/_/g, '');
        const alreadyAdded = passingItems.some(p => p._category === categoryKey);
        if (!alreadyAdded) {
          const categoryLabels = {
            technicalseo: {
              label: 'Technical SEO Fundamentals',
              desc: 'Core technical foundations are in place to support search engine crawling and indexing.',
              preserve: 'Run a full technical crawl quarterly to catch new issues early.'
            },
            onpageseo: {
              label: 'Strong On-Page SEO Foundation',
              desc: 'Your on-page optimisation is performing well across title tags, headings, and page structure.',
              preserve: 'Continue following on-page best practices as you create new content.'
            },
            contentquality: {
              label: 'Good Content Quality',
              desc: 'Content across your site meets quality thresholds for depth and relevance.',
              preserve: 'Keep publishing high-quality content and aim for 1,000+ words on key service pages.'
            },
            performance: {
              label: 'Acceptable Page Performance',
              desc: 'Page load times are within an acceptable range.',
              preserve: 'Monitor Core Web Vitals in Google Search Console monthly.'
            },
            authoritybacklinks: {
              label: 'Authority Signals Present',
              desc: 'Trust signals and contact information are present across the site.',
              preserve: 'Continue building backlinks from relevant, high-authority sources.'
            },
            localseo: {
              label: 'Local SEO Setup',
              desc: 'Local search signals are configured to support geographic visibility.',
              preserve: 'Keep your Google Business Profile updated with current hours, photos, and posts.'
            }
          };
          if (categoryLabels[categoryKey]) {
            const item = { ...categoryLabels[categoryKey], _category: categoryKey };
            passingItems.push(item);
          }
        }
      }
    }

    // Deduplicate by label
    const seen = new Set();
    const unique = passingItems.filter(item => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    });

    const displayItems = unique.slice(0, 10);

    let html = `
<div class="section what-working-section page-break-before">
  <div class="section-header green-header">
    <h2 style="color: white; border-bottom: none; margin: 0 0 6pt 0;">What IS Working</h2>
    <p class="section-subtitle" style="color: rgba(255,255,255,0.85); margin: 0;">These areas are performing well and should be maintained</p>
  </div>
  <div class="working-grid">
`;

    if (displayItems.length < 2) {
      html += `
    <div class="working-card" style="grid-column: 1 / -1;">
      <div class="check-icon">&#10003;</div>
      <div class="working-detail">
        <strong>Analysis in progress</strong>
        <p>Improvements will reveal more strengths as recommendations are implemented.</p>
      </div>
    </div>
`;
    } else {
      for (const item of displayItems) {
        const preserve = item.preserve || '';
        html += `
    <div class="working-card">
      <div class="check-icon">&#10003;</div>
      <div class="working-detail">
        <strong>${this.escapeHTML(item.label)}</strong>
        <p>${this.escapeHTML(item.desc)}</p>
        ${preserve ? `<p class="preserve-note"><span class="preserve-label">Preserve:</span> ${this.escapeHTML(preserve)}</p>` : ''}
      </div>
    </div>
`;
      }
    }

    html += `
  </div>
</div>
`;
    return html;
  }

  /**
   * Build "Expected Results" section — projected improvements table
   */
  buildExpectedResults(auditData) {
    const currentScore = auditData.overallScore || 0;
    const score30Low = currentScore + 8;
    const score30High = currentScore + 12;
    const score90Low = Math.min(95, currentScore + 15);
    const score90High = Math.min(95, currentScore + 20);

    let html = `
<div class="section expected-results-section">
  <div class="section-header" style="padding: 16pt 0 8pt 0;">
    <h2>Expected Results After Implementing Recommendations</h2>
    <p class="section-subtitle" style="color: #64748b; font-size: 9pt; margin: 0;">Projected improvements based on industry benchmarks for similar implementations</p>
  </div>
  <table class="results-table">
    <thead>
      <tr>
        <th>Timeline</th>
        <th>Metric</th>
        <th>Current</th>
        <th>Expected</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>30 days</td>
        <td>Overall SEO Score</td>
        <td>${currentScore}</td>
        <td>${score30Low}–${score30High}</td>
        <td class="confidence-high">High</td>
      </tr>
      <tr>
        <td>60 days</td>
        <td>Organic Visibility</td>
        <td>Baseline</td>
        <td>+15–25%</td>
        <td class="confidence-medium">Medium</td>
      </tr>
      <tr>
        <td>90 days</td>
        <td>Overall SEO Score</td>
        <td>${currentScore}</td>
        <td>${score90Low}–${score90High}</td>
        <td class="confidence-medium">Medium</td>
      </tr>
      <tr>
        <td>90 days</td>
        <td>Page Load Speed</td>
        <td>Varies</td>
        <td>Top 25%</td>
        <td class="confidence-medium">Medium</td>
      </tr>
      <tr>
        <td>6 months</td>
        <td>Domain Authority</td>
        <td>Baseline</td>
        <td>+5–10 pts</td>
        <td class="confidence-low">Low</td>
      </tr>
    </tbody>
  </table>
  <p class="disclaimer">* Projections based on implementing all recommended changes. Actual results may vary based on competition, content quality, and implementation timing. SEO improvements typically show measurable impact within 60–90 days.</p>
</div>
`;
    return html;
  }

  /**
   * Build "Tools & Resources" section — reference table of recommended tools
   */
  buildToolsAndResources() {
    return `
<div class="section tools-section">
  <div class="section-header" style="padding: 16pt 0 8pt 0;">
    <h2>Recommended Tools &amp; Resources</h2>
    <p class="section-subtitle" style="color: #64748b; font-size: 9pt; margin: 0;">Tools to help you implement and track these improvements</p>
  </div>
  <table class="tools-table">
    <thead>
      <tr>
        <th>Tool</th>
        <th>Purpose</th>
        <th>Cost</th>
        <th>Priority</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Google Search Console</strong></td>
        <td>Monitor search performance, indexing issues, and manual actions</td>
        <td>Free</td>
        <td class="priority-high">Essential</td>
      </tr>
      <tr>
        <td><strong>Google Analytics 4</strong></td>
        <td>Track organic traffic, user behaviour, and conversions</td>
        <td>Free</td>
        <td class="priority-high">Essential</td>
      </tr>
      <tr>
        <td><strong>Google PageSpeed Insights</strong></td>
        <td>Measure Core Web Vitals and page performance</td>
        <td>Free</td>
        <td class="priority-high">Essential</td>
      </tr>
      <tr>
        <td><strong>Screaming Frog SEO Spider</strong></td>
        <td>Deep technical crawl — redirect chains, broken links, duplicate content</td>
        <td>Free / £259/yr</td>
        <td class="priority-med">Recommended</td>
      </tr>
      <tr>
        <td><strong>Ahrefs / Semrush</strong></td>
        <td>Keyword research, backlink analysis, competitor gap analysis</td>
        <td>$99–$249/mo</td>
        <td class="priority-med">Recommended</td>
      </tr>
      <tr>
        <td><strong>Schema Markup Validator</strong></td>
        <td>Test structured data at schema.org/validator</td>
        <td>Free</td>
        <td class="priority-med">Recommended</td>
      </tr>
      <tr>
        <td><strong>Google Business Profile</strong></td>
        <td>Manage local search presence and Google Maps listing</td>
        <td>Free</td>
        <td class="priority-high">Essential</td>
      </tr>
      <tr>
        <td><strong>Yoast SEO / RankMath</strong></td>
        <td>On-page SEO management (WordPress)</td>
        <td>Free / $99/yr</td>
        <td class="priority-low">Optional</td>
      </tr>
    </tbody>
  </table>
</div>
`;
  }

  /**
   * Build "Keyword & Content Optimisation" table — copy-paste-ready title and meta recommendations
   */
  buildKeywordOptimizationTable(auditData) {
    const onPageResult = (auditData.results || []).find(r => r.category === 'ON_PAGE_SEO');
    if (!onPageResult) return '';

    const specifics = [];
    const issues = onPageResult.issues || [];

    for (const issue of issues) {
      if (Array.isArray(issue.specifics)) {
        for (const s of issue.specifics) {
          specifics.push(s);
        }
      }
    }

    // Group by URL — build a map of url -> { titleBefore, titleAfter, metaBefore, metaAfter }
    const pageMap = new Map();

    for (const s of specifics) {
      const url = s.url || '';
      if (!url) continue;
      if (!pageMap.has(url)) pageMap.set(url, { url });
      const entry = pageMap.get(url);

      const field = (s.field || '').toLowerCase();
      if (field === 'title') {
        entry.titleBefore = s.before || '';
        entry.titleAfter = s.after || '';
      } else if (field === 'meta_description' || field === 'meta') {
        entry.metaBefore = s.before || '';
        entry.metaAfter = s.after || '';
      }
    }

    const pages = [...pageMap.values()].filter(p => p.titleAfter || p.metaAfter).slice(0, 8);

    if (pages.length === 0) return '';

    let tbodyHtml = '';

    for (const page of pages) {
      let pagePath = '';
      try {
        pagePath = new URL(page.url).pathname || '/';
      } catch {
        pagePath = page.url.replace(/^https?:\/\/[^/]+/, '') || '/';
      }

      const hasTitle = !!(page.titleAfter);
      const hasMeta = !!(page.metaAfter);
      const rowspan = (hasTitle && hasMeta) ? 2 : 1;

      if (hasTitle) {
        tbodyHtml += `        <tr>\n`;
        if (rowspan === 2) {
          tbodyHtml += `          <td rowspan="2" class="page-cell">${this.escapeHTML(pagePath)}</td>\n`;
        } else {
          tbodyHtml += `          <td class="page-cell">${this.escapeHTML(pagePath)}</td>\n`;
        }
        tbodyHtml += `          <td class="element-cell">Title Tag</td>\n`;
        tbodyHtml += `          <td class="current-cell"><span class="current-val">${this.escapeHTML(page.titleBefore || '—')}</span></td>\n`;
        tbodyHtml += `          <td class="recommended-cell"><strong>${this.escapeHTML(page.titleAfter)}</strong></td>\n`;
        tbodyHtml += `        </tr>\n`;
      }

      if (hasMeta) {
        tbodyHtml += `        <tr>\n`;
        if (!hasTitle) {
          tbodyHtml += `          <td class="page-cell">${this.escapeHTML(pagePath)}</td>\n`;
        }
        tbodyHtml += `          <td class="element-cell">Meta Description</td>\n`;
        tbodyHtml += `          <td class="current-cell"><span class="current-val">${this.escapeHTML(page.metaBefore || '—')}</span></td>\n`;
        tbodyHtml += `          <td class="recommended-cell"><strong>${this.escapeHTML(page.metaAfter)}</strong></td>\n`;
        tbodyHtml += `        </tr>\n`;
      }
    }

    return `
<div class="section keyword-table-section">
  <div class="section-header" style="padding: 16pt 0 8pt 0;">
    <h2>Recommended Content &amp; Structural Updates</h2>
    <p class="section-subtitle" style="color: #64748b; font-size: 9pt; margin: 0;">Copy-paste-ready title tags and meta descriptions for your top pages</p>
  </div>
  <div class="kw-table-wrap">
    <h3 class="kw-subhead">Page-by-Page Recommendations</h3>
    <table class="kw-table">
      <thead>
        <tr>
          <th>Page</th>
          <th>Element</th>
          <th>Current</th>
          <th>Recommended</th>
        </tr>
      </thead>
      <tbody>
${tbodyHtml}      </tbody>
    </table>
  </div>
</div>
`;
  }

  /**
   * Build "Other Website Improvements" section — advisory UX, CRO, content, and analytics guidance
   */
  buildOtherImprovements() {
    return `
<div class="section other-improvements-section page-break-before">
  <div class="section-header" style="padding: 24px;">
    <h2 style="border-bottom: none; margin: 0 0 6pt 0;">5. Other Website Improvements</h2>
    <p class="section-subtitle" style="color: #64748b; font-size: 9pt; margin: 0;">Beyond SEO — improvements to increase conversions, authority, and long-term traffic</p>
  </div>
  <div class="improvements-body">

    <div class="improvement-category">
      <h3 class="improvement-cat-title">A. UX / UI Improvements</h3>
      <div class="improvement-grid">
        <div class="improvement-card">
          <div class="improvement-title">Sticky Navigation Bar</div>
          <div class="improvement-desc">Add a sticky header on scroll so primary CTA buttons remain accessible throughout long pages.</div>
          <div class="improvement-impact">Impact: Increase conversions by 10–15%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Mobile Navigation Optimisation</div>
          <div class="improvement-desc">Ensure the hamburger menu has a large tap target (min 44×44px). Consider a sticky mobile CTA button.</div>
          <div class="improvement-impact">Impact: Reduce mobile bounce rate by 5–8%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Visual Hierarchy Enhancement</div>
          <div class="improvement-desc">Use larger, bolder typography for key statistics and data points. Add visual emphasis to your most important value metrics.</div>
          <div class="improvement-impact">Impact: Increase engagement time by 20–30 seconds</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Interactive Demo or Product Tour</div>
          <div class="improvement-desc">Add a 'See How It Works' video or interactive walkthrough above the fold on your homepage.</div>
          <div class="improvement-impact">Impact: Increase trial signups by 15–25%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Accessibility Audit (WCAG 2.1)</div>
          <div class="improvement-desc">Run a WAVE or axe audit to ensure colour contrast, keyboard navigation, and ARIA label compliance.</div>
          <div class="improvement-impact">Impact: Expand market reach; reduce legal risk</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Breadcrumb Navigation</div>
          <div class="improvement-desc">Add breadcrumb navigation to all interior pages with BreadcrumbList schema markup for enhanced UX and SEO.</div>
          <div class="improvement-impact">Impact: Lower bounce rate; improve crawl efficiency</div>
        </div>
      </div>
    </div>

    <div class="improvement-category">
      <h3 class="improvement-cat-title">B. Conversion Rate Optimisation (CRO)</h3>
      <div class="improvement-grid">
        <div class="improvement-card">
          <div class="improvement-title">A/B Test Primary CTA</div>
          <div class="improvement-desc">Test CTA copy variations: 'Get Started Free' vs 'See It in Action' vs 'Start Your Free Trial'. Also test button colour.</div>
          <div class="improvement-impact">Impact: Increase conversions by 15–30%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Exit-Intent Popup</div>
          <div class="improvement-desc">When a user moves to close the tab, trigger a popup offering a free resource (guide, checklist, or audit). Capture email before they leave.</div>
          <div class="improvement-impact">Impact: Capture 5–10% of abandoning visitors</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Social Proof Notifications</div>
          <div class="improvement-desc">Show real-time activity notifications ('Someone from London just signed up') using tools like UseProof or TrustPulse.</div>
          <div class="improvement-impact">Impact: Boost conversions by 8–12%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">ROI Calculator</div>
          <div class="improvement-desc">Add an interactive calculator so visitors can estimate their personal ROI. Embed on the homepage or pricing page.</div>
          <div class="improvement-impact">Impact: Increase qualified leads by 20–30%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Optimise Form Fields</div>
          <div class="improvement-desc">Reduce sign-up forms to 3 fields maximum (Name, Email, Company). Collect additional information post-signup.</div>
          <div class="improvement-impact">Impact: Increase form submissions by 15–25%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Dedicated Landing Pages</div>
          <div class="improvement-desc">Create focused landing pages for each paid advertising campaign — single goal, no navigation, specific copy.</div>
          <div class="improvement-impact">Impact: Increase PPC conversion rate by 25–40%</div>
        </div>
      </div>
    </div>

    <div class="improvement-category">
      <h3 class="improvement-cat-title">C. Content Strategy &amp; Authority Building</h3>
      <div class="improvement-grid">
        <div class="improvement-card">
          <div class="improvement-title">Ultimate Guides Hub</div>
          <div class="improvement-desc">Create 5–8 comprehensive guides (3,000–5,000 words). Gate behind email capture to build your list. Promote via LinkedIn and organic search.</div>
          <div class="improvement-impact">Impact: Generate 100–200 qualified leads/month</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Video Content Series</div>
          <div class="improvement-desc">Launch a YouTube series with weekly 5–10 min videos. Embed on relevant website pages and optimise with transcripts, tags, and chapters.</div>
          <div class="improvement-impact">Impact: Increase dwell time; strengthen E-E-A-T</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Case Study Library</div>
          <div class="improvement-desc">Create 5–10 detailed case studies with measurable results (Challenge → Solution → Results). Include quotes, photos, and specific ROI metrics.</div>
          <div class="improvement-impact">Impact: Shorten sales cycle by 20–30%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Guest Blogging Campaign</div>
          <div class="improvement-desc">Target 10–15 high-authority publications in your industry. Aim for 2–3 guest posts per month with a backlink in the author bio.</div>
          <div class="improvement-impact">Impact: Build backlinks; grow domain authority</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">LinkedIn Newsletter</div>
          <div class="improvement-desc">Publish a weekly LinkedIn newsletter repurposing blog content. Target 1,000 subscribers in 90 days to build a warm audience.</div>
          <div class="improvement-impact">Impact: Build authority; nurture leads</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Webinar Series</div>
          <div class="improvement-desc">Host monthly webinars co-presented with industry partners. Repurpose into blog posts, social clips, and lead magnets.</div>
          <div class="improvement-impact">Impact: Generate 50–100 qualified leads per webinar</div>
        </div>
      </div>
    </div>

    <div class="improvement-category">
      <h3 class="improvement-cat-title">D. Analytics &amp; Tracking</h3>
      <div class="improvement-grid">
        <div class="improvement-card">
          <div class="improvement-title">Google Analytics 4 Setup</div>
          <div class="improvement-desc">Ensure GA4 is configured with conversion goals (form submissions, demo requests, purchases). Enable enhanced measurement.</div>
          <div class="improvement-impact">Impact: Track user behaviour; identify drop-off points</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Heatmap &amp; Session Recording</div>
          <div class="improvement-desc">Install Microsoft Clarity (free) or Hotjar to see where users click, scroll, and get confused. Review recordings weekly.</div>
          <div class="improvement-impact">Impact: Identify UX issues; optimise conversion paths</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Goal Funnel Tracking</div>
          <div class="improvement-desc">Set up conversion funnels in GA4: Homepage → Service Page → Form → Thank You. Identify where visitors abandon.</div>
          <div class="improvement-impact">Impact: Increase conversion rate by 15–25%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Custom Looker Studio Dashboard</div>
          <div class="improvement-desc">Build a weekly reporting dashboard combining GA4, Search Console, and rank tracking data for at-a-glance performance reviews.</div>
          <div class="improvement-impact">Impact: Data-driven decisions; spot trends early</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">Retargeting Pixel Setup</div>
          <div class="improvement-desc">Install Meta Pixel and Google Ads remarketing tags to retarget website visitors with personalised ads. Build custom audiences from warm traffic.</div>
          <div class="improvement-impact">Impact: Increase paid traffic conversion by 30–50%</div>
        </div>
        <div class="improvement-card">
          <div class="improvement-title">A/B Testing Programme</div>
          <div class="improvement-desc">Set up VWO or Google Optimize for continuous testing of headlines, CTAs, and page layouts. Run one test per month minimum.</div>
          <div class="improvement-impact">Impact: Compound conversion improvements over time</div>
        </div>
      </div>
    </div>

  </div>
</div>
`;
  }

  /**
   * Build "Action Summary & Next Steps" closing section
   */
  buildActionSummary(auditData) {
    const recommendations = auditData.recommendations || [];
    const criticalCount = recommendations.filter(r => r.priority === 'CRITICAL').length;
    const highCount = recommendations.filter(r => r.priority === 'HIGH').length;
    const mediumCount = recommendations.filter(r => r.priority === 'MEDIUM').length;
    const lowCount = recommendations.filter(r => r.priority === 'LOW').length;

    const topItems = recommendations
      .filter(r => r.priority === 'CRITICAL' || r.priority === 'HIGH')
      .slice(0, 3);

    const nextSteps = topItems.length >= 3
      ? topItems
      : [
          ...topItems,
          ...recommendations.filter(r => !topItems.includes(r)).slice(0, 3 - topItems.length)
        ];

    let stepsHtml = '';
    for (const step of nextSteps.slice(0, 3)) {
      stepsHtml += `<li>${this.escapeHTML(step.title)}${step.implementation ? ` — ${this.escapeHTML(this.truncate(step.implementation, 150))}` : ''}</li>\n`;
    }

    return `
<div class="section action-summary-section page-break-before">
  <div class="section-header dark-header">
    <h2 style="color: white; border-bottom: none; margin: 0 0 6pt 0;">Action Summary &amp; Next Steps</h2>
    <p class="section-subtitle" style="color: rgba(255,255,255,0.75); margin: 0;">A clear path forward to improve your search rankings</p>
  </div>
  <div class="action-body">
    <div class="issue-tally">
      <div class="tally-card critical">
        <span class="tally-number">${criticalCount}</span>
        <span class="tally-label">Critical</span>
      </div>
      <div class="tally-card high">
        <span class="tally-number">${highCount}</span>
        <span class="tally-label">High</span>
      </div>
      <div class="tally-card medium">
        <span class="tally-number">${mediumCount}</span>
        <span class="tally-label">Medium</span>
      </div>
      <div class="tally-card low">
        <span class="tally-number">${lowCount}</span>
        <span class="tally-label">Low</span>
      </div>
    </div>
    <h3>Your Next 3 Steps</h3>
    <ol class="next-steps">
      ${stepsHtml}
    </ol>
    <div class="closing-note">
      <p>SEO is a marathon, not a sprint. Addressing the critical and high-priority issues first will deliver the greatest impact in the shortest time. Consistent implementation over 90 days will compound into lasting improvements in organic visibility and qualified traffic.</p>
    </div>
  </div>
</div>
`;
  }
}

export default ProfessionalSEOReportGenerator;
