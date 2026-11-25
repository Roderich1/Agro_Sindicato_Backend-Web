import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, FarmerContext } from "../domain/call-error";
import { isNewScope } from "../domain/consent";
import {
  ConfirmInput,
  ConsentDecisionInput,
  normalizeConfirm,
  normalizeConsentDecision,
  normalizeWithdraw,
  SERVER_ID,
  WithdrawInput,
} from "../domain/participation-input";
import { FarmerHistoryViewV4, FarmerListViewV4 } from "./call-views";
import { Clock, JOINT_PURCHASE_CLOCK } from "./clock";
import { applyFarmerAction } from "./farmer/farmer-participation.decision";
import {
  AcceptedResponse,
  decodeHistoryCursor,
  encodeHistoryCursor,
  FARMER_CONSENT,
  farmerCallInclude,
  FarmerContract,
  HISTORY_PAGE_DEFAULT,
  HISTORY_PAGE_MAX,
  olderWhere,
  recentSince,
  toFarmerCallView,
} from "./farmer/farmer-participation.views";

export { FARMER_CONSENT, HISTORY_PAGE_DEFAULT, HISTORY_PAGE_MAX, RECENT_FINISHED_DAYS } from "./farmer/farmer-participation.views";
export type { AcceptedResponse, FarmerContract } from "./farmer/farmer-participation.views";

/**
 * E2 §4.2: the farmer's side. Authentication is `SyncV1AuthGuard` (Member
 * AGRICULTOR, Auth V2 session, client registration); tenant and Member come
 * from the session only.
 */
@Injectable()
export class FarmerParticipationUseCase {
  private readonly logger = new Logger("JointPurchaseCalls");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOINT_PURCHASE_CLOCK) private readonly clock: Clock,
  ) {}

  /** `GET /me/joint-purchase-calls` (E2-P2, §10.1): OPEN calls and recent finished ones. */
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
    return {
      contractVersion: 4,
      server_time: now.toISOString(),
      consent: FARMER_CONSENT,
      calls: rows.map((row) => toFarmerCallView(row, now)),
      history: { older_count: olderCount },
    };
  }

  /** `GET /me/joint-purchase-calls/history` (§10.1): paginated older finished calls. */
  async history(
    context: FarmerContext,
    query: { before?: string; limit?: number },
  ): Promise<FarmerHistoryViewV4> {
    const limit = query.limit ?? HISTORY_PAGE_DEFAULT;
    if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_PAGE_MAX) throw new CallHttpError(400, "PAYLOAD_INVALID");
    const before = query.before === undefined ? null : decodeHistoryCursor(query.before);
    const now = this.clock.now();
    const since = recentSince(now);
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
    return applyFarmerAction(this.prisma, this.clock, this.logger, context, callId, normalizeConfirm(input), contract);
  }

  /** `POST /me/joint-purchase-calls/{id}/participation/withdraw`. */
  withdraw(context: FarmerContext, callId: string, input: WithdrawInput, contract: FarmerContract = 4): Promise<AcceptedResponse> {
    if (!SERVER_ID.test(callId)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    return applyFarmerAction(this.prisma, this.clock, this.logger, context, callId, normalizeWithdraw(input), contract);
  }

  /** `POST /me/joint-purchase-calls/{id}/participation/consent` (E4 §4.2). */
  decideConsent(context: FarmerContext, callId: string, input: ConsentDecisionInput, contract: FarmerContract = 4): Promise<AcceptedResponse> {
    if (!SERVER_ID.test(callId)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    const operation = normalizeConsentDecision(input);
    if (contract < 4 && isNewScope(operation.scope!)) throw new CallHttpError(400, "PAYLOAD_INVALID");
    return applyFarmerAction(this.prisma, this.clock, this.logger, context, callId, operation, contract);
  }
}
