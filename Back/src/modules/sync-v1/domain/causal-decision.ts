import type { SyncV1Action, SyncV1ContributionStatus } from "@prisma/client";

/**
 * Causal decision of contract §6, without I/O. It never chooses by arrival,
 * timestamp, UUID, quantity or installation: an intention is accepted only if
 * it continues the current accepted head of its own contribution; anything
 * else is a conflict for the owner to resolve, or a rejection.
 */
export interface ContributionState {
  status: SyncV1ContributionStatus;
  headOperationId: string | null;
  /** Open dispute reference; null when there is none. */
  openDisputeId: string | null;
  fencedThroughSequence: number;
}

export type PredecessorInfo =
  /** `predecessorOperationId` is null. */
  | { kind: "NONE" }
  /** Unknown, foreign, rejected/conflicting or from another contribution. */
  | { kind: "NOT_ACCEPTED_HERE" }
  | {
      kind: "ACCEPTED";
      sequence: number;
      isHead: boolean;
      /** The predecessor is the direct predecessor of the current head. */
      isParentOfHead: boolean;
    };

export type ConflictCode =
  | "CAUSAL_FORK"
  | "STALE_PREDECESSOR"
  | "CANCELLED_PREDECESSOR"
  | "RECONCILIATION_STALE";

export type RejectionCode =
  | "INVALID_PREDECESSOR"
  | "INVALID_TRANSITION"
  | "CAUSAL_FENCED";

export type CausalDecision =
  | {
      kind: "APPLY";
      status: "ACTIVE" | "CANCELLED";
      /** Closes the open dispute and fences every earlier transition. */
      resolvesDispute: boolean;
    }
  | {
      kind: "CONFLICT";
      code: ConflictCode;
      /** OPEN a dispute, ROTATE the open one, or KEEP it unchanged. */
      dispute: "OPEN" | "ROTATE" | "KEEP";
    }
  | { kind: "REJECT"; code: RejectionCode };

const reject = (code: RejectionCode): CausalDecision => ({ kind: "REJECT", code });
const conflict = (
  code: ConflictCode,
  dispute: "OPEN" | "ROTATE" | "KEEP",
): CausalDecision => ({ kind: "CONFLICT", code, dispute });
const apply = (
  status: "ACTIVE" | "CANCELLED",
  resolvesDispute = false,
): CausalDecision => ({ kind: "APPLY", status, resolvesDispute });

export function decideCausal(input: {
  action: SyncV1Action;
  predecessor: PredecessorInfo;
  reconciliationReference: string | null;
  contribution: ContributionState;
}): CausalDecision {
  const { action, predecessor, reconciliationReference: ref } = input;
  const c = input.contribution;

  // The predecessor must be an accepted transition of this same contribution.
  if (predecessor.kind === "NOT_ACCEPTED_HERE") return reject("INVALID_PREDECESSOR");
  // A branch closed by an explicit resolution never competes again.
  if (
    predecessor.kind === "ACCEPTED" &&
    !predecessor.isHead &&
    predecessor.sequence <= c.fencedThroughSequence
  ) {
    return reject("CAUSAL_FENCED");
  }
  // SUPERSEDE and CANCEL always continue an accepted predecessor.
  if (action !== "PUBLISH" && predecessor.kind === "NONE")
    return reject("INVALID_TRANSITION");

  if (c.openDisputeId !== null) {
    if (ref === c.openDisputeId) {
      // Resolution: a new owner decision on the head the dispute shows.
      if (predecessor.kind !== "ACCEPTED" || !predecessor.isHead)
        return conflict("RECONCILIATION_STALE", "KEEP");
      if (c.status === "CONTESTED") {
        if (action === "SUPERSEDE") return apply("ACTIVE", true);
        if (action === "CANCEL") return apply("CANCELLED", true);
        return reject("INVALID_TRANSITION");
      }
      if (c.status === "CANCELLED") {
        // Re-publish against the accepted CANCEL, or reaffirm the withdrawal.
        if (action === "PUBLISH") return apply("ACTIVE", true);
        if (action === "CANCEL") return apply("CANCELLED", true);
        return reject("INVALID_TRANSITION");
      }
      return reject("INVALID_TRANSITION");
    }
    // A reference that is not the open dispute's is obsolete.
    if (ref !== null) return conflict("RECONCILIATION_STALE", "KEEP");
    // Another divergent intention joins the dispute: its reference changes.
    return conflict(
      c.status === "CANCELLED" ? "CANCELLED_PREDECESSOR" : "CAUSAL_FORK",
      "ROTATE",
    );
  }

  // Without an open dispute a reconciliation reference has nothing to resolve.
  if (ref !== null) return reject("INVALID_TRANSITION");

  switch (c.status) {
    case "NEVER_PUBLISHED":
      return action === "PUBLISH" && predecessor.kind === "NONE"
        ? apply("ACTIVE")
        : reject("INVALID_TRANSITION");
    case "ACTIVE":
      if (predecessor.kind === "ACCEPTED" && predecessor.isHead) {
        if (action === "SUPERSEDE") return apply("ACTIVE");
        if (action === "CANCEL") return apply("CANCELLED");
        return reject("INVALID_TRANSITION");
      }
      // A second initial PUBLISH, or a successor of an earlier head.
      if (predecessor.kind === "NONE" || predecessor.isParentOfHead)
        return conflict("CAUSAL_FORK", "OPEN");
      return conflict("STALE_PREDECESSOR", "OPEN");
    case "CANCELLED":
      if (predecessor.kind === "ACCEPTED" && predecessor.isHead) {
        return action === "PUBLISH"
          ? apply("ACTIVE")
          : reject("INVALID_TRANSITION");
      }
      // A late successor never reactivates a withdrawal (no resurrection).
      return conflict("CANCELLED_PREDECESSOR", "OPEN");
    case "CONTESTED":
      // Invariant: CONTESTED always has an open dispute.
      return reject("INVALID_TRANSITION");
  }
}
