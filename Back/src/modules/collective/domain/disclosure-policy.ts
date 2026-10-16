import type { Cell } from "./consolidation";

/**
 * Provisional threshold of F07-POL-01 (#107): distinct Members per cell. The
 * policy is NOT approved; this value only runs with synthetic data while
 * disclosure stays disabled for real figures (F06 contract §5).
 */
export const PROVISIONAL_THRESHOLD = 3;

/** Last disclosure of a cell and the contributions it was computed from. */
export interface PriorRelease {
  id: string;
  totalBase: bigint;
  contributorCount: number;
  dataAsOf: Date | null;
  releasedAt: Date;
  withdrawnAt: Date | null;
  /** contributionId → sequence at release time. */
  items: ReadonlyMap<string, number>;
  /** contributionId → Member (contributions are never reassigned). */
  memberOf: ReadonlyMap<string, string>;
}

export type CellDecision =
  /** Publish a new figure computed from the current contributions. */
  | { kind: "RELEASE" }
  /** Keep showing the prior figure; `pendingChanges` if fewer than k changed. */
  | { kind: "SHOW_PRIOR"; pendingChanges: boolean }
  /** No figure. `withdrawPrior` retracts a prior figure still shown. */
  | { kind: "SUPPRESS"; reason: "UNDER_THRESHOLD" | "REVISION"; withdrawPrior: boolean }
  | { kind: "OVERFLOW"; withdrawPrior: boolean };

/**
 * Disclosure rule of a cell (provisional F07-POL-01):
 *
 * 1. Threshold: a figure needs at least k distinct eligible Members. Below it
 *    the cell is suppressed (never shown as zero). An explicit zero counts as
 *    a contributor; a Member without contribution is unknown, not zero.
 * 2. Differencing between queries: two consecutive figures of a cell may only
 *    differ by the changes of at least k distinct Members (additions,
 *    replacements or removals). With fewer, the prior figure stays (stale but
 *    true for its date) — so the difference of two answers never isolates
 *    one contribution.
 * 3. Removals (cancellation, dispute, inactive Member or account, regrouping)
 *    withdraw the prior figure instead of keeping a value that includes a
 *    contribution that no longer counts, until rule 2 allows a new one. If
 *    the cell returns to exactly the released contributions, that same
 *    figure is published again.
 * 4. A total above int64 is never truncated: the cell shows OVERFLOW.
 */
export function decideCell(
  cell: Cell,
  prior: PriorRelease | null,
  threshold = PROVISIONAL_THRESHOLD,
): CellDecision {
  const priorShown = prior !== null && prior.withdrawnAt === null;
  if (prior === null) {
    if (cell.overflow) return { kind: "OVERFLOW", withdrawPrior: false };
    return cell.members.size >= threshold
      ? { kind: "RELEASE" }
      : { kind: "SUPPRESS", reason: "UNDER_THRESHOLD", withdrawPrior: false };
  }
  const changed = new Set<string>();
  const current = new Set<string>();
  for (const contribution of cell.contributions) {
    current.add(contribution.contributionId);
    if (prior.items.get(contribution.contributionId) !== contribution.sequence) {
      changed.add(contribution.memberId);
    }
  }
  let removed = false;
  for (const contributionId of prior.items.keys()) {
    if (current.has(contributionId)) continue;
    removed = true;
    const member = prior.memberOf.get(contributionId);
    if (member) changed.add(member);
  }
  if (changed.size === 0) {
    // Back to exactly the released state (e.g. a Member reactivated): the
    // same figure again reveals nothing new.
    if (priorShown) return { kind: "SHOW_PRIOR", pendingChanges: false };
    return cell.members.size >= threshold && !cell.overflow
      ? { kind: "RELEASE" }
      : { kind: "SUPPRESS", reason: "REVISION", withdrawPrior: false };
  }
  if (cell.overflow) return { kind: "OVERFLOW", withdrawPrior: priorShown };
  if (changed.size >= threshold && cell.members.size >= threshold) {
    return { kind: "RELEASE" };
  }
  if (removed || !priorShown) {
    return {
      kind: "SUPPRESS",
      reason: cell.members.size >= threshold ? "REVISION" : "UNDER_THRESHOLD",
      withdrawPrior: priorShown,
    };
  }
  return { kind: "SHOW_PRIOR", pendingChanges: true };
}
