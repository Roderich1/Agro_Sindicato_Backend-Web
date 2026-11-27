import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, InstitutionalActor } from "../domain/call-error";
import { CallVisibility } from "../domain/visibility";
import { ACCESS_MANAGE, CallGrant, Tx } from "./call-store";

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
 * Whether one MANAGE delegation is exercised now (E4 §6.2, unchanged from
 * E2 §10.2 and P-A): granted by the responsible under the CURRENT responsible
 * version (after a substitution the earlier ones stay suspended until the
 * successor reviews them) and while the responsible is eligible (m6). A
 * delegation never reaches the responsible herself. A stored PARTICIPANTS
 * row (E4: history only) is never in force.
 */
export function rowInForce(call: CallForAccess, row: AccessRow, responsibleEligible: boolean): boolean {
  if (row.grant !== ACCESS_MANAGE || row.grantedByUserId === null) return false;
  return responsibleEligible && row.responsibleVersion === call.responsibleVersion && row.userId !== call.responsibleUserId;
}

/** P-A §12: a MANAGE delegation waiting for the successor's review (granted under an earlier responsible version). */
export function rowPendingReview(call: CallForAccess, row: AccessRow): boolean {
  return (
    row.grant === ACCESS_MANAGE &&
    row.grantedByUserId !== null &&
    row.responsibleVersion < call.responsibleVersion &&
    row.userId !== call.responsibleUserId
  );
}

export interface CallAccessOf {
  /** Lifecycle rights of an active institutional member. */
  grants: Set<CallGrant>;
  /** E4 §2: an eligible ADMINISTRADOR of the tenant now (by role, read at this request). */
  canViewParticipants: boolean;
  isResponsible: boolean;
  visibility: CallVisibility;
}

/** Current institutional management and identified viewing are checked independently. */
export async function accessOf(db: Db, call: CallForAccess, userId: string): Promise<CallAccessOf> {
  const isResponsible = call.responsibleUserId === userId;
  const member = await db.member.findFirst({
    where: { ...eligibleMemberWhere(call.tenantId), userId },
    select: { role: true },
  });
  const administration = member?.role === UserRole.ADMINISTRADOR;
  const grants = new Set<CallGrant>();
  if (member) grants.add(ACCESS_MANAGE);
  return {
    grants,
    canViewParticipants: administration,
    isResponsible,
    visibility: new CallVisibility(administration),
  };
}

/** Whether the responsible can still act: account, Member, role and tenant active (E2-D5). */
export async function responsibleIsEligible(db: Db, tenantId: string, userId: string): Promise<boolean> {
  const member = await db.member.findFirst({ where: { ...eligibleMemberWhere(tenantId), userId }, select: { id: true } });
  return member !== null;
}

/** Lifecycle actions are authorized by active institutional membership in the call's tenant. */
export async function requireManage(db: Db, call: CallForAccess, actor: InstitutionalActor): Promise<void> {
  if (actor.tenantId === call.tenantId && await responsibleIsEligible(db, call.tenantId, actor.userId)) return;
  throw new CallHttpError(403, "MANAGE_FORBIDDEN");
}

/**
 * An eligible ADMINISTRADOR of the tenant (Member, account, role and tenant
 * active). E4 §2: sees the identified detail with consent `ADMINISTRATION`
 * and substitutes a responsible who is no longer eligible (§6.3).
 */
export async function isEligibleAdministrator(db: Db, tenantId: string, userId: string): Promise<boolean> {
  const member = await db.member.findFirst({
    where: { ...eligibleMemberWhere(tenantId), role: UserRole.ADMINISTRADOR, userId },
    select: { id: true },
  });
  return member !== null;
}
