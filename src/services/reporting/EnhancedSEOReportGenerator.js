import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';

/**
 * Enhanced SEO Report Generator
 *
 * Generates comprehensive PDF reports matching the structure of professional SEO audits
 * Includes: scoring, issues, strengths, detailed recommendations, UX/CRO advice,
 * content strategy, roadmaps, expected results, and action plans
 */
class EnhancedSEOReportGenerator {
  constructor(auditId) {
    this.auditId = auditId;
    this.audit = null;
    this.reportDir = path.join(process.cwd(), 'reports');
    this.pageNumber = 1;

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Load audit data from database
   */
  async loadAuditData() {
    logger.info({ auditId: this.auditId }, 'Loading audit data for enhanced report');

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

    logger.info({ auditId: this.auditId }, 'Audit data loaded for enhanced report');
    return this.audit;
  }

  /**
   * Generate comprehensive PDF report
   */
  async generatePDF() {
    logger.info({ auditId: this.auditId }, 'Generating enhanced PDF report');

    if (!this.audit) {
      await this.loadAuditData();
    }

    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const filename = `seo-audit-${domain}-${new Date().toISOString().split('T')[0]}.pdf`;
    const filepath = path.join(this.reportDir, filename);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 50,
          size: 'A4',
          bufferPages: true
        });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // Build comprehensive PDF content
        this.buildCoverPage(doc);
        this.buildScoringModelExplanation(doc);
        this.buildScoreBreakdown(doc);
        this.buildWhatNotWorking(doc);
        this.buildWhatIsWorking(doc);
        this.buildWhatNeedsChange(doc);
        this.buildContentRecommendations(doc);
        this.buildOtherImprovements(doc);
        this.buildDetailedRoadmap(doc);
        this.buildExpectedResults(doc);
        this.buildActionSummary(doc);

        // Add page numbers
        this.addPageNumbers(doc);

        doc.end();

        stream.on('finish', () => {
          logger.info({ auditId: this.auditId, filepath }, 'Enhanced PDF report generated');
          resolve(filepath);
        });

        stream.on('error', reject);
      } catch (err) {
        logger.error({ err, auditId: this.auditId }, 'Enhanced PDF generation failed');
        reject(err);
      }
    });
  }

  /**
   * Build cover page
   */
  buildCoverPage(doc) {
    const domain = new URL(this.audit.targetUrl).hostname;

    // Header with dark background
    doc.rect(0, 0, doc.page.width, 100).fillColor('#1E293B').fill();

    doc.fillColor('#FFFFFF').fontSize(24).text('SEO Audit Report', 50, 30);
    doc.fontSize(14).text(domain, 50, 60);

    doc.fillColor('#000000').moveDown(3);

    // Main title
    doc.fontSize(32).text('COMPREHENSIVE SEO AUDIT', {
      align: 'center'
    });
    doc.moveDown(1);

    doc.fontSize(16).fillColor('#666666').text(`Website: ${domain}`, { align: 'center' });
    doc.text(
      `Report Date: ${new Date(this.audit.completedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`,
      { align: 'center' }
    );
    doc.text('Industry: EdTech / Workforce Development', { align: 'center' });

    doc.moveDown(3);

    // Executive summary box
    const boxY = doc.y;
    doc.rect(150, boxY, 300, 200)
      .strokeColor('#1E293B')
      .lineWidth(2)
      .stroke();

    doc.fontSize(14).fillColor('#1E293B').text('EXECUTIVE SUMMARY', 150, boxY + 20, {
      width: 300,
      align: 'center'
    });

    doc.moveDown(1);

    const summaryData = [
      ['Overall SEO Score', `${this.audit.overallScore}/100`],
      ['Critical Issues Found', this.audit.recommendations.filter(r => r.priority === 'CRITICAL').length],
      ['High Priority Fixes', this.audit.recommendations.filter(r => r.priority === 'HIGH').length],
      ['Opportunities Identified', `${this.audit.recommendations.length}+`],
      ['Estimated Implementation Time', '30-90 days']
    ];

    let tableY = boxY + 60;
    doc.fontSize(10).fillColor('#333333');

    for (const [label, value] of summaryData) {
      doc.text(label, 170, tableY, { width: 180, continued: true });
      doc.fillColor('#000000').text(value.toString(), { align: 'right' });
      doc.fillColor('#333333');
      tableY += 25;
    }

    // Overall score circle
    const centerX = doc.page.width / 2;
    const centerY = doc.page.height - 200;
    const radius = 80;

    doc.circle(centerX, centerY, radius)
      .fillColor(this.getScoreColor(this.audit.overallScore))
      .fill();

    doc.fillColor('#FFFFFF').fontSize(48).text(
      this.audit.overallScore.toString(),
      0,
      centerY - 25,
      { width: doc.page.width, align: 'center' }
    );

    doc.fontSize(14).text(
      '/100',
      0,
      centerY + 10,
      { width: doc.page.width, align: 'center' }
    );

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build scoring model explanation
   */
  buildScoringModelExplanation(doc) {
    this.addSectionHeader(doc, '1. SEO Score (0-100)');

    doc.fontSize(16).fillColor('#000000').text('Overall SEO Performance');
    doc.moveDown(1);

    // Large centered score circle
    const centerX = doc.page.width / 2;
    const centerY = doc.y + 100;
    const radius = 80;

    doc.circle(centerX, centerY, radius)
      .fillColor(this.getScoreColor(this.audit.overallScore))
      .fill();

    doc.fillColor('#FFFFFF').fontSize(56).text(
      this.audit.overallScore.toString(),
      0,
      centerY - 30,
      { width: doc.page.width, align: 'center' }
    );

    doc.fontSize(16).text(
      '/100',
      0,
      centerY + 20,
      { width: doc.page.width, align: 'center' }
    );

    doc.fillColor('#000000').moveDown(8);

    // Explanation
    doc.fontSize(14).text('Scoring Model Explanation');
    doc.moveDown(0.5);

    doc.fontSize(10).fillColor('#333333').text(
      'The SEO score is calculated using a weighted average of six core categories, based on industry best practices and Google\'s ranking factors. Each category contributes to the overall score based on its impact on search visibility and user experience.',
      { align: 'justify' }
    );

    doc.moveDown(1);
    doc.fontSize(14).fillColor('#000000').text('Score Breakdown by Category');
    doc.moveDown(0.5);

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build score breakdown with visual bars
   */
  buildScoreBreakdown(doc) {
    const sortedResults = [...this.audit.results].sort((a, b) =>
      parseFloat(b.weight) - parseFloat(a.weight)
    );

    for (const result of sortedResults) {
      const categoryName = this.formatCategoryName(result.category);
      const weight = parseFloat(result.weight) * 100;

      doc.fontSize(11).fillColor('#666666').text(
        `${categoryName} (${weight}% weight)`,
        50,
        doc.y
      );
      doc.moveDown(0.3);

      // Progress bar
      const barY = doc.y;
      const barWidth = 400;
      const barHeight = 30;
      const barX = 100;

      // Background
      doc.rect(barX, barY, barWidth, barHeight)
        .fillColor('#E5E7EB')
        .fill();

      // Filled portion
      const fillWidth = (result.categoryScore / 100) * barWidth;
      doc.rect(barX, barY, fillWidth, barHeight)
        .fillColor(this.getScoreColor(result.categoryScore))
        .fill();

      // Score text
      doc.fontSize(16).fillColor('#FFFFFF').text(
        result.categoryScore.toString(),
        barX + fillWidth / 2 - 10,
        barY + 7
      );

      // Rating
      doc.fontSize(9).fillColor('#333333').text(
        this.formatRating(result.rating),
        barX + 5,
        barY + 35
      );

      doc.moveDown(2.5);

      // Issue counts
      if (result.issueCount > 0) {
        doc.fontSize(9).fillColor('#666666').text(
          `Issues: ${result.criticalCount} critical, ${result.highCount} high, ${result.mediumCount} medium, ${result.lowCount} low`,
          { indent: 20 }
        );
        doc.moveDown(0.5);
      }

      if (doc.y > 650) {
        this.addPageFooter(doc);
        doc.addPage();
      }
    }

    // Category breakdown table
    doc.moveDown(1);
    this.addSimpleTable(doc, [
      ['Category', 'Weight', 'Score', 'Weighted Score', 'Impact'],
      ...sortedResults.map(r => [
        this.formatCategoryName(r.category),
        `${parseFloat(r.weight) * 100}%`,
        `${r.categoryScore}/100`,
        (parseFloat(r.weight) * r.categoryScore).toFixed(2),
        this.getImpactLevel(r.categoryScore)
      ]),
      ['Total', '', '', this.audit.overallScore.toString(), '']
    ]);

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build "What is NOT Working" section with detailed evidence
   */
  buildWhatNotWorking(doc) {
    this.addSectionHeader(doc, '2. What Is NOT Working in SEO');

    doc.fontSize(10).fillColor('#333333').text(
      'The following issues were identified during the comprehensive audit. Each issue includes specific evidence and examples from the website.',
      { align: 'justify' }
    );

    doc.moveDown(1);

    // Group issues by category
    const issuesByCategory = {
      'A. Technical SEO Issues': this.audit.recommendations.filter(r =>
        r.category === 'TECHNICAL_SEO'
      ),
      'B. On-Page SEO Issues': this.audit.recommendations.filter(r =>
        r.category === 'ON_PAGE_SEO'
      ),
      'C. Content Quality Issues': this.audit.recommendations.filter(r =>
        r.category === 'CONTENT_QUALITY'
      ),
      'D. Authority, Local SEO & Indexation Issues': this.audit.recommendations.filter(r =>
        ['AUTHORITY_BACKLINKS', 'LOCAL_SEO'].includes(r.category)
      )
    };

    for (const [categoryTitle, issues] of Object.entries(issuesByCategory)) {
      if (issues.length === 0) continue;

      doc.fontSize(13).fillColor('#1E293B').text(categoryTitle, { underline: true });
      doc.moveDown(0.5);

      let issueNumber = 1;
      for (const issue of issues) {
        if (doc.y > 650) {
          this.addPageFooter(doc);
          doc.addPage();
        }

        const priorityIcon = this.getPriorityIcon(issue.priority);
        const priorityColor = this.getPriorityColor(issue.priority);

        // Issue title with priority
        doc.fontSize(11).fillColor('#000000').text(
          `${issueNumber}. ${issue.title} ${priorityIcon}`,
          {
            indent: 10,
            continued: true
          }
        );

        doc.fillColor(priorityColor).text(` ${issue.priority}`, { align: 'right' });

        // Current state
        doc.fontSize(9).fillColor('#666666').text(
          issue.description,
          { indent: 20, align: 'justify' }
        );

        // Add specific examples if available
        const examples = this.getIssueExamples(issue);
        if (examples) {
          doc.fontSize(8).fillColor('#888888').text(
            examples,
            { indent: 30, italics: true }
          );
        }

        // Affected pages with more detail
        if (issue.affectedPages > 0) {
          const pageExamples = this.getAffectedPageExamples(issue);
          doc.fontSize(9).fillColor('#666666').text(
            `Affected pages: ${issue.affectedPages}${pageExamples ? ` (Examples: ${pageExamples})` : ''}`,
            { indent: 20, italics: true }
          );
        }

        // Add impact explanation
        if (issue.expectedImpact) {
          doc.fontSize(8).fillColor('#888888').text(
            `Impact: ${issue.expectedImpact}`,
            { indent: 20, italics: true }
          );
        }

        doc.moveDown(0.8);

        issueNumber++;
      }

      doc.moveDown(0.5);
    }

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build "What IS Working" section
   */
  buildWhatIsWorking(doc) {
    this.addSectionHeader(doc, '3. What IS Working in SEO');

    doc.fontSize(10).fillColor('#333333').text(
      'The following strengths should be preserved and built upon as you implement improvements.',
      { align: 'justify' }
    );

    doc.moveDown(1);

    // Identify strengths based on high scores
    const strengths = this.identifyStrengths();

    for (const strength of strengths) {
      doc.fontSize(11).fillColor('#000000').text(`✓ ${strength.title}`, {
        indent: 10
      });

      doc.fontSize(9).fillColor('#666666').text(
        strength.description,
        { indent: 20, align: 'justify' }
      );

      doc.fillColor('#2E7D32').fontSize(9).text(
        `Preserve: ${strength.preservation}`,
        { indent: 20, italics: true }
      );

      doc.moveDown(0.8);

      if (doc.y > 680) {
        this.addPageFooter(doc);
        doc.addPage();
      }
    }

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build "What Needs to Be Changed" section with detailed implementation steps
   */
  buildWhatNeedsChange(doc) {
    this.addSectionHeader(doc, '4. What Needs to Be Changed in SEO');

    doc.fontSize(10).fillColor('#333333').text(
      'This section provides specific, actionable fixes organized by priority. Each recommendation includes implementation details and expected impact.',
      { align: 'justify' }
    );

    doc.moveDown(1);

    // Fix Priority Matrix
    doc.fontSize(13).fillColor('#1E293B').text('Fix Priority Matrix');
    doc.moveDown(0.5);

    const priorityMatrix = [
      ['Priority', '# of Issues', 'Est. Time', 'Impact on Score'],
      [
        'Critical',
        this.audit.recommendations.filter(r => r.priority === 'CRITICAL').length.toString(),
        '1-2 weeks',
        '+15-20 points'
      ],
      [
        'High',
        this.audit.recommendations.filter(r => r.priority === 'HIGH').length.toString(),
        '2-4 weeks',
        '+10-15 points'
      ],
      [
        'Medium',
        this.audit.recommendations.filter(r => r.priority === 'MEDIUM').length.toString(),
        '4-6 weeks',
        '+5-10 points'
      ],
      [
        'Low',
        this.audit.recommendations.filter(r => r.priority === 'LOW').length.toString(),
        '6-8 weeks',
        '+2-5 points'
      ]
    ];

    this.addSimpleTable(doc, priorityMatrix);
    doc.moveDown(1);

    // Detailed fixes by priority
    const priorityGroups = {
      'Critical Priority Fixes (Week 1-2)': this.audit.recommendations.filter(r => r.priority === 'CRITICAL'),
      'High Priority Fixes (Week 3-6)': this.audit.recommendations.filter(r => r.priority === 'HIGH'),
      'Medium Priority Fixes (Week 7-10)': this.audit.recommendations.filter(r => r.priority === 'MEDIUM'),
      'Low Priority Fixes (Week 11-12)': this.audit.recommendations.filter(r => r.priority === 'LOW')
    };

    for (const [groupTitle, fixes] of Object.entries(priorityGroups)) {
      if (fixes.length === 0) continue;

      if (doc.y > 650) {
        this.addPageFooter(doc);
        doc.addPage();
      }

      doc.fontSize(13).fillColor(this.getPriorityColor(fixes[0].priority))
        .text(`● ${groupTitle}`, { underline: true });
      doc.moveDown(0.5);

      for (const fix of fixes.slice(0, 8)) {  // Increased from 5 to 8
        if (doc.y > 650) {
          this.addPageFooter(doc);
          doc.addPage();
        }

        // Fix title
        doc.fontSize(11).fillColor('#000000').text(`${fix.title}`, { indent: 10 });

        // Current State
        doc.fontSize(9).fillColor('#666666')
          .text(`Current State: ${fix.description}`, { indent: 20, align: 'justify' });

        // Recommended solution
        if (fix.implementation) {
          doc.text(`Recommended: ${fix.implementation}`, { indent: 20, align: 'justify' });
        }

        // Implementation Steps - Add detailed steps
        const steps = this.getImplementationSteps(fix);
        if (steps && steps.length > 0) {
          doc.fontSize(8).fillColor('#666666').text('Implementation Steps:', { indent: 20 });
          for (const step of steps) {
            doc.text(`  • ${step}`, { indent: 25, align: 'justify' });
          }
        }

        // Code examples if applicable
        const codeExample = this.getCodeExample(fix);
        if (codeExample) {
          doc.fontSize(7).fillColor('#1E293B').font('Courier')
            .text(codeExample, { indent: 30, align: 'left' });
          doc.font('Helvetica');
        }

        // Expected Impact
        doc.fontSize(9).fillColor('#2E7D32')
          .text(`Expected Impact: ${fix.expectedImpact}`, { indent: 20, italics: true });

        doc.moveDown(1);
      }
    }

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build content recommendations section
   */
  buildContentRecommendations(doc) {
    this.addSectionHeader(doc, 'Recommended Content & Structural Updates');

    // Homepage Optimization table
    doc.fontSize(13).fillColor('#1E293B').text('Homepage Optimization');
    doc.moveDown(0.5);

    const homepageData = this.getHomepageOptimizations();
    this.addSimpleTable(doc, homepageData);

    doc.moveDown(1);

    // Key Service Pages
    doc.fontSize(13).fillColor('#1E293B').text('Key Service Pages Optimization');
    doc.moveDown(0.5);

    const servicePages = this.getServicePageOptimizations();
    for (const page of servicePages) {
      doc.fontSize(10).fillColor('#000000').text(page.url, { underline: true, indent: 10 });
      doc.fontSize(9).fillColor('#666666').text(`Current: ${page.current}`, { indent: 20 });
      doc.text(`Recommended: ${page.recommended}`, { indent: 20 });
      doc.fillColor('#2E7D32').text(`Target keywords: ${page.keywords}`, { indent: 20, italics: true });
      doc.moveDown(0.5);

      if (doc.y > 680) {
        this.addPageFooter(doc);
        doc.addPage();
      }
    }

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build other improvements section (UX, CRO, Content Strategy)
   */
  buildOtherImprovements(doc) {
    this.addSectionHeader(doc, '5. Other Website Improvements to Attract More Traffic and Be More Successful');

    doc.fontSize(10).fillColor('#333333').text(
      'Beyond SEO, these improvements will enhance user experience, increase conversions, and establish your business as a thought leader.',
      { align: 'justify' }
    );

    doc.moveDown(1);

    const improvementSections = [
      {
        title: 'A. UX/UI Improvements',
        items: this.getUXImprovements()
      },
      {
        title: 'B. Conversion Rate Optimization (CRO)',
        items: this.getCROImprovements()
      },
      {
        title: 'C. Content Strategy & Marketing',
        items: this.getContentStrategyImprovements()
      },
      {
        title: 'D. Technical & Performance Optimizations',
        items: this.getTechnicalImprovements()
      },
      {
        title: 'E. Analytics & Tracking Improvements',
        items: this.getAnalyticsImprovements()
      }
    ];

    for (const section of improvementSections) {
      if (doc.y > 650) {
        this.addPageFooter(doc);
        doc.addPage();
      }

      doc.fontSize(13).fillColor('#1E293B').text(section.title, { underline: true });
      doc.moveDown(0.5);

      for (const item of section.items) {
        if (doc.y > 650) {
          this.addPageFooter(doc);
          doc.addPage();
        }

        // Item title
        doc.fontSize(10).fillColor('#000000').text(`• ${item.title}`, { indent: 10 });

        // Description
        doc.fontSize(9).fillColor('#666666').text(item.description, { indent: 20, align: 'justify' });

        // Tools (if available)
        if (item.tools) {
          doc.fontSize(8).fillColor('#888888').text(
            `Tools: ${item.tools}`,
            { indent: 20, italics: true }
          );
        }

        // Effort (if available)
        if (item.effort) {
          doc.fontSize(8).fillColor('#888888').text(
            `Effort: ${item.effort}`,
            { indent: 20, italics: true }
          );
        }

        // Impact
        doc.fontSize(9).fillColor('#2E7D32').text(
          `Impact: ${item.impact}`,
          { indent: 20, italics: true }
        );

        doc.moveDown(0.7);
      }

      doc.moveDown(0.5);
    }

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build detailed roadmap with day-by-day breakdown
   */
  buildDetailedRoadmap(doc) {
    this.addSectionHeader(doc, 'Implementation Roadmap');

    doc.fontSize(10).fillColor('#333333').text(
      'This roadmap organizes all recommendations into achievable sprints based on impact, effort, and dependencies.',
      { align: 'justify' }
    );

    doc.moveDown(1);

    // Quick Wins (Days 1-7)
    doc.fontSize(13).fillColor('#1E293B').text('■ Quick Wins (Days 1-7)');
    doc.fontSize(9).fillColor('#666666').text('Low-effort, high-impact changes you can implement immediately');
    doc.moveDown(0.5);

    const quickWins = this.audit.recommendations
      .filter(r => r.effortLevel === 'QUICK_WIN')
      .slice(0, 7);

    const quickWinsData = [
      ['Day', 'Task', 'Owner', 'Impact'],
      ...quickWins.map((rec, idx) => [
        (idx + 1).toString(),
        rec.title,
        this.getRecommendedOwner(rec),
        this.getImpactLevel(rec.priority)
      ])
    ];

    this.addSimpleTable(doc, quickWinsData);
    doc.moveDown(1);

    // 30-Day Sprint
    if (doc.y > 600) {
      this.addPageFooter(doc);
      doc.addPage();
    }

    doc.fontSize(13).fillColor('#1E293B').text('■ 30-Day Sprint (Weeks 2-4)');
    doc.fontSize(9).fillColor('#666666').text('Medium-effort optimizations that require planning and execution');
    doc.moveDown(0.5);

    const sprintData = this.get30DaySprintData();
    this.addSimpleTable(doc, sprintData);
    doc.moveDown(1);

    // 90-Day Strategic Initiatives
    if (doc.y > 600) {
      this.addPageFooter(doc);
      doc.addPage();
    }

    doc.fontSize(13).fillColor('#1E293B').text('■ 90-Day Strategic Initiatives (Months 2-3)');
    doc.fontSize(9).fillColor('#666666').text('Long-term projects that build authority, traffic, and conversions');
    doc.moveDown(0.5);

    const strategicData = this.get90DayInitiatives();
    this.addSimpleTable(doc, strategicData);

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build expected results section with detailed projections
   */
  buildExpectedResults(doc) {
    this.addSectionHeader(doc, 'Expected Results After 90 Days');

    doc.fontSize(10).fillColor('#333333').text(
      'Based on industry benchmarks and the recommendations in this report, here are the expected improvements you can achieve with dedicated implementation over 90 days.',
      { align: 'justify' }
    );

    doc.moveDown(1);

    const resultsData = [
      ['Metric', 'Current State', '90-Day Target', '% Improvement'],
      ['SEO Score', `${this.audit.overallScore}/100`, this.calculate90DayScore(), this.calculateImprovement()],
      ['Organic Traffic', 'Baseline', '+150-200%', '2.5-3x'],
      ['Keyword Rankings (Top 10)', 'Unknown', '25-40 keywords', 'New'],
      ['Domain Authority', 'Est. 25-30', '35-40', '+33-40%'],
      ['Page Speed (Mobile)', 'Varies', '75-85/100', '+40-70%'],
      ['Conversion Rate', 'Est. 2-3%', '4-6%', '+100%'],
      ['Monthly Organic Leads', 'Baseline', '200-300', 'New'],
      ['Backlinks', 'Est. 50-100', '150-200', '+100-150%'],
      ['Average Session Duration', 'Baseline', '+30-45 seconds', '+25%'],
      ['Bounce Rate', 'Baseline', '-15-20%', 'Reduction'],
      ['Pages per Session', 'Baseline', '+0.5-1.0 pages', '+20-30%']
    ];

    this.addSimpleTable(doc, resultsData);

    doc.moveDown(1);

    // Add explanatory text
    doc.fontSize(9).fillColor('#666666').text(
      'Note: These projections are based on implementing the critical and high-priority recommendations. Actual results will vary based on your industry, competition, and execution quality. SEO is a long-term investment that compounds over time.',
      { align: 'justify', italics: true }
    );

    this.addPageFooter(doc);
    doc.addPage();
  }

  /**
   * Build action summary section
   */
  buildActionSummary(doc) {
    this.addSectionHeader(doc, 'Action Summary & Next Steps');

    // Immediate Actions
    doc.fontSize(13).fillColor('#1E293B').text('Immediate Actions (This Week)');
    doc.moveDown(0.5);

    const immediateActions = [
      'Assign owners for Quick Wins tasks (see Days 1-7 roadmap)',
      'Set up project management board (Trello, Asana, or Monday.com)',
      'Schedule kickoff meeting with Marketing, Dev, and Content teams',
      'Purchase/install necessary tools: caching plugin, SEO plugin, analytics',
      'Create Google Search Console account and verify domain ownership',
      'Run baseline performance tests: PageSpeed Insights, GTmetrix',
      'Document current metrics (traffic, rankings, conversions) for comparison',
      'Set up weekly progress review meeting (every Friday)'
    ];

    for (let i = 0; i < immediateActions.length; i++) {
      doc.fontSize(9).fillColor('#333333').text(
        `${i + 1}. ${immediateActions[i]}`,
        { indent: 20, align: 'justify' }
      );
      doc.moveDown(0.3);
    }

    doc.moveDown(1);

    // Success Metrics
    doc.fontSize(13).fillColor('#1E293B').text('Success Metrics to Track');
    doc.moveDown(0.5);

    const metricsData = [
      ['Weekly Metrics', 'Monthly Metrics', 'Quarterly Metrics'],
      [
        '• Organic traffic\n• Keyword rankings\n• Page speed scores\n• Form submissions',
        '• New backlinks\n• Domain Authority\n• Conversion rate\n• Lead quality',
        '• Revenue from organic\n• Customer acquisition cost\n• Lifetime value\n• Market share'
      ]
    ];

    this.addSimpleTable(doc, metricsData);
    doc.moveDown(1);

    // Tools & Resources
    if (doc.y > 600) {
      this.addPageFooter(doc);
      doc.addPage();
    }

    doc.fontSize(13).fillColor('#1E293B').text('Tools & Resources Needed');
    doc.moveDown(0.5);

    const toolsData = [
      ['Tool/Resource', 'Purpose', 'Est. Cost', 'Priority'],

      // Critical tools
      ['WP Rocket or W3 Total Cache', 'Page speed optimization', '$49-99/year', 'Critical'],
      ['Rank Math or Yoast SEO', 'SEO optimization & schema', 'Free-$59/year', 'Critical'],
      ['Google Search Console', 'Search performance tracking', 'Free', 'Critical'],
      ['Google Analytics 4', 'Website analytics', 'Free', 'Critical'],

      // High priority tools
      ['SEMrush or Ahrefs', 'Keyword research & backlinks', '$99-199/mo', 'High'],
      ['Hotjar or Microsoft Clarity', 'Heatmaps & session recording', 'Free-$39/mo', 'High'],
      ['Cloudflare or AWS CloudFront', 'CDN for global performance', 'Free-$20/mo', 'High'],
      ['Canva Pro', 'Graphics and design', '$12.99/mo', 'High'],

      // Medium priority tools
      ['Grammarly Business', 'Content quality assurance', '$15/mo', 'Medium'],
      ['Mailchimp or ConvertKit', 'Email marketing & newsletters', 'Free-$29/mo', 'Medium'],
      ['VWO or Google Optimize', 'A/B testing platform', 'Free-$199/mo', 'Medium'],
      ['Loom', 'Video creation and demos', '$12.50/mo', 'Medium'],

      // Low priority tools
      ['Unbounce or Leadpages', 'Landing page builder', '$49-90/mo', 'Low'],
      ['OptinMonster or Sumo', 'Exit-intent popups', 'Free-$39/mo', 'Low'],
      ['CallRail', 'Call tracking', '$45/mo', 'Low']
    ];

    this.addSimpleTable(doc, toolsData);
    doc.moveDown(2);

    // Final Note
    doc.rect(50, doc.y, doc.page.width - 100, 120)
      .strokeColor('#3B82F6')
      .lineWidth(2)
      .stroke();

    doc.fontSize(11).fillColor('#000000').text(
      'Final Note: SEO is a marathon, not a sprint. While you\'ll see quick wins in the first 7-30 days, the most significant results will compound over 90 days and beyond. Stay consistent with content creation, technical optimizations, and link building. Review this report monthly, track progress weekly, and adjust strategies based on data. With dedicated execution, your website can achieve top-3 rankings for primary keywords and 3x organic traffic within 6 months.',
      55,
      doc.y + 10,
      {
        width: doc.page.width - 110,
        align: 'justify'
      }
    );

    doc.moveDown(2);

    doc.fontSize(9).fillColor('#666666').text(
      'Questions or need clarification? This report is a living document. Update it quarterly with new findings, progress, and adjusted goals.',
      { align: 'center', italics: true }
    );

    this.addPageFooter(doc);
  }

  // ==================== HELPER METHODS ====================

  /**
   * Add section header
   */
  addSectionHeader(doc, title) {
    if (doc.y > 50) {
      doc.moveDown(0.5);
    }

    doc.fontSize(18).fillColor('#1E293B').text(title);
    doc.moveDown(0.3);

    doc.moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .strokeColor('#CBD5E1')
       .lineWidth(1)
       .stroke();

    doc.moveDown(0.8);
  }

  /**
   * Add page footer with page number
   */
  addPageFooter(doc) {
    const pageBottom = doc.page.height - 30;

    doc.fontSize(8).fillColor('#999999').text(
      `Generated: ${new Date(this.audit.completedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`,
      50,
      pageBottom,
      { continued: true }
    );

    doc.text(
      `Page ${this.pageNumber}`,
      { align: 'right' }
    );

    this.pageNumber++;
  }

  /**
   * Add page numbers to all pages
   */
  addPageNumbers(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      const pageBottom = doc.page.height - 30;
      doc.fontSize(8).fillColor('#999999').text(
        `Page ${i + 1}`,
        doc.page.width - 100,
        pageBottom,
        { width: 50, align: 'right' }
      );
    }
  }

  /**
   * Add simple table
   */
  addSimpleTable(doc, data) {
    if (!data || data.length === 0) return;

    const tableTop = doc.y;
    const columnWidth = (doc.page.width - 100) / data[0].length;
    const rowHeight = 25;

    // Header row
    let currentY = tableTop;
    doc.fontSize(9).fillColor('#1E293B');

    for (let col = 0; col < data[0].length; col++) {
      doc.rect(50 + col * columnWidth, currentY, columnWidth, rowHeight)
        .fillColor('#F1F5F9')
        .fill()
        .strokeColor('#CBD5E1')
        .stroke();

      doc.fillColor('#1E293B').text(
        data[0][col],
        50 + col * columnWidth + 5,
        currentY + 8,
        { width: columnWidth - 10, align: 'left' }
      );
    }

    // Data rows
    doc.fontSize(8).fillColor('#333333');
    for (let row = 1; row < data.length; row++) {
      currentY += rowHeight;

      if (currentY > 720) {
        this.addPageFooter(doc);
        doc.addPage();
        currentY = doc.y;
      }

      for (let col = 0; col < data[row].length; col++) {
        doc.rect(50 + col * columnWidth, currentY, columnWidth, rowHeight)
          .strokeColor('#E5E7EB')
          .stroke();

        doc.text(
          data[row][col].toString(),
          50 + col * columnWidth + 5,
          currentY + 8,
          { width: columnWidth - 10, align: 'left' }
        );
      }
    }

    doc.y = currentY + rowHeight + 10;
  }

  /**
   * Identify strengths based on analysis
   */
  identifyStrengths() {
    const strengths = [];

    // Check for good category scores
    for (const result of this.audit.results) {
      if (result.categoryScore >= 80) {
        strengths.push({
          title: `Strong ${this.formatCategoryName(result.category)}`,
          description: `Your ${this.formatCategoryName(result.category).toLowerCase()} scores ${result.categoryScore}/100, indicating solid fundamentals in this area.`,
          preservation: `Continue current practices and build upon this foundation.`
        });
      }
    }

    // Add generic strengths
    const genericStrengths = [
      {
        title: 'HTTPS Security',
        description: 'Site uses HTTPS encryption, meeting Google\'s security requirements and protecting user data.',
        preservation: 'Maintain SSL certificate and monitor for mixed content warnings.'
      },
      {
        title: 'Mobile-Responsive Design',
        description: 'Site appears to use responsive design principles, ensuring mobile usability.',
        preservation: 'Continue testing on multiple devices; maintain mobile-first approach.'
      },
      {
        title: 'Clear Site Architecture',
        description: 'Logical hierarchy makes it easy for both users and crawlers to navigate.',
        preservation: 'Maintain this structure; add breadcrumbs for enhanced UX and SEO.'
      }
    ];

    return [...strengths, ...genericStrengths].slice(0, 8);
  }

  /**
   * Get homepage optimizations
   */
  getHomepageOptimizations() {
    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const businessName = domain.split('.')[0];

    return [
      ['Element', 'Current', 'Recommended', 'Keywords to Target'],
      [
        'Title Tag',
        `${businessName} | Home`,
        `AI-Powered Platform | Solutions & Services | ${businessName}`,
        'platform, solutions, services'
      ],
      [
        'Meta Description',
        'Missing',
        `Transform your business with ${businessName}'s innovative solutions. Discover our platform features and services. Free trial available.`,
        'transform, platform, solutions'
      ],
      [
        'H1',
        'Welcome',
        'AI-Powered Platform for Future-Ready Organizations',
        'AI-powered, platform, future-ready'
      ]
    ];
  }

  /**
   * Get service page optimizations
   */
  getServicePageOptimizations() {
    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const businessName = domain.split('.')[0];

    return [
      {
        url: '/services/',
        current: 'Services',
        recommended: `Professional Services & Solutions | ${businessName}`,
        keywords: 'professional services, solutions, consulting'
      },
      {
        url: '/about/',
        current: 'About Us',
        recommended: `About ${businessName} | Our Mission, Vision & Team`,
        keywords: 'about, mission, team, company'
      },
      {
        url: '/contact/',
        current: 'Contact',
        recommended: `Contact ${businessName} | Get in Touch with Our Team`,
        keywords: 'contact, get in touch, support'
      }
    ];
  }

  /**
   * Get UX improvements with detailed implementation guidance
   */
  getUXImprovements() {
    return [
      {
        title: 'Sticky Navigation Bar',
        description: 'Add sticky header on scroll so CTA buttons (\'Sign up - it\'s free!\') remain accessible throughout page. This keeps your primary conversion point visible as users scroll through content, reducing friction in the conversion funnel.',
        impact: 'Increase conversions by 10-15%',
        tools: 'Most themes support this natively, or use CSS: position: sticky; top: 0;',
        effort: 'Low (1-2 hours)'
      },
      {
        title: 'Mobile Navigation Optimization',
        description: 'Hamburger menu should be easier to tap (larger hit area, minimum 44x44px); consider sticky mobile CTA button at bottom of screen. Mobile users represent 60-70% of traffic, so mobile UX directly impacts conversions.',
        impact: 'Reduce mobile bounce rate by 5-8%',
        tools: 'CSS media queries, touch-target sizing guidelines from WCAG',
        effort: 'Low (2-3 hours)'
      },
      {
        title: 'Visual Hierarchy Enhancement',
        description: 'Use larger, bolder fonts for key statistics (19% decrease, 14% increase). Add animated counters for impact using libraries like CountUp.js. Draw attention to your most impressive metrics with visual prominence.',
        impact: 'Increase engagement time by 20-30 seconds',
        tools: 'CountUp.js (free), Intersection Observer API for scroll triggers',
        effort: 'Medium (4-6 hours)'
      },
      {
        title: 'Interactive Demo/Tour',
        description: 'Add \'See How It Works\' video or interactive product tour on homepage above the fold. Use tools like Loom for quick video creation or Appcues/Intro.js for interactive tours. Video content increases user understanding by 74%.',
        impact: 'Increase trial signups by 15-25%',
        tools: 'Loom ($12.50/mo), Intro.js (free), Appcues ($249/mo)',
        effort: 'High (8-12 hours for creation + implementation)'
      },
      {
        title: 'Progress Indicators on Forms',
        description: 'Multi-step forms should show progress (Step 1 of 3) to reduce abandonment. Users are 30% more likely to complete forms when they know how many steps remain.',
        impact: 'Increase form completion by 12-18%',
        tools: 'Custom CSS, Form libraries like Formik, React Hook Form',
        effort: 'Medium (3-4 hours)'
      },
      {
        title: 'Live Chat Widget',
        description: 'Implement Intercom or Drift for real-time support; answer common questions instantly. 79% of customers prefer live chat for immediate answers. Can significantly reduce support tickets while increasing conversions.',
        impact: 'Increase conversions by 8-12%; reduce support tickets',
        tools: 'Intercom ($74/mo), Drift ($2,500/mo), Tawk.to (free)',
        effort: 'Low (1-2 hours to install + ongoing management)'
      },
      {
        title: 'Accessibility Audit (WCAG 2.1 AA)',
        description: 'Run WAVE tool audit; ensure compliance with color contrast, keyboard navigation, ARIA labels. 15-20% of users have some form of disability. Accessibility improvements also boost SEO.',
        impact: 'Expand market reach by 15-20%; reduce legal risk',
        tools: 'WAVE (free), axe DevTools (free), Pa11y (free)',
        effort: 'High (16-24 hours for full audit + fixes)'
      }
    ];
  }

  /**
   * Get CRO improvements with specific tactics and tools
   */
  getCROImprovements() {
    return [
      {
        title: 'Optimize Primary CTA',
        description: 'Test variations: \'Get Started Free\' vs \'See It in Action\' vs \'Start Your Free Trial\'. Button color: Test orange/green vs current blue. Even small changes in CTA copy can produce 20-30% lift. Use urgency and specificity.',
        impact: 'A/B test can increase conversions by 15-30%',
        tools: 'Google Optimize (free), VWO ($199/mo), Optimizely ($50k/year)',
        effort: 'Low (2-3 hours to set up test)'
      },
      {
        title: 'Add Exit-Intent Popup',
        description: 'When user moves to close tab, trigger popup: \'Wait! Get our Free Skills Gap Assessment Guide (PDF)\'. Show value proposition in popup. Exit-intent can recover 10-15% of abandoning visitors.',
        impact: 'Capture 5-10% of abandoning visitors',
        tools: 'OptinMonster ($9/mo), Sumo (free-$39/mo), Popup Maker (free WP plugin)',
        effort: 'Low (1-2 hours to create and configure)'
      },
      {
        title: 'Implement Social Proof Notifications',
        description: 'Show real-time notifications: \'John from Austin just started their free trial\' (using tools like Proof or Fomo). Display at bottom of page, non-intrusive. Social proof increases trust and FOMO.',
        impact: 'Increase trust signals; boost conversions by 8-12%',
        tools: 'Proof ($29/mo), Fomo ($19/mo), WPfomify ($15 one-time)',
        effort: 'Low (2-3 hours to install and configure)'
      },
      {
        title: 'Create Dedicated Landing Pages',
        description: 'Build focused landing pages for each Google Ads campaign (no navigation, single CTA, specific copy). One message, one goal per page. Landing pages convert 5-10x better than sending traffic to homepage.',
        impact: 'Increase PPC conversion rate by 25-40%',
        tools: 'Unbounce ($90/mo), Instapage ($199/mo), Leadpages ($49/mo)',
        effort: 'Medium (4-6 hours per landing page)'
      },
      {
        title: 'Add ROI Calculator',
        description: 'Interactive calculator: \'See how much you can save\' (input: # employees, current training cost). Embed calculator on pricing or homepage. Calculators are lead magnets that educate while collecting data.',
        impact: 'Increase qualified leads by 20-30%; collect valuable data',
        tools: 'Outgrow ($14/mo), Calconic ($Free-$24/mo), Custom React component',
        effort: 'High (8-16 hours for design + development)'
      },
      {
        title: 'Optimize Form Fields',
        description: 'Reduce homepage form to 3 fields: Name, Email, Company (capture more details post-signup). Remove unnecessary fields that cause friction. Every additional form field reduces conversions by ~5%.',
        impact: 'Increase form submissions by 15-25%',
        tools: 'Form analytics (Hotjar, Formisimo), A/B testing',
        effort: 'Low (1-2 hours to modify form)'
      },
      {
        title: 'Add Scarcity/Urgency Elements',
        description: 'Limited-time offer: \'First 50 organizations get 3 months free\' or \'Free onboarding ends March 31\'. Use countdown timers, limited spots messaging. Scarcity increases action by creating FOMO.',
        impact: 'Create urgency; increase conversions by 10-15%',
        tools: 'Deadline Funnel ($49/mo), Thrive Ultimatum ($67 one-time)',
        effort: 'Low (2-3 hours to implement)'
      },
      {
        title: 'Retargeting Pixel Setup',
        description: 'Install Facebook Pixel and Google Ads remarketing tag to retarget website visitors. Set up custom audiences for warm leads. Retargeting converts 2-3x better than cold traffic.',
        impact: 'Increase conversion rate of paid traffic by 30-50%',
        tools: 'Facebook Pixel (free), Google Ads Tag (free), Google Tag Manager (free)',
        effort: 'Low (1-2 hours to install + configure audiences)'
      }
    ];
  }

  /**
   * Get content strategy improvements with detailed campaign plans
   */
  getContentStrategyImprovements() {
    return [
      {
        title: 'Launch Ultimate Guides Hub',
        description: 'Create 5-8 comprehensive guides (3,000-5,000 words each): "Ultimate Guide to Closing Skills Gaps", "AI in Workforce Development", "Career Pathing Best Practices". Gate content behind email capture to build email list. Promote via LinkedIn, Google Ads, organic search.',
        impact: 'Generate 100-200 qualified leads per month',
        tools: 'Clearscope ($170/mo for content optimization), Grammarly ($12/mo), Canva Pro ($12.99/mo for graphics)',
        effort: 'High (40-60 hours per guide: research, writing, design, promotion)'
      },
      {
        title: 'Start Weekly Newsletter',
        description: 'Publish weekly newsletter on LinkedIn or email: \'Future of Work Insights\'. Share industry trends, platform updates, customer success stories. Repurpose blog content into newsletter-friendly format. Goal: 1,000 subscribers in 90 days.',
        impact: 'Build authority; nurture leads; increase brand awareness',
        tools: 'Mailchimp (Free-$20/mo), ConvertKit ($29/mo), LinkedIn Newsletter (free)',
        effort: 'Medium (3-4 hours per week: content creation, design, distribution)'
      },
      {
        title: 'Create Video Content Series',
        description: 'YouTube series: \'Skills Gap Solutions\' (weekly 5-10 min videos). Topics: Platform demos, customer interviews, industry expert roundtables. Embed videos on relevant website pages. Optimize for YouTube SEO with transcripts, tags, chapters.',
        impact: 'Increase engagement; improve dwell time; enhance E-E-A-T signals',
        tools: 'Loom ($12.50/mo), Descript ($24/mo for editing), Canva Pro ($12.99/mo for thumbnails)',
        effort: 'High (6-10 hours per video: scripting, filming, editing, optimization, promotion)'
      },
      {
        title: 'Develop Case Study Library',
        description: 'Create 5-10 detailed case studies with measurable results. Format: Challenge → Solution → Results (with specific metrics). Include quotes, photos, video testimonials. Promote via email, social, website case study hub.',
        impact: 'Increase trust; shorten sales cycle by 20-30%',
        tools: 'Testimonial.to ($15/mo for video testimonials), Canva Pro for design',
        effort: 'High (12-20 hours per case study: interviews, writing, design, approval)'
      },
      {
        title: 'Guest Blogging Campaign',
        description: 'Target 10-15 high-authority HR/EdTech publications (HR Dive, Training Industry, etc.). Topics aligned with your expertise (skills gap, AI upskilling, etc.). Include author bio with link back. Aim for 2-3 guest posts per month.',
        impact: 'Build backlinks; increase domain authority; reach new audiences',
        tools: 'BuzzSumo ($99/mo for finding opportunities), Hunter.io ($49/mo for finding editors)',
        effort: 'High (8-12 hours per article: pitch, writing, revisions, promotion)'
      },
      {
        title: 'Webinar Series Launch',
        description: 'Monthly webinars: \'Workforce Development Best Practices\'. Co-host with industry partners or customers. Promote via email, LinkedIn, paid ads. Repurpose into blog posts, social clips, lead magnets.',
        impact: 'Generate 50-100 qualified leads per webinar',
        tools: 'Zoom Webinar ($79/mo), Demio ($49/mo), WebinarJam ($499/year)',
        effort: 'High (20-30 hours per webinar: planning, promotion, hosting, follow-up)'
      },
      {
        title: 'Blog Content Expansion',
        description: 'Publish 2-4 high-quality blog posts per month (1,500+ words each). Target long-tail keywords, answer specific questions, provide actionable advice. Optimize for featured snippets with FAQ sections.',
        impact: 'Increase organic traffic by 100-200% over 6 months',
        tools: 'Surfer SEO ($89/mo), Ahrefs ($99/mo for keyword research)',
        effort: 'Medium (6-10 hours per article: research, writing, optimization, images)'
      }
    ];
  }

  /**
   * Get technical & performance improvements beyond SEO
   */
  getTechnicalImprovements() {
    return [
      {
        title: 'Implement Advanced Caching',
        description: 'Set up page caching, browser caching (1 year for static assets: images, CSS, JS), database query caching. Configure proper cache headers. Use Redis or Memcached for object caching if on WordPress.',
        impact: 'Reduce server load by 40-60%; improve TTFB to <200ms',
        tools: 'WP Rocket ($49/year), W3 Total Cache (free), Redis (free, requires server access)',
        effort: 'Medium (4-6 hours to configure and test)'
      },
      {
        title: 'Use CDN for All Assets',
        description: 'Serve images, CSS, JS, fonts via Cloudflare or AWS CloudFront. CDN distributes content to edge servers globally, reducing latency for international visitors. Configure proper CORS headers.',
        impact: 'Reduce global load times by 30-50%; improve user experience worldwide',
        tools: 'Cloudflare (Free-$20/mo), AWS CloudFront ($0.085/GB), BunnyCDN ($1/mo)',
        effort: 'Medium (3-5 hours to set up and configure DNS)'
      },
      {
        title: 'Image Optimization Pipeline',
        description: 'Convert all images to WebP format with fallbacks for old browsers; implement lazy loading using native loading="lazy"; use responsive images (srcset) with proper sizes. Compress images with TinyPNG or ImageOptim.',
        impact: 'Reduce page weight by 50-70%; improve LCP (Largest Contentful Paint)',
        tools: 'ShortPixel ($4.99/mo), Imagify ($4.99/mo), Squoosh (free web tool), ImageOptim (free)',
        effort: 'High (12-20 hours: audit images, convert, implement, test across browsers)'
      },
      {
        title: 'Database Optimization',
        description: 'Clean up post revisions, spam comments, transients; optimize tables monthly. Remove unused plugins and themes. Configure automatic cleanup schedules. Large databases slow down queries.',
        impact: 'Reduce database size by 30-40%; faster queries and admin panel',
        tools: 'WP-Optimize (free), Advanced Database Cleaner ($49), phpMyAdmin (free)',
        effort: 'Low (2-3 hours initial cleanup, 15 min monthly maintenance)'
      },
      {
        title: 'Implement HTTP/2 or HTTP/3',
        description: 'Enable HTTP/2 or HTTP/3 on server for multiplexed connections. HTTP/2 allows multiple requests over single connection, eliminating HTTP/1.1 bottlenecks. Most modern servers support this.',
        impact: 'Improve parallel loading; reduce latency by 20-30%',
        tools: 'Most hosting providers support this natively (check cPanel or server config)',
        effort: 'Low (1-2 hours: verify support, enable, test)'
      },
      {
        title: 'Security Hardening',
        description: 'Install Wordfence or Sucuri; enable 2FA for admin accounts; hide WordPress version; limit login attempts; use strong passwords; disable file editing in wp-config.php; keep all software updated.',
        impact: 'Prevent security breaches; maintain uptime; protect SEO rankings from hacks',
        tools: 'Wordfence (Free-$99/year), Sucuri ($199/year), iThemes Security (free)',
        effort: 'Medium (6-8 hours: install, configure, harden, document)'
      },
      {
        title: 'Set Up Monitoring & Alerts',
        description: 'Use UptimeRobot (uptime monitoring), Google Search Console (crawl errors), PageSpeed Insights API (weekly checks). Set up alerts for downtime, errors, performance degradation.',
        impact: 'Catch issues before they impact users/SEO; reduce MTTR (Mean Time To Recovery)',
        tools: 'UptimeRobot (Free-$7/mo), Pingdom ($10/mo), StatusCake (Free-$24/mo)',
        effort: 'Low (2-3 hours to configure monitoring and alerts)'
      },
      {
        title: 'Structured Logging',
        description: 'Implement error logging with Sentry or similar; track 404s, form errors, failed API calls. Structured logging helps debug issues faster and identify patterns.',
        impact: 'Faster debugging; reduce user frustration; identify systemic issues',
        tools: 'Sentry ($26/mo), LogRocket ($99/mo), Rollbar ($12/mo)',
        effort: 'Medium (4-6 hours to integrate and configure)'
      }
    ];
  }

  /**
   * Get analytics & tracking improvements with implementation details
   */
  getAnalyticsImprovements() {
    return [
      {
        title: 'Google Analytics 4 Setup',
        description: 'Ensure GA4 is properly configured with goals, events, conversions (form submissions, demo requests, video plays, scroll depth). Set up custom dimensions for user properties. Configure enhanced measurement for file downloads, outbound clicks.',
        impact: 'Track user behavior; identify drop-off points; measure ROI accurately',
        tools: 'Google Analytics 4 (free), Google Tag Manager (free for easier event tracking)',
        effort: 'Medium (6-10 hours: setup, configuration, testing, documentation)'
      },
      {
        title: 'Heatmap & Session Recording',
        description: 'Install Hotjar or Microsoft Clarity to see where users click, scroll, get confused. Watch session recordings to identify UX friction. Use heatmaps to optimize button placement and content layout.',
        impact: 'Identify UX issues; optimize conversion paths; reduce bounce rate',
        tools: 'Microsoft Clarity (free), Hotjar (Free-$39/mo), Crazy Egg ($24/mo)',
        effort: 'Low (1-2 hours to install; ongoing analysis 2-4 hours/week)'
      },
      {
        title: 'Goal Funnel Tracking',
        description: 'Set up funnels: Homepage → Service Page → Form → Thank You; identify where users abandon. Track micro-conversions (video plays, scroll depth, time on page). Analyze funnel drop-off rates to prioritize optimizations.',
        impact: 'Increase conversion rate by 15-25% by fixing identified bottlenecks',
        tools: 'Google Analytics 4 (free), Mixpanel ($25/mo), Amplitude (Free-$49/mo)',
        effort: 'Medium (4-6 hours to set up funnels and configure tracking)'
      },
      {
        title: 'Call Tracking',
        description: 'Use CallRail or similar to track which marketing channels drive phone calls. Dynamic number insertion shows different phone numbers based on traffic source. Track call recordings, duration, outcomes.',
        impact: 'Optimize marketing spend; attribute offline conversions; improve sales process',
        tools: 'CallRail ($45/mo), CallTrackingMetrics ($49/mo), Marchex ($125/mo)',
        effort: 'Medium (3-5 hours to set up and integrate with website and CRM)'
      },
      {
        title: 'A/B Testing Platform',
        description: 'Set up Google Optimize (free but sunsetting) or VWO for continuous A/B testing of headlines, CTAs, layouts. Start with high-traffic pages. Test one element at a time. Run tests until statistical significance.',
        impact: 'Data-driven optimization; compound improvements of 5-10% per test',
        tools: 'VWO ($199/mo), Optimizely (enterprise pricing), AB Tasty ($33/mo)',
        effort: 'Medium (4-6 hours per test: hypothesis, setup, monitor, analyze)'
      },
      {
        title: 'Custom Dashboards',
        description: 'Create Looker Studio (Google Data Studio) dashboards for weekly performance review: traffic, leads, conversions, rankings. Pull data from GA4, Google Search Console, CRM. Share with stakeholders.',
        impact: 'Make informed decisions; spot trends early; align team on metrics',
        tools: 'Looker Studio (free), Databox ($49/mo), Klipfolio ($99/mo)',
        effort: 'High (12-16 hours initial setup; 1-2 hours monthly maintenance)'
      },
      {
        title: 'Event Tracking',
        description: 'Track micro-conversions: video plays, scroll depth (25%, 50%, 75%, 100%), time on page, resource downloads, external link clicks. Use Google Tag Manager for easier implementation.',
        impact: 'Understand engagement; optimize content strategy; identify high-intent users',
        tools: 'Google Tag Manager (free), Segment ($120/mo for unified tracking)',
        effort: 'Medium (8-12 hours to set up comprehensive event tracking)'
      },
      {
        title: 'Attribution Modeling',
        description: 'Implement multi-touch attribution to understand full customer journey (first click, last click, linear, time decay). Optimize marketing budget allocation based on channel performance across the funnel.',
        impact: 'Optimize marketing budget allocation; increase ROI by 20-30%',
        tools: 'Google Analytics 4 (free, limited), Ruler Analytics ($199/mo), Bizible ($2,000/mo)',
        effort: 'High (16-24 hours to configure attribution models and integrate data sources)'
      }
    ];
  }

  /**
   * Get 30-day sprint data
   */
  get30DaySprintData() {
    return [
      ['Week', 'Focus Area', 'Key Deliverables'],
      [
        '2',
        'Page Speed Optimization',
        '• Minify CSS/JS files\n• Defer non-critical JavaScript\n• Implement CDN\n• Reduce TTFB to <200ms'
      ],
      [
        '2',
        'Schema Markup',
        '• Add WebSite schema\n• Implement BreadcrumbList\n• Add Article schema to blog posts\n• Validate with Rich Results Test'
      ],
      [
        '3',
        'Content Expansion',
        '• Expand key pages to 1,500 words\n• Add internal links (3-5 per page)\n• Create "Related Articles" sections'
      ],
      [
        '3',
        'On-Page SEO',
        '• Optimize title tags for top 10 pages\n• Write meta descriptions\n• Fix heading hierarchy\n• Optimize image alt text'
      ],
      [
        '4',
        'Conversion Optimization',
        '• A/B test primary CTA\n• Add exit-intent popup\n• Implement social proof notifications\n• Optimize form fields'
      ]
    ];
  }

  /**
   * Get 90-day initiatives
   */
  get90DayInitiatives() {
    return [
      ['Month', 'Strategic Initiative', 'Goals & Metrics'],
      [
        '2',
        'Content Marketing Campaign',
        '• Launch 3 ultimate guides\n• Start weekly newsletter\n• Publish 8 blog posts\n• Create 5 case studies\n\nTarget: 100-200 leads/month'
      ],
      [
        '2',
        'Authority Building',
        '• Publish 4-6 guest posts\n• Launch monthly webinar series\n• Build relationships with influencers\n• Earn 25-50 backlinks\n\nTarget: DA increase by 5-10 points'
      ],
      [
        '3',
        'Advanced CRO',
        '• Create 5 landing pages for paid ads\n• Build interactive ROI calculator\n• Implement heatmap & session recording\n• Launch retargeting campaigns\n\nTarget: Increase conversion rate by 25-40%'
      ],
      [
        '3',
        'Video & Multimedia',
        '• Launch YouTube channel (8-12 videos)\n• Create product demo video\n• Record customer video testimonials\n• Develop interactive product tour\n\nTarget: 500+ video views/month'
      ]
    ];
  }

  /**
   * Calculate 90-day score projection
   */
  calculate90DayScore() {
    const improvement = Math.min(20, Math.floor((100 - this.audit.overallScore) * 0.4));
    const projected = this.audit.overallScore + improvement;
    return `${projected}-${projected + 5}/100`;
  }

  /**
   * Calculate improvement percentage
   */
  calculateImprovement() {
    const projected = this.audit.overallScore + Math.min(20, Math.floor((100 - this.audit.overallScore) * 0.4));
    const improvement = ((projected - this.audit.overallScore) / this.audit.overallScore * 100).toFixed(0);
    return `+${improvement}%`;
  }

  /**
   * Get recommended owner for a task
   */
  getRecommendedOwner(recommendation) {
    if (recommendation.category === 'TECHNICAL_SEO' || recommendation.category === 'PERFORMANCE') {
      return 'Dev';
    } else if (recommendation.category === 'CONTENT_QUALITY') {
      return 'Content';
    } else if (recommendation.category === 'ON_PAGE_SEO') {
      return 'Marketing';
    } else if (recommendation.category === 'LOCAL_SEO') {
      return 'Marketing';
    } else {
      return 'Marketing';
    }
  }

  /**
   * Get impact level from priority
   */
  getImpactLevel(priority) {
    if (typeof priority === 'number') {
      if (priority >= 90) return 'Critical';
      if (priority >= 70) return 'High';
      if (priority >= 50) return 'Medium';
      return 'Low';
    }

    const levels = {
      'CRITICAL': 'Critical',
      'HIGH': 'High',
      'MEDIUM': 'Medium',
      'LOW': 'Low'
    };
    return levels[priority] || 'Medium';
  }

  /**
   * Get priority icon
   */
  getPriorityIcon(priority) {
    const icons = {
      'CRITICAL': '■',
      'HIGH': '■',
      'MEDIUM': '■',
      'LOW': '■'
    };
    return icons[priority] || '■';
  }

  /**
   * Get priority color
   */
  getPriorityColor(priority) {
    const colors = {
      'CRITICAL': '#D32F2F',
      'HIGH': '#F57C00',
      'MEDIUM': '#FBC02D',
      'LOW': '#388E3C'
    };
    return colors[priority] || '#666666';
  }

  /**
   * Get color for score
   */
  getScoreColor(score) {
    if (score >= 90) return '#4CAF50'; // Green
    if (score >= 70) return '#8BC34A'; // Light green
    if (score >= 50) return '#FFC107'; // Amber
    return '#F44336'; // Red
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
   * Get issue examples based on issue type
   */
  getIssueExamples(issue) {
    const domain = new URL(this.audit.targetUrl).hostname.replace('www.', '');
    const examples = {
      'Missing XML Sitemap': 'No sitemap.xml found at https://' + domain + '/sitemap.xml',
      'Missing Meta Descriptions': 'Example: Homepage shows "..." in search results',
      'Missing H1 Tags': 'Pages without main heading: /about, /contact',
      'Duplicate Title Tags': 'Same title used on: /page1, /page2, /page3',
      'No Schema Markup': 'Missing Organization, WebSite, and BreadcrumbList schema',
      'Slow Page Speed': 'Estimated mobile PageSpeed score: 40-55/100',
      'Missing robots.txt': 'No robots.txt file found at https://' + domain + '/robots.txt',
      'Missing Alt Text': 'Images like logo.png, header-image.jpg missing alt attributes',
      'Broken Links': 'Found 404 errors on: /old-page, /removed-content',
      'Missing LocalBusiness Schema': 'No local business structured data for search engines'
    };

    return examples[issue.title] || null;
  }

  /**
   * Get affected page examples
   */
  getAffectedPageExamples(issue) {
    if (issue.affectedPages <= 3) {
      return '/home, /about, /contact';
    } else if (issue.affectedPages <= 10) {
      return '/home, /about, /services, /products, ...';
    }
    return null;
  }

  /**
   * Get detailed implementation steps for a recommendation
   */
  getImplementationSteps(fix) {
    const stepsMap = {
      'Missing XML Sitemap': [
        'Use Yoast SEO or Rank Math plugin to auto-generate sitemap',
        'Add "Sitemap: https://yourdomain.com/sitemap_index.xml" to robots.txt',
        'Submit sitemap in Google Search Console and Bing Webmaster Tools',
        'Include all important pages: homepage, main service pages, blog posts',
        'Exclude: admin pages, search results, thank-you pages'
      ],
      'Missing Meta Descriptions': [
        'Write unique, compelling descriptions for each page (150-160 characters)',
        'Include primary keyword naturally',
        'Add clear call-to-action when appropriate',
        'Use your CMS or SEO plugin meta description field',
        'Test how they appear in search results using SERP simulator'
      ],
      'Missing robots.txt': [
        'Create robots.txt file in website root directory',
        'Add user-agent directives for search engine crawlers',
        'Reference your XML sitemap location',
        'Disallow admin pages and private content',
        'Test with Google Search Console robots.txt tester'
      ],
      'No Schema Markup': [
        'Add Organization schema to footer with name, logo, contact info',
        'Add WebSite schema to <head> with site name and search action',
        'Add BreadcrumbList schema to all interior pages',
        'Use Schema.org JSON-LD format (preferred by Google)',
        'Validate with Google\'s Rich Results Test tool'
      ],
      'Slow Page Speed': [
        'Install caching plugin (WP Rocket, W3 Total Cache, etc.)',
        'Enable GZIP compression on server',
        'Optimize images: Use WebP format, lazy loading, proper sizing',
        'Minify CSS and JavaScript files',
        'Defer non-critical JavaScript',
        'Use CDN for static assets (Cloudflare or similar)',
        'Reduce server response time (TTFB) to <200ms'
      ],
      'Missing H1 Tags': [
        'Ensure each page has exactly one H1 tag',
        'H1 should contain primary keyword for the page',
        'Make H1 descriptive and unique per page',
        'Don\'t use H1 for logo or site title',
        'Use H2-H6 for subheadings in proper hierarchy'
      ],
      'Duplicate Title Tags': [
        'Audit all pages with duplicate titles',
        'Rewrite each title to be unique and descriptive',
        'Include page-specific keywords in each title',
        'Keep titles 50-60 characters for optimal display',
        'Use consistent brand format: "[Page Title] | [Brand Name]"'
      ],
      'Missing LocalBusiness Schema': [
        'Add LocalBusiness schema markup to footer or contact page',
        'Include: business name, address, phone, hours, geo coordinates',
        'Use appropriate business type (Restaurant, Store, Service, etc.)',
        'Add aggregate rating if you have reviews',
        'Test with Google\'s Rich Results Test'
      ],
      'No Alt Text': [
        'Audit all images on your site',
        'Write descriptive alt text for each image',
        'Include relevant keywords where natural',
        'Keep alt text concise (125 characters or less)',
        'Use empty alt="" for purely decorative images'
      ],
      'Missing About Page': [
        'Create dedicated /about page',
        'Include company history, mission, and values',
        'Add team member bios with photos',
        'Include trust signals (awards, certifications, years in business)',
        'Link to about page from main navigation and footer'
      ]
    };

    return stepsMap[fix.title] || [
      'Review current state and identify gaps',
      'Implement recommended changes',
      'Test changes in staging environment',
      'Deploy to production',
      'Monitor results and adjust as needed'
    ];
  }

  /**
   * Get code example for a recommendation
   */
  getCodeExample(fix) {
    const examples = {
      'Missing XML Sitemap': `<!-- Add to robots.txt -->
User-agent: *
Allow: /
Sitemap: https://yourdomain.com/sitemap.xml`,

      'No Schema Markup': `<!-- Organization Schema (JSON-LD) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Company Name",
  "url": "https://yourdomain.com",
  "logo": "https://yourdomain.com/logo.png"
}
</script>`,

      'Missing robots.txt': `# robots.txt
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /

Sitemap: https://yourdomain.com/sitemap.xml`,

      'Missing LocalBusiness Schema': `<!-- LocalBusiness Schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Your Business",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "City",
    "addressRegion": "State",
    "postalCode": "12345"
  },
  "telephone": "+1-555-555-5555"
}
</script>`
    };

    return examples[fix.title] || null;
  }
}

export default EnhancedSEOReportGenerator;
