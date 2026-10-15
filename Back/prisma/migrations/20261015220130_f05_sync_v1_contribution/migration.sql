-- CreateEnum
CREATE TYPE "SyncV1BaseUnit" AS ENUM ('ML', 'G');

-- CreateEnum
CREATE TYPE "SyncV1ContributionStatus" AS ENUM ('NEVER_PUBLISHED', 'ACTIVE', 'CANCELLED', 'CONTESTED');

-- CreateEnum
CREATE TYPE "SyncV1DisputeCloseReason" AS ENUM ('RESOLVED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "SyncV1OperationJournal" ADD COLUMN     "contributionId" UUID,
ADD COLUMN     "contributionSequence" INTEGER;

-- CreateTable
CREATE TABLE "SyncV1Contribution" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectionType" "SyncV1ProjectionType" NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "status" "SyncV1ContributionStatus" NOT NULL DEFAULT 'NEVER_PUBLISHED',
    "headOperationId" UUID,
    "quantityBase" BIGINT,
    "reconciliationReference" UUID,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "fencedThroughSequence" INTEGER NOT NULL DEFAULT 0,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncV1Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncV1Dispute" (
    "id" UUID NOT NULL,
    "contributionId" UUID NOT NULL,
    "openedByOperationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closeReason" "SyncV1DisputeCloseReason",
    "resolvedByOperationId" UUID,

    CONSTRAINT "SyncV1Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncV1Contribution_tenantId_projectionType_campaignId_produ_idx" ON "SyncV1Contribution"("tenantId", "projectionType", "campaignId", "productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SyncV1Contribution_tenantId_memberId_projectionType_campaig_key" ON "SyncV1Contribution"("tenantId", "memberId", "projectionType", "campaignId", "productId", "baseUnit");

-- CreateIndex
CREATE INDEX "SyncV1Dispute_contributionId_closedAt_idx" ON "SyncV1Dispute"("contributionId", "closedAt");

-- CreateIndex
CREATE INDEX "SyncV1OperationJournal_contributionId_contributionSequence_idx" ON "SyncV1OperationJournal"("contributionId", "contributionSequence");

-- AddForeignKey
ALTER TABLE "SyncV1OperationJournal" ADD CONSTRAINT "SyncV1OperationJournal_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "SyncV1Contribution"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SyncV1Contribution" ADD CONSTRAINT "SyncV1Contribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SyncV1Contribution" ADD CONSTRAINT "SyncV1Contribution_tenantId_memberId_fkey" FOREIGN KEY ("tenantId", "memberId") REFERENCES "Member"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SyncV1Contribution" ADD CONSTRAINT "SyncV1Contribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SyncV1Contribution" ADD CONSTRAINT "SyncV1Contribution_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SyncV1Dispute" ADD CONSTRAINT "SyncV1Dispute_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "SyncV1Contribution"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- F05-SYNC-05 invariants (contract §6). Prisma does not model CHECK constraints.
-- CANCELLED and CONTESTED never keep a quantity; CONTESTED always carries its
-- open dispute reference; ACTIVE never carries one.
ALTER TABLE "SyncV1Contribution" ADD CONSTRAINT "SyncV1Contribution_quantity_nonnegative"
  CHECK ("quantityBase" IS NULL OR "quantityBase" >= 0);
ALTER TABLE "SyncV1Contribution" ADD CONSTRAINT "SyncV1Contribution_state_shape" CHECK (
  ("status" = 'NEVER_PUBLISHED' AND "headOperationId" IS NULL AND "quantityBase" IS NULL AND "reconciliationReference" IS NULL)
  OR ("status" = 'ACTIVE' AND "headOperationId" IS NOT NULL AND "quantityBase" IS NOT NULL AND "reconciliationReference" IS NULL)
  OR ("status" = 'CANCELLED' AND "headOperationId" IS NOT NULL AND "quantityBase" IS NULL)
  OR ("status" = 'CONTESTED' AND "headOperationId" IS NOT NULL AND "quantityBase" IS NULL AND "reconciliationReference" IS NOT NULL)
);
ALTER TABLE "SyncV1Contribution" ADD CONSTRAINT "SyncV1Contribution_sequences"
  CHECK ("fencedThroughSequence" >= 0 AND "lastSequence" >= "fencedThroughSequence");
ALTER TABLE "SyncV1OperationJournal" ADD CONSTRAINT "SyncV1OperationJournal_contribution_sequence"
  CHECK ("contributionSequence" IS NULL OR ("contributionId" IS NOT NULL AND "contributionSequence" > 0));
