-- CreateEnum
CREATE TYPE "SyncV1ProjectionType" AS ENUM ('CONSUMPTION_TOTAL', 'DECLARED_NEED');

-- CreateEnum
CREATE TYPE "SyncV1Action" AS ENUM ('PUBLISH', 'SUPERSEDE', 'CANCEL');

-- CreateEnum
CREATE TYPE "SyncV1ProcessingState" AS ENUM ('PROCESSING', 'FINAL');

-- CreateEnum
CREATE TYPE "SyncV1Outcome" AS ENUM ('APPLIED', 'CONFLICT', 'REJECTED');

-- CreateEnum
CREATE TYPE "SyncV1Disposition" AS ENUM ('RETIRE_FROM_OUTBOX', 'KEEP_FOR_RECONCILIATION', 'MOVE_TO_TERMINAL_FAILURE');

-- CreateTable
CREATE TABLE "SyncV1OperationJournal" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "contractVersion" INTEGER NOT NULL DEFAULT 1,
    "projectionType" "SyncV1ProjectionType" NOT NULL,
    "action" "SyncV1Action" NOT NULL,
    "predecessorOperationId" UUID,
    "causalReconciliationReference" UUID,
    "reconciliationReference" UUID,
    "fingerprint" BYTEA NOT NULL,
    "fingerprintKeyVersion" INTEGER NOT NULL,
    "processingState" "SyncV1ProcessingState" NOT NULL DEFAULT 'PROCESSING',
    "outcome" "SyncV1Outcome",
    "disposition" "SyncV1Disposition",
    "resultCode" VARCHAR(40),
    "serverAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncV1OperationJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncV1OperationJournal_tenantId_memberId_processingState_idx" ON "SyncV1OperationJournal"("tenantId", "memberId", "processingState");

-- CreateIndex
CREATE UNIQUE INDEX "SyncV1OperationJournal_tenantId_memberId_operationId_key" ON "SyncV1OperationJournal"("tenantId", "memberId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_tenantId_id_key" ON "Member"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "SyncV1OperationJournal" ADD CONSTRAINT "SyncV1OperationJournal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SyncV1OperationJournal" ADD CONSTRAINT "SyncV1OperationJournal_tenantId_memberId_fkey" FOREIGN KEY ("tenantId", "memberId") REFERENCES "Member"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Metadata invariants only; no payload or projection state.
ALTER TABLE "SyncV1OperationJournal"
  ADD CONSTRAINT "SyncV1Journal_contract_v1_check" CHECK ("contractVersion" = 1),
  ADD CONSTRAINT "SyncV1Journal_fingerprint_check" CHECK (octet_length("fingerprint") = 32),
  ADD CONSTRAINT "SyncV1Journal_key_version_check" CHECK ("fingerprintKeyVersion" > 0),
  ADD CONSTRAINT "SyncV1Journal_result_check" CHECK ((
    ("processingState" = 'PROCESSING' AND "outcome" IS NULL AND "disposition" IS NULL
      AND "resultCode" IS NULL AND "serverAcceptedAt" IS NULL AND "reconciliationReference" IS NULL)
    OR
    ("processingState" = 'FINAL' AND (
      ("outcome" = 'APPLIED' AND "disposition" = 'RETIRE_FROM_OUTBOX' AND "resultCode" = 'OK'
        AND "serverAcceptedAt" IS NOT NULL AND "reconciliationReference" IS NULL)
      OR
      ("outcome" = 'CONFLICT' AND "disposition" = 'KEEP_FOR_RECONCILIATION'
        AND "resultCode" IN ('CAUSAL_FORK', 'STALE_PREDECESSOR', 'CANCELLED_PREDECESSOR', 'RECONCILIATION_STALE')
        AND "serverAcceptedAt" IS NULL AND "reconciliationReference" IS NOT NULL)
      OR
      ("outcome" = 'REJECTED' AND "disposition" = 'MOVE_TO_TERMINAL_FAILURE'
        AND "resultCode" IN ('IDEMPOTENCY_MISMATCH', 'CAMPAIGN_NOT_OPEN', 'REFERENCE_UNAVAILABLE', 'UNIT_INCOMPATIBLE',
          'QUANTITY_INVALID', 'INVALID_PREDECESSOR', 'INVALID_TRANSITION', 'OWNERSHIP_NOT_PROVEN',
          'PURPOSE_NOT_AUTHORIZED', 'CAUSAL_FENCED')
        AND "serverAcceptedAt" IS NULL AND "reconciliationReference" IS NULL)
    ))
  ) IS TRUE);
