-- E3 (docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md §3): referencia
-- de consumo estimado fijada en un borrador de propuesta (vínculos inmutables)
-- y selección de productos para una convocatoria. Migración aditiva: no toca
-- el borrador, sus líneas ni su huella, ni las tablas de F12.

-- CreateTable
CREATE TABLE "JointPurchaseProposalEstimationLink" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "mode" VARCHAR(8) NOT NULL,
    "action" VARCHAR(24) NOT NULL,
    "runId" UUID,
    "jobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "createdByRole" VARCHAR(16) NOT NULL,

    CONSTRAINT "JointPurchaseProposalEstimationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JointPurchaseProposalSelection" (
    "proposalId" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "productRefs" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT NOT NULL,

    CONSTRAINT "JointPurchaseProposalSelection_pkey" PRIMARY KEY ("proposalId")
);

-- CreateIndex
CREATE INDEX "JointPurchaseProposalEstimationLink_runId_idx" ON "JointPurchaseProposalEstimationLink"("runId");

-- CreateIndex
CREATE INDEX "JointPurchaseProposalEstimationLink_jobId_idx" ON "JointPurchaseProposalEstimationLink"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JointPurchaseProposalEstimationLink_proposalId_sequence_key" ON "JointPurchaseProposalEstimationLink"("proposalId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "JointPurchaseProposalEstimationLink_proposalId_requestId_key" ON "JointPurchaseProposalEstimationLink"("proposalId", "requestId");

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalEstimationLink" ADD CONSTRAINT "JointPurchaseProposalEstimationLink_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "JointPurchaseProposal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalEstimationLink" ADD CONSTRAINT "JointPurchaseProposalEstimationLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalEstimationLink" ADD CONSTRAINT "JointPurchaseProposalEstimationLink_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EstimationRun"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalEstimationLink" ADD CONSTRAINT "JointPurchaseProposalEstimationLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "EstimationJob"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalEstimationLink" ADD CONSTRAINT "JointPurchaseProposalEstimationLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalSelection" ADD CONSTRAINT "JointPurchaseProposalSelection_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "JointPurchaseProposal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalSelection" ADD CONSTRAINT "JointPurchaseProposalSelection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseProposalSelection" ADD CONSTRAINT "JointPurchaseProposalSelection_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- E3 §3 (a mano): coherencia del vínculo y de la selección.
ALTER TABLE "JointPurchaseProposalEstimationLink"
  ADD CONSTRAINT "JointPurchaseProposalEstimationLink_sequence" CHECK ("sequence" >= 1),
  ADD CONSTRAINT "JointPurchaseProposalEstimationLink_mode" CHECK ("mode" IN ('INITIAL', 'UPDATE', 'CLEAR')),
  ADD CONSTRAINT "JointPurchaseProposalEstimationLink_action" CHECK ("action" IN ('LINK_EXISTING_RUN', 'REUSE_JOB', 'REQUEST_JOB', 'CLEAR')),
  ADD CONSTRAINT "JointPurchaseProposalEstimationLink_target" CHECK (
    ("action" = 'LINK_EXISTING_RUN' AND "runId" IS NOT NULL AND "jobId" IS NULL)
    OR ("action" IN ('REUSE_JOB', 'REQUEST_JOB') AND "jobId" IS NOT NULL AND "runId" IS NULL)
    OR ("action" = 'CLEAR' AND "runId" IS NULL AND "jobId" IS NULL)
  ),
  ADD CONSTRAINT "JointPurchaseProposalEstimationLink_clear_mode" CHECK (("action" = 'CLEAR') = ("mode" = 'CLEAR')),
  ADD CONSTRAINT "JointPurchaseProposalEstimationLink_hash" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "JointPurchaseProposalEstimationLink_role" CHECK ("createdByRole" IN ('DIRECTIVA', 'ADMINISTRADOR'));

ALTER TABLE "JointPurchaseProposalSelection"
  ADD CONSTRAINT "JointPurchaseProposalSelection_revision" CHECK ("revision" >= 1),
  ADD CONSTRAINT "JointPurchaseProposalSelection_refs" CHECK (jsonb_typeof("productRefs") = 'array');

-- E3-D1/E3-D7: un vínculo cita su borrador, del mismo sindicato, y una
-- ejecución o un trabajo del mismo sindicato cuya campaña objetivo es la del
-- borrador; nunca se modifica ni se borra (el trabajador F12 no escribe aquí).
CREATE FUNCTION "joint_purchase_proposal_estimation_link_guard"() RETURNS trigger AS $$
DECLARE
  proposal_tenant TEXT;
  proposal_campaign TEXT;
  target_tenant TEXT;
  target_campaign TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% no admite % (registro inmutable)', TG_TABLE_NAME, TG_OP;
  END IF;
  SELECT "tenantId", "campaignId" INTO proposal_tenant, proposal_campaign
    FROM "JointPurchaseProposal" WHERE "id" = NEW."proposalId";
  IF proposal_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'JointPurchaseProposalEstimationLink: borrador de otro sindicato';
  END IF;
  IF NEW."runId" IS NOT NULL THEN
    SELECT "tenantId", "targetCampaignId" INTO target_tenant, target_campaign
      FROM "EstimationRun" WHERE "id" = NEW."runId";
    IF target_tenant IS DISTINCT FROM proposal_tenant OR target_campaign IS DISTINCT FROM proposal_campaign THEN
      RAISE EXCEPTION 'JointPurchaseProposalEstimationLink: la ejecución no es del sindicato y la campaña del borrador';
    END IF;
  END IF;
  IF NEW."jobId" IS NOT NULL THEN
    SELECT "tenantId", "targetCampaignId" INTO target_tenant, target_campaign
      FROM "EstimationJob" WHERE "id" = NEW."jobId";
    IF target_tenant IS DISTINCT FROM proposal_tenant OR target_campaign IS DISTINCT FROM proposal_campaign THEN
      RAISE EXCEPTION 'JointPurchaseProposalEstimationLink: el trabajo no es del sindicato y la campaña del borrador';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_proposal_estimation_link_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "JointPurchaseProposalEstimationLink"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_proposal_estimation_link_guard"();

-- E3 §6: la selección es del sindicato del borrador, no se borra y cada
-- cambio avanza la revisión en uno (control optimista).
CREATE FUNCTION "joint_purchase_proposal_selection_guard"() RETURNS trigger AS $$
DECLARE
  proposal_tenant TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'JointPurchaseProposalSelection no admite DELETE';
  END IF;
  SELECT "tenantId" INTO proposal_tenant FROM "JointPurchaseProposal" WHERE "id" = NEW."proposalId";
  IF proposal_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'JointPurchaseProposalSelection: borrador de otro sindicato';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."revision" <> 1 THEN
    RAISE EXCEPTION 'JointPurchaseProposalSelection: la primera revisión es 1';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."proposalId" <> OLD."proposalId" OR NEW."revision" <> OLD."revision" + 1) THEN
    RAISE EXCEPTION 'JointPurchaseProposalSelection: cada cambio avanza la revisión en uno';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_proposal_selection_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "JointPurchaseProposalSelection"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_proposal_selection_guard"();
