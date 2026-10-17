/**
 * F10-SEC-02 (#45): differencing across any combination of disclosed figures.
 *
 * A reader who keeps every figure of a cell (and of the cells its
 * contributions came from) can add and subtract them in any way. Comparing a
 * new figure with each earlier one, or with their latest values, is not
 * enough: R2 − R1 can isolate a group that no single figure isolates.
 *
 * Model. Each disclosed figure is a row of 0/1 coefficients over "amount
 * columns": one column per contribution and amount (`contributionId|amount`),
 * so a contribution that keeps its amount is the same unknown in every figure
 * and a changed amount is a new unknown. An amount that was not recorded
 * (rows written before the quantity column) is a fresh unknown of that figure.
 * Each column belongs to one Member.
 *
 * A set of figures reveals something about fewer than k Members iff some
 * non-zero combination of the rows is supported on columns of fewer than k
 * Members. For a set S of columns that is the case iff removing the columns
 * of S lowers the rank: rank(M without S) < rank(M). Columns with the same
 * pattern across rows are interchangeable for the rank, so only whole
 * patterns matter, and only patterns whose columns belong to fewer than k
 * Members can be removed by such an S.
 *
 * Arithmetic is exact (fraction-free elimination over BigInt).
 */
export interface DisclosedFigure {
  /** columnId → Member of that column. */
  columns: ReadonlyMap<string, string>;
}

/** Column id of a contribution with a known amount. */
export function amountColumn(contributionId: string, amount: bigint | null, figureId: string): string {
  return amount === null ? `${contributionId}|?${figureId}` : `${contributionId}|${amount}`;
}

/** Rank of a 0/1 matrix given as rows of column ids, restricted to `keep`. */
function rank(rows: readonly ReadonlySet<string>[], keep: readonly string[]): number {
  const matrix: bigint[][] = rows.map((row) => keep.map((column) => (row.has(column) ? 1n : 0n)));
  const abs = (x: bigint) => (x < 0n ? -x : x);
  const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? abs(a) : gcd(b, a % b));
  let r = 0;
  for (let c = 0; c < keep.length && r < matrix.length; c++) {
    let pivot = r;
    while (pivot < matrix.length && matrix[pivot]![c] === 0n) pivot++;
    if (pivot === matrix.length) continue;
    [matrix[r], matrix[pivot]] = [matrix[pivot]!, matrix[r]!];
    const p = matrix[r]![c]!;
    // Integer elimination: row_i ← p·row_i − f·row_r, then divided by the gcd
    // of its entries, so the arithmetic stays exact and the numbers small.
    for (let i = r + 1; i < matrix.length; i++) {
      const factor = matrix[i]![c]!;
      if (factor === 0n) continue;
      const row = matrix[i]!.map((value, j) => p * value - factor * matrix[r]![j]!);
      const g = row.reduce((acc, value) => gcd(acc, value), 0n);
      matrix[i] = g > 1n ? row.map((value) => value / g) : row;
    }
    r++;
  }
  return r;
}

/**
 * Sets of Members (fewer than `threshold`) about whom the figures reveal
 * something: their amounts, or a change of them, can be computed exactly.
 * Returned as sorted, comma-joined Member ids.
 */
export function revealedGroups(figures: readonly DisclosedFigure[], threshold: number): Set<string> {
  const rows = figures.map((figure) => new Set(figure.columns.keys()));
  const memberOf = new Map<string, string>();
  for (const figure of figures) for (const [column, member] of figure.columns) memberOf.set(column, member);
  // Group columns by their pattern (which rows contain them).
  const patterns = new Map<string, { column: string; members: Set<string> }>();
  for (const column of memberOf.keys()) {
    const key = rows.map((row) => (row.has(column) ? "1" : "0")).join("");
    const entry = patterns.get(key) ?? { column, members: new Set<string>() };
    entry.members.add(memberOf.get(column)!);
    patterns.set(key, entry);
  }
  const all = [...patterns.values()];
  const full = rank(rows, all.map((p) => p.column));
  // Removable patterns: those whose columns belong to fewer than k Members.
  const candidates = all.filter((p) => p.members.size < threshold);
  const revealed = new Set<string>();
  // Unions of candidate patterns whose Members stay under k (k is small).
  const visit = (start: number, chosen: number[], members: Set<string>) => {
    if (chosen.length > 0) {
      const removed = new Set(chosen.map((i) => candidates[i]!.column));
      const kept = all.map((p) => p.column).filter((column) => !removed.has(column));
      if (rank(rows, kept) < full) revealed.add([...members].sort((a, b) => a.localeCompare(b)).join(","));
    }
    for (let i = start; i < candidates.length; i++) {
      const union = new Set([...members, ...candidates[i]!.members]);
      if (union.size < threshold) visit(i + 1, [...chosen, i], union);
    }
  };
  visit(0, [], new Set());
  return revealed;
}

/**
 * True if adding `candidate` to the figures already known reveals something
 * about fewer than k Members that the known figures did not reveal yet.
 */
export function newlyRevealing(
  known: readonly DisclosedFigure[],
  candidate: DisclosedFigure,
  threshold: number,
): boolean {
  const before = revealedGroups(known, threshold);
  const after = revealedGroups([...known, candidate], threshold);
  return [...after].some((group) => !before.has(group));
}
