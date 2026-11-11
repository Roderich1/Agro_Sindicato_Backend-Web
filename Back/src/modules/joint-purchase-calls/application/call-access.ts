import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, InstitutionalActor } from "../domain/call-error";
import { consentCoversCollaborators } from "../domain/consent";
import { CallViewer, CallVisibility } from "../domain/visibility";
import { ACCESS_MANAGE, ACCESS_PARTICIPANTS, CallGrant, Tx } from "./call-store";

export const INSTITUTIONAL_ROLES: readonly UserRole[] = [UserRole.DIRECTIVA, UserRole.ADMINISTRADOR];

/** E2-D5 and §10.2: an active DIRECTIVA/ADMINISTRADOR of this tenant (account, Member, role and tenant active). */
export function eligibleMemberWhere(tenantId: string): Prisma.MemberWhereInput {
  return {
    tenantId,
    isActive: true,
    role: { in: [...INSTITUTIONAL_ROLES] },
    tenant: { isActive: true },
    user: { isActive: true, tenantId },
  };
}

type Db = Tx | PrismaService;

export interface CallAccessOf {
  /** Grants held now: the responsible holds MANAGE by being the responsible. */
  grants: Set<CallGrant>;
  /** The PARTICIPANTS row exists now (the responsible's or a collaborator's). */
  canViewParticipants: boolean;
  isResponsible: boolean;
  visibility: CallVisibility;
}

/**
 * E2-P3 (§10.2/§10.3): what this user holds on this call, read at each
 * request (a revocation applies from the next one). The responsible holds
 * MANAGE by being the responsible and PARTICIPANTS through the row created at
 * opening; anyone else only through rows granted by the responsible. No role
 * grants anything.
 */
export async function accessOf(
  db: Db,
  call: { id: string; responsibleUserId: string },
  userId: string,
): Promise<CallAccessOf> {
  const [rows, everParticipants] = await Promise.all([
    db.jointPurchaseCallAccess.findMany({
      where: { callId: call.id, userId },
      select: { grant: true, grantedByUserId: true },
    }),
    db.jointPurchaseCallAccessEvent.count({
      where: { callId: call.id, userId, grant: ACCESS_PARTICIPANTS, action: "GRANTED" },
    }),
  ]);
  const isResponsible = call.responsibleUserId === userId;
  const grants = new Set<CallGrant>(rows.map((row) => row.grant as CallGrant));
  if (isResponsible) grants.add(ACCESS_MANAGE);
  const participantsRow = rows.find((row) => row.grant === ACCESS_PARTICIPANTS) ?? null;
  const viewer: CallViewer = {
    kind: participantsRow === null ? "NONE" : participantsRow.grantedByUserId === null && isResponsible ? "RESPONSIBLE" : "COLLABORATOR",
    formerParticipantsHolder: everParticipants > 0,
  };
  return {
    grants,
    canViewParticipants: participantsRow !== null,
    isResponsible,
    visibility: new CallVisibility(viewer, consentCoversCollaborators),
  };
}

/** Whether the responsible can still act: account, Member, role and tenant active (E2-D5). */
export async function responsibleIsEligible(db: Db, tenantId: string, userId: string): Promise<boolean> {
  const member = await db.member.findFirst({ where: { ...eligibleMemberWhere(tenantId), userId }, select: { id: true } });
  return member !== null;
}

/**
 * §10.2: editing, opening, cancelling and closing by hand need the
 * responsible or MANAGE (403 MANAGE_FORBIDDEN). When the responsible is no
 * longer eligible, any DIRECTIVA/ADMINISTRADOR of the tenant may cancel or
 * close (`fallback`), so that the call is never left without a way out; this
 * never grants seeing participants.
 */
export async function requireManage(
  db: Db,
  call: { id: string; tenantId: string; responsibleUserId: string },
  actor: InstitutionalActor,
  fallback: "CANCEL_OR_CLOSE" | "NONE",
): Promise<void> {
  if (call.responsibleUserId === actor.userId) return;
  const manage = await db.jointPurchaseCallAccess.findUnique({
    where: { callId_userId_grant: { callId: call.id, userId: actor.userId, grant: ACCESS_MANAGE } },
    select: { callId: true },
  });
  if (manage) return;
  if (fallback === "CANCEL_OR_CLOSE" && !(await responsibleIsEligible(db, call.tenantId, call.responsibleUserId))) return;
  throw new CallHttpError(403, "MANAGE_FORBIDDEN");
}
