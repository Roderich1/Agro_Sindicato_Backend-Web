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

/** The call as the access rules need it (P-A: with its responsible version). */
export interface CallForAccess {
  id: string;
  tenantId: string;
  responsibleUserId: string;
  responsibleVersion: number;
}

/** One row of JointPurchaseCallAccess as the rules read it. */
export interface AccessRow {
  userId: string;
  grant: string;
  grantedByUserId: string | null;
  responsibleVersion: number;
}

/**
 * Whether one access row is exercised now:
 * - the row the system creates for the responsible (`grantedByUserId` null)
 *   only while she is the call's responsible (P-A: a substituted responsible
 *   loses it; her row is removed by the substitution);
 * - a delegation only if it was granted under the CURRENT responsible
 *   version (P-A §12: after a substitution the earlier ones stay suspended
 *   until the successor reviews them) and while the responsible is eligible
 *   (m6). A delegation never reaches the responsible herself.
 */
export function rowInForce(call: CallForAccess, row: AccessRow, responsibleEligible: boolean): boolean {
  if (row.grantedByUserId === null) return row.userId === call.responsibleUserId;
  return responsibleEligible && row.responsibleVersion === call.responsibleVersion && row.userId !== call.responsibleUserId;
}

/** P-A §12: a delegation waiting for the successor's review (granted under an earlier responsible version). */
export function rowPendingReview(call: CallForAccess, row: AccessRow): boolean {
  return row.grantedByUserId !== null && row.responsibleVersion < call.responsibleVersion && row.userId !== call.responsibleUserId;
}

export interface CallAccessOf {
  /** Grants held now: the responsible holds MANAGE by being the responsible. */
  grants: Set<CallGrant>;
  /** The PARTICIPANTS row exists and is in force now (the responsible's or a collaborator's). */
  canViewParticipants: boolean;
  isResponsible: boolean;
  visibility: CallVisibility;
}

/**
 * E2-P3 (§10.2/§10.3): what this user holds on this call, read at each
 * request (a revocation applies from the next one). The responsible holds
 * MANAGE by being the responsible and PARTICIPANTS through the row created at
 * opening (or at her substitution); anyone else only through rows granted by
 * the responsible under the current responsible version. No role grants
 * anything.
 *
 * m6 (2026-11-12): while the responsible is not eligible, the grants she
 * gave are SUSPENDED. P-A (§12): after a substitution, the grants given under
 * an earlier responsible version are suspended until the successor reviews
 * them; a former responsible recovers nothing if she becomes eligible again.
 * A suspended collaborator is treated as having held the permission before
 * (the protection of §10.3 applies to them).
 */
export async function accessOf(db: Db, call: CallForAccess, userId: string): Promise<CallAccessOf> {
  const isResponsible = call.responsibleUserId === userId;
  const [rows, everParticipants, eligible] = await Promise.all([
    db.jointPurchaseCallAccess.findMany({
      where: { callId: call.id, userId },
      select: { userId: true, grant: true, grantedByUserId: true, responsibleVersion: true },
    }),
    db.jointPurchaseCallAccessEvent.count({
      where: { callId: call.id, userId, grant: ACCESS_PARTICIPANTS, action: { in: ["GRANTED", "CONFIRMED"] } },
    }),
    isResponsible ? Promise.resolve(true) : responsibleIsEligible(db, call.tenantId, call.responsibleUserId),
  ]);
  const inForce = rows.filter((row) => rowInForce(call, row, eligible));
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
 * responsible or MANAGE granted by her under the current responsible version.
 *
 * N2 rejected (2026-11-12): no role gets cancel or close when the responsible
 * is no longer eligible. A MANAGE granted by her is suspended meanwhile (m6).
 * The automatic closing at the deadline does not go through here and is kept.
 * The way out for such a call is the explicit substitution of P-A (§12).
 */
export async function requireManage(db: Db, call: CallForAccess, actor: InstitutionalActor): Promise<void> {
  if (call.responsibleUserId === actor.userId) return;
  const manage = await db.jointPurchaseCallAccess.findUnique({
    where: { callId_userId_grant: { callId: call.id, userId: actor.userId, grant: ACCESS_MANAGE } },
    select: { userId: true, grant: true, grantedByUserId: true, responsibleVersion: true },
  });
  if (manage && rowInForce(call, manage, await responsibleIsEligible(db, call.tenantId, call.responsibleUserId))) return;
  throw new CallHttpError(403, "MANAGE_FORBIDDEN");
}

/** P-A A1: an eligible ADMINISTRADOR of the tenant (only they grant and revoke «Sustituir responsable»). */
export async function isEligibleAdministrator(db: Db, tenantId: string, userId: string): Promise<boolean> {
  const member = await db.member.findFirst({
    where: { ...eligibleMemberWhere(tenantId), role: UserRole.ADMINISTRADOR, userId },
    select: { id: true },
  });
  return member !== null;
}

/**
 * P-A B1: the user holds «Sustituir responsable» in this tenant AND is still
 * eligible (an active DIRECTIVA/ADMINISTRADOR). The permission does not
 * depend on whoever granted it staying eligible (documented in §12): an
 * eligible ADMINISTRADOR revokes it when needed.
 */
export async function holdsSubstitution(db: Db, tenantId: string, userId: string): Promise<boolean> {
  const [grant, eligible] = await Promise.all([
    db.jointPurchaseSubstitutionGrant.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { userId: true } }),
    responsibleIsEligible(db, tenantId, userId),
  ]);
  return grant !== null && eligible;
}
