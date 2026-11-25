import type { UserRole } from "@prisma/client";
import { Cell, cellId } from "../../domain/consolidation";
import { CellDecision, PriorRelease } from "../../domain/disclosure-policy";
import { sealedCellStatus } from "../../domain/seal";
import { storedPolicy } from "../collective-config";
import {
  CollectiveSummary,
  HIDDEN,
  SealedVersion,
  SealRef,
  SummaryCell,
} from "./collective-summary.types";

/**
 * A sealed version served under its own policy (contract §5, E4 §5.3): no
 * decision, no write. Only cells still visible carry a figure and appear in
 * `releaseOf`; the coverage is the one stored at the seal.
 */
export function servedSealed(sealed: SealedVersion): {
  cells: SummaryCell[];
  coverage: NonNullable<CollectiveSummary["coverage"]>;
  releaseOf: Map<string, string>;
} {
  const releaseOf = new Map<string, string>();
  const cells: SummaryCell[] = sealed.entries.map((entry) => {
    const status = sealedCellStatus(
      {
        status: entry.status,
        contributors: entry.release?.contributorCount ?? null,
        visibilityWithdrawnAt: entry.visibilityWithdrawnAt,
      },
      sealed.threshold,
    );
    const base = {
      projection_type: entry.projectionType,
      product_ref: entry.canonicalProductId,
      product_name: entry.canonicalProduct.name,
      base_unit: entry.baseUnit,
      presentation_unit: entry.baseUnit === "ML" ? ("L" as const) : ("KG" as const),
    };
    if (status !== "DISCLOSED") return { ...base, status, ...HIDDEN };
    const release = entry.release!;
    const key = {
      projectionType: entry.projectionType,
      canonicalProductId: entry.canonicalProductId,
      baseUnit: entry.baseUnit,
    };
    releaseOf.set(cellId(key), entry.releaseId!);
    return {
      ...base,
      status,
      ...figure(release.totalBase, release.contributorCount, release.dataAsOf, release.releasedAt, entry.pendingChanges),
    };
  });
  return {
    cells: sortCells(cells),
    coverage: {
      linked_members: sealed.linkedMembers,
      members_with_contribution: sealed.membersWithContribution,
      suppressed_cells: sealed.suppressedCells || cells.some((cell) => cell.status !== "DISCLOSED"),
    },
    releaseOf,
  };
}

/** Lock of the summary decision of one campaign. */
export function summaryLockKey(tenantId: string, campaignId: string): string {
  return `collective:${tenantId}:${campaignId}`;
}

export function sortCells(cells: SummaryCell[]): SummaryCell[] {
  return cells.sort(
    (a, b) =>
      a.projection_type.localeCompare(b.projection_type) ||
      a.product_name.localeCompare(b.product_name) ||
      a.product_ref.localeCompare(b.product_ref) ||
      a.base_unit.localeCompare(b.base_unit),
  );
}

export function toSealRef(seal: {
  id: string;
  version: number;
  sealedAt: Date;
  sealedByRole: UserRole;
  sealedBy: { id: string; name: string };
  policy: string;
  threshold: number | null;
}): SealRef {
  return {
    seal_ref: seal.id,
    version: seal.version,
    sealed_at: seal.sealedAt.toISOString(),
    accepted_until: seal.sealedAt.toISOString(),
    sealed_by: { user_ref: seal.sealedBy.id, name: seal.sealedBy.name, role: seal.sealedByRole },
    policy: storedPolicy(seal.policy),
    threshold: seal.threshold,
  };
}

export function figure(
  total: bigint,
  contributors: number,
  dataAsOf: Date | null,
  releasedAt: Date,
  pendingChanges: boolean,
) {
  return {
    total_base: total.toString(),
    total_presentation: presentation(total),
    contributors,
    data_as_of: dataAsOf?.toISOString() ?? null,
    released_at: releasedAt.toISOString(),
    pending_changes: pendingChanges,
  };
}

/** Exact base -> L/KG (1000 base units each), without floats. */
export function presentation(totalBase: bigint): string {
  const whole = totalBase / 1000n;
  const fraction = (totalBase % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * F10-SEC-02 (#45): Members inside a published figure. Contributors of cells
 * without a figure are never counted.
 */
export function publishedMembers(
  output: readonly { decision: CellDecision; cell: Cell | null; prior: PriorRelease | null }[],
): Set<string> {
  const members = new Set<string>();
  for (const { decision, cell, prior } of output) {
    if (decision.kind === "RELEASE") cell!.members.forEach((member) => members.add(member));
    if (decision.kind === "SHOW_PRIOR") prior!.memberOf.forEach((member) => members.add(member));
  }
  return members;
}
