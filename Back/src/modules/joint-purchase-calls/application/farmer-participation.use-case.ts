import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { QUANTITY_MAX } from "@/modules/sync-v1/domain/envelope";
import { CallErrorCode, CallHttpError, FarmerContext } from "../domain/call-error";
import { notOpenReason } from "../domain/call-state";
import { CONSENT_TEXT, CONSENT_VERSION, decisionVersionAccepted, initialScopeOf, isAcceptedConsent } from "../domain/consent";
import {
  ConfirmInput,
  ConsentDecisionInput,
  normalizeConfirm,
  normalizeConsentDecision,
  normalizeWithdraw,
  NormalizedOperation,
  SERVER_ID,
  WithdrawInput,
} from "../domain/participation-input";
import { CALL_TRANSACTION_OPTIONS, lockCallRow, Tx } from "./call-store";
import {
  FarmerCallView,
  iso,
  ParticipationView,
  presentationUnit,
  toParticipationView,
} from "./call-views";
import { Clock, JOINT_PURCHASE_CLOCK } from "./clock";

/**
 * E2-P2 (§10.1): presentation filter of the default view. Closed or cancelled
 * calls the farmer took part in that ended within this many days are
 * «recientes»; older ones are served by `history`. Nothing is deleted.
 */
export const RECENT_FINISHED_DAYS = 180;
export const HISTORY_PAGE_DEFAULT = 20;
export const HISTORY_PAGE_MAX = 50;

export interface AcceptedResponse {
  outcome: "ACCEPTED";
  participation: ParticipationView | null;
}

/** What the journal keeps for an operation decided under the lock. */
interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

const PARTICIPATION_INCLUDE = {
  lines: { select: { productId: true, baseUnit: true, quantityBase: true } },
} as const;

/**
 * E2 §4.2: the farmer's side. Authentication is `SyncV1AuthGuard` (Member
 * AGRICULTOR, Auth V2 session, client registration); tenant and Member come
 * from the session only. A call of another tenant is 404 CALL_NOT_FOUND.
 *
 * Every operation takes the call row `FOR UPDATE` (the same row the close
 * takes), then: the journal (same `operation_id` → the stored answer; another
 * body → OPERATION_ID_REUSED), the server's deadline (CALL_NOT_OPEN), the
 * order (STALE_SEQUENCE: a late request never restores older quantities), the
 * consent (CONV-1) and the products of the call. Each decided operation is
 * journaled with its answer in the same transaction as its effect.
 *
 * Nothing here touches the declared need (Sync v1), purchases, debts,
 * payments, stock or any other farmer's data; no AuditLog entry names the
 * farmer.
 */
@Injectable()
export class FarmerParticipationUseCase {
  private readonly logger = new Logger("JointPurchaseCalls");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOINT_PURCHASE_CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * `GET /me/joint-purchase-calls` (E2-P2, §10.1): the OPEN calls of the tenant
   * and the recent finished ones (closed or cancelled in the last
   * `RECENT_FINISHED_DAYS`) in which the farmer has a participation row, plus
   * how many older finished ones there are (`history.older_count`, a count of
   * the farmer's own data). The window is only a presentation filter: nothing
   * is deleted on the server and the older ones are served by `history`.
   */
  async list(context: FarmerContext): Promise<{
    contractVersion: 2;
    server_time: string;
    consent: { version: string; text: string };
    calls: FarmerCallView[];
    history: { older_count: number };
  }> {
    const now = this.clock.now();
    const since = recentSince(now);
    const rows = await this.prisma.jointPurchaseCall.findMany({
      where: {
        tenantId: context.tenantId,
        OR: [
          { status: "OPEN" },
          {
            status: { in: ["CLOSED", "CANCELLED"] },
            participations: { some: { memberId: context.memberId } },
            OR: [{ closedAt: { gte: since } }, { cancelledAt: { gte: since } }],
          },
        ],
      },
      orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
      include: farmerCallInclude(context.memberId),
    });
    const olderCount = await this.prisma.jointPurchaseCall.count({ where: olderWhere(context, since) });
    const serverTime = now.toISOString();
    return {
      contractVersion: 2,
      server_time: serverTime,
      consent: { version: CONSENT_VERSION, text: CONSENT_TEXT },
      calls: rows.map((row) => toFarmerCallView(row, now)),
      history: { older_count: olderCount },
    };
  }

  /**
   * `GET /me/joint-purchase-calls/history` (§10.1): the farmer's finished
   * calls (CLOSED or CANCELLED, with a participation row of theirs) that ended
   * before the recent window, newest first (end date, then id), in pages of
   * `limit` (1–50, 20 by default). Same shape as the default view; never an
   * OPEN call nor another farmer's data. The cursor is opaque: one the server
   * did not issue is 400 PAYLOAD_INVALID.
   */
  async history(
    context: FarmerContext,
    query: { before?: string; limit?: number },
  ): Promise<{ contractVersion: 2; server_time: string; consent: { version: string; text: string }; calls: FarmerCallView[]; next_cursor: string | null }> {
    const limit = query.limit ?? HISTORY_PAGE_DEFAULT;
    if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_PAGE_MAX) throw new CallHttpError(400, "PAYLOAD_INVALID");
    const before = query.before === undefined ? null : decodeHistoryCursor(query.before);
    const now = this.clock.now();
    const since = recentSince(now);
    // The end date is closedAt or cancelledAt (exactly one is set, CHECK of the
    // E2 migration); timestamps are stored in UTC without a zone.
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT c."id"
      FROM "JointPurchaseCall" c
      WHERE c."tenantId" = ${context.tenantId}
        AND c."status" IN ('CLOSED', 'CANCELLED')
        AND EXISTS (SELECT 1 FROM "JointPurchaseParticipation" p WHERE p."callId" = c."id" AND p."memberId" = ${context.memberId})
        AND COALESCE(c."closedAt", c."cancelledAt") < (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND (
          ${before === null}::boolean
          OR (COALESCE(c."closedAt", c."cancelledAt"), c."id")
             < ((${before?.endedAt.toISOString() ?? null}::timestamptz AT TIME ZONE 'UTC'), ${before?.id ?? null}::uuid)
        )
      ORDER BY COALESCE(c."closedAt", c."cancelledAt") DESC, c."id" DESC
      LIMIT ${limit + 1}`;
    const page = ids.slice(0, limit).map((row) => row.id);
    const rows = await this.prisma.jointPurchaseCall.findMany({
      where: { id: { in: page }, tenantId: context.tenantId },
      include: farmerCallInclude(context.memberId),
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = page.map((id) => byId.get(id)!).filter(Boolean);
    const last = ordered[ordered.length - 1];
    return {
      contractVersion: 2,
      server_time: now.toISOString(),
      consent: { version: CONSENT_VERSION, text: CONSENT_TEXT },
      calls: ordered.map((row) => toFarmerCallView(row, now)),
      next_cursor: ids.length > limit && last ? encodeHistoryCursor((last.closedAt ?? last.cancelledAt)!, last.id) : null,
    };
  }

  /** `PUT /me/joint-purchase-calls/{id}/participation`. */
  confirm(context: FarmerContext, callId: string, input: ConfirmInput): Promise<AcceptedResponse> {
    if (!SERVER_ID.test(callId)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    return this.apply(context, callId, normalizeConfirm(input));
  }

  /** `POST /me/joint-purchase-calls/{id}/participation/withdraw`. */
  withdraw(context: FarmerContext, callId: string, input: WithdrawInput): Promise<AcceptedResponse> {
    if (!SERVER_ID.test(callId)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    return this.apply(context, callId, normalizeWithdraw(input));
  }

  /**
   * `POST /me/joint-purchase-calls/{id}/participation/consent` (§10.6, P-C):
   * widen (`COLLABORATORS`) or reduce (`RESPONSIBLE_ONLY`) who may see the
   * farmer's name and quantities, as a decision of its own with its own order.
   */
  decideConsent(context: FarmerContext, callId: string, input: ConsentDecisionInput): Promise<AcceptedResponse> {
    if (!SERVER_ID.test(callId)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    return this.apply(context, callId, normalizeConsentDecision(input));
  }

  private async apply(context: FarmerContext, callId: string, operation: NormalizedOperation): Promise<AcceptedResponse> {
    const result = await this.prisma.$transaction(
      (tx) => this.decide(tx, context, callId, operation),
      CALL_TRANSACTION_OPTIONS,
    );
    if (result.status === 200) return result.body as unknown as AcceptedResponse;
    const { errorCode, ...extra } = result.body as { errorCode: CallErrorCode } & Record<string, unknown>;
    throw new CallHttpError(result.status, errorCode, extra);
  }

  private async decide(
    tx: Tx,
    context: FarmerContext,
    callId: string,
    operation: NormalizedOperation,
  ): Promise<StoredResponse> {
    if (!(await lockCallRow(tx, context.tenantId, callId))) throw new CallHttpError(404, "CALL_NOT_FOUND");
    const call = await tx.jointPurchaseCall.findUniqueOrThrow({
      where: { id: callId },
      select: {
        id: true,
        status: true,
        deadlineAt: true,
        products: { select: { productId: true, baseUnit: true } },
      },
    });
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
      // A late request is answered with the participation in force now.
      if (journaled.outcome === "STALE_SEQUENCE") {
        return { status: 409, body: { errorCode: "STALE_SEQUENCE", participation: toParticipationView(await current()) } };
      }
      return stored;
    }

    const now = this.clock.now();
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

    if (operation.kind === "CONSENT") return this.decideScope(tx, context, call.status, operation, now, current, record, reject);

    const reason = notOpenReason(call, now);
    if (reason) return reject("CALL_NOT_OPEN", 409, { reason });

    // The quantities keep their own order; consent decisions (§10.6) have another.
    const last = await tx.jointPurchaseParticipationOperation.aggregate({
      where: { callId, memberId: context.memberId, outcome: "ACCEPTED", kind: { in: ["CONFIRM", "WITHDRAW"] } },
      _max: { sequence: true },
    });
    const existing = await current();
    if (last._max.sequence !== null && operation.sequence <= last._max.sequence) {
      return reject("STALE_SEQUENCE", 409, { participation: toParticipationView(existing) });
    }

    let participation = existing;
    if (operation.lines.length > 0) {
      // §10.6: the consent is required (and recorded) only when the
      // participation is created. Later quantities, old or new, never widen
      // nor reduce it: whatever consent they carry is ignored.
      if (!existing && (!operation.consent || !isAcceptedConsent(operation.consent.version))) {
        return reject("CONSENT_REQUIRED", 409);
      }
      const baseOf = new Map(call.products.map((p) => [p.productId, p.baseUnit]));
      if (operation.lines.some((line) => !baseOf.has(line.productRef))) return reject("PRODUCT_NOT_IN_CALL", 422);
      // The call's totals stay within int64, so its closing can always be stored.
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
      let saved: { id: string };
      if (existing) {
        saved = await tx.jointPurchaseParticipation.update({ where: { id: existing.id }, data, select: { id: true } });
      } else {
        const consent = operation.consent!;
        const scope = initialScopeOf(consent.version);
        saved = await tx.jointPurchaseParticipation.create({
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
      // Withdrawal (or a confirmation without lines, E2-D8): the consent stays recorded.
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
    this.logger.log(
      `[JOINT PURCHASE PARTICIPATION ${operation.kind}] tenant=${context.tenantId} call=${callId} outcome=ACCEPTED`,
    );
    return record("ACCEPTED", {
      status: 200,
      body: { outcome: "ACCEPTED", participation: toParticipationView(participation) } as unknown as Record<string, unknown>,
    });
  }

  /**
   * §10.6 (P-C), under the call's lock:
   * - only on an existing participation of the farmer (409
   *   PARTICIPATION_REQUIRED: the phone keeps the decision pending until its
   *   first confirmation is accepted);
   * - not tied to the deadline: a reduction is respected in any state; a
   *   widening is refused on a CANCELLED call (409
   *   WIDENING_NOT_ALLOWED) and needs the current text (409
   *   CONSENT_REQUIRED otherwise);
   * - its own order: a decision whose sequence is not above the last accepted
   *   one is STALE_SEQUENCE, so a late or out-of-order request never reverts a
   *   later decision (the same operation_id gets the stored answer);
   * - quantities, status and the first consent are untouched; the decision is
   *   written to the insert-only register in the same transaction.
   */
  private async decideScope(
    tx: Tx,
    context: FarmerContext,
    callStatus: string,
    operation: NormalizedOperation,
    now: Date,
    current: () => Promise<CurrentParticipation | null>,
    record: (outcome: string, response: StoredResponse) => Promise<StoredResponse>,
    reject: (code: CallErrorCode, status: number, extra?: Record<string, unknown>) => Promise<StoredResponse>,
  ): Promise<StoredResponse> {
    const scope = operation.scope!;
    const consent = operation.consent!;
    const existing = await current();
    if (!existing) return reject("PARTICIPATION_REQUIRED", 409);
    if (!decisionVersionAccepted(scope, consent.version)) return reject("CONSENT_REQUIRED", 409);
    if (scope === "COLLABORATORS" && callStatus === "CANCELLED") {
      return reject("WIDENING_NOT_ALLOWED", 409, { status: callStatus });
    }
    if (operation.sequence <= existing.consentScopeSequence) {
      return reject("STALE_SEQUENCE", 409, { participation: toParticipationView(existing) });
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
      },
    });
    this.logger.log(`[JOINT PURCHASE CONSENT ${scope}] tenant=${context.tenantId} call=${existing.callId} outcome=ACCEPTED`);
    return record("ACCEPTED", {
      status: 200,
      body: { outcome: "ACCEPTED", participation: toParticipationView(await current()) } as unknown as Record<string, unknown>,
    });
  }
}

type CurrentParticipation = Prisma.JointPurchaseParticipationGetPayload<{ include: typeof PARTICIPATION_INCLUDE }>;

const DAY_MS = 24 * 3600 * 1000;

function recentSince(now: Date): Date {
  return new Date(now.getTime() - RECENT_FINISHED_DAYS * DAY_MS);
}

/** Finished calls of the farmer that ended before the recent window (`history`). */
function olderWhere(context: FarmerContext, since: Date): Prisma.JointPurchaseCallWhereInput {
  return {
    tenantId: context.tenantId,
    participations: { some: { memberId: context.memberId } },
    OR: [
      { status: "CLOSED", closedAt: { lt: since } },
      { status: "CANCELLED", cancelledAt: { lt: since } },
    ],
  };
}

function farmerCallInclude(memberId: string) {
  return {
    campaign: { select: { id: true, name: true } },
    responsible: { select: { name: true } },
    products: { orderBy: { position: "asc" as const }, include: { product: { select: { name: true } } } },
    participations: { where: { memberId }, include: PARTICIPATION_INCLUDE },
    closing: {
      select: {
        cutoffAt: true,
        closedAt: true,
        participants: { where: { memberId }, include: { lines: true } },
      },
    },
  } satisfies Prisma.JointPurchaseCallInclude;
}

type FarmerCallRow = Prisma.JointPurchaseCallGetPayload<{ include: ReturnType<typeof farmerCallInclude> }>;

/** One call as the farmer sees it: never another farmer's data. */
function toFarmerCallView(row: FarmerCallRow, now: Date): FarmerCallView {
  const baseOf = new Map(row.products.map((p) => [p.productId, p.baseUnit]));
  const own = row.closing?.participants[0] ?? null;
  return {
    call_id: row.id,
    name: row.name,
    status: row.status as FarmerCallView["status"],
    campaign: { campaign_ref: row.campaign.id, name: row.campaign.name },
    opened_at: iso(row.openedAt),
    deadline_at: row.deadlineAt.toISOString(),
    closed_at: iso(row.closedAt),
    cancelled_at: iso(row.cancelledAt),
    server_time: now.toISOString(),
    accepts_operations: notOpenReason(row, now) === null,
    responsible: { name: row.responsible.name },
    products: row.products.map((p) => ({
      product_ref: p.productId,
      name: p.product.name,
      unit: presentationUnit(p.baseUnit),
      base_unit: p.baseUnit,
    })),
    participation: toParticipationView(row.participations[0] ?? null),
    closing: row.closing
      ? {
          cutoff_at: row.closing.cutoffAt.toISOString(),
          closed_at: row.closing.closedAt.toISOString(),
          included: own !== null,
          lines: own
            ? [...own.lines]
                .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
                .map((line) => ({
                  product_ref: line.productId,
                  base_unit: baseOf.get(line.productId) ?? "ML",
                  quantity_base: line.quantityBase.toString(),
                }))
            : [],
        }
      : null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function encodeHistoryCursor(endedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify(["E2H1", endedAt.toISOString(), id]), "utf8").toString("base64url");
}

/** A cursor this route did not issue is a bad request, never a silent first page. */
function decodeHistoryCursor(cursor: string): { endedAt: Date; id: string } {
  let parsed: unknown = null;
  if (/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) {
    try {
      parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
      parsed = null;
    }
  }
  if (
    Array.isArray(parsed) &&
    parsed.length === 3 &&
    parsed[0] === "E2H1" &&
    typeof parsed[1] === "string" &&
    typeof parsed[2] === "string" &&
    UUID.test(parsed[2])
  ) {
    const endedAt = new Date(parsed[1]);
    if (!Number.isNaN(endedAt.getTime()) && endedAt.toISOString() === parsed[1]) return { endedAt, id: parsed[2] };
  }
  throw new CallHttpError(400, "PAYLOAD_INVALID");
}
