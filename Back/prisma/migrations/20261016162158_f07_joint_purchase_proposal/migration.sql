-- CreateEnum
CREATE TYPE "JointPurchaseProposalStatus" AS ENUM ('DRAFT');

-- CreateEnum
CREATE TYPE "JointPurchaseProposalLineStatus" AS ENUM ('DISCLOSED', 'SUPPRESSED_UNDER_THRESHOLD', 'SUPPRESSED_REVISION', 'OVERFLOW');

-- CreateTable
CREATE TABLE "JointPurchaseProposal" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "JointPurchaseProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "inputsFingerprint" CHAR(64) NOT NULL,
    "linkedMembers" INTEGER NOT NULL,
    "membersWithContribution" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByUserId" TEXT NOT NULL,

    CONSTRAINT "JointPurchaseProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JointPurchaseProposalLine" (
    "proposalId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "status" "JointPurchaseProposalLineStatus" NOT NULL,
    "releaseId" UUID,
    "pendingChanges" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JointPurchaseProposalLine_pkey" PRIMARY KEY ("proposalId","position")
);

-- CreateIndex
CREATE INDEX "JointPurchaseProposal_tenantId_campaignId_generatedAt_idx" ON "JointPurchaseProposal"("tenantId", "campaignId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JointPurchaseProposalLine_proposalId_canonicalProductId_bas_key" ON "JointPurchaseProposalLine"("proposalId", "canonicalProductId", "baseUnit");

-- AddForeignKey
ALTER TABLE "JointPurchaseProposal" ADD CONSTRAINT "JointPurchaseProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposal" ADD CONSTRAINT "JointPurchaseProposal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposal" ADD CONSTRAINT "JointPurchaseProposal_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalLine" ADD CONSTRAINT "JointPurchaseProposalLine_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "JointPurchaseProposal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalLine" ADD CONSTRAINT "JointPurchaseProposalLine_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalLine" ADD CONSTRAINT "JointPurchaseProposalLine_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "CollectiveRelease"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- A line carries a release exactly when its figure was disclosed: no other
-- line can point to a figure (F07-POL-01, same policy as the summary).
ALTER TABLE "JointPurchaseProposalLine" ADD CONSTRAINT "JointPurchaseProposalLine_release_iff_disclosed"
    CHECK (("status" = 'DISCLOSED') = ("releaseId" IS NOT NULL));
