-- E3-P2: la convocatoria conserva, de forma inmutable, qué productos se
-- seleccionaron al crearla y su procedencia (borrador de propuesta, con su
-- huella y la revisión de su selección guardada, o catálogo). Migración
-- aditiva: no toca convocatorias, sus productos, borradores ni selecciones.
-- Nunca guarda cantidades, cifras divulgadas, aportantes ni estimaciones.

-- CreateEnum
CREATE TYPE "JointPurchaseCallOriginKind" AS ENUM ('PROPOSAL', 'CATALOG');

-- CreateTable
CREATE TABLE "JointPurchaseCallOrigin" (
    "callId" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "JointPurchaseCallOriginKind" NOT NULL,
    "proposalId" UUID,
    "proposalFingerprint" CHAR(64),
    "selectionRevision" INTEGER,
    "selectionMatched" BOOLEAN,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedByUserId" TEXT NOT NULL,

    CONSTRAINT "JointPurchaseCallOrigin_pkey" PRIMARY KEY ("callId")
);

-- CreateTable
CREATE TABLE "JointPurchaseCallOriginProduct" (
    "callId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "proposalId" UUID,
    "proposalPosition" INTEGER,

    CONSTRAINT "JointPurchaseCallOriginProduct_pkey" PRIMARY KEY ("callId","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "JointPurchaseCallOriginProduct_callId_productId_key" ON "JointPurchaseCallOriginProduct"("callId", "productId");

-- AddForeignKey
ALTER TABLE "JointPurchaseCallOrigin" ADD CONSTRAINT "JointPurchaseCallOrigin_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallOrigin" ADD CONSTRAINT "JointPurchaseCallOrigin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallOrigin" ADD CONSTRAINT "JointPurchaseCallOrigin_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "JointPurchaseProposal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallOrigin" ADD CONSTRAINT "JointPurchaseCallOrigin_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallOriginProduct" ADD CONSTRAINT "JointPurchaseCallOriginProduct_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCallOrigin"("callId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallOriginProduct" ADD CONSTRAINT "JointPurchaseCallOriginProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallOriginProduct" ADD CONSTRAINT "JointPurchaseCallOriginProduct_proposalId_proposalPosition_fkey" FOREIGN KEY ("proposalId", "proposalPosition") REFERENCES "JointPurchaseProposalLine"("proposalId", "position") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- E3-P2 (a mano): coherencia del origen.
ALTER TABLE "JointPurchaseCallOrigin"
  ADD CONSTRAINT "JointPurchaseCallOrigin_kind" CHECK (
    ("kind" = 'CATALOG'
      AND "proposalId" IS NULL AND "proposalFingerprint" IS NULL
      AND "selectionRevision" IS NULL AND "selectionMatched" IS NULL)
    OR ("kind" = 'PROPOSAL' AND "proposalId" IS NOT NULL AND "proposalFingerprint" IS NOT NULL)
  ),
  ADD CONSTRAINT "JointPurchaseCallOrigin_selection" CHECK (
    ("selectionRevision" IS NULL) = ("selectionMatched" IS NULL)
    AND ("selectionRevision" IS NULL OR "selectionRevision" >= 1)
  );

ALTER TABLE "JointPurchaseCallOriginProduct"
  ADD CONSTRAINT "JointPurchaseCallOriginProduct_position" CHECK ("position" >= 0),
  ADD CONSTRAINT "JointPurchaseCallOriginProduct_source" CHECK (("proposalId" IS NULL) = ("proposalPosition" IS NULL));

-- E3-P2: el origen se escribe al crear la convocatoria (en DRAFT), del mismo
-- sindicato que ella y, si viene de un borrador, el de la convocatoria, con la
-- huella de ese borrador y la revisión de su selección vigente en ese momento.
-- Nunca se modifica ni se borra.
CREATE FUNCTION "joint_purchase_call_origin_guard"() RETURNS trigger AS $$
DECLARE
  call_tenant TEXT;
  call_status "JointPurchaseCallStatus";
  call_proposal UUID;
  proposal_tenant TEXT;
  proposal_fingerprint TEXT;
  selection_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% no admite % (registro inmutable)', TG_TABLE_NAME, TG_OP;
  END IF;
  SELECT "tenantId", "status", "sourceProposalId" INTO call_tenant, call_status, call_proposal
    FROM "JointPurchaseCall" WHERE "id" = NEW."callId";
  IF call_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'JointPurchaseCallOrigin: convocatoria de otro sindicato';
  END IF;
  IF call_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'JointPurchaseCallOrigin: sólo al crear la convocatoria (borrador)';
  END IF;
  IF call_proposal IS DISTINCT FROM NEW."proposalId" THEN
    RAISE EXCEPTION 'JointPurchaseCallOrigin: el borrador no es el de la convocatoria';
  END IF;
  IF NEW."proposalId" IS NOT NULL THEN
    SELECT "tenantId", "inputsFingerprint" INTO proposal_tenant, proposal_fingerprint
      FROM "JointPurchaseProposal" WHERE "id" = NEW."proposalId";
    IF proposal_tenant IS DISTINCT FROM NEW."tenantId" THEN
      RAISE EXCEPTION 'JointPurchaseCallOrigin: borrador de otro sindicato';
    END IF;
    IF proposal_fingerprint IS DISTINCT FROM NEW."proposalFingerprint" THEN
      RAISE EXCEPTION 'JointPurchaseCallOrigin: la huella no es la del borrador';
    END IF;
    SELECT "revision" INTO selection_revision
      FROM "JointPurchaseProposalSelection" WHERE "proposalId" = NEW."proposalId";
    IF selection_revision IS DISTINCT FROM NEW."selectionRevision" THEN
      RAISE EXCEPTION 'JointPurchaseCallOrigin: la revisión no es la de la selección vigente';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_call_origin_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "JointPurchaseCallOrigin"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_origin_guard"();

-- Cada producto del origen es del sindicato del origen; si cita una línea, es
-- del borrador del origen y de ese mismo producto y unidad. Nunca se modifica
-- ni se borra.
CREATE FUNCTION "joint_purchase_call_origin_product_guard"() RETURNS trigger AS $$
DECLARE
  origin_tenant TEXT;
  origin_proposal UUID;
  product_tenant TEXT;
  line_product TEXT;
  line_unit "SyncV1BaseUnit";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% no admite % (registro inmutable)', TG_TABLE_NAME, TG_OP;
  END IF;
  SELECT "tenantId", "proposalId" INTO origin_tenant, origin_proposal
    FROM "JointPurchaseCallOrigin" WHERE "callId" = NEW."callId";
  SELECT "tenantId" INTO product_tenant FROM "Product" WHERE "id" = NEW."productId";
  IF product_tenant IS DISTINCT FROM origin_tenant THEN
    RAISE EXCEPTION 'JointPurchaseCallOriginProduct: producto de otro sindicato';
  END IF;
  IF NEW."proposalId" IS NOT NULL THEN
    IF NEW."proposalId" IS DISTINCT FROM origin_proposal THEN
      RAISE EXCEPTION 'JointPurchaseCallOriginProduct: la línea no es del borrador del origen';
    END IF;
    SELECT "canonicalProductId", "baseUnit" INTO line_product, line_unit
      FROM "JointPurchaseProposalLine"
      WHERE "proposalId" = NEW."proposalId" AND "position" = NEW."proposalPosition";
    IF line_product IS DISTINCT FROM NEW."productId" OR line_unit IS DISTINCT FROM NEW."baseUnit" THEN
      RAISE EXCEPTION 'JointPurchaseCallOriginProduct: la línea es de otro producto o unidad';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_call_origin_product_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "JointPurchaseCallOriginProduct"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_origin_product_guard"();
