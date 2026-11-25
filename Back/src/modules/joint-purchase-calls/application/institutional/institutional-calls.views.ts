import { UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, InstitutionalActor } from "../../domain/call-error";
import { SERVER_ID } from "../../domain/participation-input";
import { accessOf, eligibleMemberWhere, responsibleIsEligible, rowInForce, rowPendingReview } from "../call-access";
import { ACCESS_MANAGE, ACCESS_PARTICIPANTS, CallGrant, isoDate, permissionsRetiredAt, Tx } from "../call-store";
import {
  CallSummaryView,
  CLOSING_LABEL,
  ClosingViewV2,
  CollaboratorsViewV2,
  CollaboratorViewV2,
  GRANT_LABEL,
  iso,
  ParticipantsViewV2,
  pendingConsentNotice,
  presentationUnit,
  PROVISIONAL_NOTICE,
  retiredGrantNotice,
} from "../call-views";
import { findCall, frozenParticipations } from "./institutional-calls.queries";
import { ListFilter, NOT_FOUND } from "./institutional-calls.types";

export async function listCalls(
  prisma: PrismaService,
  actor: InstitutionalActor,
  filter: ListFilter,
): Promise<{ contractVersion: 1; calls: CallSummaryView[] }> {
  const rows = await prisma.jointPurchaseCall.findMany({
    where: {
      tenantId: actor.tenantId,
      ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      campaign: { select: { id: true, name: true } },
      responsible: { select: { id: true, name: true } },
      closing: { select: { participantCount: true } },
      _count: { select: { products: true } },
    },
  });
  const live = await prisma.jointPurchaseParticipation.groupBy({
    by: ["callId"],
    where: { callId: { in: rows.map((row) => row.id) }, status: "ACTIVE" },
    _count: { _all: true },
  });
  const liveCount = new Map(live.map((row) => [row.callId, row._count._all]));
  return {
    contractVersion: 1,
    calls: rows.map((row) => ({
      call_id: row.id,
      name: row.name,
      status: row.status,
      campaign: { campaign_ref: row.campaign.id, name: row.campaign.name },
      deadline_at: row.deadlineAt.toISOString(),
      opened_at: iso(row.openedAt),
      closed_at: iso(row.closedAt),
      cancelled_at: iso(row.cancelledAt),
      created_at: row.createdAt.toISOString(),
      responsible: { user_ref: row.responsible.id, name: row.responsible.name },
      product_count: row._count.products,
      participant_count: row.closing ? row.closing.participantCount : (liveCount.get(row.id) ?? 0),
    })),
  };
}

/** E2-D5: active institutional users of the tenant (id, name, role). */
export async function listEligibleResponsibles(
  prisma: PrismaService,
  actor: InstitutionalActor,
): Promise<{ contractVersion: 1; users: { user_ref: string; name: string; role: UserRole }[] }> {
  const members = await prisma.member.findMany({
    where: eligibleMemberWhere(actor.tenantId),
    select: { role: true, user: { select: { id: true, name: true } } },
    orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
  });
  return {
    contractVersion: 1,
    users: members.map((member) => ({ user_ref: member.user.id, name: member.user.name, role: member.role })),
  };
}

/** E4 §3.1: identified participants, only for an eligible ADMINISTRADOR. */
export async function getCallParticipants(
  prisma: PrismaService,
  actor: InstitutionalActor,
  id: string,
): Promise<ParticipantsViewV2> {
  const call = await findCall(prisma, actor.tenantId, id);
  const access = await accessOf(prisma, call, actor.userId);
  if (!access.canViewParticipants) throw new CallHttpError(403, "PARTICIPANTS_FORBIDDEN");
  const all = await prisma.jointPurchaseParticipation.findMany({
    where: { callId: call.id, status: "ACTIVE" },
    orderBy: [{ acceptedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      acceptedAt: true,
      consentScope: true,
      member: { select: { user: { select: { name: true } } } },
      lines: {
        orderBy: { productId: "asc" },
        select: { productId: true, baseUnit: true, quantityBase: true, product: { select: { name: true } } },
      },
    },
  });
  const rows = all.filter((row) => access.visibility.canSeeParticipation(row));
  const pending = access.visibility.pendingConsentCount(all);
  return {
    contractVersion: 2,
    call_id: call.id,
    status: call.status,
    provisional: call.status === "OPEN",
    notice: call.status === "OPEN" ? PROVISIONAL_NOTICE : null,
    participant_count: all.length,
    pending_consent_count: pending,
    pending_consent_notice: pendingConsentNotice(pending),
    participants: rows.map((row) => ({
      participation_ref: row.id,
      name: row.member.user.name,
      status: row.status,
      accepted_at: row.acceptedAt.toISOString(),
      lines: row.lines.map((line) => ({
        product_ref: line.productId,
        product_name: line.product.name,
        base_unit: line.baseUnit,
        quantity_base: line.quantityBase.toString(),
      })),
    })),
  };
}

export async function renderClosingView(
  db: Tx | PrismaService,
  actor: InstitutionalActor,
  id: string,
): Promise<ClosingViewV2> {
  const call = await findCall(db, actor.tenantId, id);
  if (call.status !== "CLOSED") throw new CallHttpError(409, "CALL_NOT_CLOSED", { status: call.status });
  const access = await accessOf(db, call, actor.userId);
  const closing = await db.jointPurchaseCallClosing.findUniqueOrThrow({
    where: { callId: call.id },
    include: {
      closedBy: { select: { id: true, name: true } },
      lines: { include: { product: { select: { name: true } } } },
    },
  });
  const order = await db.jointPurchaseCallProduct.findMany({
    where: { callId: call.id },
    orderBy: { position: "asc" },
    select: { productId: true, product: { select: { name: true } } },
  });
  const nameOf = new Map(order.map((p) => [p.productId, p.product.name]));
  const position = new Map(order.map((p, index) => [p.productId, index]));
  const lines = [...closing.lines].sort((a, b) => (position.get(a.productId) ?? 0) - (position.get(b.productId) ?? 0));
  const frozen = await frozenParticipations(db, call.id);
  let participants: ClosingViewV2["participants"] = null;
  const pending = access.visibility.pendingConsentCount(frozen);
  if (access.canViewParticipants) {
    const visible = frozen.filter((p) => access.visibility.canSeeParticipation(p));
    const members = await db.member.findMany({
      where: { id: { in: visible.map((row) => row.memberId) } },
      select: { id: true, user: { select: { name: true } } },
    });
    const memberName = new Map(members.map((m) => [m.id, m.user.name]));
    const baseOf = new Map(closing.lines.map((l) => [l.productId, l.baseUnit]));
    participants = visible.map((row) => ({
      participation_ref: row.participationId,
      name: memberName.get(row.memberId) ?? "",
      accepted_at: row.acceptedAt.toISOString(),
      lines: row.lines.map((line) => ({
        product_ref: line.productId,
        product_name: nameOf.get(line.productId) ?? "",
        base_unit: baseOf.get(line.productId) ?? "ML",
        quantity_base: line.quantityBase.toString(),
      })),
    }));
  }
  return {
    contractVersion: 2,
    call_id: call.id,
    name: call.name,
    status: "CLOSED",
    label: CLOSING_LABEL,
    mode: closing.mode,
    cutoff_at: closing.cutoffAt.toISOString(),
    closed_at: closing.closedAt.toISOString(),
    closed_by: closing.closedBy ? { user_ref: closing.closedBy.id, name: closing.closedBy.name } : null,
    participant_count: closing.participantCount,
    can_view_participants: access.canViewParticipants,
    lines: lines.map((line) => ({
      product_ref: line.productId,
      product_name: line.product.name,
      unit: presentationUnit(line.baseUnit),
      base_unit: line.baseUnit,
      ...access.visibility.productTotal(
        line.totalQuantityBase,
        line.participantCount,
        frozen.filter((p) => p.productIds.includes(line.productId)),
        "CLOSING",
      ),
    })),
    participants,
    pending_consent_count: pending,
    pending_consent_notice: pendingConsentNotice(pending),
  };
}

export async function renderCollaboratorsView(
  db: Tx | PrismaService,
  actor: InstitutionalActor,
  id: string,
): Promise<CollaboratorsViewV2> {
  if (!SERVER_ID.test(id)) throw NOT_FOUND();
  const call = await db.jointPurchaseCall.findFirst({
    where: { id, tenantId: actor.tenantId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      responsibleUserId: true,
      responsibleVersion: true,
      responsible: { select: { id: true, name: true } },
    },
  });
  if (!call) throw NOT_FOUND();
  const responsibleEligible = await responsibleIsEligible(db, actor.tenantId, call.responsibleUserId);
  const user = { select: { id: true, name: true, members: { where: { tenantId: actor.tenantId }, select: { role: true } } } } as const;
  const [rows, events, retiredAt] = await Promise.all([
    db.jointPurchaseCallAccess.findMany({
      where: { callId: call.id },
      orderBy: [{ grantedAt: "asc" }, { userId: "asc" }, { grant: "asc" }],
      include: { user, grantedBy: { select: { id: true, name: true } } },
    }),
    db.jointPurchaseCallAccessEvent.findMany({
      where: { callId: call.id },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      include: { user: { select: { id: true, name: true } }, actor: { select: { id: true, name: true } } },
    }),
    permissionsRetiredAt(db),
  ]);
  const notice = retiredGrantNotice(isoDate(retiredAt));
  const byUser = new Map<string, CollaboratorViewV2>();
  for (const row of rows) {
    if (row.grant !== ACCESS_MANAGE || row.grantedByUserId === null || row.userId === call.responsibleUserId) continue;
    const entry = byUser.get(row.userId) ?? {
      user_ref: row.user.id,
      name: row.user.name,
      role: row.user.members[0]?.role ?? null,
      grants: [],
    };
    entry.grants.push({
      grant: ACCESS_MANAGE,
      label: GRANT_LABEL[ACCESS_MANAGE],
      granted_at: row.grantedAt.toISOString(),
      granted_by: { user_ref: row.grantedBy!.id, name: row.grantedBy!.name },
      status: rowPendingReview(call, row) ? "PENDING_REVIEW" : rowInForce(call, row, responsibleEligible) ? "IN_FORCE" : "SUSPENDED",
      responsible_version: row.responsibleVersion,
    });
    byUser.set(row.userId, entry);
  }
  return {
    contractVersion: 2,
    call_id: call.id,
    status: call.status,
    responsible: { user_ref: call.responsible.id, name: call.responsible.name },
    can_grant: call.responsible.id === actor.userId,
    can_review: call.responsible.id === actor.userId && responsibleEligible,
    responsible_version: call.responsibleVersion,
    collaborators: [...byUser.values()],
    retired_grants: rows
      .filter((row) => row.grant === ACCESS_PARTICIPANTS)
      .map((row) => ({
        grant: ACCESS_PARTICIPANTS,
        label: GRANT_LABEL[ACCESS_PARTICIPANTS],
        user: { user_ref: row.user.id, name: row.user.name },
        granted_at: row.grantedAt.toISOString(),
        granted_by: row.grantedBy ? { user_ref: row.grantedBy.id, name: row.grantedBy.name } : null,
        responsible_version: row.responsibleVersion,
        retired: true as const,
        notice,
      })),
    history: events.map((event) => ({
      at: event.at.toISOString(),
      action: event.action,
      grant: event.grant as CallGrant,
      user: { user_ref: event.user.id, name: event.user.name },
      actor: { user_ref: event.actor.id, name: event.actor.name },
      retired: event.grant === ACCESS_PARTICIPANTS,
      notice: event.grant === ACCESS_PARTICIPANTS ? notice : null,
    })),
  };
}
