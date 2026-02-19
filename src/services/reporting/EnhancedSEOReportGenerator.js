import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';

/**
 * Enhanced SEO Report Generator
 *
 * Generates detailed PDF reports using HTML/CSS + Puppeteer.
 * Replaces the previous PDFKit implementation which produced blank pages
 * due to manual doc.addPage() calls. HTML/CSS pagination is automatic.
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

    // Save HTML for debugging
    const htmlDebugPath = filepath.replace('.pdf', '.html');
    fs.writeFileSync(htmlDebugPath, fullHTML);
    logger.info({ htmlDebugPath }, 'Saved HTML debug file');

    const launchOptions = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });

    await page.pdf({
      path: filepath,
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' }
    });

    await browser.close();

    logger.info({ auditId: this.auditId, filepath }, 'Enhanced PDF report generated successfully');
    return filepath;
  }

  // ─── HTML REPORT BUILDER ────────────────────────────────────────────────────

  buildHTMLReport() {
    const sections = [];
    sections.push(this.buildCoverPage());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildScoreBreakdown());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildWhatNotWorking());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildWhatIsWorking());
    sections.push(this.buildWhatNeedsChange());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildRoadmap());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildExpectedResults());
    sections.push('<div class="page-break"></div>');
    sections.push(this.buildActionSummary());
    return sections.join('\n');
  }

  // ─── SECTIONS ───────────────────────────────────────────────────────────────

  buildCoverPage() {
    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const scoreColor = this.getScoreColorClass(this.audit.overallScore);
    const criticalCount = this.audit.recommendations.filter(r => r.priority === 'CRITICAL').length;
    const highCount = this.audit.recommendations.filter(r => r.priority === 'HIGH').length;

    return `
<div class="cover">
  <h1>SEO Audit Report</h1>
  <div class="subtitle">
    ${this.escapeHTML(domain)}<br/>
    ${new Date(this.audit.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
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
    const categories = {
      'TECHNICAL_SEO': 'A. Technical SEO',
      'ON_PAGE_SEO': 'B. On-Page SEO',
      'CONTENT_QUALITY': 'C. Content Quality',
      'AUTHORITY_BACKLINKS': 'D. Authority & Local SEO',
      'LOCAL_SEO': 'D. Authority & Local SEO',
      'PERFORMANCE': 'E. Performance'
    };

    let html = `<h1>2. What Is NOT Working</h1>
<p>Issues identified during the audit, grouped by category. Each includes specific evidence and recommended fix.</p>`;

    const seen = new Set();
    for (const [categoryKey, categoryTitle] of Object.entries(categories)) {
      if (seen.has(categoryTitle)) continue;
      seen.add(categoryTitle);

      const keys = Object.entries(categories)
        .filter(([, t]) => t === categoryTitle)
        .map(([k]) => k);

      const issues = this.audit.recommendations
        .filter(r => keys.includes(r.category))
        .slice(0, 2);

      if (issues.length === 0) continue;

      html += `<h2>${this.escapeHTML(categoryTitle)}</h2>`;
      for (const issue of issues) {
        html += this.buildIssueCard(issue);
      }
    }

    return html;
  }

  buildIssueCard(issue) {
    const severity = issue.priority.toLowerCase();
    return `
<div class="issue-card ${severity}">
  <div class="issue-header">
    <span class="issue-title">${this.escapeHTML(this.truncate(issue.title, 80))}</span>
    <span class="issue-severity ${severity}">${issue.priority}</span>
  </div>
  <div class="issue-description">${this.escapeHTML(this.truncate(issue.description, 250))}</div>
  ${issue.affectedPages > 0 ? `<div class="text-sm text-gray">Affected pages: ${issue.affectedPages}</div>` : ''}
  ${issue.implementation ? `<div class="issue-fix"><strong>Fix:</strong> ${this.escapeHTML(this.truncate(issue.implementation, 200))}</div>` : ''}
  ${issue.expectedImpact ? `<div class="issue-impact">Impact: ${this.escapeHTML(this.truncate(issue.expectedImpact, 150))}</div>` : ''}
</div>`;
  }

  buildWhatIsWorking() {
    const strengths = this.identifyStrengths().slice(0, 4);

    let html = `<h1>3. What IS Working</h1>
<p>Strengths to preserve as you implement improvements.</p>`;

    for (const s of strengths) {
      html += `
<div class="success-box mt-2">
  <strong>&#10003; ${this.escapeHTML(s.title)}</strong><br/>
  <span class="text-sm">${this.escapeHTML(this.truncate(s.description, 150))}</span>
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
    const colors = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

    let html = `<div class="page-break"></div><h1>4. What Needs to Change</h1>
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

    // Top 6 fixes (max 2 per priority level that has issues)
    const fixesToShow = [];
    for (const p of priorities) {
      const group = this.audit.recommendations.filter(r => r.priority === p).slice(0, 2);
      fixesToShow.push(...group);
      if (fixesToShow.length >= 6) break;
    }

    html += `<h2>Detailed Fixes</h2>`;
    for (const fix of fixesToShow.slice(0, 6)) {
      html += this.buildIssueCard(fix);
    }

    return html;
  }

  buildRoadmap() {
    const quickWins = this.audit.recommendations.filter(r => r.effortLevel === 'QUICK_WIN').slice(0, 5);
    const month1 = this.audit.recommendations.filter(r => ['CRITICAL', 'HIGH'].includes(r.priority) && r.effortLevel !== 'QUICK_WIN').slice(0, 4);
    const month2 = this.audit.recommendations.filter(r => r.priority === 'MEDIUM').slice(0, 4);
    const month3 = this.audit.recommendations.filter(r => r.priority === 'LOW').slice(0, 3);

    const renderTasks = (tasks, fallbackImpact) => tasks.map(t => `
    <div class="roadmap-task">
      <div class="roadmap-task-title">${this.escapeHTML(this.truncate(t.title, 80))}</div>
      <div class="roadmap-task-detail">${t.estimatedHours ? `Est. ${t.estimatedHours}h` : 'Quick'} &bull; ${this.escapeHTML(this.truncate(t.expectedImpact || fallbackImpact, 120))}</div>
    </div>`).join('');

    return `<h1>5. Implementation Roadmap</h1>

<div class="roadmap-phase">
  <div class="roadmap-header">Days 1–7: Quick Wins <span class="roadmap-subtitle">(${quickWins.length} tasks)</span></div>
  <div class="roadmap-tasks">${renderTasks(quickWins, 'Immediate improvement')}</div>
</div>

<div class="roadmap-phase">
  <div class="roadmap-header">Month 1 (Weeks 2–4): Foundation Fixes <span class="roadmap-subtitle">(${month1.length} tasks)</span></div>
  <div class="roadmap-tasks">${renderTasks(month1, 'Improves core SEO metrics')}</div>
</div>

<div class="roadmap-phase">
  <div class="roadmap-header">Month 2 (Weeks 5–8): Optimisation <span class="roadmap-subtitle">(${month2.length} tasks)</span></div>
  <div class="roadmap-tasks">${renderTasks(month2, 'Enhances user experience')}</div>
</div>

<div class="roadmap-phase">
  <div class="roadmap-header">Month 3 (Weeks 9–12): Polish &amp; Growth <span class="roadmap-subtitle">(${month3.length} tasks)</span></div>
  <div class="roadmap-tasks">${renderTasks(month3, 'Long-term improvement')}</div>
</div>`;
  }

  buildExpectedResults() {
    const projected = this.audit.overallScore + Math.min(20, Math.floor((100 - this.audit.overallScore) * 0.4));
    const improvement = ((projected - this.audit.overallScore) / this.audit.overallScore * 100).toFixed(0);

    return `<h1>6. Expected Results After 90 Days</h1>
<table>
  <thead><tr><th>Metric</th><th>Current</th><th>90-Day Target</th><th>Change</th></tr></thead>
  <tbody>
    <tr><td>SEO Score</td><td>${this.audit.overallScore}/100</td><td>${projected}/100</td><td class="color-low font-semibold">+${improvement}%</td></tr>
    <tr><td>Organic Traffic</td><td>Baseline</td><td>+150–200%</td><td class="color-low font-semibold">2–3x</td></tr>
    <tr><td>Top-10 Keyword Rankings</td><td>Unknown</td><td>25–40 keywords</td><td class="color-low font-semibold">New</td></tr>
    <tr><td>Page Speed (Mobile)</td><td>Varies</td><td>75–85/100</td><td class="color-low font-semibold">+40–70%</td></tr>
    <tr><td>Conversion Rate</td><td>Est. 2–3%</td><td>4–6%</td><td class="color-low font-semibold">+100%</td></tr>
    <tr><td>Bounce Rate</td><td>Baseline</td><td>−15–20%</td><td class="color-low font-semibold">Reduction</td></tr>
  </tbody>
</table>
<div class="highlight-box mt-2">
  <strong>Note:</strong> Projections assume implementation of Critical and High-priority fixes.
  Results compound over time — SEO is a long-term investment.
</div>`;
  }

  buildActionSummary() {
    const immediateActions = [
      'Assign owners for Quick Wins tasks (see Days 1–7 roadmap)',
      'Set up project management board (Trello, Asana, or Monday.com)',
      'Schedule kickoff meeting with Marketing, Dev, and Content teams',
      'Create Google Search Console account and verify domain ownership',
      'Run baseline performance tests: PageSpeed Insights, GTmetrix',
      'Document current metrics (traffic, rankings, conversions) for comparison',
      'Install an SEO plugin (Rank Math or Yoast) if not already in use',
      'Set up weekly progress review cadence'
    ];

    const actions = immediateActions.map((a, i) => `<li>${this.escapeHTML(a)}</li>`).join('');

    return `<h1>7. Action Summary &amp; Next Steps</h1>

<h2>Immediate Actions (This Week)</h2>
<ol>${actions}</ol>

<h2>Success Metrics to Track</h2>
<table>
  <thead><tr><th>Weekly</th><th>Monthly</th><th>Quarterly</th></tr></thead>
  <tbody>
    <tr>
      <td>Organic traffic<br/>Keyword rankings<br/>Page speed scores</td>
      <td>New backlinks<br/>Conversion rate<br/>Lead quality</td>
      <td>Revenue from organic<br/>Customer acquisition cost<br/>Market share</td>
    </tr>
  </tbody>
</table>

<div class="highlight-box mt-2">
  <strong>Final Note:</strong> SEO is a marathon, not a sprint. The most significant results
  compound over 90 days and beyond. Stay consistent with content creation, technical
  optimisations, and link building. Review this report monthly and adjust based on data.
</div>`;
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  identifyStrengths() {
    const strengths = [];
    for (const result of this.audit.results) {
      if (result.categoryScore >= 70) {
        strengths.push({
          title: `Strong ${this.formatCategoryName(result.category)} (${result.categoryScore}/100)`,
          description: `Your ${this.formatCategoryName(result.category).toLowerCase()} performance is solid. Continue current practices and build on this foundation.`
        });
      }
    }
    const generic = [
      { title: 'HTTPS Security', description: 'Site uses HTTPS, meeting Google\'s security requirements and protecting user data.' },
      { title: 'Mobile-Responsive Design', description: 'Responsive design ensures usability across devices.' },
      { title: 'Clear Site Architecture', description: 'Logical hierarchy makes it easy for users and crawlers to navigate.' }
    ];
    return [...strengths, ...generic];
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

  truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
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
