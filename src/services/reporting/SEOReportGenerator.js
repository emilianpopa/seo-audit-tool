import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import fs from 'fs';
import path from 'path';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';

/**
 * SEO Report Generator
 *
 * Generates professional PDF and DOCX reports for SEO audits
 */
class SEOReportGenerator {
  constructor(auditId) {
    this.auditId = auditId;
    this.audit = null;
    this.reportDir = path.join(process.cwd(), 'reports');

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Load audit data from database
   */
  async loadAuditData() {
    logger.info({ auditId: this.auditId }, 'Loading audit data for report');

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

    logger.info({ auditId: this.auditId }, 'Audit data loaded');
    return this.audit;
  }

  /**
   * Generate PDF report
   * @returns {Promise<string>} Path to generated PDF file
   */
  async generatePDF() {
    logger.info({ auditId: this.auditId }, 'Generating PDF report');

    if (!this.audit) {
      await this.loadAuditData();
    }

    const filename = `seo-audit-${this.auditId}.pdf`;
    const filepath = path.join(this.reportDir, filename);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const stream = fs.createWriteStream(filepath);

        doc.pipe(stream);

        // Build PDF content
        this.buildPDFCoverPage(doc);
        this.buildPDFExecutiveSummary(doc);
        this.buildPDFScoreBreakdown(doc);
        this.buildPDFIssuesList(doc);
        this.buildPDFRecommendations(doc);
        this.buildPDFRoadmap(doc);

        doc.end();

        stream.on('finish', () => {
          logger.info({ auditId: this.auditId, filepath }, 'PDF report generated');
          resolve(filepath);
        });

        stream.on('error', reject);
      } catch (err) {
        logger.error({ err, auditId: this.auditId }, 'PDF generation failed');
        reject(err);
      }
    });
  }

  /**
   * Build PDF cover page
   */
  buildPDFCoverPage(doc) {
    doc.fontSize(28).text('SEO Audit Report', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(18).text(this.audit.targetUrl, { align: 'center', link: this.audit.targetUrl });
    doc.moveDown(0.5);

    doc.fontSize(12).fillColor('#666666').text(
      `Generated on ${new Date(this.audit.completedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`,
      { align: 'center' }
    );

    doc.moveDown(2);

    // Overall score circle
    const centerX = doc.page.width / 2;
    const centerY = doc.y + 100;
    const radius = 80;

    // Circle background
    doc.circle(centerX, centerY, radius).fillColor(this.getScoreColor(this.audit.overallScore)).fill();

    // Score text
    doc.fillColor('#FFFFFF').fontSize(48).text(
      this.audit.overallScore.toString(),
      0,
      centerY - 25,
      { width: doc.page.width, align: 'center' }
    );

    doc.fontSize(14).text(
      'Overall SEO Score',
      0,
      centerY + 15,
      { width: doc.page.width, align: 'center' }
    );

    doc.moveDown(8);

    // Rating
    doc.fillColor('#000000').fontSize(16).text(
      `Rating: ${this.formatRating(this.audit.scoreRating)}`,
      { align: 'center' }
    );

    doc.addPage();
  }

  /**
   * Build executive summary section
   */
  buildPDFExecutiveSummary(doc) {
    this.addPDFSectionHeader(doc, 'Executive Summary');

    doc.fontSize(11).fillColor('#333333');

    const totalIssues = this.audit.recommendations.length;
    const criticalIssues = this.audit.recommendations.filter(r => r.priority === 'CRITICAL').length;
    const highIssues = this.audit.recommendations.filter(r => r.priority === 'HIGH').length;

    doc.text(`This SEO audit analyzed ${this.audit.pages.length} pages of ${this.audit.domain} and identified ${totalIssues} optimization opportunities.`, {
      align: 'justify'
    });

    doc.moveDown(1);

    doc.text('Key Findings:', { underline: true });
    doc.moveDown(0.5);

    doc.list([
      `Overall SEO Score: ${this.audit.overallScore}/100 (${this.formatRating(this.audit.scoreRating)})`,
      `${criticalIssues} critical issues requiring immediate attention`,
      `${highIssues} high-priority issues affecting SEO performance`,
      `${this.audit.pages.length} pages crawled and analyzed`,
      `Analysis across 6 core SEO categories`
    ], {
      bulletRadius: 2,
      indent: 20
    });

    doc.moveDown(1);

    doc.text(
      'This report provides a comprehensive analysis of your website\'s SEO health with actionable recommendations prioritized by impact and effort.',
      { align: 'justify' }
    );

    doc.addPage();
  }

  /**
   * Build score breakdown section
   */
  buildPDFScoreBreakdown(doc) {
    this.addPDFSectionHeader(doc, 'Score Breakdown by Category');

    doc.moveDown(0.5);

    // Sort results by weight (descending)
    const sortedResults = [...this.audit.results].sort((a, b) =>
      parseFloat(b.weight) - parseFloat(a.weight)
    );

    for (const result of sortedResults) {
      const categoryName = this.formatCategoryName(result.category);
      const weight = parseFloat(result.weight) * 100;

      // Category name
      doc.fontSize(12).fillColor('#000000').text(
        `${categoryName} (${weight}% weight)`,
        { continued: true }
      );

      // Score aligned right
      doc.text(
        `${result.categoryScore}/100`,
        { align: 'right' }
      );

      // Progress bar
      const barY = doc.y + 5;
      const barWidth = 400;
      const barHeight = 20;
      const barX = 100;

      // Background
      doc.rect(barX, barY, barWidth, barHeight).fillColor('#E0E0E0').fill();

      // Filled portion
      const fillWidth = (result.categoryScore / 100) * barWidth;
      doc.rect(barX, barY, fillWidth, barHeight)
        .fillColor(this.getScoreColor(result.categoryScore))
        .fill();

      // Rating text
      doc.fontSize(9).fillColor('#333333').text(
        this.formatRating(result.rating),
        barX + 5,
        barY + 5
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
    }

    doc.addPage();
  }

  /**
   * Build issues list section
   */
  buildPDFIssuesList(doc) {
    this.addPDFSectionHeader(doc, 'Issues Found');

    // Group by severity
    const critical = this.audit.recommendations.filter(r => r.priority === 'CRITICAL');
    const high = this.audit.recommendations.filter(r => r.priority === 'HIGH');
    const medium = this.audit.recommendations.filter(r => r.priority === 'MEDIUM');
    const low = this.audit.recommendations.filter(r => r.priority === 'LOW');

    if (critical.length > 0) {
      this.addPDFIssueGroup(doc, 'Critical Issues', critical, '#D32F2F');
    }

    if (high.length > 0) {
      this.addPDFIssueGroup(doc, 'High Priority Issues', high, '#F57C00');
    }

    if (medium.length > 0) {
      this.addPDFIssueGroup(doc, 'Medium Priority Issues', medium, '#FBC02D');
    }

    if (low.length > 0) {
      this.addPDFIssueGroup(doc, 'Low Priority Issues', low, '#388E3C');
    }
  }

  /**
   * Add issue group to PDF
   */
  addPDFIssueGroup(doc, title, issues, color) {
    doc.fontSize(14).fillColor(color).text(title, { underline: true });
    doc.moveDown(0.5);

    for (const issue of issues.slice(0, 10)) { // Limit to top 10 per group
      doc.fontSize(11).fillColor('#000000').text(`• ${issue.title}`, { indent: 20 });
      doc.fontSize(9).fillColor('#666666').text(issue.description, { indent: 30 });

      if (issue.affectedPages > 0) {
        doc.text(`Affected pages: ${issue.affectedPages}`, { indent: 30 });
      }

      doc.moveDown(0.5);

      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
      }
    }

    doc.moveDown(1);
  }

  /**
   * Build recommendations section
   */
  buildPDFRecommendations(doc) {
    if (doc.y > 600) {
      doc.addPage();
    }

    this.addPDFSectionHeader(doc, 'Top Recommendations');

    // Get quick wins
    const quickWins = this.audit.recommendations.filter(r => r.effortLevel === 'QUICK_WIN').slice(0, 5);

    if (quickWins.length > 0) {
      doc.fontSize(12).fillColor('#000000').text('Quick Wins (< 2 hours each)', { underline: true });
      doc.moveDown(0.5);

      for (let i = 0; i < quickWins.length; i++) {
        const rec = quickWins[i];

        doc.fontSize(10).fillColor('#000000').text(`${i + 1}. ${rec.title}`, { indent: 20 });
        doc.fontSize(9).fillColor('#666666').text(rec.implementation, { indent: 30 });
        doc.text(`Impact: ${rec.expectedImpact}`, { indent: 30 });
        doc.moveDown(0.5);

        if (doc.y > 700) {
          doc.addPage();
        }
      }
    }

    doc.addPage();
  }

  /**
   * Build roadmap section
   */
  buildPDFRoadmap(doc) {
    this.addPDFSectionHeader(doc, 'Implementation Roadmap');

    const roadmap = {
      'Quick Wins': this.audit.recommendations.filter(r => r.phase === 'quick-wins'),
      'Short-term (Week 1-2)': this.audit.recommendations.filter(r => r.phase === 'short-term'),
      'Medium-term (Month 1-3)': this.audit.recommendations.filter(r => r.phase === 'medium-term'),
      'Long-term (Month 3-6)': this.audit.recommendations.filter(r => r.phase === 'long-term')
    };

    for (const [phase, recommendations] of Object.entries(roadmap)) {
      if (recommendations.length === 0) continue;

      doc.fontSize(12).fillColor('#000000').text(phase, { underline: true });
      doc.moveDown(0.5);

      const totalHours = recommendations.reduce((sum, r) => sum + (r.estimatedHours || 0), 0);

      doc.fontSize(9).fillColor('#666666').text(
        `${recommendations.length} tasks • Estimated time: ${totalHours} hours`,
        { indent: 20 }
      );
      doc.moveDown(0.5);

      for (const rec of recommendations.slice(0, 5)) {
        doc.fontSize(9).fillColor('#333333').text(
          `• ${rec.title} (${rec.estimatedHours}h)`,
          { indent: 30 }
        );
      }

      doc.moveDown(1);

      if (doc.y > 700) {
        doc.addPage();
      }
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999999').text(
      `Generated by SEO Audit Tool • ${new Date().toISOString().split('T')[0]}`,
      { align: 'center' }
    );
  }

  /**
   * Add section header
   */
  addPDFSectionHeader(doc, title) {
    doc.fontSize(18).fillColor('#000000').text(title);
    doc.moveDown(0.5);

    // Underline
    doc.moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .strokeColor('#CCCCCC')
       .stroke();

    doc.moveDown(1);
  }

  /**
   * Generate DOCX report
   * @returns {Promise<string>} Path to generated DOCX file
   */
  async generateDOCX() {
    logger.info({ auditId: this.auditId }, 'Generating DOCX report');

    if (!this.audit) {
      await this.loadAuditData();
    }

    const filename = `seo-audit-${this.auditId}.docx`;
    const filepath = path.join(this.reportDir, filename);

    const sections = [];

    // Cover page
    sections.push(
      new Paragraph({
        text: 'SEO Audit Report',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER
      }),
      new Paragraph({
        text: this.audit.targetUrl,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 }
      }),
      new Paragraph({
        text: `Overall Score: ${this.audit.overallScore}/100`,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: `Rating: ${this.formatRating(this.audit.scoreRating)}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      })
    );

    // Executive Summary
    sections.push(
      new Paragraph({
        text: 'Executive Summary',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: `This SEO audit analyzed ${this.audit.pages.length} pages and identified ${this.audit.recommendations.length} optimization opportunities.`,
        spacing: { after: 200 }
      })
    );

    // Score Breakdown
    sections.push(
      new Paragraph({
        text: 'Score Breakdown',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      })
    );

    for (const result of this.audit.results) {
      sections.push(
        new Paragraph({
          text: `${this.formatCategoryName(result.category)}: ${result.categoryScore}/100`,
          spacing: { after: 100 }
        })
      );
    }

    // Recommendations
    sections.push(
      new Paragraph({
        text: 'Top Recommendations',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      })
    );

    for (const rec of this.audit.recommendations.slice(0, 10)) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: rec.title, bold: true }),
            new TextRun({ text: `: ${rec.description}`, break: 1 }),
            new TextRun({ text: `Implementation: ${rec.implementation}`, break: 1 })
          ],
          spacing: { after: 200 }
        })
      );
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: sections
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filepath, buffer);

    logger.info({ auditId: this.auditId, filepath }, 'DOCX report generated');
    return filepath;
  }

  /**
   * Helper: Get color for score
   */
  getScoreColor(score) {
    if (score >= 90) return '#4CAF50'; // Green
    if (score >= 70) return '#8BC34A'; // Light green
    if (score >= 50) return '#FFC107'; // Amber
    return '#F44336'; // Red
  }

  /**
   * Helper: Format category name
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
   * Helper: Format rating
   */
  formatRating(rating) {
    if (!rating) return 'N/A';
    return rating.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
}

export default SEOReportGenerator;
