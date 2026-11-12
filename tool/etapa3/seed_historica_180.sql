-- SIEMBRA SINTÉTICA de una convocatoria terminada hace más de 180 días, sólo para el entorno aislado
-- (agro_demo de agro_et1_pg, 15434). No es un registro real ni evidencia de uso: permite comprobar
-- «Historial» (E2 §10.1) sin cambiar ningún reloj. Respeta todos los disparadores y CHECK: se crea en
-- DRAFT, se abre y se cierra en ese orden, con su consolidado; no desactiva ninguna regla. Idempotente.
-- Agricultor: agricultor14 («Néstor Copa (sintético)»), consentimiento CONV-1 (el vigente entonces).
\set call '\'e2a01800-0000-4000-8000-000000000180\''
\set part '\'e2a01800-0000-4000-8000-0000000001a0\''
\set tenant '\'017a3e08-e2b0-4b73-b2c4-61d8ab6709d7\''
\set campaign '\'b044b7c1-1d79-48d0-821d-e73e876e8a03\''
\set product '\'257fb438-8ad8-4572-97bc-92316c82b3ec\''
\set responsible '\'ec90de93-4a69-44af-9ea1-7b04c47b66c8\''
\set member '\'09382c8d-2fbf-45e7-9234-d5069e88f5bb\''
BEGIN;
SELECT NOT EXISTS (SELECT 1 FROM "JointPurchaseCall" WHERE id = :call) AS falta \gset
\if :falta
INSERT INTO "JointPurchaseCall" (id, "tenantId", "campaignId", name, status, "deadlineAt", "responsibleUserId", "createdByUserId", "createdAt", "updatedAt")
VALUES (:call, :tenant, :campaign, 'Convocatoria histórica sintética (sembrada para probar Historial)', 'DRAFT',
        '2026-03-20T12:00:00Z', :responsible, :responsible, '2026-03-01T12:00:00Z', '2026-03-01T12:00:00Z');
INSERT INTO "JointPurchaseCallProduct" ("callId", position, "tenantId", "productId", "baseUnit") VALUES (:call, 0, :tenant, :product, 'ML');
INSERT INTO "JointPurchaseCallEvent" (id, "callId", at, kind, "actorUserId", detail)
VALUES (gen_random_uuid(), :call, '2026-03-01T12:00:00Z', 'CREATED', :responsible, 'Borrador creado (siembra sintética).');
UPDATE "JointPurchaseCall" SET status = 'OPEN', "openedAt" = '2026-03-02T12:00:00Z', "openedByUserId" = :responsible, "updatedAt" = '2026-03-02T12:00:00Z' WHERE id = :call;
INSERT INTO "JointPurchaseCallAccess" ("callId", "userId", "grant", "grantedAt") VALUES (:call, :responsible, 'PARTICIPANTS', '2026-03-02T12:00:00Z');
INSERT INTO "JointPurchaseCallEvent" (id, "callId", at, kind, "actorUserId", detail)
VALUES (gen_random_uuid(), :call, '2026-03-02T12:00:00Z', 'OPENED', :responsible, 'Convocatoria abierta (siembra sintética).');
INSERT INTO "JointPurchaseParticipation" (id, "callId", "tenantId", "memberId", status, "consentVersion", "consentAcceptedAt", "consentReceivedAt", "lastSequence", "lastOperationId", "acceptedAt", "createdAt", "updatedAt")
VALUES (:part, :call, :tenant, :member, 'ACTIVE', 'CONV-1', '2026-03-05T12:00:00Z', '2026-03-05T12:00:05Z', 1, gen_random_uuid(), '2026-03-05T12:00:05Z', '2026-03-05T12:00:05Z', '2026-03-05T12:00:05Z');
INSERT INTO "JointPurchaseParticipationLine" ("participationId", "productId", "baseUnit", "quantityBase") VALUES (:part, :product, 'ML', 10000);
UPDATE "JointPurchaseCall" SET status = 'CLOSED', "closedAt" = '2026-03-20T12:00:30Z', "updatedAt" = '2026-03-20T12:00:30Z' WHERE id = :call;
INSERT INTO "JointPurchaseCallClosing" ("callId", mode, "cutoffAt", "closedAt", "closedByUserId", "participantCount")
VALUES (:call, 'AUTOMATIC', '2026-03-20T12:00:00Z', '2026-03-20T12:00:30Z', NULL, 1);
INSERT INTO "JointPurchaseCallClosingLine" ("callId", "productId", "baseUnit", "totalQuantityBase", "participantCount") VALUES (:call, :product, 'ML', 10000, 1);
INSERT INTO "JointPurchaseCallClosingParticipant" ("callId", "participationId", "memberId", "acceptedAt") VALUES (:call, :part, :member, '2026-03-05T12:00:05Z');
INSERT INTO "JointPurchaseCallClosingParticipantLine" ("callId", "participationId", "productId", "quantityBase") VALUES (:call, :part, :product, 10000);
INSERT INTO "JointPurchaseCallEvent" (id, "callId", at, kind, "actorUserId", detail)
VALUES (gen_random_uuid(), :call, '2026-03-20T12:00:30Z', 'CLOSED', NULL, 'Cierre automático (siembra sintética).');
\endif
COMMIT;
SELECT name, status, "closedAt" FROM "JointPurchaseCall" WHERE id = :call;
