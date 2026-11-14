-- E2 §10 (decisiones E2-P2 y E2-P3 del 2026-11-11): colaboradores por
-- convocatoria con permisos PARTICIPANTS y MANAGE, su registro sólo de
-- inserción y los eventos del historial. Migración aditiva: ninguna fila
-- existente cambia de significado; el permiso del responsable que el sistema
-- creó al abrir queda con "grantedByUserId" nulo.

-- CreateEnum
CREATE TYPE "JointPurchaseCallAccessAction" AS ENUM ('GRANTED', 'REVOKED');

-- AlterEnum (PostgreSQL >= 12: dos valores en la misma migración, sin usarlos en ella)
ALTER TYPE "JointPurchaseCallEventKind" ADD VALUE 'ACCESS_GRANTED';
ALTER TYPE "JointPurchaseCallEventKind" ADD VALUE 'ACCESS_REVOKED';

-- AlterTable
ALTER TABLE "JointPurchaseCallAccess" ADD COLUMN     "grantedByUserId" TEXT;

-- CreateTable
CREATE TABLE "JointPurchaseCallAccessEvent" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "grant" VARCHAR(16) NOT NULL,
    "action" "JointPurchaseCallAccessAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JointPurchaseCallAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JointPurchaseCallAccessEvent_callId_at_idx" ON "JointPurchaseCallAccessEvent"("callId", "at");

-- CreateIndex
CREATE INDEX "JointPurchaseCallAccessEvent_callId_userId_grant_idx" ON "JointPurchaseCallAccessEvent"("callId", "userId", "grant");

-- AddForeignKey
ALTER TABLE "JointPurchaseCallAccess" ADD CONSTRAINT "JointPurchaseCallAccess_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallAccessEvent" ADD CONSTRAINT "JointPurchaseCallAccessEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "JointPurchaseCall"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallAccessEvent" ADD CONSTRAINT "JointPurchaseCallAccessEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointPurchaseCallAccessEvent" ADD CONSTRAINT "JointPurchaseCallAccessEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- §10.2 (a mano): dos permisos cerrados.
ALTER TABLE "JointPurchaseCallAccess"
  DROP CONSTRAINT "JointPurchaseCallAccess_grant",
  ADD CONSTRAINT "JointPurchaseCallAccess_grant" CHECK ("grant" IN ('PARTICIPANTS', 'MANAGE'));

ALTER TABLE "JointPurchaseCallAccessEvent"
  ADD CONSTRAINT "JointPurchaseCallAccessEvent_grant" CHECK ("grant" IN ('PARTICIPANTS', 'MANAGE'));

-- §10.2: el permiso del responsable que crea el sistema al abrir
-- ("grantedByUserId" nulo, siempre PARTICIPANTS) no se revoca ni se cambia;
-- un permiso concedido no se modifica (revocar es borrar la fila, y la traza
-- queda en JointPurchaseCallAccessEvent). El ajuste es acotado: E2 no tenía
-- disparadores sobre esta tabla y nada de lo anterior borraba filas.
CREATE FUNCTION "joint_purchase_call_access_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess no admite UPDATE';
  END IF;
  IF TG_OP = 'DELETE' AND OLD."grantedByUserId" IS NULL THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: el permiso del responsable no se revoca';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."grantedByUserId" IS NULL AND NEW."grant" <> 'PARTICIPANTS' THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: el sistema sólo crea PARTICIPANTS para el responsable';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."grantedByUserId" IS NOT NULL AND (
    NEW."grantedByUserId" = NEW."userId"
    OR NOT EXISTS (
      SELECT 1 FROM "JointPurchaseCall" c
      JOIN "User" holder ON holder."id" = NEW."userId" AND holder."tenantId" = c."tenantId"
      WHERE c."id" = NEW."callId" AND c."responsibleUserId" = NEW."grantedByUserId" AND c."responsibleUserId" <> NEW."userId"
    )
  ) THEN
    RAISE EXCEPTION 'JointPurchaseCallAccess: sólo el responsable concede, a otro usuario del mismo tenant';
  END IF;
  RETURN (CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "joint_purchase_call_access_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "JointPurchaseCallAccess"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_access_guard"();

-- El registro de concesiones y revocaciones es sólo de inserción.
CREATE TRIGGER "joint_purchase_call_access_event_guard"
  BEFORE UPDATE OR DELETE ON "JointPurchaseCallAccessEvent"
  FOR EACH ROW EXECUTE FUNCTION "joint_purchase_call_immutable_guard"();
