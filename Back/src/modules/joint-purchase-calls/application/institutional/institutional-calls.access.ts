import { CallHttpError, InstitutionalActor } from "../../domain/call-error";
import { eligibleMemberWhere, responsibleIsEligible, rowPendingReview } from "../call-access";
import { CALL_TRANSACTION_OPTIONS, CallGrant, Tx } from "../call-store";
import { CollaboratorsViewV2, GRANT_LABEL } from "../call-views";
import { auditCall, lockAndRead } from "./institutional-calls.queries";
import {
  GrantCommand,
  InstitutionalCallDeps,
  INVALID,
  parseGrant,
  requireConfirmed,
  requireNotRetired,
  truncate,
} from "./institutional-calls.types";
import { renderCollaboratorsView } from "./institutional-calls.views";

export async function grantCollaborator(
  deps: InstitutionalCallDeps,
  actor: InstitutionalActor,
  id: string,
  command: GrantCommand,
): Promise<CollaboratorsViewV2> {
  await deps.prisma.$transaction(async (tx) => {
    const call = await lockAndRead(tx, actor.tenantId, id);
    requireNotRetired(command);
    if (call.responsibleUserId !== actor.userId) throw new CallHttpError(403, "COLLABORATORS_FORBIDDEN");
    const { userRef, grant } = parseGrant(command);
    requireConfirmed(command.confirmed);
    if (call.status === "CANCELLED") throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
    if (userRef === actor.userId || userRef === call.responsibleUserId) {
      throw new CallHttpError(422, "COLLABORATOR_NOT_ELIGIBLE");
    }
    const grantee = await tx.member.findFirst({
      where: { ...eligibleMemberWhere(actor.tenantId), userId: userRef },
      select: { user: { select: { id: true, name: true } } },
    });
    if (!grantee) throw new CallHttpError(422, "COLLABORATOR_NOT_ELIGIBLE");
    const existing = await tx.jointPurchaseCallAccess.findUnique({
      where: { callId_userId_grant: { callId: call.id, userId: userRef, grant } },
      select: { userId: true, grant: true, grantedByUserId: true, responsibleVersion: true },
    });
    if (existing && rowPendingReview(call, existing)) {
      await confirmCallDelegation(deps, tx, actor, call, userRef, grant, grantee.user.name);
      return;
    }
    if (existing) return;
    const now = deps.clock.now();
    await tx.jointPurchaseCallAccess.create({
      data: {
        callId: call.id,
        userId: userRef,
        grant,
        grantedAt: now,
        grantedByUserId: actor.userId,
        responsibleVersion: call.responsibleVersion,
      },
    });
    await tx.jointPurchaseCallAccessEvent.create({
      data: { callId: call.id, userId: userRef, grant, action: "GRANTED", actorUserId: actor.userId, at: now },
    });
    await tx.jointPurchaseCallEvent.create({
      data: {
        callId: call.id,
        at: now,
        kind: "ACCESS_GRANTED",
        actorUserId: actor.userId,
        detail: truncate(`Permiso «${GRANT_LABEL[grant]}» concedido a ${grantee.user.name}.`),
      },
    });
    await auditCall(tx, actor, call.id, call.campaignId, `Permiso «${GRANT_LABEL[grant]}» concedido en la convocatoria «${call.name}».`, {
      grant,
      collaboratorUserRef: userRef,
    });
  }, CALL_TRANSACTION_OPTIONS);
  return renderCollaboratorsView(deps.prisma, actor, id);
}

export async function revokeCollaborator(
  deps: InstitutionalCallDeps,
  actor: InstitutionalActor,
  id: string,
  command: GrantCommand,
): Promise<CollaboratorsViewV2> {
  await deps.prisma.$transaction(async (tx) => {
    const call = await lockAndRead(tx, actor.tenantId, id);
    requireNotRetired(command);
    const { userRef, grant } = parseGrant(command);
    const renouncing = userRef === actor.userId;
    if (call.responsibleUserId !== actor.userId && !renouncing) throw new CallHttpError(403, "COLLABORATORS_FORBIDDEN");
    if (userRef === call.responsibleUserId) throw new CallHttpError(422, "COLLABORATOR_NOT_ELIGIBLE");
    const existing = await tx.jointPurchaseCallAccess.findUnique({
      where: { callId_userId_grant: { callId: call.id, userId: userRef, grant } },
      select: { grantedByUserId: true, user: { select: { name: true } } },
    });
    if (!existing || existing.grantedByUserId === null) return;
    const now = deps.clock.now();
    await tx.jointPurchaseCallAccess.delete({
      where: { callId_userId_grant: { callId: call.id, userId: userRef, grant } },
    });
    await tx.jointPurchaseCallAccessEvent.create({
      data: { callId: call.id, userId: userRef, grant, action: "REVOKED", actorUserId: actor.userId, at: now },
    });
    await tx.jointPurchaseCallEvent.create({
      data: {
        callId: call.id,
        at: now,
        kind: "ACCESS_REVOKED",
        actorUserId: actor.userId,
        detail: truncate(
          renouncing
            ? `${existing.user.name} renunció al permiso «${GRANT_LABEL[grant]}».`
            : `Permiso «${GRANT_LABEL[grant]}» retirado a ${existing.user.name}.`,
        ),
      },
    });
    await auditCall(
      tx,
      actor,
      call.id,
      call.campaignId,
      renouncing
        ? `Renuncia al permiso «${GRANT_LABEL[grant]}» en la convocatoria «${call.name}».`
        : `Permiso «${GRANT_LABEL[grant]}» retirado en la convocatoria «${call.name}».`,
      { grant, collaboratorUserRef: userRef, renounced: renouncing },
    );
  }, CALL_TRANSACTION_OPTIONS);
  return renderCollaboratorsView(deps.prisma, actor, id);
}

export async function reviewCallDelegation(
  deps: InstitutionalCallDeps,
  actor: InstitutionalActor,
  id: string,
  command: { user_ref?: unknown; grant?: unknown; decision?: unknown },
): Promise<CollaboratorsViewV2> {
  await deps.prisma.$transaction(async (tx) => {
    const call = await lockAndRead(tx, actor.tenantId, id);
    requireNotRetired(command);
    if (call.responsibleUserId !== actor.userId || !(await responsibleIsEligible(tx, actor.tenantId, actor.userId))) {
      throw new CallHttpError(403, "COLLABORATORS_FORBIDDEN");
    }
    const { userRef, grant } = parseGrant(command);
    const decision = command.decision;
    if (decision !== "CONFIRM" && decision !== "RETIRE") throw INVALID();
    const row = await tx.jointPurchaseCallAccess.findUnique({
      where: { callId_userId_grant: { callId: call.id, userId: userRef, grant } },
      select: { userId: true, grant: true, grantedByUserId: true, responsibleVersion: true, user: { select: { name: true } } },
    });
    if (!row || !rowPendingReview(call, row)) throw new CallHttpError(409, "DELEGATION_NOT_PENDING");
    if (decision === "CONFIRM") {
      if (call.status === "CANCELLED") throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
      const grantee = await tx.member.findFirst({
        where: { ...eligibleMemberWhere(actor.tenantId), userId: userRef },
        select: { userId: true },
      });
      if (!grantee) throw new CallHttpError(422, "COLLABORATOR_NOT_ELIGIBLE");
      await confirmCallDelegation(deps, tx, actor, call, userRef, grant, row.user.name);
      return;
    }
    const now = deps.clock.now();
    await tx.jointPurchaseCallAccess.delete({ where: { callId_userId_grant: { callId: call.id, userId: userRef, grant } } });
    await tx.jointPurchaseCallAccessEvent.create({
      data: { callId: call.id, userId: userRef, grant, action: "REVOKED", actorUserId: actor.userId, at: now },
    });
    await tx.jointPurchaseCallEvent.create({
      data: {
        callId: call.id,
        at: now,
        kind: "ACCESS_REVOKED",
        actorUserId: actor.userId,
        detail: truncate(`Permiso «${GRANT_LABEL[grant]}» de ${row.user.name} retirado en la revisión tras la sustitución.`),
      },
    });
    await auditCall(tx, actor, call.id, call.campaignId, `Delegación retirada en la revisión de la convocatoria «${call.name}».`, {
      grant,
      collaboratorUserRef: userRef,
      decision: "RETIRE",
      responsibleVersion: call.responsibleVersion,
    });
  }, CALL_TRANSACTION_OPTIONS);
  return renderCollaboratorsView(deps.prisma, actor, id);
}

/** P-A §12: replaces a pending row by one granted under the current responsible version. */
async function confirmCallDelegation(
  deps: InstitutionalCallDeps,
  tx: Tx,
  actor: InstitutionalActor,
  call: { id: string; campaignId: string; name: string; responsibleVersion: number },
  userRef: string,
  grant: CallGrant,
  userName: string,
): Promise<void> {
  const now = deps.clock.now();
  await tx.jointPurchaseCallAccess.delete({ where: { callId_userId_grant: { callId: call.id, userId: userRef, grant } } });
  await tx.jointPurchaseCallAccess.create({
    data: {
      callId: call.id,
      userId: userRef,
      grant,
      grantedAt: now,
      grantedByUserId: actor.userId,
      responsibleVersion: call.responsibleVersion,
    },
  });
  await tx.jointPurchaseCallAccessEvent.create({
    data: { callId: call.id, userId: userRef, grant, action: "CONFIRMED", actorUserId: actor.userId, at: now },
  });
  await tx.jointPurchaseCallEvent.create({
    data: {
      callId: call.id,
      at: now,
      kind: "ACCESS_CONFIRMED",
      actorUserId: actor.userId,
      detail: truncate(`Permiso «${GRANT_LABEL[grant]}» de ${userName} confirmado por la nueva persona responsable.`),
    },
  });
  await auditCall(tx, actor, call.id, call.campaignId, `Delegación confirmada en la revisión de la convocatoria «${call.name}».`, {
    grant,
    collaboratorUserRef: userRef,
    decision: "CONFIRM",
    responsibleVersion: call.responsibleVersion,
  });
}
