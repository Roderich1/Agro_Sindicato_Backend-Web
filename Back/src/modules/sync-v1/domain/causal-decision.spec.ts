import {
  CausalDecision,
  ContributionState,
  decideCausal,
  PredecessorInfo,
} from "./causal-decision";

const HEAD = "22222222-2222-4222-8222-222222222222";
const DISPUTE = "44444444-4444-4444-8444-444444444444";
const OTHER_REF = "55555555-5555-4555-8555-555555555555";

const state = (overrides: Partial<ContributionState> = {}): ContributionState => ({
  status: "ACTIVE",
  headOperationId: HEAD,
  openDisputeId: null,
  fencedThroughSequence: 0,
  ...overrides,
});
const none: PredecessorInfo = { kind: "NONE" };
const head: PredecessorInfo = { kind: "ACCEPTED", sequence: 2, isHead: true, isParentOfHead: false };
const parent: PredecessorInfo = { kind: "ACCEPTED", sequence: 1, isHead: false, isParentOfHead: true };
const older: PredecessorInfo = { kind: "ACCEPTED", sequence: 1, isHead: false, isParentOfHead: false };
const unknown: PredecessorInfo = { kind: "NOT_ACCEPTED_HERE" };

const decide = (
  action: "PUBLISH" | "SUPERSEDE" | "CANCEL",
  predecessor: PredecessorInfo,
  contribution: ContributionState,
  reconciliationReference: string | null = null,
) => decideCausal({ action, predecessor, contribution, reconciliationReference });

const applied = (status: "ACTIVE" | "CANCELLED", resolvesDispute = false): CausalDecision => ({
  kind: "APPLY",
  status,
  resolvesDispute,
});

describe("decideCausal — contract §6 table", () => {
  it("PUBLISH inicial / NEVER_PUBLISHED → ACTIVE", () => {
    expect(decide("PUBLISH", none, state({ status: "NEVER_PUBLISHED", headOperationId: null })))
      .toEqual(applied("ACTIVE"));
  });

  it("SUPERSEDE / ACTIVE on the head → replaces the total", () => {
    expect(decide("SUPERSEDE", head, state())).toEqual(applied("ACTIVE"));
  });

  it("CANCEL / ACTIVE on the head → CANCELLED tombstone", () => {
    expect(decide("CANCEL", head, state())).toEqual(applied("CANCELLED"));
  });

  it("PUBLISH nuevo tras CANCELLED needs the accepted CANCEL as predecessor", () => {
    const cancelled = state({ status: "CANCELLED" });
    expect(decide("PUBLISH", head, cancelled)).toEqual(applied("ACTIVE"));
    // No resurrection by a successor of an earlier head or a fresh root.
    expect(decide("PUBLISH", none, cancelled))
      .toEqual({ kind: "CONFLICT", code: "CANCELLED_PREDECESSOR", dispute: "OPEN" });
    expect(decide("SUPERSEDE", older, cancelled))
      .toEqual({ kind: "CONFLICT", code: "CANCELLED_PREDECESSOR", dispute: "OPEN" });
    expect(decide("SUPERSEDE", head, cancelled))
      .toEqual({ kind: "REJECT", code: "INVALID_TRANSITION" });
  });

  it("Resolución de CONTESTED: head and the open reference, SUPERSEDE or CANCEL", () => {
    const contested = state({ status: "CONTESTED", openDisputeId: DISPUTE });
    expect(decide("SUPERSEDE", head, contested, DISPUTE)).toEqual(applied("ACTIVE", true));
    expect(decide("CANCEL", head, contested, DISPUTE)).toEqual(applied("CANCELLED", true));
    expect(decide("PUBLISH", head, contested, DISPUTE))
      .toEqual({ kind: "REJECT", code: "INVALID_TRANSITION" });
  });

  it("Resolución de disputa mientras sigue CANCELLED: PUBLISH nuevo o CANCEL reafirmado", () => {
    const disputed = state({ status: "CANCELLED", openDisputeId: DISPUTE });
    expect(decide("PUBLISH", head, disputed, DISPUTE)).toEqual(applied("ACTIVE", true));
    expect(decide("CANCEL", head, disputed, DISPUTE)).toEqual(applied("CANCELLED", true));
    expect(decide("SUPERSEDE", head, disputed, DISPUTE))
      .toEqual({ kind: "REJECT", code: "INVALID_TRANSITION" });
  });
});

describe("decideCausal — forks, staleness and fences", () => {
  it("C11 two successors of the same head: the second is a CAUSAL_FORK", () => {
    expect(decide("SUPERSEDE", parent, state()))
      .toEqual({ kind: "CONFLICT", code: "CAUSAL_FORK", dispute: "OPEN" });
    // Two initial publications from two installations.
    expect(decide("PUBLISH", none, state()))
      .toEqual({ kind: "CONFLICT", code: "CAUSAL_FORK", dispute: "OPEN" });
  });

  it("a successor of an older accepted head is STALE_PREDECESSOR", () => {
    expect(decide("SUPERSEDE", older, state()))
      .toEqual({ kind: "CONFLICT", code: "STALE_PREDECESSOR", dispute: "OPEN" });
  });

  it("C27 unknown, foreign, rejected or other-contribution predecessor", () => {
    for (const action of ["PUBLISH", "SUPERSEDE", "CANCEL"] as const)
      expect(decide(action, unknown, state()))
        .toEqual({ kind: "REJECT", code: "INVALID_PREDECESSOR" });
  });

  it("C33 a successor of a branch fenced by a resolution is CAUSAL_FENCED", () => {
    const resolved = state({ fencedThroughSequence: 2 });
    const fenced: PredecessorInfo = { kind: "ACCEPTED", sequence: 2, isHead: false, isParentOfHead: true };
    expect(decide("SUPERSEDE", fenced, resolved))
      .toEqual({ kind: "REJECT", code: "CAUSAL_FENCED" });
    // The resolution head itself is not fenced.
    expect(decide("SUPERSEDE", { ...head, sequence: 3 }, resolved)).toEqual(applied("ACTIVE"));
  });

  it("C15 obsolete reference or stale head while a dispute is open", () => {
    const contested = state({ status: "CONTESTED", openDisputeId: DISPUTE });
    expect(decide("SUPERSEDE", head, contested, OTHER_REF))
      .toEqual({ kind: "CONFLICT", code: "RECONCILIATION_STALE", dispute: "KEEP" });
    expect(decide("SUPERSEDE", parent, contested, DISPUTE))
      .toEqual({ kind: "CONFLICT", code: "RECONCILIATION_STALE", dispute: "KEEP" });
  });

  it("another divergent intention while disputed rotates the reference", () => {
    expect(decide("SUPERSEDE", head, state({ status: "CONTESTED", openDisputeId: DISPUTE })))
      .toEqual({ kind: "CONFLICT", code: "CAUSAL_FORK", dispute: "ROTATE" });
    expect(decide("PUBLISH", none, state({ status: "CANCELLED", openDisputeId: DISPUTE })))
      .toEqual({ kind: "CONFLICT", code: "CANCELLED_PREDECESSOR", dispute: "ROTATE" });
  });

  it("rejects transitions that do not fit the state", () => {
    const empty = state({ status: "NEVER_PUBLISHED", headOperationId: null });
    expect(decide("SUPERSEDE", none, empty)).toEqual({ kind: "REJECT", code: "INVALID_TRANSITION" });
    expect(decide("CANCEL", none, empty)).toEqual({ kind: "REJECT", code: "INVALID_TRANSITION" });
    expect(decide("PUBLISH", head, state())).toEqual({ kind: "REJECT", code: "INVALID_TRANSITION" });
    expect(decide("CANCEL", head, state({ status: "CANCELLED" })))
      .toEqual({ kind: "REJECT", code: "INVALID_TRANSITION" });
    // A reconciliation reference without an open dispute resolves nothing.
    expect(decide("SUPERSEDE", head, state(), DISPUTE))
      .toEqual({ kind: "REJECT", code: "INVALID_TRANSITION" });
  });

  it("never decides by quantity: equal decisions for any quantity are implied", () => {
    // The decision has no quantity input at all (no LWW, max or sum).
    expect(decideCausal.length).toBe(1);
  });
});
