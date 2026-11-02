-- F12-EST-01 (#174, docs/architecture/F12_EST_01_ESTIMATION_CONTRACT.md §6):
-- modelo de datos de la estimación del consumo (INT-09, DAT-18, DAT-19).
-- Aditiva: crea tipos, tablas, índices, restricciones y disparadores nuevos;
-- no modifica ninguna tabla existente ni DemandForecast, que no se reutiliza.

-- CreateEnum
CREATE TYPE "SeriesPointKind" AS ENUM ('VERIFIED_CONSUMPTION', 'NO_RECORD', 'HIDDEN');

-- CreateEnum
CREATE TYPE "EstimationRunOutcome" AS ENUM ('CALCULATED', 'FAILED');

-- CreateEnum
CREATE TYPE "EstimationResultStatus" AS ENUM ('ESTIMATED', 'INSUFFICIENT_DATA', 'INCOMPATIBLE_DATA', 'CALCULATION_FAILED');

-- CreateTable
CREATE TABLE "ConsumptionSeries" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "baseUnit" "SyncV1BaseUnit" NOT NULL,
    "comparabilityKey" VARCHAR(64) NOT NULL,
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
    "coverageReported" INTEGER,
    "coverageExpected" INTEGER,
    "sourceSealId" UUID,
    "sourceReleaseId" UUID,

    CONSTRAINT "SeriesPoint_pkey" PRIMARY KEY ("seriesId","position")
);

-- CreateTable
CREATE TABLE "EstimationRun" (
    "id" UUID NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByRole" "UserRole" NOT NULL,
    "targetCampaignId" TEXT NOT NULL,
    "comparabilityKey" VARCHAR(64) NOT NULL,
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
CREATE UNIQUE INDEX "ConsumptionSeries_scope_version_key" ON "ConsumptionSeries"("tenantId", "canonicalProductId", "baseUnit", "comparabilityKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumptionSeries_previousSeriesId_key" ON "ConsumptionSeries"("previousSeriesId");

-- CreateIndex
CREATE INDEX "SeriesPoint_sourceReleaseId_idx" ON "SeriesPoint"("sourceReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesPoint_seriesId_campaignId_key" ON "SeriesPoint"("seriesId", "campaignId");

-- CreateIndex
CREATE INDEX "EstimationRun_tenantId_targetCampaignId_generatedAt_idx" ON "EstimationRun"("tenantId", "targetCampaignId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EstimationRun_tenantId_requestId_key" ON "EstimationRun"("tenantId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimationRun_previousRunId_key" ON "EstimationRun"("previousRunId");

-- CreateIndex
CREATE INDEX "EstimationResult_seriesId_idx" ON "EstimationResult"("seriesId");

-- AddForeignKey
ALTER TABLE "ConsumptionSeries" ADD CONSTRAINT "ConsumptionSeries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsumptionSeries" ADD CONSTRAINT "ConsumptionSeries_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

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
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EstimationRun" ADD CONSTRAINT "EstimationRun_targetCampaignId_fkey" FOREIGN KEY ("targetCampaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

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

-- Una serie nueva es la versión 1; una reconstrucción referencia la anterior.
ALTER TABLE "ConsumptionSeries"
  ADD CONSTRAINT "ConsumptionSeries_values" CHECK (
    "version" >= 1
    AND (("version" = 1) = ("previousSeriesId" IS NULL))
    AND "comparabilityKey" <> ''
    AND "sourceHash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("sources") = 'array'
  );

-- RN-26: el consumo comprobado (incluido un cero) lleva cantidad y su
-- divulgación; la ausencia de registro y el dato oculto no llevan cantidad ni
-- divulgación, y nunca se guardan como cero. La cobertura «N de M» va completa
-- o no va.
ALTER TABLE "SeriesPoint"
  ADD CONSTRAINT "SeriesPoint_values" CHECK (
    "position" >= 1
    AND (("kind" = 'VERIFIED_CONSUMPTION') = ("quantityBase" IS NOT NULL))
    AND ("quantityBase" IS NULL OR "quantityBase" >= 0)
    AND (("kind" = 'VERIFIED_CONSUMPTION') = ("sourceReleaseId" IS NOT NULL))
    AND (("coverageReported" IS NULL) = ("coverageExpected" IS NULL))
    AND ("coverageReported" IS NULL
         OR ("coverageReported" >= 0 AND "coverageExpected" >= "coverageReported"))
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
    AND "comparabilityKey" <> ''
    AND "disclosureMode" <> ''
    AND "disclosureMode" <> 'POLICY_PENDING'
    AND "threshold" > 0
    AND "requestHash" ~ '^[0-9a-f]{64}$'
    AND "contentHash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("parameters") = 'object'
    AND (("outcome" = 'FAILED') = ("failureCode" IS NOT NULL))
    AND ("failureCode" IS NULL OR "failureCode" IN ('CALCULATION_FAILED', 'SOURCES_UNAVAILABLE'))
  );

-- RN-28: sólo ESTIMATED lleva cifras (estimación, naive, α, ajuste y
-- métricas), una serie y un tramo de al menos tres campañas (3.12.4.8); los
-- demás estados llevan su motivo cerrado y ninguna cifra. La serie y el tramo
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

-- Una versión nueva de la serie sucede a la anterior del mismo ámbito.
CREATE FUNCTION "consumption_series_insert_guard"() RETURNS trigger AS $$
BEGIN
  IF NOT "estimation_is_canonical"(NEW."tenantId", NEW."canonicalProductId") THEN
    RAISE EXCEPTION 'ConsumptionSeries: el producto no es canónico en el tenant';
  END IF;
  IF NEW."previousSeriesId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ConsumptionSeries" s
    WHERE s."id" = NEW."previousSeriesId"
      AND s."tenantId" = NEW."tenantId"
      AND s."canonicalProductId" = NEW."canonicalProductId"
      AND s."baseUnit" = NEW."baseUnit"
      AND s."comparabilityKey" = NEW."comparabilityKey"
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
-- campaña del mismo tenant. Un consumo comprobado copia exactamente la cifra
-- de la divulgación vigente de consumo de esa celda; si cita un sellado, esa
-- divulgación es la entrada DISCLOSED y visible de ese sellado.
CREATE FUNCTION "series_point_insert_guard"() RETURNS trigger AS $$
DECLARE
  series RECORD;
BEGIN
  SELECT s."tenantId", s."canonicalProductId", s."baseUnit", s.xmin AS created_by INTO series
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
  -- La forma (qué clase lleva cantidad y divulgación) la decide el CHECK; aquí
  -- sólo se valida la divulgación de un consumo comprobado bien formado.
  IF NEW."kind" = 'VERIFIED_CONSUMPTION' AND NEW."sourceReleaseId" IS NOT NULL AND NEW."quantityBase" >= 0 AND NOT EXISTS (
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
  IF NEW."sourceSealId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CollectiveSeal" x WHERE x."id" = NEW."sourceSealId" AND x."tenantId" = series."tenantId" AND x."campaignId" = NEW."campaignId"
  ) THEN
    RAISE EXCEPTION 'SeriesPoint: el sellado no es de esa campaña y tenant';
  END IF;
  IF NEW."sourceSealId" IS NOT NULL AND NEW."sourceReleaseId" IS NOT NULL AND NOT EXISTS (
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "series_point_insert_guard"
  BEFORE INSERT ON "SeriesPoint"
  FOR EACH ROW EXECUTE FUNCTION "series_point_insert_guard"();

-- Una ejecución pertenece a un tenant: su campaña objetivo y quien la pidió
-- (Member activo con ese rol) son de ese tenant, y la ejecución anterior que
-- referencia es de la misma campaña objetivo y no posterior.
CREATE FUNCTION "estimation_run_insert_guard"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AgriculturalCampaign" c WHERE c."id" = NEW."targetCampaignId" AND c."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'EstimationRun: la campaña objetivo no es del tenant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Member" m
    WHERE m."userId" = NEW."requestedByUserId" AND m."tenantId" = NEW."tenantId"
      AND m."role" = NEW."requestedByRole" AND m."isActive"
  ) THEN
    RAISE EXCEPTION 'EstimationRun: quien la pidió no es miembro activo del tenant con ese rol';
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
-- es del mismo ámbito.
CREATE FUNCTION "estimation_result_insert_guard"() RETURNS trigger AS $$
DECLARE
  run RECORD;
BEGIN
  SELECT r."tenantId", r."outcome", r."comparabilityKey", r.xmin AS created_by INTO run
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
      AND s."comparabilityKey" = run."comparabilityKey"
  ) THEN
    RAISE EXCEPTION 'EstimationResult: la serie no es la del mismo ámbito';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "estimation_result_insert_guard"
  BEFORE INSERT ON "EstimationResult"
  FOR EACH ROW EXECUTE FUNCTION "estimation_result_insert_guard"();

-- Inmutables: ni UPDATE, ni DELETE, ni TRUNCATE.
CREATE FUNCTION "estimation_immutable_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% es inmutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

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
