import { consolidate, EligibleContribution, MAX_TOTAL_BASE } from "./consolidation";
import { decideCell, decideCellWithRelated, PriorRelease } from "./disclosure-policy";

/**
 * F06 #21 with the provisional F07-POL-01 (#107): one cell at a time. Members
 * are m1…m5; contributions c1…c5 belong to them in order.
 */
const P = "product-1";

function contribution(n: number, quantity: bigint, sequence = 1, member = `m${n}`): EligibleContribution {
  return {
    contributionId: `c${n}`,
    memberId: member,
    projectionType: "DECLARED_NEED",
    productId: P,
    baseUnit: "ML",
    quantityBase: quantity,
    sequence,
    acceptedAt: new Date(`2026-10-16T0${n}:00:00.000Z`),
  };
}

function cellOf(...contributions: EligibleContribution[]) {
  const cells = consolidate(contributions, new Map());
  expect(cells).toHaveLength(1);
  return cells[0]!;
}

function releaseOf(contributions: EligibleContribution[], withdrawnAt: Date | null = null): PriorRelease {
  return {
    id: `r${contributions.map((c) => c.quantityBase).join("-")}`,
    totalBase: contributions.reduce((sum, c) => sum + c.quantityBase, 0n),
    contributorCount: new Set(contributions.map((c) => c.memberId)).size,
    dataAsOf: null,
    releasedAt: new Date("2026-10-16T10:00:00.000Z"),
    withdrawnAt,
    items: new Map(contributions.map((c) => [c.contributionId, c.quantityBase])),
    memberOf: new Map(contributions.map((c) => [c.contributionId, c.memberId])),
  };
}

describe("provisional disclosure policy (F07-POL-01, k = 3)", () => {
  it("a cell under the threshold is suppressed, never shown as zero", () => {
    expect(decideCell(cellOf(contribution(1, 5000n), contribution(2, 7000n)), [])).toEqual({
      kind: "SUPPRESS",
      reason: "UNDER_THRESHOLD",
      withdrawPrior: false,
    });
    expect(decideCell(cellOf(contribution(1, 5000n), contribution(2, 7000n), contribution(3, 1n)), [])).toEqual({
      kind: "RELEASE",
    });
  });

  it("an explicit zero counts as a contributor and as zero", () => {
    const cell = cellOf(contribution(1, 0n), contribution(2, 0n), contribution(3, 0n));
    expect(cell.total).toBe(0n);
    expect(cell.members.size).toBe(3);
    expect(decideCell(cell, [])).toEqual({ kind: "RELEASE" });
  });

  it("absence is not a cell: no contributions, no row (unknown, not zero)", () => {
    expect(consolidate([], new Map())).toEqual([]);
  });

  it("counts distinct Members: two contributions of one Member are one contributor", () => {
    const aliasA = contribution(1, 4000n);
    const aliasB = { ...contribution(2, 6000n, 1, "m1"), productId: "alias" };
    const other = contribution(3, 1000n);
    const cells = consolidate([aliasA, aliasB, other], new Map([["alias", P]]));
    expect(cells).toHaveLength(1);
    expect(cells[0]!.members.size).toBe(2);
    expect(cells[0]!.total).toBe(11000n);
    expect(decideCell(cells[0]!, [])).toEqual({ kind: "SUPPRESS", reason: "UNDER_THRESHOLD", withdrawPrior: false });
  });

  it("never adds ML and G, even inside one canonical group", () => {
    const liquid = contribution(1, 1000n);
    const solid = { ...contribution(2, 1000n), baseUnit: "G" as const };
    expect(consolidate([liquid, solid], new Map()).map((cell) => cell.baseUnit)).toEqual(["G", "ML"]);
  });

  it("the difference of two answers never isolates one Member", () => {
    const before = [contribution(1, 5000n), contribution(2, 7000n), contribution(3, 9000n)];
    const prior = releaseOf(before);
    // One Member changes: the prior figure stays, flagged as pending.
    const oneChange = cellOf(contribution(1, 6000n, 2), contribution(2, 7000n), contribution(3, 9000n));
    expect(decideCell(oneChange, [prior])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // A new Member joins: that alone would reveal its value, so it waits too.
    const oneJoins = cellOf(...before, contribution(4, 2000n));
    expect(decideCell(oneJoins, [prior])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // Three distinct Members changed their amount: a new figure is allowed.
    const threeChanges = cellOf(contribution(1, 6000n, 2), contribution(2, 7500n, 2), contribution(3, 9000n), contribution(4, 2000n));
    expect(decideCell(threeChanges, [prior])).toEqual({ kind: "RELEASE" });
    // Nothing changed: the same figure, nothing pending.
    expect(decideCell(cellOf(...before), [prior])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: false });
  });

  it("a removal withdraws the prior figure until k Members changed", () => {
    const before = [contribution(1, 5000n), contribution(2, 7000n), contribution(3, 9000n), contribution(4, 1000n)];
    const prior = releaseOf(before);
    // c4 left (cancelled, disputed, inactive or regrouped): withdraw.
    const left = cellOf(contribution(1, 5000n), contribution(2, 7000n), contribution(3, 9000n));
    expect(decideCell(left, [prior])).toEqual({ kind: "SUPPRESS", reason: "REVISION", withdrawPrior: true });
    // Already withdrawn and still fewer than k changes: stays without figure.
    expect(decideCell(left, [releaseOf(before, new Date())])).toEqual({
      kind: "SUPPRESS",
      reason: "REVISION",
      withdrawPrior: false,
    });
    // c4 came back unchanged (e.g. its Member was reactivated): the same
    // figure is published again, which reveals nothing new.
    expect(decideCell(cellOf(...before), [releaseOf(before, new Date())])).toEqual({ kind: "RELEASE" });
    // c4 left and two more changed: three Members, new figure.
    const enough = cellOf(contribution(1, 5500n, 2), contribution(2, 7500n, 2), contribution(3, 9000n));
    expect(decideCell(enough, [prior])).toEqual({ kind: "RELEASE" });
    // Leaving under the threshold: suppressed as such.
    const few = cellOf(contribution(1, 5000n), contribution(2, 7000n));
    expect(decideCell(few, [releaseOf(before.slice(0, 3))])).toEqual({
      kind: "SUPPRESS",
      reason: "UNDER_THRESHOLD",
      withdrawPrior: true,
    });
  });

  it("F10-SEC-02: a new sequence with the same value is not a change (6000 → 6100 case)", () => {
    const before = [contribution(1, 1000n), contribution(2, 2000n), contribution(3, 3000n)];
    // Three new sequences, one net change: the old rule released 6100.
    const oneNet = cellOf(contribution(1, 1100n, 2), contribution(2, 2000n, 2), contribution(3, 3000n, 2));
    expect(decideCell(oneNet, [releaseOf(before)])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // Only same-value replacements: the figure is the same, nothing pending.
    const noNet = cellOf(contribution(1, 1000n, 2), contribution(2, 2000n, 2), contribution(3, 3000n, 2));
    expect(decideCell(noNet, [releaseOf(before)])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: false });
    // A change that went back to the released value: nothing pending.
    const reverted = cellOf(contribution(1, 1000n, 3), contribution(2, 2000n), contribution(3, 3000n));
    expect(decideCell(reverted, [releaseOf(before)])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: false });
  });

  it("F10-SEC-02: no figure differs from any earlier figure by fewer than k Members", () => {
    const r1 = [contribution(1, 1000n), contribution(2, 2000n), contribution(3, 3000n), contribution(4, 4000n)];
    const r2 = [contribution(1, 1100n, 2), contribution(2, 2100n, 2), contribution(3, 3100n, 2), contribution(4, 4100n, 2)];
    const history = [releaseOf(r2), releaseOf(r1)];
    // Three go back to R1: three changes against R2, one against R1.
    const back = cellOf(contribution(1, 1100n, 2), contribution(2, 2000n, 3), contribution(3, 3000n, 3), contribution(4, 4000n, 3));
    expect(decideCell(back, [releaseOf(r2)])).toEqual({ kind: "RELEASE" }); // the old, latest-only check
    expect(decideCell(back, history)).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // Exactly R1 again: that figure was already disclosed.
    expect(decideCell(cellOf(...r1.map((c) => ({ ...c, sequence: 3 }))), history)).toEqual({ kind: "RELEASE" });
    // A withdrawn figure still counts: a reader may have kept it.
    const withdrawn = [releaseOf(r2), releaseOf(r1, new Date())];
    expect(decideCell(back, withdrawn)).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
  });

  it("F10-SEC-02: amounts are per Member, so moving a value between aliases is no change", () => {
    const before = [contribution(1, 4000n), contribution(2, 2000n), contribution(3, 3000n)];
    // m1 moves 1000 from one alias to another of the same canonical cell.
    const moved = [contribution(1, 3000n, 2), { ...contribution(9, 1000n, 1, "m1"), productId: "alias" }, contribution(2, 2000n), contribution(3, 3000n)];
    const cell = consolidate(moved, new Map([["alias", P]]))[0]!;
    expect(cell.total).toBe(9000n);
    expect(decideCell(cell, [releaseOf(before)])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: false });
  });

  it("F10-SEC-02: an unknown released amount proves no change (rows before the migration)", () => {
    const before = [contribution(1, 1000n), contribution(2, 2000n), contribution(3, 3000n)];
    // 6000 disclosed before 20261016150500: its quantities are NULL.
    const legacy: PriorRelease = { ...releaseOf(before), items: new Map(before.map((c) => [c.contributionId, null])) };
    // Only m1 changed. Counting the three unknown amounts as changes would
    // publish 6100 and reveal m1's change (finding on PR #112).
    const oneNet = cellOf(contribution(1, 1100n, 2), contribution(2, 2000n, 2), contribution(3, 3000n, 2));
    expect(decideCell(oneNet, [legacy])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // Unchanged values cannot be proven unchanged either: the prior figure stays.
    expect(decideCell(cellOf(...before), [legacy])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    const legacyAndOne: PriorRelease = {
      ...releaseOf(before),
      items: new Map([["c1", null], ["c2", 2000n], ["c3", 3000n]]),
    };
    expect(decideCell(cellOf(...before), [legacyAndOne])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // Already withdrawn: still no new figure, and nothing left to withdraw.
    expect(decideCell(oneNet, [{ ...legacy, withdrawnAt: new Date() }])).toEqual({
      kind: "SUPPRESS",
      reason: "REVISION",
      withdrawPrior: false,
    });
    // k Members that provably changed (they joined) allow a new figure.
    const threeJoin = cellOf(...oneNet.contributions, contribution(4, 500n), contribution(5, 500n), contribution(6, 500n));
    expect(decideCell(threeJoin, [legacy])).toEqual({ kind: "RELEASE" });
    const twoJoin = cellOf(...oneNet.contributions, contribution(4, 500n), contribution(5, 500n));
    expect(decideCell(twoJoin, [legacy])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
  });

  it("an int64 overflow is never truncated", () => {
    const cell = cellOf(contribution(1, MAX_TOTAL_BASE), contribution(2, 1n), contribution(3, 0n));
    expect(cell.overflow).toBe(true);
    expect(cell.total).toBe(MAX_TOTAL_BASE + 1n);
    expect(decideCell(cell, [])).toEqual({ kind: "OVERFLOW", withdrawPrior: false });
    const exact = cellOf(contribution(1, MAX_TOTAL_BASE - 1n), contribution(2, 1n), contribution(3, 0n));
    expect(exact.overflow).toBe(false);
    expect(decideCell(exact, [])).toEqual({ kind: "RELEASE" });
  });
});

describe("F10-SEC-02: the history follows contributions across cell keys", () => {
  // Product p (c1–c3) was disclosed as 6000; then it is associated with another
  // canonical product, so its contributions now form a cell of a different key.
  const p = [contribution(1, 1000n), contribution(2, 2000n), contribution(3, 3000n)];
  const released = releaseOf(p);

  it("re-keying with one change does not publish a figure that isolates it (6100 − 6000)", () => {
    const now = cellOf(contribution(1, 1100n, 2), contribution(2, 2000n), contribution(3, 3000n));
    expect(decideCell(now, [])).toEqual({ kind: "RELEASE" });
    expect(decideCellWithRelated(now, [], [[released]])).toEqual({ kind: "SUPPRESS", reason: "REVISION", withdrawPrior: false });
  });

  it("re-keying without changes may show the same figure again", () => {
    expect(decideCellWithRelated(cellOf(...p), [], [[released]])).toEqual({ kind: "RELEASE" });
  });

  it("merging into a disclosed cell with one change keeps the earlier figure pending", () => {
    const r = [contribution(4, 4000n), contribution(5, 5000n), contribution(6, 6000n)];
    const now = cellOf(contribution(1, 1100n, 2), contribution(2, 2000n), contribution(3, 3000n), ...r);
    // Each disclosure alone sees ≥ 3 Members changed, but R + P + 100 isolates the change.
    expect(decideCell(now, [releaseOf(r)])).toEqual({ kind: "RELEASE" });
    expect(decideCellWithRelated(now, [releaseOf(r)], [[released]])).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
  });

  it("after k Members changed, a new figure is allowed", () => {
    const now = cellOf(contribution(1, 1100n, 2), contribution(2, 2100n, 2), contribution(3, 3100n, 2));
    expect(decideCellWithRelated(now, [], [[released]])).toEqual({ kind: "RELEASE" });
  });

  it("without related disclosures the rule is the same as before", () => {
    expect(decideCellWithRelated(cellOf(...p), [], [])).toEqual(decideCell(cellOf(...p), []));
  });
});
