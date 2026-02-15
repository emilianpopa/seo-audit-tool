-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeoCategory" AS ENUM ('TECHNICAL_SEO', 'ON_PAGE_SEO', 'CONTENT_QUALITY', 'AUTHORITY_BACKLINKS', 'LOCAL_SEO', 'PERFORMANCE');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EffortLevel" AS ENUM ('QUICK_WIN', 'MODERATE', 'SUBSTANTIAL', 'MAJOR_PROJECT');

-- CreateTable
CREATE TABLE "SeoAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "targetUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "overallScore" INTEGER,
    "scoreRating" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "SeoAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoAuditResult" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "category" "SeoCategory" NOT NULL,
    "categoryScore" INTEGER NOT NULL,
    "weight" DECIMAL(3,2) NOT NULL,
    "rating" TEXT,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "highCount" INTEGER NOT NULL DEFAULT 0,
    "mediumCount" INTEGER NOT NULL DEFAULT 0,
    "lowCount" INTEGER NOT NULL DEFAULT 0,
    "rawData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoAuditResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoAuditPage" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "titleLength" INTEGER,
    "metaDescription" TEXT,
    "metaLength" INTEGER,
    "h1Tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "h2Tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "h3Tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "canonical" TEXT,
    "loadTime" INTEGER,
    "size" INTEGER,
    "wordCount" INTEGER,
    "imageCount" INTEGER,
    "linkCount" INTEGER,
    "hasSchema" BOOLEAN NOT NULL DEFAULT false,
    "schemaTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openGraphTags" JSONB,
    "twitterTags" JSONB,
    "robotsMeta" TEXT,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "htmlSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoAuditPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoAuditRecommendation" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "category" "SeoCategory" NOT NULL,
    "priority" "IssuePriority" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "implementation" TEXT NOT NULL,
    "expectedImpact" TEXT NOT NULL,
    "affectedPages" INTEGER NOT NULL DEFAULT 0,
    "effortLevel" "EffortLevel" NOT NULL,
    "estimatedHours" INTEGER,
    "phase" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoAuditRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "apiKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoAudit_userId_status_idx" ON "SeoAudit"("userId", "status");

-- CreateIndex
CREATE INDEX "SeoAudit_createdAt_idx" ON "SeoAudit"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "SeoAudit_domain_idx" ON "SeoAudit"("domain");

-- CreateIndex
CREATE INDEX "SeoAuditResult_auditId_idx" ON "SeoAuditResult"("auditId");

-- CreateIndex
CREATE INDEX "SeoAuditResult_category_idx" ON "SeoAuditResult"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SeoAuditResult_auditId_category_key" ON "SeoAuditResult"("auditId", "category");

-- CreateIndex
CREATE INDEX "SeoAuditPage_auditId_idx" ON "SeoAuditPage"("auditId");

-- CreateIndex
CREATE INDEX "SeoAuditPage_url_idx" ON "SeoAuditPage"("url");

-- CreateIndex
CREATE INDEX "SeoAuditPage_statusCode_idx" ON "SeoAuditPage"("statusCode");

-- CreateIndex
CREATE INDEX "SeoAuditRecommendation_auditId_priority_idx" ON "SeoAuditRecommendation"("auditId", "priority");

-- CreateIndex
CREATE INDEX "SeoAuditRecommendation_priority_idx" ON "SeoAuditRecommendation"("priority");

-- CreateIndex
CREATE INDEX "SeoAuditRecommendation_effortLevel_idx" ON "SeoAuditRecommendation"("effortLevel");

-- CreateIndex
CREATE INDEX "SeoAuditRecommendation_completed_idx" ON "SeoAuditRecommendation"("completed");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_apiKey_idx" ON "User"("apiKey");

-- AddForeignKey
ALTER TABLE "SeoAuditResult" ADD CONSTRAINT "SeoAuditResult_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "SeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoAuditPage" ADD CONSTRAINT "SeoAuditPage_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "SeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoAuditRecommendation" ADD CONSTRAINT "SeoAuditRecommendation_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "SeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
