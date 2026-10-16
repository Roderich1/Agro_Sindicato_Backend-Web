import { consolidate, EligibleContribution, MAX_TOTAL_BASE } from "./consolidation";
import { decideCell, PriorRelease } from "./disclosure-policy";

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
    id: "r1",
    totalBase: contributions.reduce((sum, c) => sum + c.quantityBase, 0n),
    contributorCount: new Set(contributions.map((c) => c.memberId)).size,
    dataAsOf: null,
    releasedAt: new Date("2026-10-16T10:00:00.000Z"),
    withdrawnAt,
    items: new Map(contributions.map((c) => [c.contributionId, c.sequence])),
    memberOf: new Map(contributions.map((c) => [c.contributionId, c.memberId])),
  };
}

describe("provisional disclosure policy (F07-POL-01, k = 3)", () => {
  it("a cell under the threshold is suppressed, never shown as zero", () => {
    expect(decideCell(cellOf(contribution(1, 5000n), contribution(2, 7000n)), null)).toEqual({
      kind: "SUPPRESS",
      reason: "UNDER_THRESHOLD",
      withdrawPrior: false,
    });
    expect(decideCell(cellOf(contribution(1, 5000n), contribution(2, 7000n), contribution(3, 1n)), null)).toEqual({
      kind: "RELEASE",
    });
  });

  it("an explicit zero counts as a contributor and as zero", () => {
    const cell = cellOf(contribution(1, 0n), contribution(2, 0n), contribution(3, 0n));
    expect(cell.total).toBe(0n);
    expect(cell.members.size).toBe(3);
    expect(decideCell(cell, null)).toEqual({ kind: "RELEASE" });
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
    expect(decideCell(cells[0]!, null)).toEqual({ kind: "SUPPRESS", reason: "UNDER_THRESHOLD", withdrawPrior: false });
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
    expect(decideCell(oneChange, prior)).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // A new Member joins: that alone would reveal its value, so it waits too.
    const oneJoins = cellOf(...before, contribution(4, 2000n));
    expect(decideCell(oneJoins, prior)).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // Three distinct Members changed: a new figure is allowed.
    const threeChanges = cellOf(contribution(1, 6000n, 2), contribution(2, 7000n, 2), contribution(3, 9000n), contribution(4, 2000n));
    expect(decideCell(threeChanges, prior)).toEqual({ kind: "RELEASE" });
    // Nothing changed: the same figure, nothing pending.
    expect(decideCell(cellOf(...before), prior)).toEqual({ kind: "SHOW_PRIOR", pendingChanges: false });
  });

  it("a removal withdraws the prior figure until k Members changed", () => {
    const before = [contribution(1, 5000n), contribution(2, 7000n), contribution(3, 9000n), contribution(4, 1000n)];
    const prior = releaseOf(before);
    // c4 left (cancelled, disputed, inactive or regrouped): withdraw.
    const left = cellOf(contribution(1, 5000n), contribution(2, 7000n), contribution(3, 9000n));
    expect(decideCell(left, prior)).toEqual({ kind: "SUPPRESS", reason: "REVISION", withdrawPrior: true });
    // Already withdrawn and still fewer than k changes: stays without figure.
    expect(decideCell(left, releaseOf(before, new Date()))).toEqual({
      kind: "SUPPRESS",
      reason: "REVISION",
      withdrawPrior: false,
    });
    // c4 came back unchanged (e.g. its Member was reactivated): the same
    // figure is published again, which reveals nothing new.
    expect(decideCell(cellOf(...before), releaseOf(before, new Date()))).toEqual({ kind: "RELEASE" });
    // c4 left and two more changed: three Members, new figure.
    const enough = cellOf(contribution(1, 5500n, 2), contribution(2, 7500n, 2), contribution(3, 9000n));
    expect(decideCell(enough, prior)).toEqual({ kind: "RELEASE" });
    // Leaving under the threshold: suppressed as such.
    const few = cellOf(contribution(1, 5000n), contribution(2, 7000n));
    expect(decideCell(few, releaseOf(before.slice(0, 3)))).toEqual({
      kind: "SUPPRESS",
      reason: "UNDER_THRESHOLD",
      withdrawPrior: true,
    });
  });

  it("an int64 overflow is never truncated", () => {
    const cell = cellOf(contribution(1, MAX_TOTAL_BASE), contribution(2, 1n), contribution(3, 0n));
    expect(cell.overflow).toBe(true);
    expect(cell.total).toBe(MAX_TOTAL_BASE + 1n);
    expect(decideCell(cell, null)).toEqual({ kind: "OVERFLOW", withdrawPrior: false });
    const exact = cellOf(contribution(1, MAX_TOTAL_BASE - 1n), contribution(2, 1n), contribution(3, 0n));
    expect(exact.overflow).toBe(false);
    expect(decideCell(exact, null)).toEqual({ kind: "RELEASE" });
  });
});
