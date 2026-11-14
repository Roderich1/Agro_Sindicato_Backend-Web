import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { QUANTITY_MAX } from "@/modules/sync-v1/domain/envelope";
import { CallErrorCode, CallHttpError, FarmerContext } from "../domain/call-error";
import { notOpenReason } from "../domain/call-state";
import {
  CONSENT_HELP,
  CONSENT_TEXT,
  CONSENT_V4_VERSION,
  initialScopeOf,
  isAcceptedConsent,
  isNewScope,
} from "../domain/consent";
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
  FarmerCallViewV4,
  FarmerConsentV4,
  FarmerHistoryViewV4,
  FarmerListViewV4,
  iso,
  ParticipationView,
  ParticipationViewV4,
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

/**
 * E4 §7: the contract the phone declared (`X-Joint-Purchase-Contract`).
 * Reads always get the shape of contract 4; writes are decided knowing it
 * (409 APP_UPDATE_REQUIRED for contracts 1–3 on a participation whose scope
 * they do not know) and answered in the shape of that contract.
 */
export type FarmerContract = 1 | 2 | 3 | 4;

/** E4 §4.1: the consent every read serves. */
export const FARMER_CONSENT: FarmerConsentV4 = { version: "CONV-4", text: CONSENT_TEXT, help: CONSENT_HELP };

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
  async list(context: FarmerContext): Promise<FarmerListViewV4> {
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
      contractVersion: 4,
      server_time: serverTime,
      consent: FARMER_CONSENT,
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
  ): Promise<FarmerHistoryViewV4> {
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
      contractVersion: 4,
      server_time: now.toISOString(),
      consent: FARMER_CONSENT,
      calls: ordered.map((row) => toFarmerCallView(row, now)),
      next_cursor: ids.length > limit && last ? encodeHistoryCursor((last.closedAt ?? last.cancelledAt)!, last.id) : null,
    };
  }

  /** `PUT /me/joint-purchase-calls/{id}/participation`. */
  confirm(context: FarmerContext, callId: string, input: ConfirmInput, contract: FarmerContract = 4): Promise<AcceptedResponse> {
    if (!SERVER_ID.test(callId)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    return this.apply(context, callId, normalizeConfirm(input), contract);
  }

  /** `POST /me/joint-purchase-calls/{id}/participation/withdraw`. */
  withdraw(context: FarmerContext, callId: string, input: WithdrawInput, contract: FarmerContract = 4): Promise<AcceptedResponse> {
    if (!SERVER_ID.test(callId)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    return this.apply(context, callId, normalizeWithdraw(input), contract);
  }

  /**
   * `POST /me/joint-purchase-calls/{id}/participation/consent` (E4 §4.2): a
   * decision of its own with its own order about who may see the farmer's
   * name and quantities (`ADMINISTRATION`, `TOTALS_ONLY`, or the earlier
   * reduction `RESPONSIBLE_ONLY`). Widening to `COLLABORATORS` and
   * authorizing a responsible are retired.
   */
  decideConsent(context: FarmerContext, callId: string, input: ConsentDecisionInput, contract: FarmerContract = 4): Promise<AcceptedResponse> {
    if (!SERVER_ID.test(callId)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    const operation = normalizeConsentDecision(input);
    // Contracts 1–3 cannot know the new scopes: they are never read from them.
    if (contract < 4 && isNewScope(operation.scope!)) throw new CallHttpError(400, "PAYLOAD_INVALID");
    return this.apply(context, callId, operation, contract);
  }

  private async apply(
    context: FarmerContext,
    callId: string,
    operation: NormalizedOperation,
    contract: FarmerContract,
  ): Promise<AcceptedResponse> {
    const result = await this.prisma.$transaction(
      (tx) => this.decide(tx, context, callId, operation, contract),
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
    contract: FarmerContract,
  ): Promise<StoredResponse> {
    if (!(await lockCallRow(tx, context.tenantId, callId))) throw new CallHttpError(404, "CALL_NOT_FOUND");
    const call = await tx.jointPurchaseCall.findUniqueOrThrow({
      where: { id: callId },
      select: {
        id: true,
        status: true,
        deadlineAt: true,
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
      // A late request is answered with the participation in force now.
      if (journaled.outcome === "STALE_SEQUENCE") {
        return { status: 409, body: { errorCode: "STALE_SEQUENCE", participation: view(await current()) } };
      }
      return stored;
    }

    // E4 §7.2: a phone of contracts 1–3 does not know `ADMINISTRATION` nor
    // `TOTALS_ONLY` (nor CONV-4): answering it would either pass off a scope it
    // cannot read or make it retry forever. Refused before deciding, and not
    // journaled: the same operation is decided once the app is updated.
    if (contract < 4) {
      const own = await current();
      if (own && isNewScope(own.consentScope)) throw new CallHttpError(409, "APP_UPDATE_REQUIRED");
      if (!own && operation.kind === "CONFIRM" && operation.consent?.version === CONSENT_V4_VERSION) {
        throw new CallHttpError(409, "APP_UPDATE_REQUIRED");
      }
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

    if (operation.kind === "CONSENT") {
      return this.decideScope(tx, context, call, operation, now, current, view, record, reject);
    }

    const reason = notOpenReason(call, now);
    if (reason) return reject("CALL_NOT_OPEN", 409, { reason });

    // The quantities keep their own order; consent decisions (§10.6) have another.
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
        // E4 §4.3: CONV-4 gives ADMINISTRATION; an earlier text keeps its own
        // scope (never read as CONV-4), restricted for the detail.
        const scope = initialScopeOf(consent.version);
        // P-A C1, kept as history only (E4 §4.3: it no longer decides access).
        // CONV-4 authorizes no responsible (NULL). An earlier text records, as
        // before, the responsible the phone showed if it is the current one; a
        // phone that does not say which (contracts 1 and 2) can only have shown
        // the current one when there was never a substitution (version 1).
        const shown = operation.responsibleVersion;
        const authorizedVersion =
          consent.version === CONSENT_V4_VERSION
            ? null
            : shown !== undefined
              ? shown === call.responsibleVersion
                ? shown
                : null
              : call.responsibleVersion === 1
                ? 1
                : null;
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
            consentResponsibleVersion: authorizedVersion,
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
            responsibleVersion: authorizedVersion,
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
      body: { outcome: "ACCEPTED", participation: view(participation) } as unknown as Record<string, unknown>,
    });
  }

  /**
   * E4 §4.2, under the call's lock, in the order of the checks:
   * 1. only on an existing participation of the farmer (409
   *    PARTICIPATION_REQUIRED: the phone keeps the decision pending until its
   *    first confirmation is accepted);
   * 2. `ADMINISTRATION` needs `CONV-4` (409 CONSENT_REQUIRED) and is refused on
   *    a CANCELLED call (409 WIDENING_NOT_ALLOWED); it is valid in OPEN and
   *    CLOSED whatever the deadline (`authorize_responsible` with it is 400,
   *    checked in `normalizeConsentDecision`);
   * 3. widening to `COLLABORATORS` (any version) or authorizing a responsible
   *    is 409 CONSENT_VERSION_RETIRED, journaled (idempotent) without writing
   *    a decision: no earlier widening ever reaches anybody again;
   * 4. the earlier reduction `RESPONSIBLE_ONLY` is respected with any known
   *    text and in any state; from `ADMINISTRATION` it stops covering the
   *    detail;
   * 5. `TOTALS_ONLY` (D-05) with any known text, not on a CANCELLED call;
   * 6. its own order: a sequence not above the last accepted decision is
   *    STALE_SEQUENCE with the participation in force, so a late request never
   *    restores an earlier access (the same operation_id gets the stored answer).
   * Quantities, status and the first consent are untouched; the decision is
   * written to the insert-only register in the same transaction.
   */
  private async decideScope(
    tx: Tx,
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
    // E2 §11.1: the phone keeps the decision pending and retries it with the
    // same operation_id once its first confirmation is accepted. The 409 is
    // therefore NOT journaled (like APP_UPDATE_REQUIRED): a stored answer
    // would turn every retry into the same 409 (cierre 2026-11-13).
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
    this.logger.log(`[JOINT PURCHASE CONSENT ${scope}] tenant=${context.tenantId} call=${existing.callId} outcome=ACCEPTED`);
    return record("ACCEPTED", {
      status: 200,
      body: { outcome: "ACCEPTED", participation: view(await current()) } as unknown as Record<string, unknown>,
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

/** One call as the farmer sees it (contract 4): never another farmer's data. */
function toFarmerCallView(row: FarmerCallRow, now: Date): FarmerCallViewV4 {
  const baseOf = new Map(row.products.map((p) => [p.productId, p.baseUnit]));
  const own = row.closing?.participants[0] ?? null;
  return {
    call_id: row.id,
    name: row.name,
    status: row.status as FarmerCallViewV4["status"],
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
    // Contract 4: no responsible_authorization (P-A C1 no longer decides access).
    participation: toParticipationView(row.participations[0] ?? null) as ParticipationViewV4 | null,
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
