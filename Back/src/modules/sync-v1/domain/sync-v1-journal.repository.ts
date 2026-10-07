import type {
  SyncV1Action,
  SyncV1Disposition,
  SyncV1OperationJournal,
  SyncV1Outcome,
  SyncV1ProjectionType,
} from "@prisma/client";

/** Internal persistence context; a future authenticated adapter supplies it. */
export interface JournalIdentity {
  tenantId: string;
  memberId: string;
  operationId: string;
}

export interface ReserveJournal extends JournalIdentity {
  contractVersion: 1;
  projectionType: SyncV1ProjectionType;
  action: SyncV1Action;
  predecessorOperationId: string | null;
  /** Request causal reference, distinct from the eventual ACK conflict reference. */
  causalReconciliationReference: string | null;
  fingerprint: Uint8Array;
  fingerprintKeyVersion: number;
}

export type JournalResultCode =
  | "OK"
  | "CAUSAL_FORK"
  | "STALE_PREDECESSOR"
  | "CANCELLED_PREDECESSOR"
  | "RECONCILIATION_STALE"
  | "IDEMPOTENCY_MISMATCH"
  | "CAMPAIGN_NOT_OPEN"
  | "REFERENCE_UNAVAILABLE"
  | "UNIT_INCOMPATIBLE"
  | "QUANTITY_INVALID"
  | "INVALID_PREDECESSOR"
  | "INVALID_TRANSITION"
  | "OWNERSHIP_NOT_PROVEN"
  | "PURPOSE_NOT_AUTHORIZED"
  | "CAUSAL_FENCED";

export interface FinalizeJournal {
  outcome: SyncV1Outcome;
  disposition: SyncV1Disposition;
  resultCode: JournalResultCode;
  serverAcceptedAt: Date | null;
  reconciliationReference: string | null;
}

export type ReservationClassification =
  | "CREATED"
  | "EXISTING_SAME_FINGERPRINT"
  | "EXISTING_DIFFERENT_FINGERPRINT"
  | "EXISTING_PROCESSING";

export interface JournalReservation {
  classification: ReservationClassification;
  journal: SyncV1OperationJournal;
}

/** No HTTP, HMAC keys or projection effects; transaction belongs to the caller. */
export interface SyncV1JournalRepository<TTransaction> {
  reserve(
    input: ReserveJournal,
    transaction?: TTransaction,
  ): Promise<JournalReservation>;
  findByIdentity(
    identity: JournalIdentity,
    transaction?: TTransaction,
  ): Promise<SyncV1OperationJournal | null>;
  finalize(
    identity: JournalIdentity,
    result: FinalizeJournal,
    transaction?: TTransaction,
  ): Promise<{
    classification: "FINALIZED" | "ALREADY_FINAL";
    journal: SyncV1OperationJournal;
  }>;
}

export class JournalOwnershipError extends Error {
  constructor() {
    super("Journal Member does not belong to the effective tenant.");
  }
}

export class JournalValidationError extends Error {
  constructor() {
    super("Invalid journal metadata or final result.");
  }
}

export class JournalFinalizationError extends Error {
  constructor() {
    super("Journal absent or incompatible with its immutable final result.");
  }
}
