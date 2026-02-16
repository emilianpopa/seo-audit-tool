import express from 'express';
import path from 'path';
import fs from 'fs';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  HTTP_STATUS
} from '../../utils/responseFormatter.js';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';
import SEOReportGenerator from '../../services/reporting/SEOReportGenerator.js';
import EnhancedSEOReportGenerator from '../../services/reporting/EnhancedSEOReportGenerator.js';
import { reportDownloadLimiter } from '../../middleware/rateLimiter.js';

const router = express.Router();

/**
 * GET /api/report/:id/generate
 * Generate report (PDF or DOCX)
 */
router.get('/:id/generate', reportDownloadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const format = req.query.format || 'pdf'; // pdf or docx
    const enhanced = req.query.enhanced === 'true'; // Use enhanced generator

    // Validate format
    if (!['pdf', 'docx'].includes(format.toLowerCase())) {
      return res.status(HTTP_STATUS.VALIDATION_ERROR).json(
        errorResponse('Invalid format. Use "pdf" or "docx"', 'INVALID_FORMAT')
      );
    }

    // Check if audit exists and is completed
    const audit = await prisma.seoAudit.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        targetUrl: true
      }
    });

    if (!audit) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        notFoundResponse('Audit', id)
      );
    }

    if (audit.status !== 'COMPLETED') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        errorResponse('Audit is not completed yet. Cannot generate report.', 'AUDIT_NOT_COMPLETED')
      );
    }

    // Generate report
    logger.info({ auditId: id, format, enhanced }, 'Generating report');

    // Use enhanced generator by default, fallback to basic if specified
    const generator = enhanced || format.toLowerCase() === 'pdf'
      ? new EnhancedSEOReportGenerator(id)
      : new SEOReportGenerator(id);
    let filepath;

    if (format.toLowerCase() === 'pdf') {
      filepath = await generator.generatePDF();
    } else {
      // DOCX only available in basic generator
      if (enhanced) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          errorResponse('Enhanced reports are only available in PDF format', 'INVALID_FORMAT_COMBINATION')
        );
      }
      filepath = await generator.generateDOCX();
    }

    // Return file info
    const filename = path.basename(filepath);
    const fileStats = fs.statSync(filepath);

    res.json(successResponse({
      auditId: id,
      format: format.toLowerCase(),
      enhanced: enhanced || format.toLowerCase() === 'pdf',
      filename,
      fileSize: fileStats.size,
      downloadUrl: `/api/report/${id}/download?format=${format.toLowerCase()}&enhanced=${enhanced || format.toLowerCase() === 'pdf'}`,
      generatedAt: new Date().toISOString()
    }, 'Report generated successfully'));

  } catch (error) {
    logger.error({ err: error, auditId: req.params.id }, 'Failed to generate report');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Failed to generate report', 'REPORT_GENERATION_ERROR')
    );
  }
});

/**
 * GET /api/report/:id/download
 * Download generated report
 */
router.get('/:id/download', reportDownloadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const format = req.query.format || 'pdf';
    const enhanced = req.query.enhanced === 'true' || format.toLowerCase() === 'pdf';

    // Validate format
    if (!['pdf', 'docx'].includes(format.toLowerCase())) {
      return res.status(HTTP_STATUS.VALIDATION_ERROR).json(
        errorResponse('Invalid format. Use "pdf" or "docx"', 'INVALID_FORMAT')
      );
    }

    // Check if audit exists
    const audit = await prisma.seoAudit.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        domain: true,
        targetUrl: true
      }
    });

    if (!audit) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        notFoundResponse('Audit', id)
      );
    }

    if (audit.status !== 'COMPLETED') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        errorResponse('Audit is not completed yet', 'AUDIT_NOT_COMPLETED')
      );
    }

    // Build file path - enhanced generator uses different naming
    const extension = format.toLowerCase();
    const domain = new URL(audit.targetUrl).hostname.replace('www.', '');
    let filename, filepath;

    // Ensure reports directory exists
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    if (enhanced && format.toLowerCase() === 'pdf') {
      // Enhanced PDF uses date-based naming
      // Try to find existing file with same domain and today's date
      const todayDateStr = new Date().toISOString().split('T')[0];
      const expectedFilename = `seo-audit-${domain}-${todayDateStr}.pdf`;
      const expectedPath = path.join(reportsDir, expectedFilename);

      if (fs.existsSync(expectedPath)) {
        filename = expectedFilename;
        filepath = expectedPath;
      } else {
        // Check if any file for this domain exists today
        const files = fs.readdirSync(reportsDir);
        const matchingFile = files.find(f => f.startsWith(`seo-audit-${domain}`) && f.endsWith('.pdf'));

        if (matchingFile) {
          filename = matchingFile;
          filepath = path.join(reportsDir, filename);
        } else {
          filename = expectedFilename;
          filepath = expectedPath;
        }
      }
    } else {
      filename = `seo-audit-${id}.${extension}`;
      filepath = path.join(reportsDir, filename);
    }

    // Check if file exists, if not generate it
    if (!fs.existsSync(filepath)) {
      logger.info({ auditId: id, format, enhanced }, 'Report not found, generating...');

      const generator = enhanced
        ? new EnhancedSEOReportGenerator(id)
        : new SEOReportGenerator(id);

      if (format.toLowerCase() === 'pdf') {
        filepath = await generator.generatePDF();
        filename = path.basename(filepath);
      } else {
        if (enhanced) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json(
            errorResponse('Enhanced reports are only available in PDF format', 'INVALID_FORMAT_COMBINATION')
          );
        }
        await generator.generateDOCX();
      }
    }

    // Set appropriate headers
    const mimeType = format.toLowerCase() === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const downloadFilename = enhanced
      ? filename
      : `seo-audit-${audit.domain.replace(/\./g, '-')}-${new Date().toISOString().split('T')[0]}.${extension}`;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);

    // Stream file
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      logger.error({ err, auditId: id }, 'Error streaming file');
      if (!res.headersSent) {
        res.status(HTTP_STATUS.INTERNAL_ERROR).json(
          errorResponse('Failed to download report', 'FILE_STREAM_ERROR')
        );
      }
    });

    logger.info({ auditId: id, format, enhanced, filename: downloadFilename }, 'Report downloaded');

  } catch (error) {
    logger.error({ err: error, auditId: req.params.id }, 'Failed to download report');

    if (!res.headersSent) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json(
        errorResponse('Failed to download report', 'REPORT_DOWNLOAD_ERROR')
      );
    }
  }
});

/**
 * DELETE /api/report/:id
 * Delete generated report files
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const reportDir = path.join(process.cwd(), 'reports');
    const pdfPath = path.join(reportDir, `seo-audit-${id}.pdf`);
    const docxPath = path.join(reportDir, `seo-audit-${id}.docx`);

    let deletedFiles = [];

    // Delete PDF if exists
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
      deletedFiles.push('pdf');
    }

    // Delete DOCX if exists
    if (fs.existsSync(docxPath)) {
      fs.unlinkSync(docxPath);
      deletedFiles.push('docx');
    }

    if (deletedFiles.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        notFoundResponse('Report files', id)
      );
    }

    logger.info({ auditId: id, deletedFiles }, 'Report files deleted');

    res.json(successResponse({
      auditId: id,
      deletedFiles
    }, 'Report files deleted successfully'));

  } catch (error) {
    logger.error({ err: error, auditId: req.params.id }, 'Failed to delete report files');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(
      errorResponse('Failed to delete report files', 'REPORT_DELETE_ERROR')
    );
  }
});

export default router;
