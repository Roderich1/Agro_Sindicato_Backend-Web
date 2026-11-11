import type { SyncV1BaseUnit } from "@prisma/client";

export interface ClosingInputParticipation {
  id: string;
  memberId: string;
  status: "ACTIVE" | "WITHDRAWN";
  acceptedAt: Date;
  lines: { productId: string; quantityBase: bigint }[];
}

export interface ClosingProduct {
  productId: string;
  baseUnit: SyncV1BaseUnit;
}

export interface ClosingLine {
  productId: string;
  baseUnit: SyncV1BaseUnit;
  totalQuantityBase: bigint;
  participantCount: number;
}

export interface ClosingParticipant {
  participationId: string;
  memberId: string;
  acceptedAt: Date;
  lines: { productId: string; quantityBase: bigint }[];
}

export interface ClosingComputation {
  /** One per call product, in the call's order (zero when nobody asked for it). */
  lines: ClosingLine[];
  participants: ClosingParticipant[];
  /** Distinct persons (Members) with at least one line: each counted once (E2-D8). */
  participantCount: number;
}

/**
 * E2-D12/D13: the «Consolidado al cierre» from the participations as they
 * stand under the call's lock. A participation counts when it is ACTIVE, has
 * lines and was accepted at or before the cutoff (operations after the
 * deadline were already refused; the check only keeps the function honest).
 * Lines of products that are not in the call are ignored. A person is counted
 * once overall and once per product, however many products they asked for.
 * Pure: no clock, no database.
 */
export function computeClosing(
  products: readonly ClosingProduct[],
  participations: readonly ClosingInputParticipation[],
  cutoffAt: Date,
): ClosingComputation {
  const inCall = new Set(products.map((p) => p.productId));
  const totals = new Map<string, bigint>();
  const membersOf = new Map<string, Set<string>>();
  const persons = new Set<string>();
  const participants: ClosingParticipant[] = [];
  const ordered = [...participations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const participation of ordered) {
    if (participation.status !== "ACTIVE") continue;
    if (participation.acceptedAt.getTime() > cutoffAt.getTime()) continue;
    const lines = participation.lines
      .filter((line) => inCall.has(line.productId) && line.quantityBase > 0n)
      .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
    if (lines.length === 0) continue;
    persons.add(participation.memberId);
    for (const line of lines) {
      totals.set(line.productId, (totals.get(line.productId) ?? 0n) + line.quantityBase);
      const members = membersOf.get(line.productId) ?? new Set<string>();
      members.add(participation.memberId);
      membersOf.set(line.productId, members);
    }
    participants.push({
      participationId: participation.id,
      memberId: participation.memberId,
      acceptedAt: participation.acceptedAt,
      lines,
    });
  }
  return {
    lines: products.map((product) => ({
      productId: product.productId,
      baseUnit: product.baseUnit,
      totalQuantityBase: totals.get(product.productId) ?? 0n,
      participantCount: membersOf.get(product.productId)?.size ?? 0,
    })),
    participants,
    participantCount: persons.size,
  };
}
