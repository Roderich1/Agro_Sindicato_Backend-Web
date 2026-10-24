-- CreateEnum
CREATE TYPE "CollectiveSealEntryStatus" AS ENUM ('DISCLOSED', 'SUPPRESSED_UNDER_THRESHOLD', 'SUPPRESSED_REVISION', 'OVERFLOW');

-- CreateTable
CREATE TABLE "CollectiveSeal" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sealedAt" TIMESTAMP(3) NOT NULL,
    "sealedByUserId" TEXT NOT NULL,
    "sealedByRole" "UserRole" NOT NULL,
    "disclosureMode" VARCHAR(32) NOT NULL,
    "policy" VARCHAR(16) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "linkedMembers" INTEGER NOT NULL,
    "membersWithContribution" INTEGER NOT NULL,
    "suppressedCells" BOOLEAN NOT NULL,
    "openDisputes" BOOLEAN NOT NULL,
    "reviewRef" CHAR(64) NOT NULL,

    CONSTRAINT "CollectiveSeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectiveSealEntry" (
    "sealId" UUID NOT NULL,
    "projectionType" "SyncV1ProjectionType" NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "status" "CollectiveSealEntryStatus" NOT NULL,
    "releaseId" UUID,
    "pendingChanges" BOOLEAN NOT NULL DEFAULT false,
    "visibilityWithdrawnAt" TIMESTAMP(3),

    CONSTRAINT "CollectiveSealEntry_pkey" PRIMARY KEY ("sealId","projectionType","canonicalProductId","baseUnit")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectiveSeal_tenantId_campaignId_version_key" ON "CollectiveSeal"("tenantId", "campaignId", "version");

-- CreateIndex
CREATE INDEX "CollectiveSealEntry_releaseId_idx" ON "CollectiveSealEntry"("releaseId");

-- AddForeignKey
ALTER TABLE "CollectiveSeal" ADD CONSTRAINT "CollectiveSeal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveSeal" ADD CONSTRAINT "CollectiveSeal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveSeal" ADD CONSTRAINT "CollectiveSeal_sealedByUserId_fkey" FOREIGN KEY ("sealedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveSealEntry" ADD CONSTRAINT "CollectiveSealEntry_sealId_fkey" FOREIGN KEY ("sealId") REFERENCES "CollectiveSeal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveSealEntry" ADD CONSTRAINT "CollectiveSealEntry_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CollectiveSealEntry" ADD CONSTRAINT "CollectiveSealEntry_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "CollectiveRelease"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- F07 (2026-10-23, F07_SEALED_HISTORY_CONTRACT.md §4): la versión sellada es
-- inmutable. Este bloque sólo admite la versión 1 (no hay reapertura ni
-- versiones posteriores); sólo sellan DIRECTIVA o ADMINISTRADOR.
ALTER TABLE "CollectiveSeal"
  ADD CONSTRAINT "CollectiveSeal_values" CHECK (
    "version" = 1
    AND "sealedByRole" IN ('DIRECTIVA', 'ADMINISTRADOR')
    AND "threshold" > 0
    AND "linkedMembers" >= 0
    AND "membersWithContribution" >= 0
    AND "reviewRef" ~ '^[0-9a-f]{64}$'
  );

-- Una entrada lleva la divulgación exactamente cuando su cifra se publicó.
ALTER TABLE "CollectiveSealEntry"
  ADD CONSTRAINT "CollectiveSealEntry_release_iff_disclosed"
  CHECK (("status" = 'DISCLOSED') = ("releaseId" IS NOT NULL));

-- Sólo se sella una campaña CERRADA del mismo tenant.
CREATE FUNCTION "collective_seal_insert_guard"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AgriculturalCampaign" c
    WHERE c."id" = NEW."campaignId" AND c."tenantId" = NEW."tenantId" AND c."status" = 'CERRADA'
  ) THEN
    RAISE EXCEPTION 'CollectiveSeal: sólo se sella una campaña CERRADA del mismo tenant';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_seal_insert_guard"
  BEFORE INSERT ON "CollectiveSeal"
  FOR EACH ROW EXECUTE FUNCTION "collective_seal_insert_guard"();

CREATE FUNCTION "collective_seal_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CollectiveSeal es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_seal_guard"
  BEFORE UPDATE OR DELETE ON "CollectiveSeal"
  FOR EACH ROW EXECUTE FUNCTION "collective_seal_guard"();

-- Las entradas se escriben en la misma transacción que crea el sellado y sólo
-- con una divulgación vigente de la misma celda, campaña y tenant.
CREATE FUNCTION "collective_seal_entry_insert_guard"() RETURNS trigger AS $$
DECLARE
  seal RECORD;
BEGIN
  SELECT s."tenantId", s."campaignId", s.xmin AS created_by INTO seal
  FROM "CollectiveSeal" s WHERE s."id" = NEW."sealId";
  IF seal.created_by IS DISTINCT FROM pg_current_xact_id()::xid THEN
    RAISE EXCEPTION 'CollectiveSealEntry: una versión sellada no admite entradas posteriores';
  END IF;
  IF NEW."releaseId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CollectiveRelease" r
    WHERE r."id" = NEW."releaseId"
      AND r."tenantId" = seal."tenantId"
      AND r."campaignId" = seal."campaignId"
      AND r."projectionType" = NEW."projectionType"
      AND r."canonicalProductId" = NEW."canonicalProductId"
      AND r."baseUnit" = NEW."baseUnit"
      AND r."withdrawnAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'CollectiveSealEntry: la divulgación no es la vigente de esa celda';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_seal_entry_insert_guard"
  BEFORE INSERT ON "CollectiveSealEntry"
  FOR EACH ROW EXECUTE FUNCTION "collective_seal_entry_insert_guard"();

-- Sólo se marca una vez la retirada de visibilidad; nada más cambia ni se borra.
CREATE FUNCTION "collective_seal_entry_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CollectiveSealEntry no admite borrado';
  END IF;
  IF OLD."visibilityWithdrawnAt" IS NOT NULL
     OR NEW."visibilityWithdrawnAt" IS NULL
     OR (to_jsonb(NEW) - 'visibilityWithdrawnAt') IS DISTINCT FROM (to_jsonb(OLD) - 'visibilityWithdrawnAt') THEN
    RAISE EXCEPTION 'CollectiveSealEntry: sólo se puede retirar una vez la visibilidad';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_seal_entry_guard"
  BEFORE UPDATE OR DELETE ON "CollectiveSealEntry"
  FOR EACH ROW EXECUTE FUNCTION "collective_seal_entry_guard"();

-- Una campaña sellada no admite divulgaciones nuevas, retiradas de las
-- anteriores ni filas nuevas de memoria: su versión no se recalcula.
CREATE FUNCTION "collective_release_sealed_guard"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CollectiveSeal" s
    WHERE s."tenantId" = NEW."tenantId" AND s."campaignId" = NEW."campaignId"
  ) THEN
    RAISE EXCEPTION 'CollectiveRelease: la campaña tiene un consolidado sellado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_release_sealed_guard"
  BEFORE INSERT OR UPDATE ON "CollectiveRelease"
  FOR EACH ROW EXECUTE FUNCTION "collective_release_sealed_guard"();

CREATE FUNCTION "collective_release_item_sealed_guard"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CollectiveRelease" r
    JOIN "CollectiveSeal" s ON s."tenantId" = r."tenantId" AND s."campaignId" = r."campaignId"
    WHERE r."id" = NEW."releaseId"
  ) THEN
    RAISE EXCEPTION 'CollectiveReleaseItem: la campaña tiene un consolidado sellado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_release_item_sealed_guard"
  BEFORE INSERT ON "CollectiveReleaseItem"
  FOR EACH ROW EXECUTE FUNCTION "collective_release_item_sealed_guard"();

-- El estado y el tenant de una campaña sellada no cambian (CERRADA es
-- terminal en el código; la base lo garantiza también para la sellada).
CREATE FUNCTION "agricultural_campaign_sealed_guard"() RETURNS trigger AS $$
BEGIN
  IF (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId")
     AND EXISTS (SELECT 1 FROM "CollectiveSeal" s WHERE s."campaignId" = OLD."id") THEN
    RAISE EXCEPTION 'AgriculturalCampaign: una campaña sellada no cambia de estado ni de tenant';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "agricultural_campaign_sealed_guard"
  BEFORE UPDATE ON "AgriculturalCampaign"
  FOR EACH ROW EXECUTE FUNCTION "agricultural_campaign_sealed_guard"();

-- F05 §8, enmienda del 2026-10-23: CAMPAIGN_SEALED es un rechazo final más.
-- Se amplía el conjunto cerrado del journal; las demás combinaciones no cambian.
ALTER TABLE "SyncV1OperationJournal" DROP CONSTRAINT "SyncV1Journal_result_check";
ALTER TABLE "SyncV1OperationJournal"
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
        AND "resultCode" IN ('IDEMPOTENCY_MISMATCH', 'CAMPAIGN_NOT_OPEN', 'CAMPAIGN_SEALED', 'REFERENCE_UNAVAILABLE',
          'UNIT_INCOMPATIBLE', 'QUANTITY_INVALID', 'INVALID_PREDECESSOR', 'INVALID_TRANSITION', 'OWNERSHIP_NOT_PROVEN',
          'PURPOSE_NOT_AUTHORIZED', 'CAUSAL_FENCED')
        AND "serverAcceptedAt" IS NULL AND "reconciliationReference" IS NULL)
    ))
  ) IS TRUE);
