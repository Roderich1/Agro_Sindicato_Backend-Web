import type { JointPurchaseCallStatus } from "@prisma/client";

/**
 * E2-D2: `DRAFT → OPEN → CLOSED`, `DRAFT → CANCELLED`, `OPEN → CANCELLED`.
 * No reopening or extension; CLOSED and CANCELLED are final. The migration's
 * trigger enforces the same table in the database.
 */
const TRANSITIONS: Readonly<Record<JointPurchaseCallStatus, readonly JointPurchaseCallStatus[]>> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: JointPurchaseCallStatus, to: JointPurchaseCallStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isFinal(status: JointPurchaseCallStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Name, deadline, responsible and products change only in DRAFT. */
export function isEditable(status: JointPurchaseCallStatus): boolean {
  return status === "DRAFT";
}

export type CallNotOpenReason = "DEADLINE_PASSED" | "CLOSED" | "CANCELLED" | "DRAFT";

/**
 * E2-D11: the server decides the deadline. An operation received with
 * `now >= deadlineAt`, or on a call that is not OPEN, is refused with the
 * reason; null when the call accepts operations now.
 */
export function notOpenReason(
  call: { status: JointPurchaseCallStatus; deadlineAt: Date },
  now: Date,
): CallNotOpenReason | null {
  if (call.status !== "OPEN") return call.status;
  if (now.getTime() >= call.deadlineAt.getTime()) return "DEADLINE_PASSED";
  return null;
}

/** E2-D12: the closing cutoff never goes beyond the deadline. */
export function closingCutoff(closedAt: Date, deadlineAt: Date): Date {
  return closedAt.getTime() <= deadlineAt.getTime() ? closedAt : deadlineAt;
}
