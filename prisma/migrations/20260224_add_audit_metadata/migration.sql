-- Add metadata JSON column to SeoAudit for storing CMS detection results
ALTER TABLE "SeoAudit" ADD COLUMN "metadata" JSONB;
