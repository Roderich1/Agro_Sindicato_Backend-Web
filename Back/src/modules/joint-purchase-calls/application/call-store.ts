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
