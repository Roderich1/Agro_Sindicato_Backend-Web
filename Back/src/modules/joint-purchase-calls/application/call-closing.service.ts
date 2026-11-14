import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError } from "../domain/call-error";
import { closingCutoff } from "../domain/call-state";
import { computeClosing } from "../domain/closing";
import { CALL_TRANSACTION_OPTIONS, ENTITY_NAME, lockCallRow, Tx } from "./call-store";
import { Clock, JOINT_PURCHASE_CLOCK } from "./clock";

export type CloseOutcome = { callId: string; alreadyClosed: boolean };

/**
 * E2-D12/D13: atomic, idempotent close. One transaction takes the call row
 * with `FOR UPDATE` (every farmer operation takes the same row before it
 * writes), so a confirmation is either in the closing or refused, never
 * accepted and missing. Cutoff = min(closing time, deadline): the automatic
 * close never extends the deadline. The snapshot (closing, lines,
 * participants and their lines) is immutable in the database.
 *
 * Writes only the call, its products' `openCampaignId`, the snapshot, an event
 * and an AuditLog entry: no purchase, debt, payment, stock or Sync v1 row.
 */
@Injectable()
export class CallClosingService {
  private readonly logger = new Logger("JointPurchaseCalls");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOINT_PURCHASE_CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Manual close; idempotent from CLOSED. `authorize` runs under the call's
   * lock, before anything else (§10.2: the responsible, MANAGE, or anyone of
   * the Directiva/Administración when the responsible is no longer eligible).
   */
  async closeManually(
    tenantId: string,
    callId: string,
    actorUserId: string,
    authorize?: (tx: Tx, call: { id: string; tenantId: string; responsibleUserId: string; responsibleVersion: number }) => Promise<void>,
  ): Promise<CloseOutcome> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await lockCallRow(tx, tenantId, callId))) throw new CallHttpError(404, "CALL_NOT_FOUND");
      const call = await tx.jointPurchaseCall.findUniqueOrThrow({ where: { id: callId }, select: CALL_SELECT });
      if (authorize) await authorize(tx, call);
      if (call.status === "CLOSED") return { callId, alreadyClosed: true };
      if (call.status !== "OPEN") throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
      await this.closeLocked(tx, call, "MANUAL", actorUserId);
      return { callId, alreadyClosed: false };
    }, CALL_TRANSACTION_OPTIONS);
  }

  /**
   * Automatic close (worker): every OPEN call whose deadline passed, each in
   * its own transaction. A call closed or cancelled meanwhile is skipped.
   * Returns the ids it closed.
   */
  async closeDue(): Promise<string[]> {
    const now = this.clock.now();
    const due = await this.prisma.jointPurchaseCall.findMany({
      where: { status: "OPEN", deadlineAt: { lte: now } },
      select: { id: true, tenantId: true },
      orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    const closed: string[] = [];
    for (const { id, tenantId } of due) {
      const done = await this.prisma.$transaction(async (tx) => {
        if (!(await lockCallRow(tx, tenantId, id))) return false;
        const call = await tx.jointPurchaseCall.findUniqueOrThrow({ where: { id }, select: CALL_SELECT });
        if (call.status !== "OPEN" || call.deadlineAt.getTime() > this.clock.now().getTime()) return false;
        await this.closeLocked(tx, call, "AUTOMATIC", null);
        return true;
      }, CALL_TRANSACTION_OPTIONS);
      if (done) closed.push(id);
    }
    return closed;
  }

  private async closeLocked(
    tx: Tx,
    call: CallForClose,
    mode: "MANUAL" | "AUTOMATIC",
    actorUserId: string | null,
  ): Promise<void> {
    const closedAt = this.clock.now();
    const cutoffAt = closingCutoff(closedAt, call.deadlineAt);
    const participations = await tx.jointPurchaseParticipation.findMany({
      where: { callId: call.id },
      select: {
        id: true,
        memberId: true,
        status: true,
        acceptedAt: true,
        lines: { select: { productId: true, quantityBase: true } },
      },
    });
    const computation = computeClosing(
      call.products.map((p) => ({ productId: p.productId, baseUnit: p.baseUnit })),
      participations,
      cutoffAt,
    );
    await tx.jointPurchaseCallClosing.create({
      data: {
        callId: call.id,
        mode,
        cutoffAt,
        closedAt,
        closedByUserId: actorUserId,
        participantCount: computation.participantCount,
        lines: {
          create: computation.lines.map((line) => ({
            productId: line.productId,
            baseUnit: line.baseUnit,
            totalQuantityBase: line.totalQuantityBase,
            participantCount: line.participantCount,
          })),
        },
      },
    });
    for (const participant of computation.participants) {
      await tx.jointPurchaseCallClosingParticipant.create({
        data: {
          callId: call.id,
          participationId: participant.participationId,
          memberId: participant.memberId,
          acceptedAt: participant.acceptedAt,
          lines: {
            create: participant.lines.map((line) => ({ productId: line.productId, quantityBase: line.quantityBase })),
          },
        },
      });
    }
    await tx.jointPurchaseCallProduct.updateMany({ where: { callId: call.id }, data: { openCampaignId: null } });
    await tx.jointPurchaseCall.update({ where: { id: call.id }, data: { status: "CLOSED", closedAt } });
    await tx.jointPurchaseCallEvent.create({
      data: {
        callId: call.id,
        at: closedAt,
        kind: "CLOSED",
        actorUserId,
        detail: mode === "MANUAL" ? "Cierre manual." : "Cierre automático al vencer la fecha límite.",
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: call.tenantId,
        campaignId: call.campaignId,
        actorUserId,
        ownerUserId: null,
        action: "OTRO",
        entityName: ENTITY_NAME,
        entityId: call.id,
        summary:
          mode === "MANUAL"
            ? `Convocatoria de compra conjunta «${call.name}» cerrada.`
            : `Convocatoria de compra conjunta «${call.name}» cerrada automáticamente al vencer la fecha límite.`,
        metadata: { mode, cutoffAt: cutoffAt.toISOString() },
      },
    });
    this.logger.log(`[JOINT PURCHASE CALL CLOSED] tenant=${call.tenantId} call=${call.id} mode=${mode}`);
  }
}

const CALL_SELECT = {
  id: true,
  tenantId: true,
  responsibleUserId: true,
  responsibleVersion: true,
  campaignId: true,
  name: true,
  status: true,
  deadlineAt: true,
  products: { select: { productId: true, baseUnit: true }, orderBy: { position: "asc" as const } },
} as const;

interface CallForClose {
  id: string;
  tenantId: string;
  campaignId: string;
  name: string;
  deadlineAt: Date;
  products: { productId: string; baseUnit: "ML" | "G" }[];
}
