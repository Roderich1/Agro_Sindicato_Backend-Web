/**
 * Closed error codes of the E2 routes (contract §4): `/api/v1/joint-purchase-calls`
 * (institutional) and `/api/v1/me/joint-purchase-calls` (farmer). The body is
 * always `{ errorCode }`, plus `reason` (CALL_NOT_OPEN), `status`
 * (INVALID_TRANSITION, CALL_NOT_EDITABLE, CALL_NOT_CLOSED) or `participation`
 * (STALE_SEQUENCE). Nothing from the request is echoed.
 *
 * E2-P3 (§10.2): 403 MANAGE_FORBIDDEN (editing, opening, cancelling or
 * closing without being the responsible nor holding MANAGE), 403
 * COLLABORATORS_FORBIDDEN (granting or revoking without being the
 * responsible) and 422 COLLABORATOR_NOT_ELIGIBLE (the grantee is not another
 * active DIRECTIVA/ADMINISTRADOR of the tenant; never says why).
 *
 * P-A (§12): 403 SUBSTITUTION_FORBIDDEN (granting the substitution permission
 * without being an eligible ADMINISTRADOR, or substituting without holding
 * it), 422 GRANTEE_NOT_ELIGIBLE / SUCCESSOR_NOT_ELIGIBLE (never says why),
 * 409 RESPONSIBLE_STILL_ELIGIBLE (B1: only a responsible who is no longer
 * eligible is substituted), 409 RESPONSIBLE_CHANGED (the responsible version
 * is not the one the client saw; carries `responsible_version`), 409
 * REQUEST_ID_REUSED, 409 DELEGATION_NOT_PENDING and, for the farmer, 409
 * AUTHORIZATION_REQUIRED (widening before authorizing the current
 * responsible). Every code fits the 24 characters of the journal.
 */
export type CallErrorCode =
  | "PAYLOAD_INVALID"
  | "AUTH_REQUIRED"
  | "AUTH_CONTEXT_FORBIDDEN"
  | "CALL_NOT_FOUND"
  | "CAMPAIGN_NOT_FOUND"
  | "CAMPAIGN_NOT_ELIGIBLE"
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_CAMPAIGN_MISMATCH"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "PRODUCT_UNIT_UNSUPPORTED"
  | "PRODUCT_NOT_CANONICAL"
  | "PRODUCT_DUPLICATED"
  | "PRODUCT_IN_OPEN_CALL"
  | "RESPONSIBLE_NOT_ELIGIBLE"
  | "DEADLINE_IN_PAST"
  | "CONFIRMATION_REQUIRED"
  | "REASON_REQUIRED"
  | "INVALID_TRANSITION"
  | "CALL_NOT_EDITABLE"
  | "CALL_NOT_CLOSED"
  | "PARTICIPANTS_FORBIDDEN"
  | "MANAGE_FORBIDDEN"
  | "COLLABORATORS_FORBIDDEN"
  | "COLLABORATOR_NOT_ELIGIBLE"
  | "CALL_NOT_OPEN"
  | "STALE_SEQUENCE"
  | "OPERATION_ID_REUSED"
  | "CONSENT_REQUIRED"
  | "PARTICIPATION_REQUIRED"
  | "WIDENING_NOT_ALLOWED"
  | "SUBSTITUTION_FORBIDDEN"
  | "GRANTEE_NOT_ELIGIBLE"
  | "RESPONSIBLE_STILL_ELIGIBLE"
  | "SUCCESSOR_NOT_ELIGIBLE"
  | "RESPONSIBLE_CHANGED"
  | "REQUEST_ID_REUSED"
  | "AUTHORIZATION_REQUIRED"
  | "DELEGATION_NOT_PENDING"
  | "PRODUCT_NOT_IN_CALL"
  | "QUANTITY_INVALID"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE";

export const CALL_ERROR_CODES: readonly CallErrorCode[] = [
  "PAYLOAD_INVALID",
  "AUTH_REQUIRED",
  "AUTH_CONTEXT_FORBIDDEN",
  "CALL_NOT_FOUND",
  "CAMPAIGN_NOT_FOUND",
  "CAMPAIGN_NOT_ELIGIBLE",
  "PROPOSAL_NOT_FOUND",
  "PROPOSAL_CAMPAIGN_MISMATCH",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_INACTIVE",
  "PRODUCT_UNIT_UNSUPPORTED",
  "PRODUCT_NOT_CANONICAL",
  "PRODUCT_DUPLICATED",
  "PRODUCT_IN_OPEN_CALL",
  "RESPONSIBLE_NOT_ELIGIBLE",
  "DEADLINE_IN_PAST",
  "CONFIRMATION_REQUIRED",
  "REASON_REQUIRED",
  "INVALID_TRANSITION",
  "CALL_NOT_EDITABLE",
  "CALL_NOT_CLOSED",
  "PARTICIPANTS_FORBIDDEN",
  "MANAGE_FORBIDDEN",
  "COLLABORATORS_FORBIDDEN",
  "COLLABORATOR_NOT_ELIGIBLE",
  "CALL_NOT_OPEN",
  "STALE_SEQUENCE",
  "OPERATION_ID_REUSED",
  "CONSENT_REQUIRED",
  "PARTICIPATION_REQUIRED",
  "WIDENING_NOT_ALLOWED",
  "SUBSTITUTION_FORBIDDEN",
  "GRANTEE_NOT_ELIGIBLE",
  "RESPONSIBLE_STILL_ELIGIBLE",
  "SUCCESSOR_NOT_ELIGIBLE",
  "RESPONSIBLE_CHANGED",
  "REQUEST_ID_REUSED",
  "AUTHORIZATION_REQUIRED",
  "DELEGATION_NOT_PENDING",
  "PRODUCT_NOT_IN_CALL",
  "QUANTITY_INVALID",
  "RATE_LIMITED",
  "TEMPORARILY_UNAVAILABLE",
];

/** Closed extra fields an error body may carry besides `errorCode`. */
export interface CallErrorExtra {
  reason?: string;
  status?: string;
  participation?: unknown;
  /** P-A: the current responsible version (RESPONSIBLE_CHANGED). */
  responsible_version?: number;
}

export class CallHttpError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: CallErrorCode,
    readonly extra: CallErrorExtra = {},
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(errorCode);
  }

  body(): Record<string, unknown> {
    return { errorCode: this.errorCode, ...this.extra };
  }
}

/** The farmer: taken from the authenticated session only (SyncV1AuthGuard). */
export interface FarmerContext {
  tenantId: string;
  memberId: string;
}

/** The institutional user: JWT principal, current role resolved from the database. */
export interface InstitutionalActor {
  tenantId: string;
  userId: string;
}
