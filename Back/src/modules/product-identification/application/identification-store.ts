import { Prisma } from "@prisma/client";

/** What the views read besides the request row itself. */
export const VIEW_INCLUDE = {
  product: { select: { id: true, name: true, unit: true, isActive: true } },
} satisfies Prisma.ProductIdentificationRequestInclude;

/**
 * Every write on identification requests of a tenant is serialised (E1 §4.2),
 * as the product associations are: no lost decision, no double creation.
 */
export async function lockTenant(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  const key = `product-identification:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Photo writes include storage calls inside the transaction (B2 can be slow). */
export const PHOTO_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;
