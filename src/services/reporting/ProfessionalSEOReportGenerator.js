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

    // Pages 3-6: Findings by Category (with evidence)
    sections.push(this.buildFindingsByCategory());

    // Pages 7-8: Priority Backlog + Effort/Impact Matrix
    sections.push(this.buildPriorityBacklog());

    // Pages 9-10: 30/60/90 Day Roadmap
    sections.push(this.buildRoadmap());

    // Optional: Appendix (if needed)
    if (this.audit.pages.length > 50) {
      sections.push(this.buildAppendix());
    }

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
      <div class="roadmap-task-title">${this.escapeHTML(task.title)}</div>
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
      <div class="roadmap-task-title">${this.escapeHTML(task.title)}</div>
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
      <div class="roadmap-task-title">${this.escapeHTML(task.title)}</div>
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
      <div class="roadmap-task-title">${this.escapeHTML(task.title)}</div>
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
}

export default ProfessionalSEOReportGenerator;
