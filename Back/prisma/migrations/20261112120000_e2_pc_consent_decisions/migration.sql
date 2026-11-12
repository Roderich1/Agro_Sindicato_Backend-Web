-- E2 §10.6 (decisión P-C del autor, 2026-11-12): el consentimiento es una
-- decisión propia, separada de las cantidades. Cada participación lleva el
-- alcance vigente (sólo la persona responsable, o también los colaboradores
-- que ella autorice) con la versión del texto, la fecha y el orden de la
-- decisión que lo fijó; cada decisión queda en un registro sólo de inserción.
--
-- Migración aditiva. Las participaciones existentes conservan exactamente el
-- alcance que ya tenían: CONV-2 cubría a los colaboradores (texto aceptado de
-- forma explícita) y CONV-1 sólo a la persona responsable. No se reescribe
-- ningún consentimiento aceptado: "consentVersion" y sus fechas no cambian y
-- la fila del registro se marca MIGRATED.

-- CreateEnum
CREATE TYPE "JointPurchaseConsentScope" AS ENUM ('RESPONSIBLE_ONLY', 'COLLABORATORS');

-- AlterTable
ALTER TABLE "JointPurchaseParticipation"
  ADD COLUMN "consentScope" "JointPurchaseConsentScope",
  ADD COLUMN "consentScopeVersion" VARCHAR(16),
  ADD COLUMN "consentScopeDecidedAt" TIMESTAMP(3),
  ADD COLUMN "consentScopeReceivedAt" TIMESTAMP(3),
  ADD COLUMN "consentScopeSequence" INTEGER NOT NULL DEFAULT 0;

UPDATE "JointPurchaseParticipation" SET
  "consentScope" = CASE WHEN "consentVersion" = 'CONV-2' THEN 'COLLABORATORS'::"JointPurchaseConsentScope" ELSE 'RESPONSIBLE_ONLY'::"JointPurchaseConsentScope" END,
  "consentScopeVersion" = "consentVersion",
  "consentScopeDecidedAt" = "consentAcceptedAt",
  "consentScopeReceivedAt" = "consentReceivedAt";

ALTER TABLE "JointPurchaseParticipation"
  ALTER COLUMN "consentScope" SET NOT NULL,
  ALTER COLUMN "consentScopeVersion" SET NOT NULL,
  ALTER COLUMN "consentScopeDecidedAt" SET NOT NULL,
  ALTER COLUMN "consentScopeReceivedAt" SET NOT NULL,
  ADD CONSTRAINT "JointPurchaseParticipation_scope_version" CHECK ("consentScopeVersion" ~ '^CONV-[1-9][0-9]{0,2}$'),
  ADD CONSTRAINT "JointPurchaseParticipation_scope_sequence" CHECK ("consentScopeSequence" >= 0);

-- CreateTable
CREATE TABLE "JointPurchaseConsentDecision" (
    "id" UUID NOT NULL,
    "participationId" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "memberId" TEXT NOT NULL,
    "scope" "JointPurchaseConsentScope" NOT NULL,
    "consentVersion" VARCHAR(16) NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operationId" UUID,
    "source" VARCHAR(16) NOT NULL,

    CONSTRAINT "JointPurchaseConsentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JointPurchaseConsentDecision_participationId_sequence_idx" ON "JointPurchaseConsentDecision"("participationId", "sequence");

-- AddForeignKey
ALTER TABLE "JointPurchaseConsentDecision" ADD CONSTRAINT "JointPurchaseConsentDecision_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "JointPurchaseParticipation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseConsentDecision" ADD CONSTRAINT "JointPurchaseConsentDecision_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- (a mano) Origen cerrado, versión con el formato de las demás, orden >= 0
-- (0 = la aceptación con que se creó la participación).
ALTER TABLE "JointPurchaseConsentDecision"
  ADD CONSTRAINT "JointPurchaseConsentDecision_source" CHECK ("source" IN ('INITIAL', 'DECISION', 'MIGRATED')),
  ADD CONSTRAINT "JointPurchaseConsentDecision_version" CHECK ("consentVersion" ~ '^CONV-[1-9][0-9]{0,2}$'),
  ADD CONSTRAINT "JointPurchaseConsentDecision_sequence" CHECK ("sequence" >= 0),
  ADD CONSTRAINT "JointPurchaseConsentDecision_operation" CHECK (("source" = 'DECISION') = ("operationId" IS NOT NULL));

-- Registro sólo de inserción (la misma función que el historial y el cierre).
CREATE TRIGGER "joint_purchase_consent_decision_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseConsentDecision"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();

-- Las decisiones sobre el consentimiento se registran en el diario de
-- operaciones del agricultor (idempotencia), con su propio orden.
ALTER TABLE "JointPurchaseParticipationOperation"
  DROP CONSTRAINT "JointPurchaseParticipationOperation_kind",
  ADD CONSTRAINT "JointPurchaseParticipationOperation_kind" CHECK ("kind" IN ('CONFIRM', 'WITHDRAW', 'CONSENT'));

-- Una fila MIGRATED por participación existente: el alcance que ya tenía.
INSERT INTO "JointPurchaseConsentDecision" ("id", "participationId", "callId", "memberId", "scope", "consentVersion", "decidedAt", "receivedAt", "sequence", "operationId", "source")
SELECT gen_random_uuid(), p."id", p."callId", p."memberId", p."consentScope", p."consentScopeVersion", p."consentScopeDecidedAt", p."consentScopeReceivedAt", 0, NULL, 'MIGRATED'
FROM "JointPurchaseParticipation" p;
