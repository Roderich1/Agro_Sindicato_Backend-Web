import { Cell, cellId } from "./consolidation";
import { amountColumn, DisclosedFigure, newlyRevealing, WorkBudget } from "./differencing";

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
 * Rule 2 against **any combination** of known figures (F10-SEC-02 #45).
 *
 * `history` holds the cell's own disclosures and `related` those of every
 * other key that shares contributions with it (directly or through other
 * disclosures, e.g. after the Directiva re-keys a product), including the
 * figures already decided earlier in the same read. The reader may add and
 * subtract all of them. A new figure is only allowed if it does not make
 * computable, together with all those figures, anything about a group of
 * fewer than k Members that was not computable before (see
 * `differencing.ts`). This covers re-keying (p → r), the difference of two own
 * figures (R2 − R1), cells split in one read, and their combinations.
 *
 * Fail-closed: if any known figure has an amount the server did not record
 * (rows written before 20261016150500), the combinations cannot be checked
 * exactly, so no new figure is published in that group of keys; and the same
 * when the read's work budget runs out.
 *
 * Otherwise the cell keeps its own earlier figure with pending changes, if it
 * still describes it, or shows no figure (REVISION). A figure of another key
 * is never shown under this one.
 */
export function decideCellWithRelated(
  cell: Cell,
  history: readonly PriorRelease[],
  related: readonly (readonly PriorRelease[])[],
  threshold = PROVISIONAL_THRESHOLD,
  budget: WorkBudget = new WorkBudget(),
): CellDecision {
  const own = decideCell(cell, history, threshold);
  const known = [...history, ...related.flat()];
  if (own.kind !== "RELEASE" || known.length === 0) return own;
  const inexact = known.some((release) => [...release.items.values()].some((quantity) => quantity === null));
  if (!inexact && !newlyRevealing(known.map(figureOf), currentFigure(cell), threshold, budget)) return own;
  const now = currentAmounts(cell);
  const ownLatest = history[0] ?? null;
  const ownShown = ownLatest !== null && ownLatest.withdrawnAt === null;
  const removedFromOwn =
    ownLatest !== null && [...releasedAmounts(ownLatest).keys()].some((member) => !now.has(member));
  if (ownShown && !removedFromOwn) return { kind: "SHOW_PRIOR", pendingChanges: true };
  return { kind: "SUPPRESS", reason: "REVISION", withdrawPrior: ownShown };
}

/**
 * Decides every cell of one summary read (F10-SEC-02 #45). `histories` maps a
 * cell key to its disclosures, newest first. Cells are decided in key order,
 * and each figure decided here is known to the cells decided after it, so two
 * cells published in the same read are checked against each other too (a
 * split P1 + P2 − earlier P1∪P2 isolates whoever joined). One budget bounds
 * the work of the whole read.
 */
export function decideCells(
  cells: readonly Cell[],
  histories: ReadonlyMap<string, readonly PriorRelease[]>,
  threshold = PROVISIONAL_THRESHOLD,
  budget: WorkBudget = new WorkBudget(),
): Map<string, CellDecision> {
  const known = new Map<string, readonly PriorRelease[]>(histories);
  const keysOf = new Map<string, Set<string>>();
  const contributionsOf = new Map<string, Set<string>>();
  const register = (key: string, release: PriorRelease) => {
    const own = contributionsOf.get(key) ?? new Set<string>();
    for (const contributionId of release.items.keys()) {
      keysOf.set(contributionId, (keysOf.get(contributionId) ?? new Set()).add(key));
      own.add(contributionId);
    }
    contributionsOf.set(key, own);
  };
  for (const [key, history] of histories) for (const release of history) register(key, release);
  // Every key connected to the cell through shared contributions, directly or
  // through other disclosures: their figures can be combined.
  const connectedKeys = (id: string, seed: Iterable<string>): string[] => {
    const keys = new Set([id]);
    const seen = new Set([...seed, ...(contributionsOf.get(id) ?? [])]);
    const queue = [...seen];
    while (queue.length > 0) {
      for (const key of keysOf.get(queue.pop()!) ?? []) {
        if (keys.has(key)) continue;
        keys.add(key);
        for (const contributionId of contributionsOf.get(key) ?? []) {
          if (!seen.has(contributionId)) {
            seen.add(contributionId);
            queue.push(contributionId);
          }
        }
      }
    }
    keys.delete(id);
    return [...keys].sort((a, b) => a.localeCompare(b));
  };
  const decisions = new Map<string, CellDecision>();
  const ordered = [...cells].sort((a, b) => cellId(a).localeCompare(cellId(b)));
  for (const cell of ordered) {
    const id = cellId(cell);
    const history = histories.get(id) ?? [];
    const related = connectedKeys(id, cell.contributions.map((c) => c.contributionId)).map((key) => known.get(key) ?? []);
    const decision = decideCellWithRelated(cell, history, related, threshold, budget);
    decisions.set(id, decision);
    if (decision.kind === "RELEASE") {
      // Known from now on, under a key of its own so it is never shown as
      // this cell's prior figure.
      const decided: PriorRelease = {
        id: `decided-in-read:${id}`,
        totalBase: cell.total,
        contributorCount: cell.members.size,
        dataAsOf: cell.dataAsOf,
        releasedAt: new Date(0),
        withdrawnAt: null,
        items: new Map(cell.contributions.map((c) => [c.contributionId, c.quantityBase])),
        memberOf: new Map(cell.contributions.map((c) => [c.contributionId, c.memberId])),
      };
      const key = `decided-in-read:${id}`;
      known.set(key, [decided]);
      register(key, decided);
    }
  }
  return decisions;
}

function figureOf(release: PriorRelease): DisclosedFigure {
  const columns = new Map<string, string>();
  for (const [contributionId, quantity] of release.items) {
    const member = release.memberOf.get(contributionId);
    // Callers exclude figures with unknown amounts (fail-closed above).
    if (member !== undefined && quantity !== null) columns.set(amountColumn(contributionId, quantity), member);
  }
  return { columns };
}

function currentFigure(cell: Cell): DisclosedFigure {
  return {
    columns: new Map(cell.contributions.map((c) => [amountColumn(c.contributionId, c.quantityBase), c.memberId])),
  };
}
