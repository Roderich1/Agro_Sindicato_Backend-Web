-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('UPLOADING', 'AVAILABLE', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "BackupMetadata" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'UPLOADING',
    "storageKey" UUID NOT NULL,
    "contentType" VARCHAR(64) NOT NULL,
    "formatVersion" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "sizeBytes" BIGINT,
    "failureCode" VARCHAR(48),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BackupMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackupMetadata_storageKey_key" ON "BackupMetadata"("storageKey");

-- CreateIndex
CREATE INDEX "BackupMetadata_tenantId_memberId_status_createdAt_idx" ON "BackupMetadata"("tenantId", "memberId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "BackupMetadata" ADD CONSTRAINT "BackupMetadata_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BackupMetadata" ADD CONSTRAINT "BackupMetadata_tenantId_memberId_fkey" FOREIGN KEY ("tenantId", "memberId") REFERENCES "Member"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

