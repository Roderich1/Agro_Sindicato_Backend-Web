import type { SyncV1BaseUnit, SyncV1ProjectionType } from "@prisma/client";

/** Largest total that downstream consumers can hold without loss (int64). */
export const MAX_TOTAL_BASE = 9223372036854775807n;

/**
 * An eligible contribution (F06 #21): `ACTIVE` with a quantity, from an active
 * Member and account of the tenant. CANCELLED, CONTESTED and NEVER_PUBLISHED
 * are never passed in.
 */
export interface EligibleContribution {
  contributionId: string;
  memberId: string;
  projectionType: SyncV1ProjectionType;
  productId: string;
  baseUnit: SyncV1BaseUnit;
  quantityBase: bigint;
  sequence: number;
  acceptedAt: Date | null;
}

/** Campaign × canonical product × type × base unit. */
export interface CellKey {
  projectionType: SyncV1ProjectionType;
  canonicalProductId: string;
  baseUnit: SyncV1BaseUnit;
}

export interface Cell extends CellKey {
  contributions: EligibleContribution[];
  /** Distinct Members: a Member with two aliases of one group counts once. */
  members: Set<string>;
  total: bigint;
  overflow: boolean;
  dataAsOf: Date | null;
}

export function cellId(key: CellKey): string {
  return `${key.projectionType}|${key.canonicalProductId}|${key.baseUnit}`;
}

/**
 * Groups contributions by their **current** canonical product. A product
 * without an active association is its own canonical. Units are part of the
 * key: ML and G are never added together, whatever the association says.
 * Totals are exact (BigInt); a total above int64 is flagged, never truncated.
 */
export function consolidate(
  contributions: readonly EligibleContribution[],
  canonicalOf: ReadonlyMap<string, string>,
): Cell[] {
  const cells = new Map<string, Cell>();
  for (const contribution of contributions) {
    const key: CellKey = {
      projectionType: contribution.projectionType,
      canonicalProductId:
        canonicalOf.get(contribution.productId) ?? contribution.productId,
      baseUnit: contribution.baseUnit,
    };
    const id = cellId(key);
    const cell =
      cells.get(id) ??
      ({ ...key, contributions: [], members: new Set(), total: 0n, overflow: false, dataAsOf: null } as Cell);
    cell.contributions.push(contribution);
    cell.members.add(contribution.memberId);
    cell.total += contribution.quantityBase;
    cell.overflow = cell.total > MAX_TOTAL_BASE;
    if (
      contribution.acceptedAt &&
      (!cell.dataAsOf || contribution.acceptedAt > cell.dataAsOf)
    ) {
      cell.dataAsOf = contribution.acceptedAt;
    }
    cells.set(id, cell);
  }
  return [...cells.values()].sort((a, b) => cellId(a).localeCompare(cellId(b)));
}
