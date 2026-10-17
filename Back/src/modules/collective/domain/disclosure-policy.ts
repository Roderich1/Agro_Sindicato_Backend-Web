import type { Cell } from "./consolidation";

/**
 * Provisional threshold of F07-POL-01 (#107): distinct Members per cell. The
 * policy is NOT approved; this value only runs with synthetic data while
 * disclosure stays disabled for real figures (F06 contract §5). A threshold of
 * k is not an anonymity guarantee: k − 1 contributors who share their values
 * can still deduce the remaining one.
 */
export const PROVISIONAL_THRESHOLD = 3;

/** One disclosure of a cell and the contributions it was computed from. */
export interface PriorRelease {
  id: string;
  totalBase: bigint;
  contributorCount: number;
  dataAsOf: Date | null;
  releasedAt: Date;
  withdrawnAt: Date | null;
  /** contributionId → quantity at release time (null: unknown, older row). */
  items: ReadonlyMap<string, bigint | null>;
  /** contributionId → Member (contributions are never reassigned). */
  memberOf: ReadonlyMap<string, string>;
}

export type CellDecision =
  /** Publish a new figure computed from the current contributions. */
  | { kind: "RELEASE" }
  /**
   * Keep showing the latest figure; `pendingChanges` unless the current values
   * provably equal it (changed, or not provable because an amount is unknown).
   */
  | { kind: "SHOW_PRIOR"; pendingChanges: boolean }
  /** No figure. `withdrawPrior` retracts a prior figure still shown. */
  | { kind: "SUPPRESS"; reason: "UNDER_THRESHOLD" | "REVISION"; withdrawPrior: boolean }
  | { kind: "OVERFLOW"; withdrawPrior: boolean };

/** Per-Member amount in the cell now. */
function currentAmounts(cell: Cell): Map<string, bigint> {
  const amounts = new Map<string, bigint>();
  for (const c of cell.contributions) {
    amounts.set(c.memberId, (amounts.get(c.memberId) ?? 0n) + c.quantityBase);
  }
  return amounts;
}

/** Per-Member amount in a disclosure; null when an amount is unknown. */
function releasedAmounts(release: PriorRelease): Map<string, bigint | null> {
  const amounts = new Map<string, bigint | null>();
  for (const [contributionId, quantity] of release.items) {
    const member = release.memberOf.get(contributionId);
    if (member === undefined) continue;
    const sum = amounts.has(member) ? amounts.get(member)! : 0n;
    amounts.set(member, sum === null || quantity === null ? null : sum + quantity);
  }
  return amounts;
}

/** How the cell now compares with one disclosure, Member by Member. */
interface Comparison {
  /** Members that joined, left, or whose known amount differs. */
  changed: number;
  /** Members in both whose released amount is unknown (row older than the quantity column). */
  unknown: number;
}

/**
 * Net changes between two states. A replacement with the same value, or a
 * change that went back to the released value, is not a change. An unknown
 * released amount is neither a change nor its absence: it is never rebuilt
 * from current values.
 */
function compare(now: ReadonlyMap<string, bigint>, then: ReadonlyMap<string, bigint | null>): Comparison {
  let changed = 0;
  let unknown = 0;
  for (const [member, amount] of now) {
    const before = then.get(member);
    if (before === undefined) changed++;
    else if (before === null) unknown++;
    else if (before !== amount) changed++;
  }
  for (const member of then.keys()) if (!now.has(member)) changed++;
  return { changed, unknown };
}

/** Provably the same state as the disclosure. */
function unchanged(c: Comparison): boolean {
  return c.changed === 0 && c.unknown === 0;
}

/**
 * Rule 2 against one disclosure: provably nothing changed, or at least k
 * Members provably changed. Unknown amounts prove neither, so they never help.
 */
function provablySafe(c: Comparison, threshold: number): boolean {
  return unchanged(c) || c.changed >= threshold;
}

/**
 * Disclosure rule of a cell (provisional F07-POL-01, reviewed under
 * F10-SEC-02 #45). `history` holds every earlier disclosure of the cell,
 * newest first, including withdrawn ones: a reader may have kept any of them.
 *
 * Threat considered: an authorised reader (Directiva/Administrador of the
 * tenant) who compares figures of a cell over time, or before and after a
 * regrouping, to learn one Member's amount or its change. Not covered:
 * collusion of k − 1 contributors, outside knowledge of individual values, and
 * the timing signals listed in the policy. It does not make data anonymous.
 *
 * 1. Threshold: a figure needs at least k distinct eligible Members. Below it
 *    the cell is suppressed (never shown as zero). An explicit zero counts as
 *    a contributor; a Member without contribution is unknown, not zero.
 * 2. Differences: a new figure may only be published if, against **every**
 *    earlier disclosure of the cell, either nothing changed (the same figure
 *    again) or at least k Members changed their **net** amount. Sequences do
 *    not count: a replacement with the same value is not a change. Both must
 *    be provable: an amount unknown in a disclosure written before the
 *    quantity column existed proves neither, so that cell keeps its figure
 *    (or stays without one) until k Members provably changed against it.
 * 3. Removals (cancellation, dispute, inactive Member or account, regrouping)
 *    withdraw the latest figure instead of keeping a value that includes a
 *    contribution that no longer counts, until rule 2 allows a new one.
 * 4. A total above int64 is never truncated: the cell shows OVERFLOW.
 */
export function decideCell(
  cell: Cell,
  history: readonly PriorRelease[],
  threshold = PROVISIONAL_THRESHOLD,
): CellDecision {
  const latest = history[0] ?? null;
  if (latest === null) {
    if (cell.overflow) return { kind: "OVERFLOW", withdrawPrior: false };
    return cell.members.size >= threshold
      ? { kind: "RELEASE" }
      : { kind: "SUPPRESS", reason: "UNDER_THRESHOLD", withdrawPrior: false };
  }
  const now = currentAmounts(cell);
  const latestShown = latest.withdrawnAt === null;
  const latestAmounts = releasedAmounts(latest);
  const vsLatest = compare(now, latestAmounts);
  const removed = [...latestAmounts.keys()].some((member) => !now.has(member));
  if (unchanged(vsLatest)) {
    // Exactly the latest disclosed state: the same figure reveals nothing new.
    if (latestShown) return { kind: "SHOW_PRIOR", pendingChanges: false };
    return cell.members.size >= threshold && !cell.overflow
      ? { kind: "RELEASE" }
      : { kind: "SUPPRESS", reason: "REVISION", withdrawPrior: false };
  }
  if (cell.overflow) return { kind: "OVERFLOW", withdrawPrior: latestShown };
  const safeAgainstHistory = history.every((release) =>
    provablySafe(compare(now, releasedAmounts(release)), threshold),
  );
  if (cell.members.size >= threshold && safeAgainstHistory) return { kind: "RELEASE" };
  if (removed || !latestShown) {
    return {
      kind: "SUPPRESS",
      reason: cell.members.size >= threshold ? "REVISION" : "UNDER_THRESHOLD",
      withdrawPrior: latestShown,
    };
  }
  return { kind: "SHOW_PRIOR", pendingChanges: true };
}

/**
 * Rule 2 across cell keys (F10-SEC-02 #45). A contribution can move to another
 * cell when the Directiva associates its product with a different canonical
 * product. The disclosures of the cell it came from stay known to the reader,
 * so the history of a cell also includes **every earlier disclosure of other
 * keys that shares a contribution with it** (`related`, newest first per key).
 *
 * A new figure is only allowed if, besides the cell's own history, it is
 * provably safe against each related disclosure and against the combination
 * of the latest disclosure of every key involved (a reader can add them up).
 * Otherwise the cell keeps its own earlier figure with pending changes, if it
 * still describes it, or shows no figure (REVISION). A figure of another key
 * is never shown under this one.
 */
export function decideCellWithRelated(
  cell: Cell,
  history: readonly PriorRelease[],
  related: readonly (readonly PriorRelease[])[],
  threshold = PROVISIONAL_THRESHOLD,
): CellDecision {
  const own = decideCell(cell, history, threshold);
  const foreign = related.filter((releases) => releases.length > 0);
  if (own.kind !== "RELEASE" || foreign.length === 0) return own;
  const now = currentAmounts(cell);
  // Latest disclosure of each key; a contribution in two of them counts once,
  // with the newest known amount.
  const latest = [history[0], ...foreign.map((releases) => releases[0])]
    .filter((release): release is PriorRelease => release !== undefined)
    .sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime());
  const combined: PriorRelease = {
    ...latest[0]!,
    items: new Map(latest.flatMap((release) => [...release.items]).reverse()),
    memberOf: new Map(latest.flatMap((release) => [...release.memberOf]).reverse()),
  };
  const safe =
    foreign.every((releases) =>
      releases.every((release) => provablySafe(compare(now, releasedAmounts(release)), threshold)),
    ) && provablySafe(compare(now, releasedAmounts(combined)), threshold);
  if (safe) return own;
  const ownLatest = history[0] ?? null;
  const ownShown = ownLatest !== null && ownLatest.withdrawnAt === null;
  const removedFromOwn =
    ownLatest !== null && [...releasedAmounts(ownLatest).keys()].some((member) => !now.has(member));
  if (ownShown && !removedFromOwn) return { kind: "SHOW_PRIOR", pendingChanges: true };
  return { kind: "SUPPRESS", reason: "REVISION", withdrawPrior: ownShown };
}
