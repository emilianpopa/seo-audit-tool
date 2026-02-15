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
    logger.info({ auditId: id, format }, 'Generating report');

    const generator = new SEOReportGenerator(id);
    let filepath;

    if (format.toLowerCase() === 'pdf') {
      filepath = await generator.generatePDF();
    } else {
      filepath = await generator.generateDOCX();
    }

    // Return file info
    const filename = path.basename(filepath);
    const fileStats = fs.statSync(filepath);

    res.json(successResponse({
      auditId: id,
      format: format.toLowerCase(),
      filename,
      fileSize: fileStats.size,
      downloadUrl: `/api/report/${id}/download?format=${format.toLowerCase()}`,
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
        domain: true
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

    // Build file path
    const extension = format.toLowerCase();
    const filename = `seo-audit-${id}.${extension}`;
    const filepath = path.join(process.cwd(), 'reports', filename);

    // Check if file exists, if not generate it
    if (!fs.existsSync(filepath)) {
      logger.info({ auditId: id, format }, 'Report not found, generating...');

      const generator = new SEOReportGenerator(id);

      if (format.toLowerCase() === 'pdf') {
        await generator.generatePDF();
      } else {
        await generator.generateDOCX();
      }
    }

    // Set appropriate headers
    const mimeType = format.toLowerCase() === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const downloadFilename = `seo-audit-${audit.domain.replace(/\./g, '-')}-${new Date().toISOString().split('T')[0]}.${extension}`;

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

    logger.info({ auditId: id, format, filename: downloadFilename }, 'Report downloaded');

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
