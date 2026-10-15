import { Injectable, Logger } from "@nestjs/common";
import { Prisma, SyncV1Contribution } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { ack, ackFromJournal, SyncV1Ack } from "../domain/ack";
import { decideCausal } from "../domain/causal-decision";
import { quantityInRange, SyncV1Envelope } from "../domain/envelope";
import type { FingerprintKeyring } from "../domain/fingerprint";
import type {
  JournalIdentity,
  JournalResultCode,
} from "../domain/sync-v1-journal.repository";
import { baseUnitForCentralUnit } from "../domain/units";
import { PrismaSyncV1ContributionRepository } from "../infrastructure/prisma-sync-v1-contribution.repository";
import { PrismaSyncV1JournalRepository } from "../infrastructure/prisma-sync-v1-journal.repository";
import { SyncV1Config } from "./sync-v1-config";
import { SyncV1Context, SyncV1HttpError } from "./sync-v1-http-error";

/** Prisma errors that leave no committed result: the client retries. */
const TRANSIENT_PRISMA_CODES = new Set(["P2028", "P2034"]);

/** Advisory lock key of one operation, scoped to its owner. */
const operationLockKey = (
  owner: { tenantId: string; memberId: string },
  operationId: string,
) => `sync-v1:${owner.tenantId}:${owner.memberId}:${operationId}`;

/** The predecessor is still being processed: roll back, nothing is kept. */
class DependencyPending extends Error {}

/**
 * F05-SYNC-05 push (contract §5–§10). One transaction holds the journal
 * reservation, the contribution lock, the decision, the transition and the
 * final result: either everything commits or nothing does, and the ACK is
 * built only from what was committed. Never logs quantities or the body.
 */
@Injectable()
export class PushOperationUseCase {
  private readonly logger = new Logger("SyncV1Push");
  private readonly journal: PrismaSyncV1JournalRepository;
  private readonly contributions = new PrismaSyncV1ContributionRepository();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SyncV1Config,
  ) {
    this.journal = new PrismaSyncV1JournalRepository(prisma);
  }

  async execute(
    context: SyncV1Context,
    envelope: SyncV1Envelope,
  ): Promise<SyncV1Ack> {
    const keyring = this.config.keyring;
    if (!this.config.admissionOpen || !keyring)
      throw new SyncV1HttpError(503, "TEMPORARILY_UNAVAILABLE");
    let result: SyncV1Ack;
    try {
      result = await this.prisma.$transaction(
        (tx) => this.decide(tx, keyring, context, envelope),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5000,
          timeout: 15000,
        },
      );
    } catch (error) {
      if (error instanceof DependencyPending) {
        // Not a final result: the reservation was rolled back (§7, C28).
        result = ack(envelope.operationId, "RETRYABLE", "DEPENDENCY_PENDING");
      } else if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        TRANSIENT_PRISMA_CODES.has(error.code)
      ) {
        throw new SyncV1HttpError(503, "TEMPORARILY_UNAVAILABLE");
      } else {
        throw error;
      }
    }
    this.logger.log(
      `push outcome=${result.outcome} code=${result.code} operation=${envelope.operationId} type=${envelope.projectionType} action=${envelope.action}`,
    );
    return result;
  }

  private async decide(
    tx: Prisma.TransactionClient,
    keyring: FingerprintKeyring,
    context: SyncV1Context,
    envelope: SyncV1Envelope,
  ): Promise<SyncV1Ack> {
    const identity: JournalIdentity = {
      tenantId: context.tenantId,
      memberId: context.memberId,
      operationId: envelope.operationId,
    };
    await this.revalidateContext(tx, context);
    // Held until commit or rollback: requests with the same operationId take
    // turns, and a successor can tell that this one is still in processing.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${operationLockKey(identity, identity.operationId)}, 0))`;
    // A journal created before a key rotation is compared with its own key.
    const existing = await this.journal.findByIdentity(identity, tx);
    const version = existing?.fingerprintKeyVersion ?? keyring.currentVersion;
    const fingerprint = keyring.fingerprint(envelope, version);
    if (!fingerprint) throw new SyncV1HttpError(503, "TEMPORARILY_UNAVAILABLE");

    const reservation = await this.journal.reserve(
      {
        ...identity,
        contractVersion: 1,
        projectionType: envelope.projectionType,
        action: envelope.action,
        predecessorOperationId: envelope.causal.predecessorOperationId,
        causalReconciliationReference: envelope.causal.reconciliationReference,
        fingerprint,
        fingerprintKeyVersion: version,
      },
      tx,
    );
    switch (reservation.classification) {
      case "EXISTING_SAME_FINGERPRINT":
        // Replay: the persisted result, even if the catalogue changed since.
        return ackFromJournal(reservation.journal);
      case "EXISTING_DIFFERENT_FINGERPRINT":
        // The original result is kept; this mutation attempt is not recorded.
        return ack(envelope.operationId, "REJECTED", "IDEMPOTENCY_MISMATCH");
      case "EXISTING_PROCESSING":
        return ack(envelope.operationId, "RETRYABLE", "OPERATION_IN_PROGRESS");
      case "CREATED":
        return this.process(tx, identity, envelope);
    }
  }

  /**
   * Authorization revalidated at the decision point, inside the transaction
   * (contract §10, matrix C40). `FOR SHARE` makes a concurrent revocation of
   * the session, registration, Member, account or tenant wait for this
   * commit, or be seen here if it committed first: never half-way.
   */
  private async revalidateContext(
    tx: Prisma.TransactionClient,
    context: SyncV1Context,
  ): Promise<void> {
    if (!context.sessionId) throw new SyncV1HttpError(403, "AUTH_CONTEXT_FORBIDDEN");
    const valid = await tx.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok
      FROM "AuthSession" s
      JOIN "Member" m ON m."id" = s."memberId"
      JOIN "User" u ON u."id" = m."userId"
      JOIN "Tenant" t ON t."id" = m."tenantId"
      JOIN "ClientRegistration" r ON r."id" = s."clientRegistrationId"
      WHERE s."id" = ${context.sessionId}
        AND s."status" = 'ACTIVE' AND s."expiresAt" > now()
        AND m."id" = ${context.memberId} AND m."tenantId" = ${context.tenantId}
        AND m."isActive" AND m."role" = 'AGRICULTOR'
        AND u."isActive" AND u."tenantId" = m."tenantId" AND t."isActive"
        AND r."status" = 'ACTIVE' AND r."memberId" = m."id" AND r."tenantId" = m."tenantId"
      FOR SHARE OF s, m, u, t, r`;
    if (valid.length !== 1) throw new SyncV1HttpError(403, "AUTH_CONTEXT_FORBIDDEN");
  }

  /**
   * True while another transaction holds the lock of that operation. The
   * attempt never waits, so it cannot deadlock with the predecessor, which may
   * be waiting for the contribution lock held here.
   */
  private async inFlight(
    tx: Prisma.TransactionClient,
    owner: { tenantId: string; memberId: string },
    operationId: string,
  ): Promise<boolean> {
    const [row] = await tx.$queryRaw<{ free: boolean }[]>`
      SELECT pg_try_advisory_xact_lock_shared(hashtextextended(${operationLockKey(owner, operationId)}, 0)) AS free`;
    return !row.free;
  }

  private async process(
    tx: Prisma.TransactionClient,
    identity: JournalIdentity,
    envelope: SyncV1Envelope,
  ): Promise<SyncV1Ack> {
    const owner = { tenantId: identity.tenantId, memberId: identity.memberId };
    const { campaign_ref, product_ref, base_unit, quantity_base } =
      envelope.payload;
    const valued = envelope.action !== "CANCEL";

    // Inexistent, foreign or inactive references share one code: no
    // cross-tenant existence is revealed.
    const campaign = await tx.agriculturalCampaign.findFirst({
      where: { id: campaign_ref, tenantId: identity.tenantId },
      select: { id: true, status: true, isActive: true },
    });
    const product = await tx.product.findFirst({
      where: { id: product_ref, tenantId: identity.tenantId },
      select: { id: true, unit: true, isActive: true },
    });
    if (!campaign || !product || (valued && !product.isActive))
      return this.reject(tx, identity, "REFERENCE_UNAVAILABLE", null);
    if (baseUnitForCentralUnit(product.unit) !== base_unit)
      return this.reject(tx, identity, "UNIT_INCOMPATIBLE", null);
    if (valued && !quantityInRange(quantity_base!))
      return this.reject(tx, identity, "QUANTITY_INVALID", null);

    const key = {
      ...owner,
      projectionType: envelope.projectionType,
      campaignId: campaign.id,
      productId: product.id,
      baseUnit: base_unit,
    };
    // CANCEL may withdraw in a closed campaign; new values need it open.
    if (valued && !(campaign.status === "ABIERTA" && campaign.isActive)) {
      const current = await this.contributions.find(tx, key);
      return this.reject(tx, identity, "CAMPAIGN_NOT_OPEN", current?.id ?? null);
    }

    const contribution = await this.contributions.lockOrCreate(tx, key);
    const predecessorId = envelope.causal.predecessorOperationId;
    const predecessor = await this.contributions.predecessorInfo(
      tx,
      owner,
      contribution,
      predecessorId,
    );
    // An own predecessor not yet visible may be in flight in another
    // request: DEPENDENCY_PENDING, never a terminal rejection (§6, C28).
    if (
      predecessor.kind === "NOT_ACCEPTED_HERE" &&
      predecessorId !== null &&
      (await this.inFlight(tx, owner, predecessorId))
    ) {
      throw new DependencyPending();
    }
    const decision = decideCausal({
      action: envelope.action,
      predecessor,
      reconciliationReference: envelope.causal.reconciliationReference,
      contribution: {
        status: contribution.status,
        headOperationId: contribution.headOperationId,
        openDisputeId: contribution.reconciliationReference,
        fencedThroughSequence: contribution.fencedThroughSequence,
      },
    });

    switch (decision.kind) {
      case "REJECT":
        return this.reject(tx, identity, decision.code, contribution.id);
      case "CONFLICT":
        return this.conflict(tx, identity, contribution, decision);
      case "APPLY":
        return this.apply(tx, identity, contribution, decision, quantity_base);
    }
  }

  private async apply(
    tx: Prisma.TransactionClient,
    identity: JournalIdentity,
    contribution: SyncV1Contribution,
    decision: { status: "ACTIVE" | "CANCELLED"; resolvesDispute: boolean },
    quantity: string | null,
  ): Promise<SyncV1Ack> {
    const now = new Date();
    const sequence = contribution.lastSequence + 1;
    if (decision.resolvesDispute && contribution.reconciliationReference) {
      await tx.syncV1Dispute.update({
        where: { id: contribution.reconciliationReference },
        data: {
          closedAt: now,
          closeReason: "RESOLVED",
          resolvedByOperationId: identity.operationId,
        },
      });
    }
    await tx.syncV1Contribution.update({
      where: { id: contribution.id },
      data: {
        status: decision.status,
        headOperationId: identity.operationId,
        // A total replaces the previous one; it is never added to it.
        quantityBase: decision.status === "ACTIVE" ? BigInt(quantity!) : null,
        reconciliationReference: null,
        lastSequence: sequence,
        // A resolution fences every earlier branch (contract §6).
        fencedThroughSequence: decision.resolvesDispute
          ? contribution.lastSequence
          : contribution.fencedThroughSequence,
        acceptedAt: now,
      },
    });
    await this.journal.finalize(
      identity,
      {
        outcome: "APPLIED",
        disposition: "RETIRE_FROM_OUTBOX",
        resultCode: "OK",
        serverAcceptedAt: now,
        reconciliationReference: null,
        contributionId: contribution.id,
        contributionSequence: sequence,
      },
      tx,
    );
    return ack(identity.operationId, "APPLIED", "OK", { serverAcceptedAt: now });
  }

  private async conflict(
    tx: Prisma.TransactionClient,
    identity: JournalIdentity,
    contribution: SyncV1Contribution,
    decision: {
      code: "CAUSAL_FORK" | "STALE_PREDECESSOR" | "CANCELLED_PREDECESSOR" | "RECONCILIATION_STALE";
      dispute: "OPEN" | "ROTATE" | "KEEP";
    },
  ): Promise<SyncV1Ack> {
    let reference = contribution.reconciliationReference;
    if (decision.dispute !== "KEEP") {
      const now = new Date();
      if (decision.dispute === "ROTATE" && reference) {
        await tx.syncV1Dispute.update({
          where: { id: reference },
          data: { closedAt: now, closeReason: "SUPERSEDED" },
        });
      }
      reference = randomUUID();
      await tx.syncV1Dispute.create({
        data: {
          id: reference,
          contributionId: contribution.id,
          openedByOperationId: identity.operationId,
        },
      });
      // A disputed value is neither disclosed nor counted; a withdrawal stays
      // withdrawn while its dispute is open.
      await tx.syncV1Contribution.update({
        where: { id: contribution.id },
        data: {
          status: contribution.status === "CANCELLED" ? "CANCELLED" : "CONTESTED",
          quantityBase: null,
          reconciliationReference: reference,
        },
      });
    }
    if (!reference) throw new Error("Conflict without dispute reference.");
    await this.journal.finalize(
      identity,
      {
        outcome: "CONFLICT",
        disposition: "KEEP_FOR_RECONCILIATION",
        resultCode: decision.code,
        serverAcceptedAt: null,
        reconciliationReference: reference,
        contributionId: contribution.id,
      },
      tx,
    );
    return ack(identity.operationId, "CONFLICT", decision.code, {
      reconciliationReference: reference,
    });
  }

  private async reject(
    tx: Prisma.TransactionClient,
    identity: JournalIdentity,
    code: JournalResultCode,
    contributionId: string | null,
  ): Promise<SyncV1Ack> {
    await this.journal.finalize(
      identity,
      {
        outcome: "REJECTED",
        disposition: "MOVE_TO_TERMINAL_FAILURE",
        resultCode: code,
        serverAcceptedAt: null,
        reconciliationReference: null,
        contributionId,
      },
      tx,
    );
    return ack(identity.operationId, "REJECTED", code);
  }
}
