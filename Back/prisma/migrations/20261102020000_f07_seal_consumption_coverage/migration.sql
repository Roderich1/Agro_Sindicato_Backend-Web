-- F07 §5.3 (docs/architecture/F07_SEALED_HISTORY_CONTRACT.md), para F12
-- (#174, F12_EST_01_ESTIMATION_CONTRACT.md §3.1): cobertura de participación
-- del consumo de cada sellado NUEVO, escrita en la misma transacción que el
-- sellado e inmutable. Aditiva: crea un tipo, una tabla y disparadores; no
-- modifica ninguna fila. Los sellados anteriores quedan sin fila: su
-- cobertura de consumo es desconocida y no se reconstruye.

-- CreateEnum
CREATE TYPE "ConsumptionCoverageStatus" AS ENUM ('IDENTIFIED', 'POPULATION_MISMATCH');

-- CreateTable
CREATE TABLE "CollectiveSealConsumptionCoverage" (
    "sealId" UUID NOT NULL,
    "status" "ConsumptionCoverageStatus" NOT NULL,
    "linkedMembers" INTEGER,
    "membersInPublishedFigures" INTEGER,

    CONSTRAINT "CollectiveSealConsumptionCoverage_pkey" PRIMARY KEY ("sealId")
);

-- AddForeignKey
ALTER TABLE "CollectiveSealConsumptionCoverage" ADD CONSTRAINT "CollectiveSealConsumptionCoverage_sealId_fkey" FOREIGN KEY ("sealId") REFERENCES "CollectiveSeal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- IDENTIFIED lleva N de M con 0 <= N <= M; POPULATION_MISMATCH no lleva
-- ninguna fracción (algún Member de una cifra mostrada no estaba entre los
-- vinculados leídos).
ALTER TABLE "CollectiveSealConsumptionCoverage"
  ADD CONSTRAINT "CollectiveSealConsumptionCoverage_values" CHECK (
    (("status" = 'IDENTIFIED') = ("linkedMembers" IS NOT NULL))
    AND (("status" = 'IDENTIFIED') = ("membersInPublishedFigures" IS NOT NULL))
    AND ("linkedMembers" IS NULL OR "linkedMembers" >= 0)
    AND ("membersInPublishedFigures" IS NULL
         OR ("membersInPublishedFigures" >= 0 AND "membersInPublishedFigures" <= "linkedMembers"))
  );

-- Se escribe en la transacción que crea su sellado; M es el mismo
-- `linkedMembers` que guarda el sellado.
CREATE FUNCTION "collective_seal_consumption_coverage_insert_guard"() RETURNS trigger AS $$
DECLARE
  seal RECORD;
BEGIN
  SELECT x."linkedMembers", x.xmin AS created_by INTO seal FROM "CollectiveSeal" x WHERE x."id" = NEW."sealId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CollectiveSealConsumptionCoverage: el sellado no existe';
  END IF;
  IF seal.created_by IS DISTINCT FROM pg_current_xact_id()::xid THEN
    RAISE EXCEPTION 'CollectiveSealConsumptionCoverage: sólo se escribe con su sellado';
  END IF;
  IF NEW."status" = 'IDENTIFIED' AND NEW."linkedMembers" IS DISTINCT FROM seal."linkedMembers" THEN
    RAISE EXCEPTION 'CollectiveSealConsumptionCoverage: M no es el de su sellado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_seal_consumption_coverage_insert_guard"
  BEFORE INSERT ON "CollectiveSealConsumptionCoverage"
  FOR EACH ROW EXECUTE FUNCTION "collective_seal_consumption_coverage_insert_guard"();

CREATE FUNCTION "collective_seal_consumption_coverage_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CollectiveSealConsumptionCoverage es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collective_seal_consumption_coverage_guard"
  BEFORE UPDATE OR DELETE ON "CollectiveSealConsumptionCoverage"
  FOR EACH ROW EXECUTE FUNCTION "collective_seal_consumption_coverage_guard"();
CREATE TRIGGER "collective_seal_consumption_coverage_truncate_guard"
  BEFORE TRUNCATE ON "CollectiveSealConsumptionCoverage"
  FOR EACH STATEMENT EXECUTE FUNCTION "collective_seal_consumption_coverage_guard"();

-- Todo sellado creado desde esta migración lleva su cobertura de consumo: se
-- comprueba al confirmar la transacción. Los sellados anteriores no cambian.
CREATE FUNCTION "collective_seal_requires_consumption_coverage"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "CollectiveSealConsumptionCoverage" c WHERE c."sealId" = NEW."id") THEN
    RAISE EXCEPTION 'CollectiveSeal: un sellado nuevo exige su cobertura de consumo';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "collective_seal_requires_consumption_coverage"
  AFTER INSERT ON "CollectiveSeal"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "collective_seal_requires_consumption_coverage"();
