import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, InstitutionalActor } from "../domain/call-error";
import { SERVER_ID } from "../domain/participation-input";
import { eligibleMemberWhere, isEligibleAdministrator, responsibleIsEligible } from "./call-access";
import { ACCESS_MANAGE, CALL_TRANSACTION_OPTIONS, ENTITY_NAME, lockCallRow, permissionsRetiredAt, Tx } from "./call-store";
import { CallDetailViewV2, GRANT_LABEL, SubstitutionPermissionsHistoryView, SUBSTITUTION_PERMISSION_RETIRED_NOTICE } from "./call-views";
import { Clock, JOINT_PURCHASE_CLOCK } from "./clock";
import { InstitutionalCallsUseCase, REASON_MAX, requireConfirmed, truncate } from "./institutional-calls.use-case";

export const SUBSTITUTION_ENTITY = "JointPurchaseSubstitutionGrant";

export interface SubstituteCommand {
  request_id?: unknown;
  expected_responsible_version?: unknown;
  new_responsible_ref?: unknown;
  reason?: unknown;
  confirmed?: unknown;
}

export interface SubstitutionGrantCommand {
  user_ref?: unknown;
  reason?: unknown;
  confirmed?: unknown;
}

/** E4 §3.2: the read-only history of the retired permission. */
export type SubstitutionPermissionsView = SubstitutionPermissionsHistoryView;

const INVALID = () => new CallHttpError(400, "PAYLOAD_INVALID");

function parseReason(raw: unknown, required: boolean): string | null {
  if (raw === undefined || raw === null) {
    if (required) throw new CallHttpError(422, "REASON_REQUIRED");
    return null;
  }
  if (typeof raw !== "string") throw new CallHttpError(422, "REASON_REQUIRED");
  const reason = raw.trim();
  if (reason.length > REASON_MAX || (required && reason.length === 0)) throw new CallHttpError(422, "REASON_REQUIRED");
  return reason.length === 0 ? null : reason;
}

function parseUserRef(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 64) throw INVALID();
  return raw;
}

/**
 * P-A (decisión del autor del 2026-11-12, B1), contrato E2 §12, con E4 §6.3
 * (2026-11-13).
 *
 * E4: the tenant permission «Sustituir responsable» (A1) is retired: granting
 * or revoking it is 409 SUBSTITUTION_PERMISSION_RETIRED and writes nothing;
 * its rows and events stay as read-only history and give no power.
 *
 * Substitution: an ELIGIBLE ADMINISTRADOR of the tenant (by role, without any
 * permission; checked again under the call's lock) substitutes a responsible
 * who is NO LONGER eligible, in DRAFT, OPEN or CLOSED calls (not CANCELLED),
 * with a reason (1–280) and confirmation. A DIRECTIVA gets 403
 * SUBSTITUTION_FORBIDDEN, also with a permission granted before. Every P-A
 * safeguard is kept: the successor is another eligible DIRECTIVA or
 * ADMINISTRADOR, never the actor (no self-substitution) nor the current one;
 * `expected_responsible_version` (409 RESPONSIBLE_CHANGED on a concurrent
 * substitution); the same `request_id` answers the same (409
 * REQUEST_ID_REUSED with another body); the change, its event, the AuditLog
 * entry and the trigger that only lets the responsible change. It does not
 * reopen the call nor change its deadline, participations, quantities or
 * closing, nor create purchases, payments, debts or stock.
 *
 * E4 changes: no PARTICIPANTS row is removed nor created (the detail does not
 * depend on the responsible), only MANAGE delegations are suspended until the
 * successor reviews them, and no new authorization is asked of the farmers.
 */
@Injectable()
export class ResponsibleSubstitutionUseCase {
  private readonly logger = new Logger("JointPurchaseCalls");

  constructor(
    private readonly prisma: PrismaService,
    private readonly calls: InstitutionalCallsUseCase,
    @Inject(JOINT_PURCHASE_CLOCK) private readonly clock: Clock,
  ) {}

  // ------------------------------------------------- A1: retired permission (E4 §3.2)

  /** Any DIRECTIVA/ADMINISTRADOR of the tenant reads the history (no farmer data). */
  async permissions(actor: InstitutionalActor): Promise<SubstitutionPermissionsView> {
    return this.renderPermissions(this.prisma, actor);
  }

  /** E4 §3.2: retired. Writes nothing. */
  async grantPermission(_actor: InstitutionalActor, _command: SubstitutionGrantCommand): Promise<never> {
    throw new CallHttpError(409, "SUBSTITUTION_PERMISSION_RETIRED");
  }

  /** E4 §3.2: retired. The rows are never deleted (CLAUDE.md rule 6); writes nothing. */
  async revokePermission(_actor: InstitutionalActor, _command: { user_ref?: unknown; reason?: unknown }): Promise<never> {
    throw new CallHttpError(409, "SUBSTITUTION_PERMISSION_RETIRED");
  }

  // --------------------------------------------------------- B1: substitution

  async substitute(actor: InstitutionalActor, id: string, command: SubstituteCommand): Promise<CallDetailViewV2> {
    if (!SERVER_ID.test(id)) throw new CallHttpError(404, "CALL_NOT_FOUND");
    const requestId = command.request_id;
    if (typeof requestId !== "string" || !SERVER_ID.test(requestId)) throw INVALID();
    const expected = command.expected_responsible_version;
    if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 1) throw INVALID();
    const successorRef = parseUserRef(command.new_responsible_ref);
    requireConfirmed(command.confirmed);
    const reason = parseReason(command.reason, true)!;
    const requestHash = createHash("sha256")
      .update(JSON.stringify(["E2-PA-1", id, expected, successorRef, reason]), "utf8")
      .digest("hex");

    await this.prisma.$transaction(async (tx) => {
      if (!(await lockCallRow(tx, actor.tenantId, id))) throw new CallHttpError(404, "CALL_NOT_FOUND");
      const call = await tx.jointPurchaseCall.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          tenantId: true,
          campaignId: true,
          name: true,
          status: true,
          responsibleUserId: true,
          responsibleVersion: true,
          responsible: { select: { name: true } },
        },
      });
      // A retry of a substitution already made answers the same, without a second change.
      const replay = await tx.jointPurchaseResponsibleChange.findUnique({
        where: { callId_requestId: { callId: id, requestId } },
        select: { requestHash: true },
      });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new CallHttpError(409, "REQUEST_ID_REUSED");
        return;
      }
      // E4 §6.3: by role, read inside the transaction; no permission involved.
      if (!(await isEligibleAdministrator(tx, actor.tenantId, actor.userId))) throw new CallHttpError(403, "SUBSTITUTION_FORBIDDEN");
      if (call.status === "CANCELLED") throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
      if (expected !== call.responsibleVersion) {
        throw new CallHttpError(409, "RESPONSIBLE_CHANGED", { responsible_version: call.responsibleVersion });
      }
      if (await responsibleIsEligible(tx, actor.tenantId, call.responsibleUserId)) {
        throw new CallHttpError(409, "RESPONSIBLE_STILL_ELIGIBLE");
      }
      // The successor: another eligible DIRECTIVA/ADMINISTRADOR of the tenant, never the
      // actor (nobody names themselves, §12) nor the current one.
      if (successorRef === actor.userId || successorRef === call.responsibleUserId) {
        throw new CallHttpError(422, "SUCCESSOR_NOT_ELIGIBLE");
      }
      const successor = await tx.member.findFirst({
        where: { ...eligibleMemberWhere(actor.tenantId), userId: successorRef },
        select: { user: { select: { id: true, name: true } } },
      });
      if (!successor) throw new CallHttpError(422, "SUCCESSOR_NOT_ELIGIBLE");

      const now = this.clock.now();
      const version = call.responsibleVersion + 1;
      // MANAGE delegations in force under the version that ends: suspended until the successor reviews them.
      const delegations = await tx.jointPurchaseCallAccess.findMany({
        where: {
          callId: id,
          grant: ACCESS_MANAGE,
          grantedByUserId: { not: null },
          responsibleVersion: call.responsibleVersion,
          userId: { not: successorRef },
        },
        select: { userId: true, grant: true },
        orderBy: [{ userId: "asc" }, { grant: "asc" }],
      });
      await tx.jointPurchaseResponsibleChange.create({
        data: {
          callId: id,
          tenantId: actor.tenantId,
          version,
          previousUserId: call.responsibleUserId,
          newUserId: successorRef,
          actorUserId: actor.userId,
          reason,
          at: now,
          callStatus: call.status,
          suspendedDelegations: delegations.length,
          requestId,
          requestHash,
        },
      });
      await tx.jointPurchaseCall.update({
        where: { id },
        data: { responsibleUserId: successorRef, responsibleVersion: version },
      });
      // E4 §6.3: no PARTICIPANTS row is removed nor created (stored ones are history).
      for (const delegation of delegations) {
        await tx.jointPurchaseCallAccessEvent.create({
          data: { callId: id, userId: delegation.userId, grant: delegation.grant, action: "SUSPENDED", actorUserId: actor.userId, at: now },
        });
      }
      const suspended =
        delegations.length === 0
          ? "Sin permisos de colaboradores que suspender."
          : delegations.length === 1
            ? "1 permiso de colaborador suspendido hasta su revisión."
            : `${delegations.length} permisos de colaboradores suspendidos hasta su revisión.`;
      await tx.jointPurchaseCallEvent.create({
        data: {
          callId: id,
          at: now,
          kind: "RESPONSIBLE_REPLACED",
          actorUserId: actor.userId,
          detail: truncate(`Responsable sustituida: ${call.responsible.name} → ${successor.user.name}. ${suspended} Motivo: ${reason}`),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          campaignId: call.campaignId,
          actorUserId: actor.userId,
          ownerUserId: null,
          action: "OTRO",
          entityName: ENTITY_NAME,
          entityId: id,
          summary: `Persona responsable sustituida en la convocatoria «${call.name}».`,
          metadata: {
            previousResponsibleUserRef: call.responsibleUserId,
            newResponsibleUserRef: successorRef,
            responsibleVersion: version,
            callStatus: call.status,
            reason,
            suspendedDelegations: delegations.map((d) => ({ userRef: d.userId, grant: d.grant, label: GRANT_LABEL[d.grant as "PARTICIPANTS" | "MANAGE"] })),
          } as Prisma.InputJsonValue,
        },
      });
      this.logger.log(`[JOINT PURCHASE CALL RESPONSIBLE REPLACED] tenant=${actor.tenantId} actor=${actor.userId} call=${id} version=${version}`);
    }, CALL_TRANSACTION_OPTIONS);
    return this.calls.detail(actor, id);
  }

  // ---------------------------------------------------------------- helpers

  private async renderPermissions(db: Tx | PrismaService, actor: InstitutionalActor): Promise<SubstitutionPermissionsView> {
    const user = { select: { id: true, name: true, members: { where: { tenantId: actor.tenantId }, select: { role: true } } } } as const;
    const [rows, events, retiredAt] = await Promise.all([
      db.jointPurchaseSubstitutionGrant.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: [{ grantedAt: "asc" }, { userId: "asc" }],
        include: { user, grantedBy: { select: { id: true, name: true } } },
      }),
      db.jointPurchaseSubstitutionGrantEvent.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: [{ at: "asc" }, { id: "asc" }],
        include: { user: { select: { id: true, name: true } }, actor: { select: { id: true, name: true } } },
      }),
      permissionsRetiredAt(db),
    ]);
    return {
      contractVersion: 2,
      retired_at: retiredAt.toISOString(),
      notice: SUBSTITUTION_PERMISSION_RETIRED_NOTICE,
      can_grant: false,
      holders: rows.map((row) => ({
        user_ref: row.user.id,
        name: row.user.name,
        role: row.user.members[0]?.role ?? null,
        granted_at: row.grantedAt.toISOString(),
        granted_by: { user_ref: row.grantedBy.id, name: row.grantedBy.name },
        reason: row.reason,
      })),
      history: events.map((event) => ({
        at: event.at.toISOString(),
        action: event.action as "GRANTED" | "REVOKED",
        user: { user_ref: event.user.id, name: event.user.name },
        actor: { user_ref: event.actor.id, name: event.actor.name },
        reason: event.reason,
      })),
    };
  }
}
