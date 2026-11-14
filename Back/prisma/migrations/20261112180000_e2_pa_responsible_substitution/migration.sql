-- E2 P-A (decisión del autor del 2026-11-12: A1 + B1 + C1), contrato §12.
--
-- A1: permiso del sindicato «Sustituir responsable», concedido y revocado por
--     una persona ADMINISTRADOR habilitada a personas concretas y habilitadas
--     de la Directiva o la Administración del mismo sindicato (nunca a sí
--     misma ni a un rol entero). Concesiones y revocaciones quedan en un
--     registro sólo de inserción.
-- B1: sólo quien tiene el permiso y sigue habilitada sustituye a una
--     responsable que ya no está habilitada, en borradores, abiertas y
--     cerradas (no en canceladas), con motivo y confirmación. Cada
--     sustitución es una fila sólo de inserción con la versión nueva de la
--     responsabilidad; la convocatoria sólo cambia de responsable con esa fila.
-- C1: la autorización de cada agricultor se ata a una versión de la
--     responsabilidad; ninguna aceptación anterior cubre a la sucesora.
--
-- Migración aditiva. Toda convocatoria existente está en la versión 1 (no
-- hubo sustituciones) y cada participación existente queda autorizada para
-- esa versión, que es la de la responsable que el agricultor vio al aceptar.
-- No se reescribe ningún consentimiento ni decisión registrada.

-- AlterEnum
ALTER TYPE "JointPurchaseCallEventKind" ADD VALUE 'RESPONSIBLE_REPLACED';
ALTER TYPE "JointPurchaseCallEventKind" ADD VALUE 'ACCESS_CONFIRMED';

-- AlterEnum
ALTER TYPE "JointPurchaseCallAccessAction" ADD VALUE 'SUSPENDED';
ALTER TYPE "JointPurchaseCallAccessAction" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "JointPurchaseCall" ADD COLUMN     "responsibleVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "JointPurchaseCallAccess" ADD COLUMN     "responsibleVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "JointPurchaseParticipation" ADD COLUMN     "consentResponsibleVersion" INTEGER;

-- AlterTable
ALTER TABLE "JointPurchaseConsentDecision" ADD COLUMN     "responsibleVersion" INTEGER;

-- CreateTable
CREATE TABLE "JointPurchaseSubstitutionGrant" (
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(280) NOT NULL,

    CONSTRAINT "JointPurchaseSubstitutionGrant_pkey" PRIMARY KEY ("tenantId","userId")
);

-- CreateTable
CREATE TABLE "JointPurchaseSubstitutionGrantEvent" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(280),

    CONSTRAINT "JointPurchaseSubstitutionGrantEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JointPurchaseResponsibleChange" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previousUserId" TEXT NOT NULL,
    "newUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" VARCHAR(280) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "callStatus" "JointPurchaseCallStatus" NOT NULL,
    "suspendedDelegations" INTEGER NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,

    CONSTRAINT "JointPurchaseResponsibleChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JointPurchaseSubstitutionGrantEvent_tenantId_at_idx" ON "JointPurchaseSubstitutionGrantEvent"("tenantId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "JointPurchaseResponsibleChange_callId_version_key" ON "JointPurchaseResponsibleChange"("callId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "JointPurchaseResponsibleChange_callId_requestId_key" ON "JointPurchaseResponsibleChange"("callId", "requestId");

-- AddForeignKey
ALTER TABLE "JointPurchaseSubstitutionGrant" ADD CONSTRAINT "JointPurchaseSubstitutionGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseSubstitutionGrant" ADD CONSTRAINT "JointPurchaseSubstitutionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseSubstitutionGrant" ADD CONSTRAINT "JointPurchaseSubstitutionGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseSubstitutionGrantEvent" ADD CONSTRAINT "JointPurchaseSubstitutionGrantEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseSubstitutionGrantEvent" ADD CONSTRAINT "JointPurchaseSubstitutionGrantEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseSubstitutionGrantEvent" ADD CONSTRAINT "JointPurchaseSubstitutionGrantEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseResponsibleChange" ADD CONSTRAINT "JointPurchaseResponsibleChange_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseResponsibleChange" ADD CONSTRAINT "JointPurchaseResponsibleChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseResponsibleChange" ADD CONSTRAINT "JointPurchaseResponsibleChange_previousUserId_fkey" FOREIGN KEY ("previousUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseResponsibleChange" ADD CONSTRAINT "JointPurchaseResponsibleChange_newUserId_fkey" FOREIGN KEY ("newUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseResponsibleChange" ADD CONSTRAINT "JointPurchaseResponsibleChange_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- (a mano) C1: cada participación existente se aceptó viendo a la
-- responsable de la versión 1 (la única que hubo): queda autorizada para ella.
UPDATE "JointPurchaseParticipation" SET "consentResponsibleVersion" = 1;

ALTER TABLE "JointPurchaseCall"
  ADD CONSTRAINT "JointPurchaseCall_responsible_version" CHECK ("responsibleVersion" >= 1);
ALTER TABLE "JointPurchaseCallAccess"
  ADD CONSTRAINT "JointPurchaseCallAccess_responsible_version" CHECK ("responsibleVersion" >= 1);
ALTER TABLE "JointPurchaseParticipation"
  ADD CONSTRAINT "JointPurchaseParticipation_consent_responsible_version" CHECK ("consentResponsibleVersion" IS NULL OR "consentResponsibleVersion" >= 1);
ALTER TABLE "JointPurchaseConsentDecision"
  ADD CONSTRAINT "JointPurchaseConsentDecision_responsible_version" CHECK ("responsibleVersion" IS NULL OR "responsibleVersion" >= 1);
ALTER TABLE "JointPurchaseSubstitutionGrant"
  ADD CONSTRAINT "JointPurchaseSubstitutionGrant_not_self" CHECK ("userId" <> "grantedByUserId"),
  ADD CONSTRAINT "JointPurchaseSubstitutionGrant_reason" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 280);
ALTER TABLE "JointPurchaseSubstitutionGrantEvent"
  ADD CONSTRAINT "JointPurchaseSubstitutionGrantEvent_action" CHECK ("action" IN ('GRANTED', 'REVOKED')),
  ADD CONSTRAINT "JointPurchaseSubstitutionGrantEvent_reason" CHECK ("action" <> 'GRANTED' OR char_length(btrim("reason")) BETWEEN 1 AND 280);
ALTER TABLE "JointPurchaseResponsibleChange"
  ADD CONSTRAINT "JointPurchaseResponsibleChange_version" CHECK ("version" >= 2),
  ADD CONSTRAINT "JointPurchaseResponsibleChange_distinct" CHECK ("previousUserId" <> "newUserId"),
  ADD CONSTRAINT "JointPurchaseResponsibleChange_reason" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 280),
  ADD CONSTRAINT "JointPurchaseResponsibleChange_status" CHECK ("callStatus" IN ('DRAFT', 'OPEN', 'CLOSED')),
  ADD CONSTRAINT "JointPurchaseResponsibleChange_suspended" CHECK ("suspendedDelegations" >= 0),
  ADD CONSTRAINT "JointPurchaseResponsibleChange_hash" CHECK ("requestHash" ~ '^[0-9a-f]{64}$');

-- Registros sólo de inserción.
CREATE TRIGGER "joint_purchase_substitution_grant_event_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseSubstitutionGrantEvent"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();
CREATE TRIGGER "joint_purchase_responsible_change_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseResponsibleChange"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();

-- A1: un permiso no se modifica (revocar es borrar la fila); quien concede y
-- quien recibe son del mismo sindicato que el permiso.
CREATE FUNCTION "joint_purchase_substitution_grant_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'JointPurchaseSubstitutionGrant no admite UPDATE';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM "User" holder JOIN "User" grantor ON grantor."tenantId" = holder."tenantId"
    WHERE holder."id" = NEW."userId" AND grantor."id" = NEW."grantedByUserId" AND holder."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'JointPurchaseSubstitutionGrant: concedente y destinatario del mismo sindicato';
  END IF;
  RETURN (CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_substitution_grant_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "JointPurchaseSubstitutionGrant"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_substitution_grant_guard"();

-- B1: la convocatoria sólo cambia de responsable después de abrir (o, en un
-- borrador, también por sustitución) cuando la misma transacción registró la
-- sustitución con la versión siguiente, la responsable anterior y la nueva.
-- Una sustitución sólo cambia la responsable, su versión y updatedAt: no
-- reabre, no cambia el plazo ni nada más, tampoco en una cerrada. Una
-- cancelada no se sustituye. El resto de las reglas de E2-D2 no cambia.
CREATE OR REPLACE FUNCTION "joint_purchase_call_guard"() RETURNS trigger AS $$
DECLARE
  neutral "JointPurchaseCall"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'JointPurchaseCall no admite DELETE';
  END IF;
  IF NEW."responsibleVersion" IS DISTINCT FROM OLD."responsibleVersion" THEN
    IF NEW."responsibleVersion" <> OLD."responsibleVersion" + 1
      OR OLD."status" = 'CANCELLED'
      OR NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."responsibleUserId" = OLD."responsibleUserId"
      OR NOT EXISTS (
        SELECT 1 FROM "JointPurchaseResponsibleChange" rc
        WHERE rc."callId" = NEW."id" AND rc."version" = NEW."responsibleVersion"
          AND rc."previousUserId" = OLD."responsibleUserId" AND rc."newUserId" = NEW."responsibleUserId"
      )
    THEN
      RAISE EXCEPTION 'JointPurchaseCall: sustitución de la responsable sin registro válido';
    END IF;
    neutral := OLD;
    neutral."responsibleUserId" := NEW."responsibleUserId";
    neutral."responsibleVersion" := NEW."responsibleVersion";
    neutral."updatedAt" := NEW."updatedAt";
    IF ROW(NEW.*) IS DISTINCT FROM ROW(neutral.*) THEN
      RAISE EXCEPTION 'JointPurchaseCall: una sustitución sólo cambia la persona responsable';
    END IF;
    RETURN NEW;
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

-- §10.2 con P-A: el permiso que el sistema crea para la responsable
-- ("grantedByUserId" nulo, PARTICIPANTS) sólo se crea para la responsable
-- actual y sólo se borra cuando ella dejó de serlo (sustitución). Una
-- delegación se concede con la versión vigente de la responsabilidad.
CREATE OR REPLACE FUNCTION "joint_purchase_call_access_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess no admite UPDATE';
  END IF;
  IF TG_OP = 'DELETE' AND OLD."grantedByUserId" IS NULL AND EXISTS (
    SELECT 1 FROM "JointPurchaseCall" c WHERE c."id" = OLD."callId" AND c."responsibleUserId" = OLD."userId"
  ) THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: el permiso del responsable no se revoca';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."grantedByUserId" IS NULL AND (
    NEW."grant" <> 'PARTICIPANTS'
    OR NOT EXISTS (
      SELECT 1 FROM "JointPurchaseCall" c
      WHERE c."id" = NEW."callId" AND c."responsibleUserId" = NEW."userId" AND c."responsibleVersion" = NEW."responsibleVersion"
    )
  ) THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: el sistema sólo crea PARTICIPANTS para el responsable';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."grantedByUserId" IS NOT NULL AND (
    NEW."grantedByUserId" = NEW."userId"
    OR NOT EXISTS (
      SELECT 1 FROM "JointPurchaseCall" c
      JOIN "User" holder ON holder."id" = NEW."userId" AND holder."tenantId" = c."tenantId"
      WHERE c."id" = NEW."callId" AND c."responsibleUserId" = NEW."grantedByUserId" AND c."responsibleUserId" <> NEW."userId"
        AND c."responsibleVersion" = NEW."responsibleVersion"
    )
  ) THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: sólo el responsable concede, a otro usuario del mismo tenant';
  END IF;
  RETURN (CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
END;
$$ LANGUAGE plpgsql;
