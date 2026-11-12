import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, InstitutionalActor } from "../domain/call-error";
import { scopeCoversCollaborators } from "../domain/consent";
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
 *
 * m6 (2026-11-12): while the responsible is not eligible (account, Member,
 * role or tenant inactive), the grants she gave are SUSPENDED: they stay
 * recorded but are not exercised, until a substitution (P-A, pending) reviews
 * them. A suspended collaborator is treated as having held the permission
 * before (the protection of §10.3 applies to them).
 */
export async function accessOf(
  db: Db,
  call: { id: string; tenantId: string; responsibleUserId: string },
  userId: string,
): Promise<CallAccessOf> {
  const isResponsible = call.responsibleUserId === userId;
  const [rows, everParticipants, eligible] = await Promise.all([
    db.jointPurchaseCallAccess.findMany({
      where: { callId: call.id, userId },
      select: { grant: true, grantedByUserId: true },
    }),
    db.jointPurchaseCallAccessEvent.count({
      where: { callId: call.id, userId, grant: ACCESS_PARTICIPANTS, action: "GRANTED" },
    }),
    isResponsible ? Promise.resolve(true) : responsibleIsEligible(db, call.tenantId, call.responsibleUserId),
  ]);
  // The responsible's own row is never a delegation; collaborators' rows are suspended with her.
  const inForce = rows.filter((row) => row.grantedByUserId === null || eligible);
  const grants = new Set<CallGrant>(inForce.map((row) => row.grant as CallGrant));
  if (isResponsible) grants.add(ACCESS_MANAGE);
  const participantsRow = inForce.find((row) => row.grant === ACCESS_PARTICIPANTS) ?? null;
  const viewer: CallViewer = {
    kind: participantsRow === null ? "NONE" : participantsRow.grantedByUserId === null && isResponsible ? "RESPONSIBLE" : "COLLABORATOR",
    formerParticipantsHolder: everParticipants > 0,
  };
  return {
    grants,
    canViewParticipants: participantsRow !== null,
    isResponsible,
    visibility: new CallVisibility(viewer, scopeCoversCollaborators),
  };
}

/** Whether the responsible can still act: account, Member, role and tenant active (E2-D5). */
export async function responsibleIsEligible(db: Db, tenantId: string, userId: string): Promise<boolean> {
  const member = await db.member.findFirst({ where: { ...eligibleMemberWhere(tenantId), userId }, select: { id: true } });
  return member !== null;
}

/**
 * §10.2: editing, opening, cancelling and closing by hand need the
 * responsible or MANAGE granted by her (403 MANAGE_FORBIDDEN).
 *
 * N2 rejected (2026-11-12): no role gets cancel or close when the responsible
 * is no longer eligible. A MANAGE granted by her is suspended meanwhile (m6).
 * The automatic closing at the deadline does not go through here and is kept.
 * The way out for such a call is the explicit substitution of P-A, not yet
 * enabled.
 */
export async function requireManage(
  db: Db,
  call: { id: string; tenantId: string; responsibleUserId: string },
  actor: InstitutionalActor,
): Promise<void> {
  if (call.responsibleUserId === actor.userId) return;
  const manage = await db.jointPurchaseCallAccess.findUnique({
    where: { callId_userId_grant: { callId: call.id, userId: actor.userId, grant: ACCESS_MANAGE } },
    select: { callId: true },
  });
  if (manage && (await responsibleIsEligible(db, call.tenantId, call.responsibleUserId))) return;
  throw new CallHttpError(403, "MANAGE_FORBIDDEN");
}
