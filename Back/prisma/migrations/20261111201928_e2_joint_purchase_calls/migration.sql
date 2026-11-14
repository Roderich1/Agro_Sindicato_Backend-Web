-- CreateEnum
CREATE TYPE "JointPurchaseCallStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JointPurchaseCallEventKind" AS ENUM ('CREATED', 'UPDATED', 'OPENED', 'CLOSED', 'CANCELLED', 'RESPONSIBLE_ASSIGNED');

-- CreateEnum
CREATE TYPE "JointPurchaseParticipationStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "JointPurchaseCallCloseMode" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateTable
CREATE TABLE "JointPurchaseCall" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "JointPurchaseCallStatus" NOT NULL DEFAULT 'DRAFT',
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "responsibleUserId" TEXT NOT NULL,
    "sourceProposalId" UUID,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "openedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelReason" VARCHAR(280),

    CONSTRAINT "JointPurchaseCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JointPurchaseCallProduct" (
    "callId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "openCampaignId" TEXT,
    "sourceProposalId" UUID,
    "sourcePosition" INTEGER,

    CONSTRAINT "JointPurchaseCallProduct_pkey" PRIMARY KEY ("callId","position")
);

-- CreateTable
CREATE TABLE "JointPurchaseCallAccess" (
    "callId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "grant" VARCHAR(16) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JointPurchaseCallAccess_pkey" PRIMARY KEY ("callId","userId","grant")
);

-- CreateTable
CREATE TABLE "JointPurchaseParticipation" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "JointPurchaseParticipationStatus" NOT NULL,
    "consentVersion" VARCHAR(16) NOT NULL,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "consentReceivedAt" TIMESTAMP(3) NOT NULL,
    "lastSequence" INTEGER NOT NULL,
    "lastOperationId" UUID NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JointPurchaseParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JointPurchaseParticipationLine" (
    "participationId" UUID NOT NULL,
    "productId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "quantityBase" BIGINT NOT NULL,

    CONSTRAINT "JointPurchaseParticipationLine_pkey" PRIMARY KEY ("participationId","productId")
);

-- CreateTable
CREATE TABLE "JointPurchaseParticipationOperation" (
    "callId" UUID NOT NULL,
    "memberId" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "outcome" VARCHAR(24) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JointPurchaseParticipationOperation_pkey" PRIMARY KEY ("callId","memberId","operationId")
);

-- CreateTable
CREATE TABLE "JointPurchaseCallEvent" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "JointPurchaseCallEventKind" NOT NULL,
    "actorUserId" TEXT,
    "detail" VARCHAR(280),

    CONSTRAINT "JointPurchaseCallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JointPurchaseCallClosing" (
    "callId" UUID NOT NULL,
    "mode" "JointPurchaseCallCloseMode" NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "closedByUserId" TEXT,
    "participantCount" INTEGER NOT NULL,

    CONSTRAINT "JointPurchaseCallClosing_pkey" PRIMARY KEY ("callId")
);

-- CreateTable
CREATE TABLE "JointPurchaseCallClosingLine" (
    "callId" UUID NOT NULL,
    "productId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "totalQuantityBase" BIGINT NOT NULL,
    "participantCount" INTEGER NOT NULL,

    CONSTRAINT "JointPurchaseCallClosingLine_pkey" PRIMARY KEY ("callId","productId")
);

-- CreateTable
CREATE TABLE "JointPurchaseCallClosingParticipant" (
    "callId" UUID NOT NULL,
    "participationId" UUID NOT NULL,
    "memberId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JointPurchaseCallClosingParticipant_pkey" PRIMARY KEY ("callId","participationId")
);

-- CreateTable
CREATE TABLE "JointPurchaseCallClosingParticipantLine" (
    "callId" UUID NOT NULL,
    "participationId" UUID NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityBase" BIGINT NOT NULL,

    CONSTRAINT "JointPurchaseCallClosingParticipantLine_pkey" PRIMARY KEY ("callId","participationId","productId")
);

-- CreateIndex
CREATE INDEX "JointPurchaseCall_tenantId_campaignId_status_idx" ON "JointPurchaseCall"("tenantId", "campaignId", "status");

-- CreateIndex
CREATE INDEX "JointPurchaseCall_status_deadlineAt_idx" ON "JointPurchaseCall"("status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "JointPurchaseCallProduct_callId_productId_key" ON "JointPurchaseCallProduct"("callId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "JointPurchaseParticipation_callId_memberId_key" ON "JointPurchaseParticipation"("callId", "memberId");

-- CreateIndex
CREATE INDEX "JointPurchaseParticipationOperation_callId_memberId_outcome_idx" ON "JointPurchaseParticipationOperation"("callId", "memberId", "outcome", "sequence");

-- CreateIndex
CREATE INDEX "JointPurchaseCallEvent_callId_at_idx" ON "JointPurchaseCallEvent"("callId", "at");

-- AddForeignKey
ALTER TABLE "JointPurchaseCall" ADD CONSTRAINT "JointPurchaseCall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCall" ADD CONSTRAINT "JointPurchaseCall_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCall" ADD CONSTRAINT "JointPurchaseCall_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCall" ADD CONSTRAINT "JointPurchaseCall_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCall" ADD CONSTRAINT "JointPurchaseCall_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCall" ADD CONSTRAINT "JointPurchaseCall_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCall" ADD CONSTRAINT "JointPurchaseCall_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "JointPurchaseProposal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallProduct" ADD CONSTRAINT "JointPurchaseCallProduct_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallProduct" ADD CONSTRAINT "JointPurchaseCallProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallProduct" ADD CONSTRAINT "JointPurchaseCallProduct_sourceProposalId_sourcePosition_fkey" FOREIGN KEY ("sourceProposalId", "sourcePosition") REFERENCES "JointPurchaseProposalLine"("proposalId", "position") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallAccess" ADD CONSTRAINT "JointPurchaseCallAccess_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallAccess" ADD CONSTRAINT "JointPurchaseCallAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseParticipation" ADD CONSTRAINT "JointPurchaseParticipation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseParticipation" ADD CONSTRAINT "JointPurchaseParticipation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseParticipation" ADD CONSTRAINT "JointPurchaseParticipation_tenantId_memberId_fkey" FOREIGN KEY ("tenantId", "memberId") REFERENCES "Member"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseParticipationLine" ADD CONSTRAINT "JointPurchaseParticipationLine_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "JointPurchaseParticipation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseParticipationLine" ADD CONSTRAINT "JointPurchaseParticipationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseParticipationOperation" ADD CONSTRAINT "JointPurchaseParticipationOperation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseParticipationOperation" ADD CONSTRAINT "JointPurchaseParticipationOperation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallEvent" ADD CONSTRAINT "JointPurchaseCallEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallEvent" ADD CONSTRAINT "JointPurchaseCallEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallClosing" ADD CONSTRAINT "JointPurchaseCallClosing_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallClosing" ADD CONSTRAINT "JointPurchaseCallClosing_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallClosingLine" ADD CONSTRAINT "JointPurchaseCallClosingLine_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCallClosing"("callId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallClosingLine" ADD CONSTRAINT "JointPurchaseCallClosingLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallClosingParticipant" ADD CONSTRAINT "JointPurchaseCallClosingParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCallClosing"("callId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallClosingParticipantLine" ADD CONSTRAINT "JointPurchaseCallClosingParticipantLine_callId_participati_fkey" FOREIGN KEY ("callId", "participationId") REFERENCES "JointPurchaseCallClosingParticipant"("callId", "participationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- E2 §3 (a mano): estados coherentes, cantidades positivas, valores cerrados.
ALTER TABLE "JointPurchaseCall"
  ADD CONSTRAINT "JointPurchaseCall_name" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "JointPurchaseCall_opened" CHECK (
    ("status" IN ('OPEN', 'CLOSED')) <= ("openedAt" IS NOT NULL AND "openedByUserId" IS NOT NULL)
    AND ("status" <> 'DRAFT' OR "openedAt" IS NULL)
  ),
  ADD CONSTRAINT "JointPurchaseCall_closed" CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL)),
  ADD CONSTRAINT "JointPurchaseCall_cancelled" CHECK (
    ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL)
    AND ("status" = 'CANCELLED') = ("cancelledByUserId" IS NOT NULL)
    AND ("status" = 'CANCELLED') = ("cancelReason" IS NOT NULL)
  ),
  ADD CONSTRAINT "JointPurchaseCall_deadline_after_open" CHECK ("openedAt" IS NULL OR "deadlineAt" > "openedAt");

ALTER TABLE "JointPurchaseCallProduct"
  ADD CONSTRAINT "JointPurchaseCallProduct_position" CHECK ("position" >= 0),
  ADD CONSTRAINT "JointPurchaseCallProduct_source" CHECK (("sourceProposalId" IS NULL) = ("sourcePosition" IS NULL));

ALTER TABLE "JointPurchaseCallAccess"
  ADD CONSTRAINT "JointPurchaseCallAccess_grant" CHECK ("grant" IN ('PARTICIPANTS'));

ALTER TABLE "JointPurchaseParticipation"
  ADD CONSTRAINT "JointPurchaseParticipation_consent_version" CHECK ("consentVersion" ~ '^CONV-[1-9][0-9]{0,2}$'),
  ADD CONSTRAINT "JointPurchaseParticipation_sequence" CHECK ("lastSequence" >= 1);

ALTER TABLE "JointPurchaseParticipationLine"
  ADD CONSTRAINT "JointPurchaseParticipationLine_quantity" CHECK ("quantityBase" > 0);

ALTER TABLE "JointPurchaseParticipationOperation"
  ADD CONSTRAINT "JointPurchaseParticipationOperation_kind" CHECK ("kind" IN ('CONFIRM', 'WITHDRAW')),
  ADD CONSTRAINT "JointPurchaseParticipationOperation_sequence" CHECK ("sequence" >= 1),
  ADD CONSTRAINT "JointPurchaseParticipationOperation_fingerprint" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$');

ALTER TABLE "JointPurchaseCallClosing"
  ADD CONSTRAINT "JointPurchaseCallClosing_count" CHECK ("participantCount" >= 0);

ALTER TABLE "JointPurchaseCallClosingLine"
  ADD CONSTRAINT "JointPurchaseCallClosingLine_total" CHECK (
    "totalQuantityBase" >= 0 AND "participantCount" >= 0
    AND ("participantCount" = 0) = ("totalQuantityBase" = 0)
  );

ALTER TABLE "JointPurchaseCallClosingParticipantLine"
  ADD CONSTRAINT "JointPurchaseCallClosingParticipantLine_quantity" CHECK ("quantityBase" > 0);

-- E2-D3: un producto colectivo no está en dos convocatorias abiertas de la
-- misma campaña.
CREATE UNIQUE INDEX "JointPurchaseCallProduct_open_product_key"
  ON "JointPurchaseCallProduct"("tenantId", "openCampaignId", "productId")
  WHERE "openCampaignId" IS NOT NULL;

-- E2-D2: transiciones permitidas; nombre, fecha límite, responsable, campaña y
-- origen no cambian después de abrir; CLOSED y CANCELLED son finales.
CREATE FUNCTION "joint_purchase_call_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'JointPurchaseCall no admite DELETE';
  END IF;
  IF OLD."status" <> NEW."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('OPEN', 'CANCELLED'))
    OR (OLD."status" = 'OPEN' AND NEW."status" IN ('CLOSED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'JointPurchaseCall: transición % -> % no permitida', OLD."status", NEW."status";
  END IF;
  IF OLD."status" <> 'DRAFT' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."campaignId" IS DISTINCT FROM OLD."campaignId"
    OR NEW."name" IS DISTINCT FROM OLD."name"
    OR NEW."deadlineAt" IS DISTINCT FROM OLD."deadlineAt"
    OR NEW."responsibleUserId" IS DISTINCT FROM OLD."responsibleUserId"
    OR NEW."sourceProposalId" IS DISTINCT FROM OLD."sourceProposalId"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."openedAt" IS DISTINCT FROM OLD."openedAt"
    OR NEW."openedByUserId" IS DISTINCT FROM OLD."openedByUserId"
  ) THEN
    RAISE EXCEPTION 'JointPurchaseCall: campos inmutables después de abrir';
  END IF;
  IF OLD."status" IN ('CLOSED', 'CANCELLED') AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'JointPurchaseCall: estado final %', OLD."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_call_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseCall"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_guard"();

-- Los productos sólo cambian en DRAFT; después sólo se mueve "openCampaignId".
CREATE FUNCTION "joint_purchase_call_product_guard"() RETURNS trigger AS $$
DECLARE
  call_status "JointPurchaseCallStatus";
BEGIN
  SELECT "status" INTO call_status FROM "JointPurchaseCall"
    WHERE "id" = (CASE WHEN TG_OP = 'DELETE' THEN OLD."callId" ELSE NEW."callId" END);
  IF call_status = 'DRAFT' THEN
    RETURN (CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW."callId" = OLD."callId"
    AND NEW."position" = OLD."position"
    AND NEW."tenantId" = OLD."tenantId"
    AND NEW."productId" = OLD."productId"
    AND NEW."baseUnit" = OLD."baseUnit"
    AND NEW."sourceProposalId" IS NOT DISTINCT FROM OLD."sourceProposalId"
    AND NEW."sourcePosition" IS NOT DISTINCT FROM OLD."sourcePosition"
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'JointPurchaseCallProduct: productos inmutables después de abrir (% en %)', TG_OP, call_status;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_call_product_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "JointPurchaseCallProduct"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_product_guard"();

-- E2-D13 y el historial: el consolidado al cierre y los eventos no se
-- modifican ni se borran.
CREATE FUNCTION "joint_purchase_call_immutable_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% no admite % (registro inmutable)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_call_event_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseCallEvent"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();
CREATE TRIGGER "joint_purchase_call_closing_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseCallClosing"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();
CREATE TRIGGER "joint_purchase_call_closing_line_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseCallClosingLine"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();
CREATE TRIGGER "joint_purchase_call_closing_participant_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseCallClosingParticipant"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();
CREATE TRIGGER "joint_purchase_call_closing_participant_line_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseCallClosingParticipantLine"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();
