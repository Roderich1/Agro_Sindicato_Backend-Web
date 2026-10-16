import type { SyncV1OperationJournal } from "@prisma/client";
import type { JournalResultCode } from "./sync-v1-journal.repository";

/** Wire outcome (contract §7); the journal persists only the three final ones. */
export type AckOutcome =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "CONFLICT"
  | "REJECTED"
  | "RETRYABLE";

export type AckDisposition =
  | "RETIRE_FROM_OUTBOX"
  | "KEEP_FOR_RETRY"
  | "KEEP_FOR_RECONCILIATION"
  | "MOVE_TO_TERMINAL_FAILURE";

export type AckCode =
  | JournalResultCode
  | "OPERATION_IN_PROGRESS"
  | "DEPENDENCY_PENDING"
  | "TRANSIENT_UNAVAILABLE";

/** Exactly seven keys (contract §7). */
export interface SyncV1Ack {
  contractVersion: 1;
  operationId: string;
  outcome: AckOutcome;
  disposition: AckDisposition;
  serverAcceptedAt: string | null;
  code: AckCode;
  reconciliationReference: string | null;
}

export type RequestErrorCode =
  | "INVALID_REQUEST"
  | "FIELD_NOT_ALLOWED"
  | "CONTRACT_VERSION_MISMATCH"
  | "AUTH_REQUIRED"
  | "AUTH_CONTEXT_FORBIDDEN"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "REQUEST_TOO_LARGE"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE"
  | "OPERATION_NOT_FOUND";

/** Exactly four keys; operationId is always null (contract §9). */
export interface SyncV1RequestError {
  contractVersion: 1;
  operationId: null;
  errorCode: RequestErrorCode;
  disposition: AckDisposition;
}

const ERROR_DISPOSITION: Record<RequestErrorCode, AckDisposition> = {
  INVALID_REQUEST: "MOVE_TO_TERMINAL_FAILURE",
  FIELD_NOT_ALLOWED: "MOVE_TO_TERMINAL_FAILURE",
  UNSUPPORTED_MEDIA_TYPE: "MOVE_TO_TERMINAL_FAILURE",
  REQUEST_TOO_LARGE: "MOVE_TO_TERMINAL_FAILURE",
  AUTH_REQUIRED: "KEEP_FOR_RETRY",
  RATE_LIMITED: "KEEP_FOR_RETRY",
  TEMPORARILY_UNAVAILABLE: "KEEP_FOR_RETRY",
  OPERATION_NOT_FOUND: "KEEP_FOR_RETRY",
  CONTRACT_VERSION_MISMATCH: "KEEP_FOR_RECONCILIATION",
  AUTH_CONTEXT_FORBIDDEN: "KEEP_FOR_RECONCILIATION",
};

export function requestError(errorCode: RequestErrorCode): SyncV1RequestError {
  return {
    contractVersion: 1,
    operationId: null,
    errorCode,
    disposition: ERROR_DISPOSITION[errorCode],
  };
}

const DISPOSITION_BY_OUTCOME: Record<AckOutcome, AckDisposition> = {
  APPLIED: "RETIRE_FROM_OUTBOX",
  ALREADY_APPLIED: "RETIRE_FROM_OUTBOX",
  CONFLICT: "KEEP_FOR_RECONCILIATION",
  REJECTED: "MOVE_TO_TERMINAL_FAILURE",
  RETRYABLE: "KEEP_FOR_RETRY",
};

export function ack(
  operationId: string,
  outcome: AckOutcome,
  code: AckCode,
  options: { serverAcceptedAt?: Date | null; reconciliationReference?: string | null } = {},
): SyncV1Ack {
  return {
    contractVersion: 1,
    operationId,
    outcome,
    disposition: DISPOSITION_BY_OUTCOME[outcome],
    serverAcceptedAt: options.serverAcceptedAt
      ? options.serverAcceptedAt.toISOString()
      : null,
    code,
    reconciliationReference: options.reconciliationReference ?? null,
  };
}

/**
 * Replays a persisted final result: same outcome, code, reference and
 * acceptance time. APPLIED is presented as ALREADY_APPLIED (contract §5, §9).
 */
export function ackFromJournal(journal: SyncV1OperationJournal): SyncV1Ack {
  if (journal.processingState !== "FINAL" || !journal.outcome)
    return ack(journal.operationId, "RETRYABLE", "OPERATION_IN_PROGRESS");
  return ack(
    journal.operationId,
    journal.outcome === "APPLIED" ? "ALREADY_APPLIED" : journal.outcome,
    journal.resultCode as JournalResultCode,
    {
      serverAcceptedAt: journal.serverAcceptedAt,
      reconciliationReference: journal.reconciliationReference,
    },
  );
}
