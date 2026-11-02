-- F12-EST-01 (#174, docs/architecture/F12_EST_01_ESTIMATION_CONTRACT.md §6):
-- modelo de datos de la estimación del consumo (INT-09, DAT-18, DAT-19), con
-- las decisiones EST-D-02 (temporadas), EST-D-03 (fuente sellada), EST-D-04
-- (trabajos por lotes) y EST-D-09 (sin cobertura sin fuente).
-- Aditiva: crea tipos, tablas, índices, restricciones y disparadores nuevos;
-- no modifica ninguna tabla existente ni DemandForecast, que no se reutiliza.

-- CreateEnum
CREATE TYPE "SeriesPointKind" AS ENUM ('VERIFIED_CONSUMPTION', 'NO_RECORD', 'HIDDEN');

-- CreateEnum
CREATE TYPE "EstimationRunOutcome" AS ENUM ('CALCULATED', 'FAILED');

-- CreateEnum
CREATE TYPE "EstimationResultStatus" AS ENUM ('ESTIMATED', 'INSUFFICIENT_DATA', 'INCOMPATIBLE_DATA', 'CALCULATION_FAILED');

-- CreateEnum
CREATE TYPE "EstimationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'NOT_EXECUTED');

-- CreateTable
CREATE TABLE "ComparabilitySeason" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "definition" VARCHAR(500) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByRole" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparabilitySeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSeasonClassification" (
    "campaignId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seasonId" UUID NOT NULL,
    "classifiedByUserId" TEXT NOT NULL,
    "classifiedByRole" "UserRole" NOT NULL,
    "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSeasonClassification_pkey" PRIMARY KEY ("campaignId")
);

-- CreateTable
CREATE TABLE "ConsumptionSeries" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "seasonId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "previousSeriesId" UUID,
    "sourceHash" CHAR(64) NOT NULL,
    "sources" JSONB NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumptionSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesPoint" (
    "seriesId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "SeriesPointKind" NOT NULL,
    "quantityBase" BIGINT,
    "sourceSealId" UUID,
    "sourceReleaseId" UUID,

    CONSTRAINT "SeriesPoint_pkey" PRIMARY KEY ("seriesId","position")
);

-- CreateTable
CREATE TABLE "EstimationJob" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByRole" "UserRole" NOT NULL,
    "targetCampaignId" TEXT NOT NULL,
    "productRefs" JSONB,
    "status" "EstimationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "stopCode" VARCHAR(48),

    CONSTRAINT "EstimationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimationRun" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" UUID NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByRole" "UserRole" NOT NULL,
    "targetCampaignId" TEXT NOT NULL,
    "seasonId" UUID NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "method" VARCHAR(32) NOT NULL,
    "methodVersion" VARCHAR(32) NOT NULL,
    "parameters" JSONB NOT NULL,
    "horizon" INTEGER NOT NULL,
    "disclosureMode" VARCHAR(32) NOT NULL,
    "policy" VARCHAR(16) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "outcome" "EstimationRunOutcome" NOT NULL,
    "failureCode" VARCHAR(48),
    "previousRunId" UUID,
    "contentHash" CHAR(64) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimationResult" (
    "runId" UUID NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "seriesId" UUID,
    "status" "EstimationResultStatus" NOT NULL,
    "reasonCode" VARCHAR(48),
    "estimateBase" DECIMAL(30,6),
    "naiveBase" BIGINT,
    "alpha" DECIMAL(3,2),
    "fitInformative" BOOLEAN,
    "fitCriterion" DECIMAL(38,6),
    "spanFirstPosition" INTEGER,
    "spanLastPosition" INTEGER,
    "exclusions" JSONB NOT NULL,
    "validations" JSONB NOT NULL,
    "metrics" JSONB,

    CONSTRAINT "EstimationResult_pkey" PRIMARY KEY ("runId","canonicalProductId","baseUnit")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComparabilitySeason_tenantId_key_key" ON "ComparabilitySeason"("tenantId", "key");

-- CreateIndex
CREATE INDEX "CampaignSeasonClassification_tenantId_seasonId_idx" ON "CampaignSeasonClassification"("tenantId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumptionSeries_scope_version_key" ON "ConsumptionSeries"("tenantId", "canonicalProductId", "baseUnit", "seasonId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumptionSeries_previousSeriesId_key" ON "ConsumptionSeries"("previousSeriesId");

-- CreateIndex
CREATE INDEX "SeriesPoint_sourceReleaseId_idx" ON "SeriesPoint"("sourceReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesPoint_seriesId_campaignId_key" ON "SeriesPoint"("seriesId", "campaignId");

-- CreateIndex
CREATE INDEX "EstimationJob_status_enqueuedAt_idx" ON "EstimationJob"("status", "enqueuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EstimationJob_tenantId_requestId_key" ON "EstimationJob"("tenantId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimationRun_jobId_key" ON "EstimationRun"("jobId");

-- CreateIndex
CREATE INDEX "EstimationRun_tenantId_targetCampaignId_generatedAt_idx" ON "EstimationRun"("tenantId", "targetCampaignId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EstimationRun_previousRunId_key" ON "EstimationRun"("previousRunId");

-- CreateIndex
CREATE INDEX "EstimationResult_seriesId_idx" ON "EstimationResult"("seriesId");

-- AddForeignKey
ALTER TABLE "ComparabilitySeason" ADD CONSTRAINT "ComparabilitySeason_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ComparabilitySeason" ADD CONSTRAINT "ComparabilitySeason_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CampaignSeasonClassification" ADD CONSTRAINT "CampaignSeasonClassification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CampaignSeasonClassification" ADD CONSTRAINT "CampaignSeasonClassification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CampaignSeasonClassification" ADD CONSTRAINT "CampaignSeasonClassification_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ComparabilitySeason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CampaignSeasonClassification" ADD CONSTRAINT "CampaignSeasonClassification_classifiedByUserId_fkey" FOREIGN KEY ("classifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsumptionSeries" ADD CONSTRAINT "ConsumptionSeries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsumptionSeries" ADD CONSTRAINT "ConsumptionSeries_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsumptionSeries" ADD CONSTRAINT "ConsumptionSeries_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ComparabilitySeason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsumptionSeries" ADD CONSTRAINT "ConsumptionSeries_previousSeriesId_fkey" FOREIGN KEY ("previousSeriesId") REFERENCES "ConsumptionSeries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeriesPoint" ADD CONSTRAINT "SeriesPoint_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ConsumptionSeries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeriesPoint" ADD CONSTRAINT "SeriesPoint_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeriesPoint" ADD CONSTRAINT "SeriesPoint_sourceSealId_fkey" FOREIGN KEY ("sourceSealId") REFERENCES "CollectiveSeal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeriesPoint" ADD CONSTRAINT "SeriesPoint_sourceReleaseId_fkey" FOREIGN KEY ("sourceReleaseId") REFERENCES "CollectiveRelease"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationJob" ADD CONSTRAINT "EstimationJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationJob" ADD CONSTRAINT "EstimationJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationJob" ADD CONSTRAINT "EstimationJob_targetCampaignId_fkey" FOREIGN KEY ("targetCampaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "EstimationJob"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_targetCampaignId_fkey" FOREIGN KEY ("targetCampaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ComparabilitySeason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_previousRunId_fkey" FOREIGN KEY ("previousRunId") REFERENCES "EstimationRun"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationResult" ADD CONSTRAINT "EstimationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EstimationRun"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationResult" ADD CONSTRAINT "EstimationResult_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationResult" ADD CONSTRAINT "EstimationResult_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ConsumptionSeries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- Forma de cada fila (contrato §6.2). Ninguna tabla tiene columna de vigencia
-- (se deriva al consultar, §8) ni campos de aprobación manual (§7).

-- Una sola cadena de ejecuciones por campaña objetivo: sólo una sin anterior
-- (índice parcial, sólo en SQL, como ProductCanonicalAssociation).
CREATE UNIQUE INDEX "EstimationRun_one_root_per_target" ON "EstimationRun"("tenantId", "targetCampaignId") WHERE "previousRunId" IS NULL;

-- EST-D-02: la temporada la define DIRECTIVA o ADMINISTRADOR con una clave
-- explícita, una definición y una duración nominal en días.
ALTER TABLE "ComparabilitySeason"
  ADD CONSTRAINT "ComparabilitySeason_values" CHECK (
    "key" <> '' AND "key" = btrim("key")
    AND btrim("definition") <> ''
    AND "durationDays" > 0
    AND "createdByRole" IN ('DIRECTIVA', 'ADMINISTRADOR')
  );

ALTER TABLE "CampaignSeasonClassification"
  ADD CONSTRAINT "CampaignSeasonClassification_values" CHECK (
    "classifiedByRole" IN ('DIRECTIVA', 'ADMINISTRADOR')
  );

-- Una serie nueva es la versión 1; una reconstrucción referencia la anterior.
ALTER TABLE "ConsumptionSeries"
  ADD CONSTRAINT "ConsumptionSeries_values" CHECK (
    "version" >= 1
    AND (("version" = 1) = ("previousSeriesId" IS NULL))
    AND "sourceHash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("sources") = 'array'
  );

-- RN-26: el consumo comprobado (incluido un cero) lleva cantidad, su
-- divulgación y su versión sellada (EST-D-03); la ausencia de registro y el
-- dato oculto no llevan cantidad ni divulgación, y nunca se guardan como cero.
-- Un dato oculto cita el sellado que lo oculta; una ausencia puede citar el
-- sellado consultado o ninguno (campaña sin sellar).
ALTER TABLE "SeriesPoint"
  ADD CONSTRAINT "SeriesPoint_values" CHECK (
    "position" >= 1
    AND (("kind" = 'VERIFIED_CONSUMPTION') = ("quantityBase" IS NOT NULL))
    AND ("quantityBase" IS NULL OR "quantityBase" >= 0)
    AND (("kind" = 'VERIFIED_CONSUMPTION') = ("sourceReleaseId" IS NOT NULL))
    AND ("kind" = 'NO_RECORD' OR "sourceSealId" IS NOT NULL)
  );

-- EST-D-04: estado operativo de un trabajo. Quién lo pidió (DIRECTIVA o
-- ADMINISTRADOR) y qué pidió no cambian; cada estado lleva sólo sus campos.
ALTER TABLE "EstimationJob"
  ADD CONSTRAINT "EstimationJob_values" CHECK (
    "requestedByRole" IN ('DIRECTIVA', 'ADMINISTRADOR')
    AND "requestHash" ~ '^[0-9a-f]{64}$'
    AND ("productRefs" IS NULL OR jsonb_typeof("productRefs") = 'array')
    AND "attempts" >= 0
    AND ("status" <> 'QUEUED' OR ("attempts" = 0 AND "startedAt" IS NULL AND "leaseExpiresAt" IS NULL AND "finishedAt" IS NULL AND "stopCode" IS NULL))
    AND ("status" <> 'RUNNING' OR ("attempts" >= 1 AND "startedAt" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND "finishedAt" IS NULL AND "stopCode" IS NULL))
    AND ("status" <> 'COMPLETED' OR ("attempts" >= 1 AND "finishedAt" IS NOT NULL AND "leaseExpiresAt" IS NULL AND "stopCode" IS NULL))
    AND ("status" <> 'NOT_EXECUTED' OR ("attempts" >= 1 AND "finishedAt" IS NOT NULL AND "leaseExpiresAt" IS NULL AND "stopCode" IS NOT NULL))
    AND ("stopCode" IS NULL OR "stopCode" IN ('POLICY_PENDING', 'REQUESTER_NOT_AUTHORIZED', 'TARGET_CAMPAIGN_NOT_ELIGIBLE', 'ATTEMPTS_EXHAUSTED'))
  );

-- Sólo DIRECTIVA o ADMINISTRADOR (ADR-003) generan; contrato v1, h = 1,
-- método SES con línea base naive, nunca con la política pendiente. Una
-- ejecución fallida lleva su código cerrado.
ALTER TABLE "EstimationRun"
  ADD CONSTRAINT "EstimationRun_values" CHECK (
    "contractVersion" = 1
    AND "horizon" = 1
    AND "method" = 'SES_NAIVE'
    AND "methodVersion" <> ''
    AND "requestedByRole" IN ('DIRECTIVA', 'ADMINISTRADOR')
    AND "disclosureMode" <> ''
    AND "disclosureMode" <> 'POLICY_PENDING'
    AND "threshold" > 0
    AND "contentHash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("parameters") = 'object'
    AND (("outcome" = 'FAILED') = ("failureCode" IS NOT NULL))
    AND ("failureCode" IS NULL OR "failureCode" IN ('CALCULATION_FAILED', 'SOURCES_UNAVAILABLE'))
  );

-- RN-28: sólo ESTIMATED lleva cifras (estimación, naive, α, ajuste y
-- métricas), una serie y un tramo de al menos tres campañas (3.12.4.8); los
-- demás estados llevan un motivo cerrado de su estado y ninguna cifra. La serie y el tramo
-- de un estado sin cifras son contexto (por ejemplo, un tramo de dos).
ALTER TABLE "EstimationResult"
  ADD CONSTRAINT "EstimationResult_values" CHECK (
    (("status" = 'ESTIMATED') = ("estimateBase" IS NOT NULL))
    AND (("status" = 'ESTIMATED') = ("naiveBase" IS NOT NULL))
    AND (("status" = 'ESTIMATED') = ("alpha" IS NOT NULL))
    AND (("status" = 'ESTIMATED') = ("fitInformative" IS NOT NULL))
    AND (("status" = 'ESTIMATED') = ("fitCriterion" IS NOT NULL))
    AND (("status" = 'ESTIMATED') = ("reasonCode" IS NULL))
    AND ("status" = 'ESTIMATED' OR "metrics" IS NULL)
    AND ("status" <> 'ESTIMATED' OR "seriesId" IS NOT NULL)
    AND ("reasonCode" IS NULL OR "reasonCode" IN (
      'LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED', 'SPAN_TOO_SHORT', 'NO_SERIES',
      'MIXED_UNITS', 'NO_COMPARABLE_CAMPAIGNS', 'COVERAGE_UNKNOWN', 'CALCULATION_ERROR'
    ))
    AND ("status" <> 'INSUFFICIENT_DATA'
         OR "reasonCode" = ANY (ARRAY['LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED', 'SPAN_TOO_SHORT', 'NO_SERIES']))
    AND ("status" <> 'INCOMPATIBLE_DATA'
         OR "reasonCode" = ANY (ARRAY['MIXED_UNITS', 'NO_COMPARABLE_CAMPAIGNS', 'COVERAGE_UNKNOWN']))
    AND ("status" <> 'CALCULATION_FAILED' OR "reasonCode" = 'CALCULATION_ERROR')
    AND ("estimateBase" IS NULL OR "estimateBase" >= 0)
    AND ("naiveBase" IS NULL OR "naiveBase" >= 0)
    AND ("alpha" IS NULL OR ("alpha" >= 0 AND "alpha" <= 1))
    AND ("fitCriterion" IS NULL OR "fitCriterion" >= 0)
    AND (("spanFirstPosition" IS NULL) = ("spanLastPosition" IS NULL))
    AND ("spanFirstPosition" IS NULL
         OR ("spanFirstPosition" >= 1 AND "spanLastPosition" >= "spanFirstPosition"))
    AND ("status" <> 'ESTIMATED'
         OR ("spanFirstPosition" IS NOT NULL AND "spanLastPosition" - "spanFirstPosition" >= 2))
    AND jsonb_typeof("exclusions") = 'array'
    AND jsonb_typeof("validations") = 'array'
    AND ("metrics" IS NULL OR jsonb_typeof("metrics") = 'object')
  );

-- Un producto es canónico si no es hoy la denominación de otro (F06).
CREATE FUNCTION "estimation_is_canonical"(tenant TEXT, product TEXT) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = product AND p."tenantId" = tenant)
     AND NOT EXISTS (
       SELECT 1 FROM "ProductCanonicalAssociation" a
       WHERE a."tenantId" = tenant AND a."productId" = product
         AND a."canonicalProductId" <> product AND a."validTo" IS NULL
     );
$$ LANGUAGE sql STABLE;

-- EST-D-13: la autorización es la existente por roles. Quien define una
-- temporada, clasifica una campaña o pide una estimación es Member activo, con
-- cuenta activa, del tenant y con el rol registrado.
CREATE FUNCTION "estimation_is_active_member"(tenant TEXT, account TEXT, member_role "UserRole") RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Member" m JOIN "User" u ON u."id" = m."userId"
    WHERE m."tenantId" = tenant AND m."userId" = account AND m."role" = member_role
      AND m."isActive" AND u."isActive"
  );
$$ LANGUAGE sql STABLE;

CREATE FUNCTION "comparability_season_insert_guard"() RETURNS trigger AS $$
BEGIN
  IF NOT "estimation_is_active_member"(NEW."tenantId", NEW."createdByUserId", NEW."createdByRole") THEN
    RAISE EXCEPTION 'ComparabilitySeason: quien la define no es miembro activo del tenant con ese rol';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "comparability_season_insert_guard"
  BEFORE INSERT ON "ComparabilitySeason"
  FOR EACH ROW EXECUTE FUNCTION "comparability_season_insert_guard"();

-- Una clasificación une una campaña y una temporada del mismo tenant.
CREATE FUNCTION "campaign_season_classification_insert_guard"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AgriculturalCampaign" c WHERE c."id" = NEW."campaignId" AND c."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'CampaignSeasonClassification: la campaña no es del tenant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "ComparabilitySeason" s WHERE s."id" = NEW."seasonId" AND s."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'CampaignSeasonClassification: la temporada no es del tenant';
  END IF;
  IF NOT "estimation_is_active_member"(NEW."tenantId", NEW."classifiedByUserId", NEW."classifiedByRole") THEN
    RAISE EXCEPTION 'CampaignSeasonClassification: quien clasifica no es miembro activo del tenant con ese rol';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "campaign_season_classification_insert_guard"
  BEFORE INSERT ON "CampaignSeasonClassification"
  FOR EACH ROW EXECUTE FUNCTION "campaign_season_classification_insert_guard"();

-- Una versión nueva de la serie sucede a la anterior del mismo ámbito; la
-- temporada es del tenant.
CREATE FUNCTION "consumption_series_insert_guard"() RETURNS trigger AS $$
BEGIN
  IF NOT "estimation_is_canonical"(NEW."tenantId", NEW."canonicalProductId") THEN
    RAISE EXCEPTION 'ConsumptionSeries: el producto no es canónico en el tenant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "ComparabilitySeason" s WHERE s."id" = NEW."seasonId" AND s."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'ConsumptionSeries: la temporada no es del tenant';
  END IF;
  IF NEW."previousSeriesId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ConsumptionSeries" s
    WHERE s."id" = NEW."previousSeriesId"
      AND s."tenantId" = NEW."tenantId"
      AND s."canonicalProductId" = NEW."canonicalProductId"
      AND s."baseUnit" = NEW."baseUnit"
      AND s."seasonId" = NEW."seasonId"
      AND s."version" = NEW."version" - 1
  ) THEN
    RAISE EXCEPTION 'ConsumptionSeries: la versión anterior no es la del mismo ámbito';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "consumption_series_insert_guard"
  BEFORE INSERT ON "ConsumptionSeries"
  FOR EACH ROW EXECUTE FUNCTION "consumption_series_insert_guard"();

-- Los puntos se escriben en la misma transacción que crea su serie, con una
-- campaña del tenant clasificada en la temporada de la serie (EST-D-02).
-- EST-D-03: un consumo comprobado es de una campaña CERRADA y copia
-- exactamente la cifra de la divulgación vigente de consumo de esa celda, que
-- es la entrada DISCLOSED y visible del sellado citado. Un dato oculto que
-- cita un sellado corresponde a una entrada no visible de ese sellado; una
-- ausencia que cita un sellado, a ninguna entrada de consumo de esa celda, y
-- una ausencia sin sellado sólo cabe en una campaña sin sellar.
CREATE FUNCTION "series_point_insert_guard"() RETURNS trigger AS $$
DECLARE
  series RECORD;
  entry RECORD;
BEGIN
  SELECT s."tenantId", s."canonicalProductId", s."baseUnit", s."seasonId", s.xmin AS created_by INTO series
  FROM "ConsumptionSeries" s WHERE s."id" = NEW."seriesId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SeriesPoint: la serie no existe';
  END IF;
  IF series.created_by IS DISTINCT FROM pg_current_xact_id()::xid THEN
    RAISE EXCEPTION 'SeriesPoint: una serie no admite puntos posteriores';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "AgriculturalCampaign" c WHERE c."id" = NEW."campaignId" AND c."tenantId" = series."tenantId"
  ) THEN
    RAISE EXCEPTION 'SeriesPoint: la campaña no es del tenant de la serie';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "CampaignSeasonClassification" k
    WHERE k."campaignId" = NEW."campaignId" AND k."seasonId" = series."seasonId"
  ) THEN
    RAISE EXCEPTION 'SeriesPoint: la campaña no está clasificada en la temporada de la serie';
  END IF;
  IF NEW."sourceSealId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CollectiveSeal" x WHERE x."id" = NEW."sourceSealId" AND x."tenantId" = series."tenantId" AND x."campaignId" = NEW."campaignId"
  ) THEN
    RAISE EXCEPTION 'SeriesPoint: el sellado no es de esa campaña y tenant';
  END IF;
  -- La forma (qué clase lleva cantidad, divulgación y sellado) la decide el
  -- CHECK; aquí sólo se validan las referencias de filas bien formadas.
  IF NEW."kind" = 'VERIFIED_CONSUMPTION' AND NEW."sourceReleaseId" IS NOT NULL AND NEW."sourceSealId" IS NOT NULL AND NEW."quantityBase" >= 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM "AgriculturalCampaign" c WHERE c."id" = NEW."campaignId" AND c."status" = 'CERRADA'
    ) THEN
      RAISE EXCEPTION 'SeriesPoint: un consumo comprobado exige una campaña cerrada';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "CollectiveRelease" r
      WHERE r."id" = NEW."sourceReleaseId"
        AND r."tenantId" = series."tenantId"
        AND r."campaignId" = NEW."campaignId"
        AND r."canonicalProductId" = series."canonicalProductId"
        AND r."baseUnit" = series."baseUnit"
        AND r."projectionType" = 'CONSUMPTION_TOTAL'
        AND r."withdrawnAt" IS NULL
        AND r."totalBase" = NEW."quantityBase"
    ) THEN
      RAISE EXCEPTION 'SeriesPoint: la divulgación no es el consumo vigente de esa celda con esa cifra';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "CollectiveSealEntry" e
      WHERE e."sealId" = NEW."sourceSealId"
        AND e."projectionType" = 'CONSUMPTION_TOTAL'
        AND e."canonicalProductId" = series."canonicalProductId"
        AND e."baseUnit" = series."baseUnit"
        AND e."status" = 'DISCLOSED'
        AND e."releaseId" = NEW."sourceReleaseId"
        AND e."visibilityWithdrawnAt" IS NULL
    ) THEN
      RAISE EXCEPTION 'SeriesPoint: la divulgación no es la entrada visible de ese sellado';
    END IF;
  END IF;
  IF NEW."kind" = 'NO_RECORD' AND NEW."sourceSealId" IS NULL AND EXISTS (
    SELECT 1 FROM "CollectiveSeal" x WHERE x."campaignId" = NEW."campaignId"
  ) THEN
    RAISE EXCEPTION 'SeriesPoint: la campaña está sellada; una ausencia cita su sellado';
  END IF;
  IF NEW."kind" IN ('HIDDEN', 'NO_RECORD') AND NEW."sourceSealId" IS NOT NULL THEN
    SELECT e."status", e."visibilityWithdrawnAt" INTO entry
    FROM "CollectiveSealEntry" e
    WHERE e."sealId" = NEW."sourceSealId"
      AND e."projectionType" = 'CONSUMPTION_TOTAL'
      AND e."canonicalProductId" = series."canonicalProductId"
      AND e."baseUnit" = series."baseUnit";
    IF NEW."kind" = 'HIDDEN' AND (NOT FOUND OR (entry."status" = 'DISCLOSED' AND entry."visibilityWithdrawnAt" IS NULL)) THEN
      RAISE EXCEPTION 'SeriesPoint: el sellado no oculta esa celda';
    END IF;
    IF NEW."kind" = 'NO_RECORD' AND FOUND THEN
      RAISE EXCEPTION 'SeriesPoint: el sellado tiene una entrada de consumo para esa celda';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "series_point_insert_guard"
  BEFORE INSERT ON "SeriesPoint"
  FOR EACH ROW EXECUTE FUNCTION "series_point_insert_guard"();

-- EST-D-04: un trabajo nace en cola, para una campaña objetivo del tenant ya
-- clasificada, pedido por un Member activo con rol DIRECTIVA o ADMINISTRADOR.
CREATE FUNCTION "estimation_job_insert_guard"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" <> 'QUEUED' THEN
    RAISE EXCEPTION 'EstimationJob: un trabajo nuevo empieza en cola';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "AgriculturalCampaign" c WHERE c."id" = NEW."targetCampaignId" AND c."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'EstimationJob: la campaña objetivo no es del tenant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "CampaignSeasonClassification" k WHERE k."campaignId" = NEW."targetCampaignId" AND k."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'EstimationJob: la campaña objetivo no está clasificada';
  END IF;
  IF NOT "estimation_is_active_member"(NEW."tenantId", NEW."requestedByUserId", NEW."requestedByRole") THEN
    RAISE EXCEPTION 'EstimationJob: quien lo pide no es miembro activo del tenant con ese rol';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "estimation_job_insert_guard"
  BEFORE INSERT ON "EstimationJob"
  FOR EACH ROW EXECUTE FUNCTION "estimation_job_insert_guard"();

-- Sólo cambia el estado operativo, hacia delante: QUEUED → RUNNING;
-- RUNNING → RUNNING (otro intento tras vencer el plazo, con más intentos),
-- COMPLETED o NOT_EXECUTED. Un estado final no cambia. COMPLETED exige su
-- ejecución, y un trabajo con ejecución sólo puede pasar a COMPLETED.
CREATE FUNCTION "estimation_job_update_guard"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."requestId" IS DISTINCT FROM OLD."requestId"
     OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
     OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
     OR NEW."requestedByRole" IS DISTINCT FROM OLD."requestedByRole"
     OR NEW."targetCampaignId" IS DISTINCT FROM OLD."targetCampaignId"
     OR NEW."productRefs" IS DISTINCT FROM OLD."productRefs"
     OR NEW."enqueuedAt" IS DISTINCT FROM OLD."enqueuedAt" THEN
    RAISE EXCEPTION 'EstimationJob: la petición no cambia';
  END IF;
  IF OLD."status" IN ('COMPLETED', 'NOT_EXECUTED') THEN
    RAISE EXCEPTION 'EstimationJob: un trabajo terminado no cambia';
  END IF;
  IF NOT ((OLD."status" = 'QUEUED' AND NEW."status" = 'RUNNING')
          OR (OLD."status" = 'RUNNING' AND NEW."status" IN ('RUNNING', 'COMPLETED', 'NOT_EXECUTED'))) THEN
    RAISE EXCEPTION 'EstimationJob: transición no admitida de % a %', OLD."status", NEW."status";
  END IF;
  IF NEW."attempts" < OLD."attempts" THEN
    RAISE EXCEPTION 'EstimationJob: los intentos no disminuyen';
  END IF;
  IF OLD."status" = 'RUNNING' AND NEW."status" = 'RUNNING' AND NEW."attempts" <= OLD."attempts" THEN
    RAISE EXCEPTION 'EstimationJob: otro intento aumenta los intentos';
  END IF;
  IF EXISTS (SELECT 1 FROM "EstimationRun" r WHERE r."jobId" = NEW."id") THEN
    IF NEW."status" <> 'COMPLETED' THEN
      RAISE EXCEPTION 'EstimationJob: un trabajo con ejecución sólo pasa a COMPLETED';
    END IF;
  ELSIF NEW."status" = 'COMPLETED' THEN
    RAISE EXCEPTION 'EstimationJob: un trabajo completado exige su ejecución';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "estimation_job_update_guard"
  BEFORE UPDATE ON "EstimationJob"
  FOR EACH ROW EXECUTE FUNCTION "estimation_job_update_guard"();

-- Una ejecución pertenece a un tenant y la produce un trabajo en curso con la
-- misma campaña objetivo y el mismo solicitante, que sigue siendo Member
-- activo con ese rol al registrarla. La campaña objetivo está clasificada en
-- la temporada de la ejecución, y la ejecución anterior que referencia es de
-- la misma campaña objetivo y no posterior.
CREATE FUNCTION "estimation_run_insert_guard"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AgriculturalCampaign" c WHERE c."id" = NEW."targetCampaignId" AND c."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'EstimationRun: la campaña objetivo no es del tenant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "EstimationJob" j
    WHERE j."id" = NEW."jobId" AND j."tenantId" = NEW."tenantId" AND j."status" = 'RUNNING'
      AND j."targetCampaignId" = NEW."targetCampaignId"
      AND j."requestedByUserId" = NEW."requestedByUserId" AND j."requestedByRole" = NEW."requestedByRole"
  ) THEN
    RAISE EXCEPTION 'EstimationRun: el trabajo no está en curso o no es la misma petición';
  END IF;
  IF NOT "estimation_is_active_member"(NEW."tenantId", NEW."requestedByUserId", NEW."requestedByRole") THEN
    RAISE EXCEPTION 'EstimationRun: quien la pidió no es miembro activo del tenant con ese rol';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "CampaignSeasonClassification" k
    WHERE k."campaignId" = NEW."targetCampaignId" AND k."seasonId" = NEW."seasonId" AND k."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'EstimationRun: la campaña objetivo no está clasificada en esa temporada';
  END IF;
  IF NEW."previousRunId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "EstimationRun" p
    WHERE p."id" = NEW."previousRunId"
      AND p."tenantId" = NEW."tenantId"
      AND p."targetCampaignId" = NEW."targetCampaignId"
      AND p."generatedAt" <= NEW."generatedAt"
  ) THEN
    RAISE EXCEPTION 'EstimationRun: la ejecución anterior no es de la misma campaña objetivo o es posterior';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "estimation_run_insert_guard"
  BEFORE INSERT ON "EstimationRun"
  FOR EACH ROW EXECUTE FUNCTION "estimation_run_insert_guard"();

-- Los resultados se escriben en la misma transacción que su ejecución; una
-- ejecución fallida no lleva cifras; el producto es canónico y la serie usada
-- es del mismo producto, unidad y temporada.
CREATE FUNCTION "estimation_result_insert_guard"() RETURNS trigger AS $$
DECLARE
  run RECORD;
BEGIN
  SELECT r."tenantId", r."outcome", r."seasonId", r.xmin AS created_by INTO run
  FROM "EstimationRun" r WHERE r."id" = NEW."runId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EstimationResult: la ejecución no existe';
  END IF;
  IF run.created_by IS DISTINCT FROM pg_current_xact_id()::xid THEN
    RAISE EXCEPTION 'EstimationResult: una ejecución no admite resultados posteriores';
  END IF;
  IF run."outcome" = 'FAILED' AND NEW."status" = 'ESTIMATED' THEN
    RAISE EXCEPTION 'EstimationResult: una ejecución fallida no lleva cifras';
  END IF;
  IF NOT "estimation_is_canonical"(run."tenantId", NEW."canonicalProductId") THEN
    RAISE EXCEPTION 'EstimationResult: el producto no es canónico en el tenant de la ejecución';
  END IF;
  IF NEW."seriesId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ConsumptionSeries" s
    WHERE s."id" = NEW."seriesId"
      AND s."tenantId" = run."tenantId"
      AND s."canonicalProductId" = NEW."canonicalProductId"
      AND s."baseUnit" = NEW."baseUnit"
      AND s."seasonId" = run."seasonId"
  ) THEN
    RAISE EXCEPTION 'EstimationResult: la serie no es la del mismo ámbito';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "estimation_result_insert_guard"
  BEFORE INSERT ON "EstimationResult"
  FOR EACH ROW EXECUTE FUNCTION "estimation_result_insert_guard"();

-- Inmutables: ni UPDATE, ni DELETE, ni TRUNCATE. EstimationJob sólo admite
-- UPDATE del estado operativo (arriba): tampoco se borra.
CREATE FUNCTION "estimation_immutable_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% es inmutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "estimation_job_delete_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EstimationJob no se borra';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "comparability_season_guard"
  BEFORE UPDATE OR DELETE ON "ComparabilitySeason"
  FOR EACH ROW EXECUTE FUNCTION "estimation_immutable_guard"();
CREATE TRIGGER "comparability_season_truncate_guard"
  BEFORE TRUNCATE ON "ComparabilitySeason"
  FOR EACH STATEMENT EXECUTE FUNCTION "estimation_immutable_guard"();

CREATE TRIGGER "campaign_season_classification_guard"
  BEFORE UPDATE OR DELETE ON "CampaignSeasonClassification"
  FOR EACH ROW EXECUTE FUNCTION "estimation_immutable_guard"();
CREATE TRIGGER "campaign_season_classification_truncate_guard"
  BEFORE TRUNCATE ON "CampaignSeasonClassification"
  FOR EACH STATEMENT EXECUTE FUNCTION "estimation_immutable_guard"();

CREATE TRIGGER "consumption_series_guard"
  BEFORE UPDATE OR DELETE ON "ConsumptionSeries"
  FOR EACH ROW EXECUTE FUNCTION "estimation_immutable_guard"();
CREATE TRIGGER "consumption_series_truncate_guard"
  BEFORE TRUNCATE ON "ConsumptionSeries"
  FOR EACH STATEMENT EXECUTE FUNCTION "estimation_immutable_guard"();

CREATE TRIGGER "series_point_guard"
  BEFORE UPDATE OR DELETE ON "SeriesPoint"
  FOR EACH ROW EXECUTE FUNCTION "estimation_immutable_guard"();
CREATE TRIGGER "series_point_truncate_guard"
  BEFORE TRUNCATE ON "SeriesPoint"
  FOR EACH STATEMENT EXECUTE FUNCTION "estimation_immutable_guard"();

CREATE TRIGGER "estimation_job_delete_guard"
  BEFORE DELETE ON "EstimationJob"
  FOR EACH ROW EXECUTE FUNCTION "estimation_job_delete_guard"();
CREATE TRIGGER "estimation_job_truncate_guard"
  BEFORE TRUNCATE ON "EstimationJob"
  FOR EACH STATEMENT EXECUTE FUNCTION "estimation_job_delete_guard"();

CREATE TRIGGER "estimation_run_guard"
  BEFORE UPDATE OR DELETE ON "EstimationRun"
  FOR EACH ROW EXECUTE FUNCTION "estimation_immutable_guard"();
CREATE TRIGGER "estimation_run_truncate_guard"
  BEFORE TRUNCATE ON "EstimationRun"
  FOR EACH STATEMENT EXECUTE FUNCTION "estimation_immutable_guard"();

CREATE TRIGGER "estimation_result_guard"
  BEFORE UPDATE OR DELETE ON "EstimationResult"
  FOR EACH ROW EXECUTE FUNCTION "estimation_immutable_guard"();
CREATE TRIGGER "estimation_result_truncate_guard"
  BEFORE TRUNCATE ON "EstimationResult"
  FOR EACH STATEMENT EXECUTE FUNCTION "estimation_immutable_guard"();
