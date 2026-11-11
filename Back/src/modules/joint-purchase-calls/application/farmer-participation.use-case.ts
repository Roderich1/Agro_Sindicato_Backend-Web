import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { QUANTITY_MAX } from "@/modules/sync-v1/domain/envelope";
import { CallErrorCode, CallHttpError, FarmerContext } from "../domain/call-error";
import { notOpenReason } from "../domain/call-state";
import { CONSENT_TEXT, CONSENT_VERSION, isCurrentConsent } from "../domain/consent";
import {
  ConfirmInput,
  normalizeConfirm,
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

/** E2-P2: closed or cancelled calls the farmer took part in stay visible this long. */
export const FINISHED_VISIBLE_DAYS = 180;

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

  /** `GET /me/joint-purchase-calls`. */
  async list(context: FarmerContext): Promise<{
    contractVersion: 1;
    server_time: string;
    consent: { version: string; text: string };
    calls: FarmerCallView[];
  }> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - FINISHED_VISIBLE_DAYS * 24 * 3600 * 1000);
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
      include: {
        campaign: { select: { id: true, name: true } },
        responsible: { select: { name: true } },
        products: { orderBy: { position: "asc" }, include: { product: { select: { name: true } } } },
        participations: { where: { memberId: context.memberId }, include: PARTICIPATION_INCLUDE },
        closing: {
          select: {
            cutoffAt: true,
            closedAt: true,
            participants: { where: { memberId: context.memberId }, include: { lines: true } },
          },
        },
      },
    });
    const serverTime = now.toISOString();
    return {
      contractVersion: 1,
      server_time: serverTime,
      consent: { version: CONSENT_VERSION, text: CONSENT_TEXT },
      calls: rows.map((row) => {
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
          server_time: serverTime,
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
      }),
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

    const reason = notOpenReason(call, now);
    if (reason) return reject("CALL_NOT_OPEN", 409, { reason });

    const last = await tx.jointPurchaseParticipationOperation.aggregate({
      where: { callId, memberId: context.memberId, outcome: "ACCEPTED" },
      _max: { sequence: true },
    });
    const existing = await current();
    if (last._max.sequence !== null && operation.sequence <= last._max.sequence) {
      return reject("STALE_SEQUENCE", 409, { participation: toParticipationView(existing) });
    }

    let participation = existing;
    if (operation.lines.length > 0) {
      if (!operation.consent || !isCurrentConsent(operation.consent.version)) return reject("CONSENT_REQUIRED", 409);
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
        consentVersion: operation.consent.version,
        consentAcceptedAt: operation.consent.acceptedAt,
        consentReceivedAt: now,
        lastSequence: operation.sequence,
        lastOperationId: operation.operationId,
        acceptedAt: now,
      };
      const saved = existing
        ? await tx.jointPurchaseParticipation.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.jointPurchaseParticipation.create({
            data: { callId, tenantId: context.tenantId, memberId: context.memberId, ...data },
            select: { id: true },
          });
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
}
