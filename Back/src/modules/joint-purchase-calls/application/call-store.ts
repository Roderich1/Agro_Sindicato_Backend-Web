import { Prisma } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

/** Lock waits count against the interactive transaction's time. */
export const CALL_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * Openings of a tenant are serialised (E2-D3), together with the partial
 * unique index on open products.
 */
export async function lockTenantCalls(tx: Tx, tenantId: string): Promise<void> {
  const key = `joint-purchase-calls:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * E3-P2: the origin of a call reads the draft's saved selection under the
 * same lock as the E3 selection writes (E3-D3, key `e3-proposal:<id>`), so the
 * recorded revision is the one in force when the call is created.
 */
export async function lockProposalSelection(tx: Tx, proposalId: string): Promise<void> {
  const key = `e3-proposal:${proposalId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * E2-D12: every write on a call (open, cancel, close, a farmer operation)
 * takes the call row with `FOR UPDATE` first. Returns false when the call
 * does not exist in that tenant (indistinguishable from another tenant's).
 */
export async function lockCallRow(tx: Tx, tenantId: string, callId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "JointPurchaseCall"
    WHERE "id" = ${callId}::uuid AND "tenantId" = ${tenantId}
    FOR UPDATE`;
  return rows.length === 1;
}

export const ACCESS_PARTICIPANTS = "PARTICIPANTS";
/** E2-P3 (§10.2): edit the draft, open, cancel and close by hand. */
export const ACCESS_MANAGE = "MANAGE";
export const CALL_GRANTS = [ACCESS_PARTICIPANTS, ACCESS_MANAGE] as const;
export type CallGrant = (typeof CALL_GRANTS)[number];
export const ENTITY_NAME = "JointPurchaseCall";

/** E4 (2026-11-13): the migration that retired the view and substitution permissions. */
export const E4_MIGRATION = "20261113120000_e4_acceso_rol_sin_k";

let retiredAtCache: Date | null = null;

/**
 * E4 §3.1–§3.2: when the view permissions (`PARTICIPANTS`) and «Sustituir
 * responsable» stopped being used IN THIS ENVIRONMENT: the moment its
 * migration finished (`_prisma_migrations`), never a date written by hand.
 * Read once per process.
 */
export async function permissionsRetiredAt(db: Pick<Prisma.TransactionClient, "$queryRaw">): Promise<Date> {
  if (retiredAtCache) return retiredAtCache;
  const rows = await db.$queryRaw<{ finished_at: Date | null }[]>`
    SELECT "finished_at" FROM "_prisma_migrations"
    WHERE "migration_name" = ${E4_MIGRATION} AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    ORDER BY "finished_at" ASC LIMIT 1`;
  const finished = rows[0]?.finished_at;
  if (!finished) throw new Error(`Migration ${E4_MIGRATION} is not applied`);
  retiredAtCache = finished;
  return finished;
}

/** AAAA-MM-DD (UTC) of an instant. */
export function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}
