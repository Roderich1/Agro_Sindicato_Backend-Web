import { Cell, cellId, consolidate, EligibleContribution, MAX_TOTAL_BASE } from "./consolidation";
import { decideCell, decideCells, decideCellWithRelated, PriorRelease } from "./disclosure-policy";
import { amountColumn, newlyRevealing, WorkBudget } from "./differencing";

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

describe("F10-SEC-02: no combination of earlier figures isolates fewer than k Members", () => {
  // Reproductions from the session A review (scratchpad review_b/policy):
  // every read is simulated; a RELEASE joins the history of its key.
  const [a, b, c] = [contribution(1, 10n), contribution(2, 20n), contribution(3, 30n)];
  const [d, e, f] = [contribution(4, 100n), contribution(5, 200n), contribution(6, 300n)];
  const g = contribution(7, 5n);
  const [x, y, z] = [contribution(8, 1n), contribution(9, 2n), contribution(10, 3n)];

  function simulator() {
    const histories: Record<string, PriorRelease[]> = {};
    const shown: Record<string, bigint | null> = {};
    const read = (key: string, items: EligibleContribution[], relatedKeys: string[] = []) => {
      const history = (histories[key] ??= []);
      const cell = cellOf(...items);
      const decision = decideCellWithRelated(cell, history, relatedKeys.map((k) => histories[k] ?? []));
      if ("withdrawPrior" in decision && decision.withdrawPrior && history[0]) history[0].withdrawnAt = new Date();
      if (decision.kind === "RELEASE") history.unshift({ ...releaseOf(items), id: `${key}${history.length + 1}` });
      shown[key] = decision.kind === "RELEASE" || decision.kind === "SHOW_PRIOR" ? history[0]!.totalBase : null;
      return { decision, shown: shown[key] };
    };
    return { read };
  }

  it("re-keying after a withdrawal cannot publish N with N − R1 − P = g (bypass3)", () => {
    const { read } = simulator();
    expect(read("p", [a, b, c]).shown).toBe(60n);
    expect(read("r", [d, e, f]).shown).toBe(600n);
    expect(read("r", [d, e, f, x, y, z]).shown).toBe(606n);
    expect(read("r", [d, e, f, x, y, z, g]).decision).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    expect(read("r", [d, e, f, g]).shown).toBeNull();
    // The Directiva associates p → r.
    const after = read("r", [a, b, c, d, e, f, g], ["p"]);
    expect(after.shown).not.toBe(665n);
    expect(after.decision.kind).not.toBe("RELEASE");
  });

  it("one key: N − (R2 − R1) = g is not published either (base3, before this change it was)", () => {
    const { read } = simulator();
    expect(read("q", [a, b, c]).shown).toBe(60n);
    expect(read("q", [a, b, c, d, e, f]).shown).toBe(660n);
    expect(read("q", [a, b, c, d, e, f, g]).decision).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    // decideCell alone (pairwise) would release 605 here.
    expect(decideCell(cellOf(d, e, f, g), [releaseOf([a, b, c, d, e, f]), releaseOf([a, b, c])]).kind).toBe("RELEASE");
    const after = read("q", [d, e, f, g]);
    expect(after.shown).not.toBe(605n);
    expect(after.decision.kind).not.toBe("RELEASE");
  });

  it("with an intermediate withdrawal, N − (R2 − R1) = g is still not published", () => {
    const { read } = simulator();
    expect(read("q", [a, b, c]).shown).toBe(60n);
    expect(read("q", [a, b, c, d, e, f]).shown).toBe(660n);
    // c cancels: one Member left, the figure is withdrawn.
    expect(read("q", [a, b, d, e, f]).decision).toEqual({ kind: "SUPPRESS", reason: "REVISION", withdrawPrior: true });
    // c publishes the same value again: the same figure may be shown again.
    expect(read("q", [a, b, c, d, e, f]).shown).toBe(660n);
    expect(read("q", [a, b, c, d, e, f, g]).decision).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
    const after = read("q", [d, e, f, g]);
    expect(after.shown).not.toBe(605n);
    expect(after.decision.kind).not.toBe("RELEASE");
  });

  it("does not suppress what reveals nothing: merging two published cells without changes", () => {
    const { read } = simulator();
    expect(read("p", [a, b, c]).shown).toBe(60n);
    expect(read("r", [d, e, f]).shown).toBe(600n);
    // p → r without changes: 660 = 600 + 60, nothing new about anyone.
    expect(read("r", [a, b, c, d, e, f], ["p"])).toEqual({ decision: { kind: "RELEASE" }, shown: 660n });
  });

  it("does not suppress k Members changing after earlier figures of two keys", () => {
    const { read } = simulator();
    read("p", [a, b, c]);
    read("r", [d, e, f]);
    const changed = [contribution(1, 11n, 2), contribution(2, 21n, 2), contribution(3, 31n, 2)];
    expect(read("r", [...changed, d, e, f], ["p"]).decision).toEqual({ kind: "RELEASE" });
  });

  it("k Members joining at once is still a new figure", () => {
    const { read } = simulator();
    expect(read("q", [a, b, c]).shown).toBe(60n);
    expect(read("q", [a, b, c, d, e, f]).shown).toBe(660n);
  });
});

describe("F10-SEC-02: the cells of one read are checked against each other", () => {
  // Reproductions S1 and S7 from the session A review (scratchpad
  // review_b/policy2/scenarios.mts): P2 was associated with P1 and 660 was
  // published; then the association is undone and both cells are decided in
  // the SAME read.
  const of = (n: number, quantity: bigint, product: string) => ({ ...contribution(n, quantity), productId: product });
  const p1 = [of(1, 10n, "P1"), of(2, 20n, "P1"), of(3, 30n, "P1")];
  const p2 = [of(4, 100n, "P2"), of(5, 200n, "P2"), of(6, 300n, "P2")];

  function world() {
    const histories = new Map<string, PriorRelease[]>();
    const read = (contributions: EligibleContribution[], canonicalOf = new Map<string, string>()) => {
      const cells = consolidate(contributions, canonicalOf);
      const decisions = decideCells(cells, histories);
      const shown: Record<string, string> = {};
      for (const cell of cells) {
        const id = cellId(cell);
        const history = histories.get(id) ?? [];
        const decision = decisions.get(id)!;
        if ("withdrawPrior" in decision && decision.withdrawPrior && history[0]) history[0].withdrawnAt = new Date();
        if (decision.kind === "RELEASE") histories.set(id, [{ ...releaseOf(cell.contributions), id: `${id}#${history.length + 1}` }, ...history]);
        shown[cell.canonicalProductId] = decision.kind === "RELEASE" ? `${cell.total}` : decision.kind;
      }
      return shown;
    };
    return { read };
  }
  const merged = new Map([["P2", "P1"]]);

  it("S1: a split while g joins P1 never publishes P1 = 65 and P2 = 600 together (65 + 600 − 660 = g)", () => {
    const { read } = world();
    expect(read([...p1, ...p2], merged)).toEqual({ P1: "660" });
    const g = of(7, 5n, "P1");
    // Each cell alone would be allowed against the earlier 660:
    const [cellP1, cellP2] = consolidate([...p1, g, ...p2], new Map()) as [Cell, Cell];
    const r660 = { ...releaseOf([...p1, ...p2]), id: "660" };
    expect(decideCellWithRelated(cellP1, [r660], []).kind).toBe("RELEASE");
    expect(decideCellWithRelated(cellP2, [], [[r660]]).kind).toBe("RELEASE");
    // Decided in one read, the second one sees the first.
    expect(read([...p1, g, ...p2])).toEqual({ P1: "65", P2: "SUPPRESS" });
  });

  it("S7: one Member joins each cell in the same read: g + h is not revealed", () => {
    const { read } = world();
    read([...p1, ...p2], merged);
    expect(read([...p1, of(7, 5n, "P1"), ...p2, of(8, 7n, "P2")])).toEqual({ P1: "65", P2: "SUPPRESS" });
  });

  it("does not suppress a split that reveals nothing: 60 and 600 after 660", () => {
    const { read } = world();
    read([...p1, ...p2], merged);
    expect(read([...p1, ...p2])).toEqual({ P1: "60", P2: "600" });
  });
});

describe("F10-SEC-02: what is revealed is compared, not only which groups", () => {
  const figure = (entries: [string, bigint, string][]) => ({
    columns: new Map(entries.map(([id, amount, member]) => [amountColumn(id, amount), member])),
  });
  const abc: [string, bigint, string][] = [["ca", 10n, "a"], ["cb", 20n, "b"], ["cc", 30n, "c"]];

  it("a group already exposed (published before this rule) does not get its new value revealed", () => {
    // 60 and 65 were published under an earlier rule: g = 5 is exposed.
    const known = [figure(abc), figure([...abc, ["cg", 5n, "g"]])];
    expect(newlyRevealing(known, figure([...abc, ["cg", 7n, "g"]]), 3)).toBe(true);
    expect(newlyRevealing(known, figure([...abc, ["cg", 5n, "g"]]), 3)).toBe(false);
  });
});

describe("F10-SEC-02: unknown amounts and the work limit fail closed", () => {
  it("a figure with amounts the server did not record allows no new figure in its keys (base3 over a legacy row)", () => {
    const [a, b, c] = [contribution(1, 10n), contribution(2, 20n), contribution(3, 30n)];
    const [d, e, f, g] = [contribution(4, 100n), contribution(5, 200n), contribution(6, 300n), contribution(7, 5n)];
    const legacy: PriorRelease = { ...releaseOf([a, b, c]), id: "L", items: new Map([a, b, c].map((x) => [x.contributionId, null])) };
    const r2 = { ...releaseOf([a, b, c, d, e, f]), id: "R2" };
    const now = cellOf(d, e, f, g);
    // 605 − (660 − L) = g if a, b, c did not change since L.
    expect(decideCell(now, [r2, legacy]).kind).toBe("RELEASE");
    expect(decideCellWithRelated(now, [r2, legacy], [])).toEqual({ kind: "SUPPRESS", reason: "REVISION", withdrawPrior: true });
  });

  it("when the budget runs out the answer is «reveals», so no new figure is published", () => {
    const p = [contribution(1, 10n), contribution(2, 20n), contribution(3, 30n)];
    const r = [contribution(4, 100n), contribution(5, 200n), contribution(6, 300n)];
    const now = cellOf(...p, ...r);
    const related = [[{ ...releaseOf(p), id: "p" }]];
    expect(decideCellWithRelated(now, [releaseOf(r)], related).kind).toBe("RELEASE");
    expect(decideCellWithRelated(now, [releaseOf(r)], related, 3, new WorkBudget(1))).toEqual({ kind: "SHOW_PRIOR", pendingChanges: true });
  });

  it("a long history (74 Members, 3 changes per read, 60 figures) stays well within the work limit", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const amounts = [...Array(74).keys()].map((i) => BigInt(100 + i));
    let history: PriorRelease[] = [];
    let released = 0;
    for (let round = 0; round <= 60; round++) {
      if (round > 0) {
        const changed = new Set<number>();
        while (changed.size < 3) changed.add(random() % 74);
        for (const i of changed) amounts[i] = BigInt(1000 + (random() % 100000));
      }
      const cell = cellOf(...amounts.map((amount, i) => contribution(i + 1, amount, round + 1, `m${i + 1}`)));
      const budget = new WorkBudget();
      const decision = decideCells([cell], new Map([[cellId(cell), history]]), 3, budget).get(cellId(cell))!;
      expect(budget.exhausted).toBe(false);
      if (decision.kind === "RELEASE") {
        released++;
        history = [{ ...releaseOf(cell.contributions), id: `r${round}` }, ...history];
      }
    }
    expect(released).toBeGreaterThan(50);
  });
});
