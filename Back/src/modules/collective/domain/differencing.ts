/**
 * F10-SEC-02 (#45): differencing across any combination of disclosed figures.
 *
 * A reader who keeps every figure of a cell (and of the cells its
 * contributions came from, and of the cells disclosed in the same read) can
 * add and subtract them in any way. Comparing a new figure with each earlier
 * one, or with their latest values, is not enough: R2 − R1 can isolate a group
 * that no single figure isolates.
 *
 * Model. Each disclosed figure is a row of 0/1 coefficients over "amount
 * columns": one column per contribution and amount (`contributionId|amount`),
 * so a contribution that keeps its amount is the same unknown in every figure
 * and a changed amount is a new unknown. Each column belongs to one Member.
 *
 * What the figures reveal about a group G of Members is the space of linear
 * combinations of the rows supported only on columns of G. Its dimension is
 * rank(M) − rank(M without the columns of G). Columns with the same pattern
 * across rows are interchangeable for the rank, so only patterns whose
 * columns all belong to G count. With a basis K of the null space of M (one
 * representative column per pattern), that dimension is |S| − rank(K[S]),
 * where S are those patterns (matroid duality): one small rank per group.
 *
 * A new figure is refused if it raises that dimension for some group of
 * fewer than k Members: it would make computable something about them that
 * was not computable before (a new value of an already exposed group too).
 *
 * Arithmetic is exact (fraction-free elimination over BigInt). The work is
 * bounded by a budget; when it runs out the answer is "reveals" (fail-closed),
 * so the cell keeps its earlier figure or shows none.
 */
export interface DisclosedFigure {
  /** columnId → Member of that column. */
  columns: ReadonlyMap<string, string>;
}

/** Column id of a contribution with its amount. */
export function amountColumn(contributionId: string, amount: bigint): string {
  return `${contributionId}|${amount}`;
}

/**
 * Elementary operations allowed for the differencing checks of one summary
 * read. ~1.5·10⁷ BigInt operations: well under a second on the development
 * PC (see F10_SEC_02_PROJECTION.md), far from the 5 s transaction timeout.
 */
export const READ_WORK_LIMIT = 15_000_000;

export class WorkBudget {
  private remaining: number;

  constructor(limit = READ_WORK_LIMIT) {
    this.remaining = limit;
  }

  get exhausted(): boolean {
    return this.remaining <= 0;
  }

  spend(units: number): void {
    this.remaining -= units;
    if (this.remaining <= 0) throw new WorkLimitReached();
  }
}

class WorkLimitReached extends Error {}

const abs = (x: bigint) => (x < 0n ? -x : x);
const gcd = (a: bigint, b: bigint): bigint => {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
};

/** 64-bit words of a BigInt, so the budget follows the size of the numbers. */
const words = (x: bigint) => 1 + (abs(x).toString(16).length >> 4);

function normalized(row: bigint[]): bigint[] {
  const g = row.reduce((acc, value) => gcd(acc, value), 0n);
  return g > 1n ? row.map((value) => value / g) : row;
}

/** Rank of an integer matrix (fraction-free elimination). */
function rank(input: readonly (readonly bigint[])[], budget: WorkBudget): number {
  const matrix = input.map((row) => [...row]);
  const width = matrix[0]?.length ?? 0;
  let r = 0;
  for (let c = 0; c < width && r < matrix.length; c++) {
    let pivot = r;
    while (pivot < matrix.length && matrix[pivot]![c] === 0n) pivot++;
    if (pivot === matrix.length) continue;
    [matrix[r], matrix[pivot]] = [matrix[pivot]!, matrix[r]!];
    const p = matrix[r]![c]!;
    for (let i = r + 1; i < matrix.length; i++) {
      const factor = matrix[i]![c]!;
      if (factor === 0n) continue;
      budget.spend(width * (words(p) + words(factor)));
      matrix[i] = normalized(matrix[i]!.map((value, j) => p * value - factor * matrix[r]![j]!));
    }
    r++;
  }
  return r;
}

/**
 * Basis of the null space of a 0/1 matrix, as one row per column of the
 * matrix (so `basis[j]` is the j-th coordinate of every basis vector).
 */
function nullSpaceByColumn(input: readonly (readonly bigint[])[], width: number, budget: WorkBudget): bigint[][] {
  const matrix = input.map((row) => [...row]);
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < width && r < matrix.length; c++) {
    let pivot = r;
    while (pivot < matrix.length && matrix[pivot]![c] === 0n) pivot++;
    if (pivot === matrix.length) continue;
    [matrix[r], matrix[pivot]] = [matrix[pivot]!, matrix[r]!];
    const p = matrix[r]![c]!;
    // Reduced echelon form: clear the column above and below the pivot.
    for (let i = 0; i < matrix.length; i++) {
      if (i === r) continue;
      const factor = matrix[i]![c]!;
      if (factor === 0n) continue;
      budget.spend(width * (words(p) + words(factor)));
      matrix[i] = normalized(matrix[i]!.map((value, j) => p * value - factor * matrix[r]![j]!));
    }
    pivots.push(c);
    r++;
  }
  const isPivot = new Set(pivots);
  const free = [...Array(width).keys()].filter((c) => !isPivot.has(c));
  const byColumn = [...Array(width)].map(() => new Array<bigint>(free.length).fill(0n));
  free.forEach((f, t) => {
    budget.spend(pivots.length + width);
    // x_f = L and, for each pivot row i, x_{pivot(i)} = −row_i[f]·L / row_i[pivot(i)].
    let lcm = 1n;
    pivots.forEach((pc, i) => {
      if (matrix[i]![f] !== 0n) lcm = (lcm / gcd(lcm, matrix[i]![pc]!)) * abs(matrix[i]![pc]!);
    });
    const vector = new Array<bigint>(width).fill(0n);
    vector[f] = lcm;
    pivots.forEach((pc, i) => {
      if (matrix[i]![f] !== 0n) vector[pc] = (-matrix[i]![f]! * lcm) / matrix[i]![pc]!;
    });
    normalized(vector).forEach((value, j) => (byColumn[j]![t] = value));
  });
  return byColumn;
}

interface Analysis {
  /** Patterns whose columns belong to fewer than k Members. */
  small: { members: ReadonlySet<string>; index: number }[];
  /** Null-space basis, one row per pattern. */
  kernel: bigint[][];
}

function analyse(figures: readonly DisclosedFigure[], threshold: number, budget: WorkBudget): Analysis {
  const rows = figures.map((figure) => new Set(figure.columns.keys()));
  const memberOf = new Map<string, string>();
  for (const figure of figures) for (const [column, member] of figure.columns) memberOf.set(column, member);
  budget.spend(memberOf.size * Math.max(rows.length, 1));
  // Group columns by their pattern (which rows contain them).
  const patterns = new Map<string, { column: string; members: Set<string> }>();
  for (const column of memberOf.keys()) {
    const key = rows.map((row) => (row.has(column) ? "1" : "0")).join("");
    const entry = patterns.get(key) ?? { column, members: new Set<string>() };
    entry.members.add(memberOf.get(column)!);
    patterns.set(key, entry);
  }
  const all = [...patterns.values()];
  const matrix = rows.map((row) => all.map((pattern) => (row.has(pattern.column) ? 1n : 0n)));
  const kernel = nullSpaceByColumn(matrix, all.length, budget);
  const small = all
    .map((pattern, index) => ({ members: pattern.members, index }))
    .filter((pattern) => pattern.members.size < threshold);
  return { small, kernel };
}

/** Dimension of what the figures reveal about the Members of `group`. */
function revealedDimension(analysis: Analysis, group: ReadonlySet<string>, budget: WorkBudget): number {
  const inside = analysis.small.filter((pattern) => [...pattern.members].every((member) => group.has(member)));
  if (inside.length === 0) return 0;
  return inside.length - rank(inside.map((pattern) => analysis.kernel[pattern.index]!), budget);
}

/** Groups of fewer than k Members that are unions of small patterns' Members. */
function groupsOf(analysis: Analysis, threshold: number, budget: WorkBudget): ReadonlySet<string>[] {
  const sets = new Map<string, string[]>();
  for (const { members } of analysis.small) {
    const sorted = [...members].sort((a, b) => a.localeCompare(b));
    sets.set(sorted.join(","), sorted);
  }
  const distinct = [...sets.values()];
  const groups = new Map<string, ReadonlySet<string>>();
  const visit = (start: number, members: ReadonlySet<string>) => {
    for (let i = start; i < distinct.length; i++) {
      const union = new Set([...members, ...distinct[i]!]);
      if (union.size >= threshold) continue;
      budget.spend(1);
      const key = [...union].sort((a, b) => a.localeCompare(b)).join(",");
      if (!groups.has(key)) groups.set(key, union);
      visit(i + 1, union);
    }
  };
  visit(0, new Set());
  return [...groups.values()];
}

/**
 * True if adding `candidate` to the figures already known makes computable
 * something about fewer than k Members that the known figures did not, or if
 * the check ran out of budget (fail-closed).
 */
export function newlyRevealing(
  known: readonly DisclosedFigure[],
  candidate: DisclosedFigure,
  threshold: number,
  budget: WorkBudget = new WorkBudget(),
): boolean {
  if (budget.exhausted) return true;
  try {
    const after = analyse([...known, candidate], threshold, budget);
    const before = analyse(known, threshold, budget);
    // Enough: a group whose dimension grows contains a union of the new small
    // patterns' Members with the same patterns (see the module comment).
    return groupsOf(after, threshold, budget).some(
      (group) => revealedDimension(after, group, budget) > revealedDimension(before, group, budget),
    );
  } catch (error) {
    if (error instanceof WorkLimitReached) return true;
    throw error;
  }
}
