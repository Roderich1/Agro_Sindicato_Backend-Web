import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { QUANTITY_MAX } from "@/modules/sync-v1/domain/envelope";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallErrorCode, CallHttpError, FarmerContext } from "../../domain/call-error";
import { notOpenReason } from "../../domain/call-state";
import {
  authorizesAdministration,
  CONSENT_V4_VERSION,
  isAcceptedConsent,
  isNewScope,
  ORDER_CONSENT_VERSION,
} from "../../domain/consent";
import { NormalizedOperation, SEQUENCE_MAX } from "../../domain/participation-input";
import { CALL_TRANSACTION_OPTIONS, lockCallRow, Tx } from "../call-store";
import { ParticipationView, toParticipationView } from "../call-views";
import { Clock } from "../clock";
import {
  AcceptedResponse,
  CurrentParticipation,
  FarmerContract,
  PARTICIPATION_INCLUDE,
  StoredResponse,
} from "./farmer-participation.views";

export async function applyFarmerAction(
  prisma: PrismaService,
  clock: Clock,
  logger: Logger,
  context: FarmerContext,
  callId: string,
  operation: NormalizedOperation,
  contract: FarmerContract,
): Promise<AcceptedResponse> {
  const result = await prisma.$transaction(
    (tx) => decideParticipation(tx, clock, logger, context, callId, operation, contract),
    CALL_TRANSACTION_OPTIONS,
  );
  if (result.status === 200) return result.body as unknown as AcceptedResponse;
  const { errorCode, ...extra } = result.body as { errorCode: CallErrorCode } & Record<string, unknown>;
  throw new CallHttpError(result.status, errorCode, extra);
}

async function decideParticipation(
  tx: Tx,
  clock: Clock,
  logger: Logger,
  context: FarmerContext,
  callId: string,
  operation: NormalizedOperation,
  contract: FarmerContract,
): Promise<StoredResponse> {
  if (!(await lockCallRow(tx, context.tenantId, callId))) throw new CallHttpError(404, "CALL_NOT_FOUND");
  const call = await tx.jointPurchaseCall.findUniqueOrThrow({
    where: { id: callId },
    select: {
      status: true,
      deadlineAt: true,
      openedAt: true,
      responsibleVersion: true,
      products: { select: { productId: true, baseUnit: true } },
    },
  });
  const view = (row: CurrentParticipation | null) => toParticipationView(row, call.responsibleVersion);
  const key = { callId, memberId: context.memberId, operationId: operation.operationId };
  const journaled = await tx.jointPurchaseParticipationOperation.findUnique({
    where: { callId_memberId_operationId: key },
  });
  const current = () =>
    tx.jointPurchaseParticipation.findUnique({
      where: { callId_memberId: { callId, memberId: context.memberId } },
      include: PARTICIPATION_INCLUDE,
    });
  if (journaled) {
    if (journaled.fingerprint !== operation.fingerprint) throw new CallHttpError(409, "OPERATION_ID_REUSED");
    const stored = journaled.response as unknown as StoredResponse;
    if (journaled.outcome === "STALE_SEQUENCE") {
      return { status: 409, body: { errorCode: "STALE_SEQUENCE", participation: view(await current()) } };
    }
    return stored;
  }

  if (contract < 4) {
    const own = await current();
    if (own && isNewScope(own.consentScope)) throw new CallHttpError(409, "APP_UPDATE_REQUIRED");
  }

  const now = clock.now();
  const record = async (outcome: string, response: StoredResponse): Promise<StoredResponse> => {
    await tx.jointPurchaseParticipationOperation.create({
      data: {
        ...key,
        sequence: operation.sequence,
        kind: operation.kind,
        outcome,
        fingerprint: operation.fingerprint,
        response: response as unknown as Prisma.InputJsonValue,
        receivedAt: now,
      },
    });
    return response;
  };
  const reject = (code: CallErrorCode, status: number, extra: Record<string, unknown> = {}) =>
    record(code, { status, body: { errorCode: code, ...extra } });

  if (operation.kind === "CONSENT") {
    return decideScope(tx, logger, context, call, operation, now, current, view, record, reject);
  }

  const reason = notOpenReason(call, now);
  if (reason) return reject("CALL_NOT_OPEN", 409, { reason });

  const last = await tx.jointPurchaseParticipationOperation.aggregate({
    where: { callId, memberId: context.memberId, outcome: "ACCEPTED", kind: { in: ["CONFIRM", "WITHDRAW"] } },
    _max: { sequence: true },
  });
  const existing = await current();
  if (last._max.sequence !== null && operation.sequence <= last._max.sequence) {
    return reject("STALE_SEQUENCE", 409, { participation: view(existing) });
  }

  let participation = existing;
  if (operation.lines.length > 0) {
    if (contract < 4) throw new CallHttpError(409, "APP_UPDATE_REQUIRED");
    const reusesAuthorization = existing?.status === "ACTIVE" &&
      existing.consentScope === "ADMINISTRATION" && authorizesAdministration(existing.consentScopeVersion);
    if (!reusesAuthorization && !hasOrderAuthorization(operation, existing, call.openedAt, now)) {
      return reject("ORDER_CONSENT_REQUIRED", 409);
    }
    const baseOf = new Map(call.products.map((p) => [p.productId, p.baseUnit]));
    if (operation.lines.some((line) => !baseOf.has(line.productRef))) return reject("PRODUCT_NOT_IN_CALL", 422);
    const others = await tx.jointPurchaseParticipationLine.groupBy({
      by: ["productId"],
      where: { participation: { callId, status: "ACTIVE", memberId: { not: context.memberId } } },
      _sum: { quantityBase: true },
    });
    const otherTotal = new Map(others.map((row) => [row.productId, row._sum.quantityBase ?? 0n]));
    if (operation.lines.some((line) => (otherTotal.get(line.productRef) ?? 0n) + line.quantityBase > QUANTITY_MAX)) {
      return reject("QUANTITY_INVALID", 422);
    }
    const data = {
      status: "ACTIVE" as const,
      lastSequence: operation.sequence,
      lastOperationId: operation.operationId,
      acceptedAt: now,
    };
    const saved = existing
      ? await tx.jointPurchaseParticipation.update({ where: { id: existing.id }, data, select: { id: true } })
      : await createInitialParticipation(tx, context, callId, operation, now, data);
    if (existing && !reusesAuthorization) {
      await authorizeOrder(tx, existing, operation, now);
      logger.log(`[JOINT PURCHASE CONSENT ADMINISTRATION] tenant=${context.tenantId} call=${callId} outcome=ACCEPTED`);
    }
    await tx.jointPurchaseParticipationLine.deleteMany({ where: { participationId: saved.id } });
    await tx.jointPurchaseParticipationLine.createMany({
      data: operation.lines.map((line) => ({
        participationId: saved.id,
        productId: line.productRef,
        baseUnit: baseOf.get(line.productRef)!,
        quantityBase: line.quantityBase,
      })),
    });
    participation = await current();
  } else if (existing) {
    await tx.jointPurchaseParticipationLine.deleteMany({ where: { participationId: existing.id } });
    await tx.jointPurchaseParticipation.update({
      where: { id: existing.id },
      data: {
        status: "WITHDRAWN",
        lastSequence: operation.sequence,
        lastOperationId: operation.operationId,
        acceptedAt: now,
      },
    });
    participation = await current();
  }
  logger.log(
    `[JOINT PURCHASE PARTICIPATION ${operation.kind}] tenant=${context.tenantId} call=${callId} outcome=ACCEPTED`,
  );
  return record("ACCEPTED", {
    status: 200,
    body: { outcome: "ACCEPTED", participation: view(participation) } as unknown as Record<string, unknown>,
  });
}

const CLOCK_TOLERANCE_MS = 5 * 60_000;

function hasOrderAuthorization(operation: NormalizedOperation, existing: CurrentParticipation | null, openedAt: Date | null, now: Date): boolean {
  const consent = operation.consent;
  if (!consent || !authorizesAdministration(consent.version)) return false;
  const acceptedAt = consent.acceptedAt.getTime();
  if (!openedAt ||
      acceptedAt < openedAt.getTime() - CLOCK_TOLERANCE_MS || acceptedAt > now.getTime() + CLOCK_TOLERANCE_MS) return false;
  if (!existing) return true;
  if (consent.version !== ORDER_CONSENT_VERSION || existing.consentScopeSequence >= SEQUENCE_MAX) return false;
  // Queued accepts prepared before a later privacy decision or withdrawal cannot restore access.
  const lastChange = existing.status === "WITHDRAWN"
    ? Math.max(existing.consentScopeReceivedAt.getTime(), existing.acceptedAt.getTime())
    : existing.consentScopeReceivedAt.getTime();
  return acceptedAt > lastChange;
}

async function authorizeOrder(tx: Tx, existing: CurrentParticipation, operation: NormalizedOperation, now: Date) {
  const consent = operation.consent!;
  const sequence = existing.consentScopeSequence + 1;
  await tx.jointPurchaseParticipation.update({
    where: { id: existing.id },
    data: {
      consentScope: "ADMINISTRATION",
      consentScopeVersion: consent.version,
      consentScopeDecidedAt: consent.acceptedAt,
      consentScopeReceivedAt: now,
      consentScopeSequence: sequence,
    },
  });
  await tx.jointPurchaseConsentDecision.create({
    data: {
      participationId: existing.id,
      callId: existing.callId,
      memberId: existing.memberId,
      scope: "ADMINISTRATION",
      consentVersion: consent.version,
      decidedAt: consent.acceptedAt,
      receivedAt: now,
      sequence,
      operationId: operation.operationId,
      source: "DECISION",
    },
  });
}

async function createInitialParticipation(
  tx: Tx,
  context: FarmerContext,
  callId: string,
  operation: NormalizedOperation,
  now: Date,
  data: { status: "ACTIVE"; lastSequence: number; lastOperationId: string; acceptedAt: Date },
): Promise<{ id: string }> {
  const consent = operation.consent!;
  const scope = "ADMINISTRATION" as const;
  const saved = await tx.jointPurchaseParticipation.create({
    data: {
      callId,
      tenantId: context.tenantId,
      memberId: context.memberId,
      ...data,
      consentVersion: consent.version,
      consentAcceptedAt: consent.acceptedAt,
      consentReceivedAt: now,
      consentScope: scope,
      consentScopeVersion: consent.version,
      consentScopeDecidedAt: consent.acceptedAt,
      consentScopeReceivedAt: now,
      consentScopeSequence: 0,
    },
    select: { id: true },
  });
  await tx.jointPurchaseConsentDecision.create({
    data: {
      participationId: saved.id,
      callId,
      memberId: context.memberId,
      scope,
      consentVersion: consent.version,
      decidedAt: consent.acceptedAt,
      receivedAt: now,
      sequence: 0,
      source: "INITIAL",
    },
  });
  return saved;
}

async function decideScope(
  tx: Tx,
  logger: Logger,
  context: FarmerContext,
  call: { status: string; responsibleVersion: number },
  operation: NormalizedOperation,
  now: Date,
  current: () => Promise<CurrentParticipation | null>,
  view: (row: CurrentParticipation | null) => ParticipationView | null,
  record: (outcome: string, response: StoredResponse) => Promise<StoredResponse>,
  reject: (code: CallErrorCode, status: number, extra?: Record<string, unknown>) => Promise<StoredResponse>,
): Promise<StoredResponse> {
  const scope = operation.scope!;
  const consent = operation.consent!;
  const existing = await current();
  if (!existing) throw new CallHttpError(409, "PARTICIPATION_REQUIRED");
  if (scope === "ADMINISTRATION") {
    if (consent.version !== CONSENT_V4_VERSION) return reject("CONSENT_REQUIRED", 409);
    if (call.status === "CANCELLED") return reject("WIDENING_NOT_ALLOWED", 409, { status: call.status });
  }
  if (scope === "COLLABORATORS" || operation.authorizeResponsible === true) return reject("CONSENT_VERSION_RETIRED", 409);
  if (!isAcceptedConsent(consent.version)) return reject("CONSENT_REQUIRED", 409);
  if (scope === "TOTALS_ONLY" && call.status === "CANCELLED") return reject("WIDENING_NOT_ALLOWED", 409, { status: call.status });
  if (operation.sequence <= existing.consentScopeSequence) {
    return reject("STALE_SEQUENCE", 409, { participation: view(existing) });
  }
  await tx.jointPurchaseParticipation.update({
    where: { id: existing.id },
    data: {
      consentScope: scope,
      consentScopeVersion: consent.version,
      consentScopeDecidedAt: consent.acceptedAt,
      consentScopeReceivedAt: now,
      consentScopeSequence: operation.sequence,
    },
  });
  await tx.jointPurchaseConsentDecision.create({
    data: {
      participationId: existing.id,
      callId: existing.callId,
      memberId: context.memberId,
      scope,
      consentVersion: consent.version,
      decidedAt: consent.acceptedAt,
      receivedAt: now,
      sequence: operation.sequence,
      operationId: operation.operationId,
      source: "DECISION",
      responsibleVersion: null,
    },
  });
  logger.log(`[JOINT PURCHASE CONSENT ${scope}] tenant=${context.tenantId} call=${existing.callId} outcome=ACCEPTED`);
  return record("ACCEPTED", {
    status: 200,
    body: { outcome: "ACCEPTED", participation: view(await current()) } as unknown as Record<string, unknown>,
  });
}
