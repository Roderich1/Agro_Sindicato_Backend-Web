import { Prisma, PrismaClient, SyncV1OperationJournal } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import {
  FinalizeJournal,
  JournalFinalizationError,
  JournalIdentity,
  JournalOwnershipError,
  JournalValidationError,
  ReserveJournal,
  SyncV1JournalRepository,
} from "../domain/sync-v1-journal.repository";

const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const conflictCodes = new Set([
  "CAUSAL_FORK",
  "STALE_PREDECESSOR",
  "CANCELLED_PREDECESSOR",
  "RECONCILIATION_STALE",
]);
const rejectionCodes = new Set([
  "IDEMPOTENCY_MISMATCH",
  "CAMPAIGN_NOT_OPEN",
  "REFERENCE_UNAVAILABLE",
  "UNIT_INCOMPATIBLE",
  "QUANTITY_INVALID",
  "INVALID_PREDECESSOR",
  "INVALID_TRANSITION",
  "OWNERSHIP_NOT_PROVEN",
  "PURPOSE_NOT_AUTHORIZED",
  "CAUSAL_FENCED",
]);

/** Dormant adapter: instantiate explicitly in tests, never registered in AppModule. */
export class PrismaSyncV1JournalRepository implements SyncV1JournalRepository<Prisma.TransactionClient> {
  constructor(private readonly prisma: PrismaClient) {}

  private withTransaction<T>(
    transaction: Prisma.TransactionClient | undefined,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return transaction
      ? work(transaction)
      : this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 10000,
          timeout: 10000,
        });
  }

  private async validateOwner(
    tx: Prisma.TransactionClient,
    identity: JournalIdentity,
  ) {
    if (
      !identity.tenantId ||
      !identity.memberId ||
      !uuidV4.test(identity.operationId)
    ) {
      throw new JournalValidationError();
    }
    const member = await tx.member.findUnique({
      where: { id: identity.memberId },
      select: { tenantId: true },
    });
    if (member?.tenantId !== identity.tenantId)
      throw new JournalOwnershipError();
    // This proves the FK ownership only, not session/role/ClientRegistration authorization.
  }

  private identityWhere(identity: JournalIdentity) {
    return {
      tenantId: identity.tenantId,
      memberId: identity.memberId,
      operationId: identity.operationId,
    };
  }

  private get(tx: Prisma.TransactionClient, identity: JournalIdentity) {
    return tx.syncV1OperationJournal.findUnique({
      where: { tenantId_memberId_operationId: this.identityWhere(identity) },
    });
  }

  async reserve(input: ReserveJournal, transaction?: Prisma.TransactionClient) {
    if (
      input.contractVersion !== 1 ||
      !["CONSUMPTION_TOTAL", "DECLARED_NEED"].includes(input.projectionType) ||
      !["PUBLISH", "SUPERSEDE", "CANCEL"].includes(input.action) ||
      input.fingerprint?.byteLength !== 32 ||
      !Number.isSafeInteger(input.fingerprintKeyVersion) ||
      input.fingerprintKeyVersion <= 0 ||
      (input.predecessorOperationId !== null &&
        !uuidV4.test(input.predecessorOperationId)) ||
      (input.causalReconciliationReference !== null &&
        !uuidV4.test(input.causalReconciliationReference))
    ) {
      throw new JournalValidationError();
    }
    // Snapshot mutable bytes before any await. Never spread untrusted extra properties.
    const fingerprint = Uint8Array.from(input.fingerprint);
    input = {
      ...this.identityWhere(input),
      contractVersion: input.contractVersion,
      projectionType: input.projectionType,
      action: input.action,
      predecessorOperationId: input.predecessorOperationId,
      causalReconciliationReference: input.causalReconciliationReference,
      fingerprint,
      fingerprintKeyVersion: input.fingerprintKeyVersion,
    };
    return this.withTransaction(transaction, async (tx) => {
      await this.validateOwner(tx, input);
      // ON CONFLICT DO NOTHING does not abort an external PostgreSQL transaction.
      // Catching P2002 after a plain INSERT would leave that transaction unusable.
      const inserted = await tx.syncV1OperationJournal.createMany({
        data: {
          ...this.identityWhere(input),
          contractVersion: input.contractVersion,
          projectionType: input.projectionType,
          action: input.action,
          predecessorOperationId: input.predecessorOperationId,
          causalReconciliationReference: input.causalReconciliationReference,
          fingerprint,
          fingerprintKeyVersion: input.fingerprintKeyVersion,
        },
        skipDuplicates: true,
      });
      const journal = await this.get(tx, input);
      if (!journal) throw new JournalFinalizationError();
      if (inserted.count === 1)
        return { classification: "CREATED" as const, journal };
      const same =
        journal.fingerprintKeyVersion === input.fingerprintKeyVersion &&
        journal.fingerprint.byteLength === fingerprint.byteLength &&
        timingSafeEqual(journal.fingerprint, fingerprint) &&
        journal.contractVersion === input.contractVersion &&
        journal.projectionType === input.projectionType &&
        journal.action === input.action &&
        journal.predecessorOperationId === input.predecessorOperationId &&
        journal.causalReconciliationReference ===
          input.causalReconciliationReference;
      if (!same)
        return {
          classification: "EXISTING_DIFFERENT_FINGERPRINT" as const,
          journal,
        };
      return {
        classification:
          journal.processingState === "PROCESSING"
            ? ("EXISTING_PROCESSING" as const)
            : ("EXISTING_SAME_FINGERPRINT" as const),
        journal,
      };
    });
  }

  findByIdentity(
    identity: JournalIdentity,
    transaction?: Prisma.TransactionClient,
  ) {
    identity = this.identityWhere(identity);
    return this.withTransaction(transaction, async (tx) => {
      await this.validateOwner(tx, identity);
      return this.get(tx, identity);
    });
  }

  async finalize(
    identity: JournalIdentity,
    result: FinalizeJournal,
    transaction?: Prisma.TransactionClient,
  ) {
    identity = this.identityWhere(identity);
    const valid =
      (result.outcome === "APPLIED" &&
        result.disposition === "RETIRE_FROM_OUTBOX" &&
        result.resultCode === "OK" &&
        result.serverAcceptedAt instanceof Date &&
        Number.isFinite(result.serverAcceptedAt.getTime()) &&
        result.reconciliationReference === null) ||
      (result.outcome === "CONFLICT" &&
        result.disposition === "KEEP_FOR_RECONCILIATION" &&
        conflictCodes.has(result.resultCode) &&
        result.serverAcceptedAt === null &&
        typeof result.reconciliationReference === "string" &&
        uuidV4.test(result.reconciliationReference)) ||
      (result.outcome === "REJECTED" &&
        result.disposition === "MOVE_TO_TERMINAL_FAILURE" &&
        rejectionCodes.has(result.resultCode) &&
        result.serverAcceptedAt === null &&
        result.reconciliationReference === null);
    if (!valid) throw new JournalValidationError();
    const finalData = {
      processingState: "FINAL" as const,
      outcome: result.outcome,
      disposition: result.disposition,
      resultCode: result.resultCode,
      serverAcceptedAt:
        result.serverAcceptedAt && new Date(result.serverAcceptedAt),
      reconciliationReference: result.reconciliationReference,
    };
    return this.withTransaction(transaction, async (tx) => {
      await this.validateOwner(tx, identity);
      const updated = await tx.syncV1OperationJournal.updateMany({
        where: {
          ...this.identityWhere(identity),
          processingState: "PROCESSING",
        },
        data: finalData,
      });
      const journal = await this.get(tx, identity);
      if (!journal) throw new JournalFinalizationError();
      if (updated.count === 1)
        return { classification: "FINALIZED" as const, journal };
      if (!this.sameFinal(journal, finalData))
        throw new JournalFinalizationError();
      return { classification: "ALREADY_FINAL" as const, journal };
    });
  }

  private sameFinal(journal: SyncV1OperationJournal, result: FinalizeJournal) {
    return (
      journal.processingState === "FINAL" &&
      journal.outcome === result.outcome &&
      journal.disposition === result.disposition &&
      journal.resultCode === result.resultCode &&
      (journal.serverAcceptedAt?.getTime() ?? null) ===
        (result.serverAcceptedAt?.getTime() ?? null) &&
      journal.reconciliationReference === result.reconciliationReference
    );
  }
}
