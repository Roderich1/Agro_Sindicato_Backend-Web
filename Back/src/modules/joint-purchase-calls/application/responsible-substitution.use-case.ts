import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, InstitutionalActor } from "../domain/call-error";
import { SERVER_ID } from "../domain/participation-input";
import {
  eligibleMemberWhere,
  holdsSubstitution,
  isEligibleAdministrator,
  responsibleIsEligible,
} from "./call-access";
import { ACCESS_PARTICIPANTS, CALL_TRANSACTION_OPTIONS, ENTITY_NAME, lockCallRow, Tx } from "./call-store";
import { CallDetailView, GRANT_LABEL } from "./call-views";
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

export interface SubstitutionPermissionsView {
  contractVersion: 1;
  /** Only an eligible ADMINISTRADOR grants and revokes (A1). */
  can_grant: boolean;
  /** This user holds the permission and is eligible now. */
  holds_permission: boolean;
  holders: {
    user_ref: string;
    name: string;
    role: UserRole | null;
    /** The holder is an active DIRECTIVA/ADMINISTRADOR now; otherwise the permission is not exercised. */
    eligible: boolean;
    granted_at: string;
    granted_by: { user_ref: string; name: string };
    reason: string;
  }[];
  history: {
    at: string;
    action: "GRANTED" | "REVOKED";
    user: { user_ref: string; name: string };
    actor: { user_ref: string; name: string };
    reason: string | null;
  }[];
}

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
 * P-A (decisión del autor del 2026-11-12: A1 + B1 + C1), contrato E2 §12.
 *
 * A1: an eligible ADMINISTRADOR grants and revokes «Sustituir responsable»
 * to concrete, eligible persons of the Directiva or the Administración of
 * the same tenant (never to themselves, never to a whole role), with a
 * reason. The permission only allows substituting responsibles under B1: it
 * gives no access to participants, no administration of calls and no power
 * to grant anything. If nobody else is eligible, there is no automatic
 * exception (documented in §12).
 *
 * B1: only a holder who is still eligible substitutes a responsible who is
 * NO LONGER eligible, in DRAFT, OPEN or CLOSED calls (not CANCELLED), with a
 * reason (1–280) and confirmation. Every condition is checked again under
 * the call's lock. The client names the responsible version it saw: a
 * concurrent substitution makes the second one fail (409
 * RESPONSIBLE_CHANGED), never overwrite silently; the same `request_id`
 * answers the same without a second change (409 REQUEST_ID_REUSED with
 * another body). The substitution does not reopen the call, change its
 * deadline, participations, quantities or closing, nor create purchases,
 * payments, debts or stock.
 *
 * C1 and delegations: the new responsible version leaves every farmer's
 * earlier authorization behind (their data stay restricted for her until
 * each farmer authorizes her), and every delegation of the earlier
 * responsible is suspended (not deleted) until the successor reviews it.
 */
@Injectable()
export class ResponsibleSubstitutionUseCase {
  private readonly logger = new Logger("JointPurchaseCalls");

  constructor(
    private readonly prisma: PrismaService,
    private readonly calls: InstitutionalCallsUseCase,
    @Inject(JOINT_PURCHASE_CLOCK) private readonly clock: Clock,
  ) {}

  // ------------------------------------------------------------- A1: permission

  /** Any DIRECTIVA/ADMINISTRADOR of the tenant reads who holds it and its history (no farmer data). */
  async permissions(actor: InstitutionalActor): Promise<SubstitutionPermissionsView> {
    return this.renderPermissions(this.prisma, actor);
  }

  async grantPermission(actor: InstitutionalActor, command: SubstitutionGrantCommand): Promise<SubstitutionPermissionsView> {
    const userRef = parseUserRef(command.user_ref);
    requireConfirmed(command.confirmed);
    const reason = parseReason(command.reason, true)!;
    await this.prisma.$transaction(async (tx) => {
      await lockSubstitutionGrants(tx, actor.tenantId);
      if (!(await isEligibleAdministrator(tx, actor.tenantId, actor.userId))) throw new CallHttpError(403, "SUBSTITUTION_FORBIDDEN");
      if (userRef === actor.userId) throw new CallHttpError(422, "GRANTEE_NOT_ELIGIBLE");
      const grantee = await tx.member.findFirst({
        where: { ...eligibleMemberWhere(actor.tenantId), userId: userRef },
        select: { user: { select: { id: true, name: true } } },
      });
      if (!grantee) throw new CallHttpError(422, "GRANTEE_NOT_ELIGIBLE");
      const existing = await tx.jointPurchaseSubstitutionGrant.findUnique({
        where: { tenantId_userId: { tenantId: actor.tenantId, userId: userRef } },
        select: { userId: true },
      });
      if (existing) return;
      const now = this.clock.now();
      await tx.jointPurchaseSubstitutionGrant.create({
        data: { tenantId: actor.tenantId, userId: userRef, grantedByUserId: actor.userId, grantedAt: now, reason },
      });
      await tx.jointPurchaseSubstitutionGrantEvent.create({
        data: { tenantId: actor.tenantId, userId: userRef, action: "GRANTED", actorUserId: actor.userId, at: now, reason },
      });
      await this.auditPermission(tx, actor, userRef, `Permiso «Sustituir responsable» concedido a ${grantee.user.name}.`, {
        action: "GRANTED",
        holderUserRef: userRef,
        reason,
      });
    }, CALL_TRANSACTION_OPTIONS);
    this.logger.log(`[JOINT PURCHASE SUBSTITUTION PERMISSION GRANTED] tenant=${actor.tenantId} actor=${actor.userId}`);
    return this.permissions(actor);
  }

  /** An eligible ADMINISTRADOR revokes it; a holder may renounce their own (m1, by analogy). Idempotent. */
  async revokePermission(actor: InstitutionalActor, command: { user_ref?: unknown; reason?: unknown }): Promise<SubstitutionPermissionsView> {
    const userRef = parseUserRef(command.user_ref);
    const reason = parseReason(command.reason, false);
    await this.prisma.$transaction(async (tx) => {
      await lockSubstitutionGrants(tx, actor.tenantId);
      const renouncing = userRef === actor.userId;
      if (!renouncing && !(await isEligibleAdministrator(tx, actor.tenantId, actor.userId))) {
        throw new CallHttpError(403, "SUBSTITUTION_FORBIDDEN");
      }
      const existing = await tx.jointPurchaseSubstitutionGrant.findUnique({
        where: { tenantId_userId: { tenantId: actor.tenantId, userId: userRef } },
        select: { user: { select: { name: true } } },
      });
      if (!existing) return;
      const now = this.clock.now();
      await tx.jointPurchaseSubstitutionGrant.delete({ where: { tenantId_userId: { tenantId: actor.tenantId, userId: userRef } } });
      await tx.jointPurchaseSubstitutionGrantEvent.create({
        data: { tenantId: actor.tenantId, userId: userRef, action: "REVOKED", actorUserId: actor.userId, at: now, reason },
      });
      await this.auditPermission(
        tx,
        actor,
        userRef,
        renouncing
          ? `Renuncia al permiso «Sustituir responsable».`
          : `Permiso «Sustituir responsable» retirado a ${existing.user.name}.`,
        { action: "REVOKED", holderUserRef: userRef, renounced: renouncing, reason },
      );
    }, CALL_TRANSACTION_OPTIONS);
    return this.permissions(actor);
  }

  // --------------------------------------------------------- B1: substitution

  async substitute(actor: InstitutionalActor, id: string, command: SubstituteCommand): Promise<CallDetailView> {
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
      if (!(await holdsSubstitution(tx, actor.tenantId, actor.userId))) throw new CallHttpError(403, "SUBSTITUTION_FORBIDDEN");
      if (call.status === "CANCELLED") throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
      if (expected !== call.responsibleVersion) {
        throw new CallHttpError(409, "RESPONSIBLE_CHANGED", { responsible_version: call.responsibleVersion });
      }
      if (await responsibleIsEligible(tx, actor.tenantId, call.responsibleUserId)) {
        throw new CallHttpError(409, "RESPONSIBLE_STILL_ELIGIBLE");
      }
      // The successor: another eligible DIRECTIVA/ADMINISTRADOR of the tenant, never the
      // actor (the permission does not let anyone name themselves, §12) nor the current one.
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
      // Delegations in force under the version that ends: suspended until the successor reviews them.
      const delegations = await tx.jointPurchaseCallAccess.findMany({
        where: {
          callId: id,
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
      // The former responsible's own permission ends with her responsibility; the
      // successor gets hers in an open or closed call (in a draft it comes at opening).
      await tx.jointPurchaseCallAccess.deleteMany({
        where: { callId: id, userId: call.responsibleUserId, grantedByUserId: null },
      });
      if (call.status === "OPEN" || call.status === "CLOSED") {
        await tx.jointPurchaseCallAccess.create({
          data: { callId: id, userId: successorRef, grant: ACCESS_PARTICIPANTS, grantedAt: now, responsibleVersion: version },
        });
      }
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
    const [rows, events, canGrant, holds] = await Promise.all([
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
      isEligibleAdministrator(db, actor.tenantId, actor.userId),
      holdsSubstitution(db, actor.tenantId, actor.userId),
    ]);
    const eligible = await Promise.all(rows.map((row) => responsibleIsEligible(db, actor.tenantId, row.userId)));
    return {
      contractVersion: 1,
      can_grant: canGrant,
      holds_permission: holds,
      holders: rows.map((row, index) => ({
        user_ref: row.user.id,
        name: row.user.name,
        role: row.user.members[0]?.role ?? null,
        eligible: eligible[index],
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

  private async auditPermission(tx: Tx, actor: InstitutionalActor, holderRef: string, summary: string, metadata: Prisma.InputJsonValue) {
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        campaignId: null,
        actorUserId: actor.userId,
        ownerUserId: null,
        action: "OTRO",
        entityName: SUBSTITUTION_ENTITY,
        entityId: holderRef,
        summary,
        metadata,
      },
    });
  }
}

/** Grants and revocations of «Sustituir responsable» of one tenant are serialised. */
async function lockSubstitutionGrants(tx: Tx, tenantId: string): Promise<void> {
  const key = `joint-purchase-substitution:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
