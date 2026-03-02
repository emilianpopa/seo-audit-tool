-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "AutoFixStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'PUBLISHED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "AutoFix" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "documentType" TEXT NOT NULL,
    "documentId" TEXT,
    "fieldPath" TEXT NOT NULL,
    "currentValue" TEXT,
    "proposedValue" TEXT NOT NULL,
    "status" "AutoFixStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoFix_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (idempotent)
ALTER TABLE "AutoFix" DROP CONSTRAINT IF EXISTS "AutoFix_auditId_fkey";
ALTER TABLE "AutoFix" ADD CONSTRAINT "AutoFix_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "SeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
