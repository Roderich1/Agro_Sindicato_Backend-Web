-- F12-EST-05 (#178): titularidad del trabajo al registrar su ejecución.
--
-- Aditiva: no reescribe 20261101233651_f12_est_01_estimation. `jobId` único
-- ya impide dos ejecuciones por trabajo; esto impide además que un trabajador
-- que perdió el trabajo (su plazo venció, o otro lo retomó con un intento
-- nuevo) registre la ejecución en lugar del titular vigente.
--
-- - `jobAttempt` es el intento que produjo la ejecución: debe ser el intento
--   vigente del trabajo (`EstimationJob.attempts`) al insertarla.
-- - Salvo `RETRIES_EXHAUSTED`, el plazo del trabajo no ha vencido según la
--   hora real (`clock_timestamp()`, no la del inicio de la transacción).
--   `RETRIES_EXHAUSTED` lo registra quien encuentra el trabajo con los
--   intentos agotados y el plazo vencido; la guarda existente exige además
--   que los intentos estén agotados.
-- La columna es anulable sólo para ser aditiva: la guarda la exige en toda
-- ejecución nueva. Las tablas F12 no tienen filas fuera de entornos sintéticos.

-- AlterTable
ALTER TABLE "EstimationRun" ADD COLUMN "jobAttempt" INTEGER;

CREATE FUNCTION "estimation_run_ownership_guard"() RETURNS trigger AS $$
DECLARE
  job RECORD;
BEGIN
  SELECT j."attempts", j."leaseExpiresAt" INTO job FROM "EstimationJob" j WHERE j."id" = NEW."jobId";
  IF NOT FOUND OR NEW."jobAttempt" IS NULL OR NEW."jobAttempt" <> job."attempts" THEN
    RAISE EXCEPTION 'EstimationRun: el intento no es el vigente del trabajo';
  END IF;
  IF NEW."failureCode" IS DISTINCT FROM 'RETRIES_EXHAUSTED'
     AND (job."leaseExpiresAt" IS NULL OR job."leaseExpiresAt" <= clock_timestamp()) THEN
    RAISE EXCEPTION 'EstimationRun: el plazo del trabajo venció';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "estimation_run_ownership_guard"
  BEFORE INSERT ON "EstimationRun"
  FOR EACH ROW EXECUTE FUNCTION "estimation_run_ownership_guard"();
