-- E4 (2026-11-13): acceso por rol en compras conjuntas y totales sin umbral de
-- agricultores. Contrato: docs/architecture/E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md
-- §4.3–§4.4 y §5.1.
--
-- Expansión aditiva: no se borra ni se reescribe ningún dato ni historia.
-- - Ningún consentimiento aceptado cambia de alcance (no hay filas MIGRATED
--   nuevas).
-- - Las filas PARTICIPANTS de JointPurchaseCallAccess, los permisos
--   «Sustituir responsable» y sus eventos se conservan como historia.
-- - Lo sellado y lo ejecutado antes conserva política F07-POL-01 y umbral 3.
-- - Las columnas nuevas quedan nulas, sin relleno.
-- - CollectiveDisclosurePolicyActivation queda vacía: la primera fila la
--   escribe el primer arranque con COLLECTIVE_DISCLOSURE_POLICY explícita.

-- §4.3: alcances nuevos del consentimiento.
ALTER TYPE "JointPurchaseConsentScope" ADD VALUE 'ADMINISTRATION';
ALTER TYPE "JointPurchaseConsentScope" ADD VALUE 'TOTALS_ONLY';

-- §4.4: la política con que se decidió cada divulgación nueva (NULL = anterior a E4, F07-POL-01).
ALTER TABLE "CollectiveRelease" ADD COLUMN "policy" VARCHAR(16);
ALTER TABLE "CollectiveRelease"
  ADD CONSTRAINT "CollectiveRelease_policy" CHECK ("policy" IS NULL OR "policy" IN ('F07-POL-01', 'F07-POL-02'));

-- §4.4: la política con que se generó cada borrador (NULL = anterior a E4, F07-POL-01).
ALTER TABLE "JointPurchaseProposal" ADD COLUMN "disclosurePolicy" VARCHAR(16);
ALTER TABLE "JointPurchaseProposal"
  ADD CONSTRAINT "JointPurchaseProposal_disclosure_policy" CHECK ("disclosurePolicy" IS NULL OR "disclosurePolicy" IN ('F07-POL-01', 'F07-POL-02'));

-- §4.4: el umbral pasa a ser nulo con F07-POL-02. CHECK de coherencia:
-- F07-POL-01 ⇔ umbral presente (y positivo). No se guarda 1 en lugar de NULL:
-- se leería como «K = 1». Las demás condiciones de *_values no cambian.
ALTER TABLE "CollectiveSeal" ALTER COLUMN "threshold" DROP NOT NULL;
ALTER TABLE "CollectiveSeal" DROP CONSTRAINT "CollectiveSeal_values";
ALTER TABLE "CollectiveSeal"
  ADD CONSTRAINT "CollectiveSeal_values" CHECK (
    "version" = 1
    AND "sealedByRole" IN ('DIRECTIVA', 'ADMINISTRADOR')
    AND "linkedMembers" >= 0
    AND "membersWithContribution" >= 0
    AND "reviewRef" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "CollectiveSeal_policy_threshold" CHECK (
    "policy" IN ('F07-POL-01', 'F07-POL-02')
    AND (("policy" = 'F07-POL-01') = ("threshold" IS NOT NULL))
    AND ("threshold" IS NULL OR "threshold" > 0)
  );

ALTER TABLE "EstimationRun" ALTER COLUMN "threshold" DROP NOT NULL;
ALTER TABLE "EstimationRun" DROP CONSTRAINT "EstimationRun_values";
ALTER TABLE "EstimationRun"
  ADD CONSTRAINT "EstimationRun_values" CHECK (
    "contractVersion" = 1
    AND "horizon" = 1
    AND "method" = 'SES_NAIVE'
    AND "methodVersion" <> ''
    AND "requestedByRole" IN ('DIRECTIVA', 'ADMINISTRADOR')
    AND "disclosureMode" <> ''
    AND "disclosureMode" <> 'POLICY_PENDING'
    AND "contentHash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("parameters") = 'object'
    AND (("outcome" = 'FAILED') = ("failureCode" IS NOT NULL))
    AND ("failureCode" IS NULL OR "failureCode" IN ('CALCULATION_FAILED', 'RETRIES_EXHAUSTED'))
  ),
  ADD CONSTRAINT "EstimationRun_policy_threshold" CHECK (
    "policy" IN ('F07-POL-01', 'F07-POL-02')
    AND (("policy" = 'F07-POL-01') = ("threshold" IS NOT NULL))
    AND ("threshold" IS NULL OR "threshold" > 0)
  );

-- §4.4 y §3.1: los permisos de visualización (PARTICIPANTS) se retiran de los
-- flujos activos. Defensa en profundidad: la base rechaza insertar uno nuevo y
-- borrar uno guardado (se conservan como historia). MANAGE sigue con las reglas
-- de E2 §10.2 y P-A (sólo la responsable vigente concede, con la versión
-- vigente de la responsabilidad).
CREATE OR REPLACE FUNCTION "joint_purchase_call_access_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess no admite UPDATE';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."grant" = 'PARTICIPANTS' THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: el permiso PARTICIPANTS está retirado (E4)';
  END IF;
  IF TG_OP = 'DELETE' AND OLD."grant" = 'PARTICIPANTS' THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: un permiso PARTICIPANTS guardado es historia y no se borra (E4)';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."grantedByUserId" IS NULL THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: el sistema ya no crea permisos (E4)';
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

-- §5.1 (D-03): activaciones de la política colectiva, sólo de inserción.
CREATE TABLE "CollectiveDisclosurePolicyActivation" (
    "id" UUID NOT NULL,
    "policy" VARCHAR(16) NOT NULL,
    "previousPolicy" VARCHAR(16),
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "source" VARCHAR(16) NOT NULL,

    CONSTRAINT "CollectiveDisclosurePolicyActivation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollectiveDisclosurePolicyActivation_activatedAt_idx" ON "CollectiveDisclosurePolicyActivation"("activatedAt");

ALTER TABLE "CollectiveDisclosurePolicyActivation"
  ADD CONSTRAINT "CollectiveDisclosurePolicyActivation_values" CHECK (
    "policy" IN ('F07-POL-01', 'F07-POL-02')
    AND ("previousPolicy" IS NULL OR "previousPolicy" IN ('F07-POL-01', 'F07-POL-02'))
    AND "policy" IS DISTINCT FROM "previousPolicy"
    AND "source" = 'CONFIG'
  );

CREATE TRIGGER "collective_disclosure_policy_activation_guard"
  BEFORE UPDATE OR DELETE ON "CollectiveDisclosurePolicyActivation"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();
