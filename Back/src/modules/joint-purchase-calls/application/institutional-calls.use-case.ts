import { Inject, Injectable, Logger } from "@nestjs/common";
import { JointPurchaseCallStatus, Prisma, SyncV1BaseUnit, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "@/modules/collective/application/collective-config";
import { baseUnitForCentralUnit } from "@/modules/sync-v1/domain/units";
import { CallHttpError, InstitutionalActor } from "../domain/call-error";
import { isEditable } from "../domain/call-state";
import { SERVER_ID } from "../domain/participation-input";
import { CallVisibility, ParticipationForVisibility } from "../domain/visibility";
import {
  accessOf,
  CallForAccess,
  eligibleMemberWhere,
  requireManage,
  responsibleIsEligible,
  rowInForce,
  rowPendingReview,
} from "./call-access";
import { CallClosingService } from "./call-closing.service";
import {
  ACCESS_MANAGE,
  ACCESS_PARTICIPANTS,
  CALL_GRANTS,
  CALL_TRANSACTION_OPTIONS,
  CallGrant,
  ENTITY_NAME,
  isoDate,
  lockCallRow,
  lockProposalSelection,
  lockTenantCalls,
  permissionsRetiredAt,
  Tx,
} from "./call-store";
import {
  CallDetailViewV2,
  CallOriginView,
  CallSummaryView,
  CLOSING_LABEL,
  ClosingViewV2,
  CollaboratorsViewV2,
  CollaboratorViewV2,
  GRANT_LABEL,
  HistoryEntryView,
  iso,
  ParticipantsViewV2,
  pendingConsentNotice,
  presentationUnit,
  PROVISIONAL_NOTICE,
  ProposalReferenceView,
  REFERENCE_DISCLOSED_LABEL,
  REFERENCE_NO_FIGURE_LABEL,
  retiredGrantNotice,
} from "./call-views";
import { Clock, JOINT_PURCHASE_CLOCK } from "./clock";

export { eligibleMemberWhere, INSTITUTIONAL_ROLES } from "./call-access";
export const NAME_MAX = 120;
export const REASON_MAX = 280;
export const MAX_PRODUCTS = 50;
/**
 * N1 (accepted with changes, 2026-11-12): drafts are created and edited in a
 * PLANIFICADA or ABIERTA campaign; a call is opened only in an ABIERTA one.
 * Cancelling and closing an existing call never depend on the campaign, and
 * a change of the campaign never cancels a call.
 */
const DRAFT_CAMPAIGN = new Set(["PLANIFICADA", "ABIERTA"]);
const OPEN_CAMPAIGN = new Set(["ABIERTA"]);

/** E4 §3.1: the opening grants nothing (the detail is consulted by role). Earlier events keep their text. */
export const OPENED_DETAIL = "Convocatoria abierta.";

export interface DraftCommand {
  campaign_id: string;
  name: string;
  deadline_at: string;
  responsible_user_id: string;
  products: { product_ref: string }[];
  source_proposal_id?: string | null;
}

export type PatchCommand = Partial<Omit<DraftCommand, "campaign_id">>;

export interface ConfirmCommand {
  confirmed?: unknown;
}

export interface CancelCommand extends ConfirmCommand {
  reason?: unknown;
}

export interface GrantCommand {
  user_ref?: unknown;
  grant?: unknown;
  confirmed?: unknown;
}

export interface ListFilter {
  campaignId?: string;
  status?: JointPurchaseCallStatus;
}

const NOT_FOUND = () => new CallHttpError(404, "CALL_NOT_FOUND");
const INVALID = () => new CallHttpError(400, "PAYLOAD_INVALID");

interface ResolvedProduct {
  productId: string;
  baseUnit: SyncV1BaseUnit;
  sourceProposalId: string | null;
  sourcePosition: number | null;
}

/**
 * E2 §4.1: joint purchase calls of the Directiva of the effective tenant (its
 * ADMINISTRADOR holds the Directiva functions, RU-18/RU-19). Another tenant's
 * call is indistinguishable from a missing one (404). Every decision is an
 * event with its actor and an AuditLog entry with `ownerUserId: null`, never
 * with a farmer's name or quantity. E4 §2: the identified detail is
 * consulted only by an eligible ADMINISTRADOR, and only for participations
 * whose consent covers `ADMINISTRATION`; the Directiva and Administración see
 * counts and the totals of rule T (§5.2). The responsible coordinates (MANAGE)
 * and sees nothing more for being the responsible.
 */
@Injectable()
export class InstitutionalCallsUseCase {
  private readonly logger = new Logger("JointPurchaseCalls");

  constructor(
    private readonly prisma: PrismaService,
    private readonly collective: CollectiveConfig,
    private readonly closing: CallClosingService,
    @Inject(JOINT_PURCHASE_CLOCK) private readonly clock: Clock,
  ) {}

  // ------------------------------------------------------------------ reads

  async list(actor: InstitutionalActor, filter: ListFilter): Promise<{ contractVersion: 1; calls: CallSummaryView[] }> {
    const rows = await this.prisma.jointPurchaseCall.findMany({
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
    const live = await this.prisma.jointPurchaseParticipation.groupBy({
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
  async eligibleResponsibles(
    actor: InstitutionalActor,
  ): Promise<{ contractVersion: 1; users: { user_ref: string; name: string; role: UserRole }[] }> {
    const members = await this.prisma.member.findMany({
      where: eligibleMemberWhere(actor.tenantId),
      select: { role: true, user: { select: { id: true, name: true } } },
      orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
    });
    return {
      contractVersion: 1,
      users: members.map((member) => ({ user_ref: member.user.id, name: member.user.name, role: member.role })),
    };
  }

  async detail(actor: InstitutionalActor, id: string): Promise<CallDetailViewV2> {
    return this.renderDetail(this.prisma, actor, id);
  }

  /**
   * E4 §3.1: identified participants, only for an eligible ADMINISTRADOR (role
   * and eligibility read at this request; anyone else 403
   * PARTICIPANTS_FORBIDDEN, also the responsible and whoever held a view
   * permission). Only ACTIVE participations with scope `ADMINISTRATION`; the
   * others are a count without names.
   */
  async participants(actor: InstitutionalActor, id: string): Promise<ParticipantsViewV2> {
    const call = await this.findCall(this.prisma, actor.tenantId, id);
    const access = await accessOf(this.prisma, call, actor.userId);
    if (!access.canViewParticipants) throw new CallHttpError(403, "PARTICIPANTS_FORBIDDEN");
    const all = await this.prisma.jointPurchaseParticipation.findMany({
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

  /** E2-D13: the closing snapshot; per-person detail only for an eligible ADMINISTRADOR (E4). */
  async closingView(actor: InstitutionalActor, id: string): Promise<ClosingViewV2> {
    return this.renderClosing(this.prisma, actor, id);
  }

  // ----------------------------------------------------------------- writes

  async create(actor: InstitutionalActor, command: DraftCommand): Promise<CallDetailViewV2> {
    const name = normalizeName(command.name);
    const deadlineAt = parseDeadline(command.deadline_at);
    const id = await this.prisma.$transaction(async (tx) => {
      const now = this.clock.now();
      const campaign = await this.requireCampaign(tx, actor.tenantId, command.campaign_id);
      if (deadlineAt.getTime() <= now.getTime()) throw new CallHttpError(422, "DEADLINE_IN_PAST");
      const responsible = await this.requireResponsible(tx, actor.tenantId, command.responsible_user_id);
      const proposalId = await this.requireProposal(tx, actor.tenantId, campaign.id, command.source_proposal_id ?? null);
      const products = await this.resolveProducts(tx, actor.tenantId, command.products, proposalId);
      const origin = await this.originOf(tx, proposalId, products);
      const call = await tx.jointPurchaseCall.create({
        data: {
          tenantId: actor.tenantId,
          campaignId: campaign.id,
          name,
          deadlineAt,
          responsibleUserId: responsible.id,
          sourceProposalId: proposalId,
          createdByUserId: actor.userId,
          products: {
            create: products.map((product, position) => ({ position, tenantId: actor.tenantId, ...product })),
          },
        },
        select: { id: true },
      });
      // E3-P2: the products as they are now and where they came from, once.
      await tx.jointPurchaseCallOrigin.create({
        data: {
          callId: call.id,
          tenantId: actor.tenantId,
          ...origin,
          recordedAt: now,
          recordedByUserId: actor.userId,
          products: {
            create: products.map((product, position) => ({
              position,
              productId: product.productId,
              baseUnit: product.baseUnit,
              proposalId: product.sourceProposalId,
              proposalPosition: product.sourcePosition,
            })),
          },
        },
      });
      await tx.jointPurchaseCallEvent.create({
        data: { callId: call.id, at: now, kind: "CREATED", actorUserId: actor.userId, detail: "Borrador creado." },
      });
      await tx.jointPurchaseCallEvent.create({
        data: {
          callId: call.id,
          at: new Date(now.getTime() + 1),
          kind: "RESPONSIBLE_ASSIGNED",
          actorUserId: actor.userId,
          detail: truncate(`Responsable asignado: ${responsible.name}.`),
        },
      });
      await this.audit(tx, actor, call.id, campaign.id, `Borrador de convocatoria de compra conjunta «${name}» creado.`, {
        productCount: products.length,
        responsibleUserRef: responsible.id,
        origin: origin.kind,
      });
      return call.id;
    }, CALL_TRANSACTION_OPTIONS);
    this.logger.log(`[JOINT PURCHASE CALL CREATED] tenant=${actor.tenantId} actor=${actor.userId} call=${id}`);
    return this.detail(actor, id);
  }

  /** Only DRAFT: name, deadline, responsible, products (and their source draft). */
  async patch(actor: InstitutionalActor, id: string, command: PatchCommand): Promise<CallDetailViewV2> {
    const name = command.name !== undefined ? normalizeName(command.name) : undefined;
    const deadlineAt = command.deadline_at !== undefined ? parseDeadline(command.deadline_at) : undefined;
    if (command.products !== undefined && (!Array.isArray(command.products) || command.products.length === 0)) {
      throw INVALID();
    }
    await this.prisma.$transaction(async (tx) => {
      const call = await this.lockAndRead(tx, actor.tenantId, id);
      await requireManage(tx, call, actor);
      if (!isEditable(call.status)) throw new CallHttpError(409, "CALL_NOT_EDITABLE", { status: call.status });
      await this.requireCampaign(tx, actor.tenantId, call.campaignId);
      const now = this.clock.now();
      const changed: string[] = [];
      const data: Prisma.JointPurchaseCallUncheckedUpdateInput = {};
      if (name !== undefined && name !== call.name) {
        data.name = name;
        changed.push("nombre");
      }
      if (deadlineAt !== undefined) {
        if (deadlineAt.getTime() <= now.getTime()) throw new CallHttpError(422, "DEADLINE_IN_PAST");
        if (deadlineAt.getTime() !== call.deadlineAt.getTime()) {
          data.deadlineAt = deadlineAt;
          changed.push("fecha límite");
        }
      }
      let responsibleName: string | null = null;
      if (command.responsible_user_id !== undefined && command.responsible_user_id !== call.responsibleUserId) {
        const responsible = await this.requireResponsible(tx, actor.tenantId, command.responsible_user_id);
        data.responsibleUserId = responsible.id;
        responsibleName = responsible.name;
      }
      const proposalChanged =
        command.source_proposal_id !== undefined && (command.source_proposal_id ?? null) !== call.sourceProposalId;
      if (command.products !== undefined || proposalChanged) {
        const proposalId = proposalChanged
          ? await this.requireProposal(tx, actor.tenantId, call.campaignId, command.source_proposal_id ?? null)
          : call.sourceProposalId;
        const requested = command.products ?? call.products.map((p) => ({ product_ref: p.productId }));
        const products = await this.resolveProducts(tx, actor.tenantId, requested, proposalId);
        await tx.jointPurchaseCallProduct.deleteMany({ where: { callId: call.id } });
        await tx.jointPurchaseCallProduct.createMany({
          data: products.map((product, position) => ({ callId: call.id, position, tenantId: actor.tenantId, ...product })),
        });
        data.sourceProposalId = proposalId;
        changed.push("productos");
      }
      if (changed.length === 0 && responsibleName === null) return;
      await tx.jointPurchaseCall.update({ where: { id: call.id }, data });
      if (changed.length > 0) {
        await tx.jointPurchaseCallEvent.create({
          data: {
            callId: call.id,
            at: now,
            kind: "UPDATED",
            actorUserId: actor.userId,
            detail: truncate(`Borrador actualizado: ${changed.join(", ")}.`),
          },
        });
      }
      if (responsibleName !== null) {
        await tx.jointPurchaseCallEvent.create({
          data: {
            callId: call.id,
            at: new Date(now.getTime() + 1),
            kind: "RESPONSIBLE_ASSIGNED",
            actorUserId: actor.userId,
            detail: truncate(`Responsable asignado: ${responsibleName}.`),
          },
        });
      }
      await this.audit(tx, actor, call.id, call.campaignId, `Borrador de convocatoria de compra conjunta «${name ?? call.name}» actualizado.`, {
        changed: [...changed, ...(responsibleName !== null ? ["responsable"] : [])],
      });
    }, CALL_TRANSACTION_OPTIONS);
    return this.detail(actor, id);
  }

  /**
   * E2-D3/D4/D5/D6: DRAFT → OPEN. Products, deadline and responsible are
   * validated again under the tenant's lock; the partial unique index backs
   * the uniqueness of open products. E4 §3.1: grants nothing (no PARTICIPANTS row).
   */
  async open(actor: InstitutionalActor, id: string, command: ConfirmCommand): Promise<CallDetailViewV2> {
    requireConfirmed(command.confirmed);
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockTenantCalls(tx, actor.tenantId);
        const call = await this.lockAndRead(tx, actor.tenantId, id);
        await requireManage(tx, call, actor);
        if (call.status !== "DRAFT") throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
        const now = this.clock.now();
        if (call.deadlineAt.getTime() <= now.getTime()) throw new CallHttpError(422, "DEADLINE_IN_PAST");
        await this.requireCampaign(tx, actor.tenantId, call.campaignId, OPEN_CAMPAIGN);
        await this.requireResponsible(tx, actor.tenantId, call.responsibleUserId);
        const checked = await this.checkProducts(tx, actor.tenantId, call.products.map((p) => p.productId));
        for (const product of call.products) {
          if (checked.get(product.productId) !== product.baseUnit) {
            throw new CallHttpError(422, "PRODUCT_UNIT_UNSUPPORTED");
          }
        }
        const conflict = await tx.jointPurchaseCallProduct.findFirst({
          where: {
            tenantId: actor.tenantId,
            openCampaignId: call.campaignId,
            productId: { in: call.products.map((p) => p.productId) },
            callId: { not: call.id },
          },
          select: { callId: true },
        });
        if (conflict) throw new CallHttpError(409, "PRODUCT_IN_OPEN_CALL");
        await tx.jointPurchaseCallProduct.updateMany({
          where: { callId: call.id },
          data: { openCampaignId: call.campaignId },
        });
        await tx.jointPurchaseCall.update({
          where: { id: call.id },
          data: { status: "OPEN", openedAt: now, openedByUserId: actor.userId },
        });
        await tx.jointPurchaseCallEvent.create({
          data: { callId: call.id, at: now, kind: "OPENED", actorUserId: actor.userId, detail: OPENED_DETAIL },
        });
        await this.audit(tx, actor, call.id, call.campaignId, `Convocatoria de compra conjunta «${call.name}» abierta.`, {
          deadlineAt: call.deadlineAt.toISOString(),
          productCount: call.products.length,
          responsibleUserRef: call.responsibleUserId,
        });
      }, CALL_TRANSACTION_OPTIONS);
    } catch (error) {
      // A concurrent opening that slipped past the lock still meets the index.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CallHttpError(409, "PRODUCT_IN_OPEN_CALL");
      }
      throw error;
    }
    this.logger.log(`[JOINT PURCHASE CALL OPENED] tenant=${actor.tenantId} actor=${actor.userId} call=${id}`);
    return this.detail(actor, id);
  }

  /** DRAFT|OPEN → CANCELLED with a reason; releases the products. Idempotent from CANCELLED. */
  async cancel(actor: InstitutionalActor, id: string, command: CancelCommand): Promise<CallDetailViewV2> {
    requireConfirmed(command.confirmed);
    const reason = typeof command.reason === "string" ? command.reason.trim() : "";
    if (!reason || reason.length > REASON_MAX) throw new CallHttpError(422, "REASON_REQUIRED");
    await this.prisma.$transaction(async (tx) => {
      const call = await this.lockAndRead(tx, actor.tenantId, id);
      await requireManage(tx, call, actor);
      if (call.status === "CANCELLED") return;
      if (call.status !== "DRAFT" && call.status !== "OPEN") {
        throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
      }
      const now = this.clock.now();
      await tx.jointPurchaseCallProduct.updateMany({ where: { callId: call.id }, data: { openCampaignId: null } });
      await tx.jointPurchaseCall.update({
        where: { id: call.id },
        data: { status: "CANCELLED", cancelledAt: now, cancelledByUserId: actor.userId, cancelReason: reason },
      });
      await tx.jointPurchaseCallEvent.create({
        data: { callId: call.id, at: now, kind: "CANCELLED", actorUserId: actor.userId, detail: reason },
      });
      await this.audit(tx, actor, call.id, call.campaignId, `Convocatoria de compra conjunta «${call.name}» cancelada.`, {
        from: call.status,
        reason,
      });
    }, CALL_TRANSACTION_OPTIONS);
    return this.detail(actor, id);
  }

  /** OPEN → CLOSED (manual); idempotent from CLOSED. Returns the closing as this user may see it. */
  async close(actor: InstitutionalActor, id: string, command: ConfirmCommand): Promise<ClosingViewV2> {
    requireConfirmed(command.confirmed);
    if (!SERVER_ID.test(id)) throw NOT_FOUND();
    // §10.2: checked under the call's lock, in the closing's own transaction.
    await this.closing.closeManually(actor.tenantId, id, actor.userId, (tx, call) =>
      requireManage(tx, call, actor),
    );
    return this.closingView(actor, id);
  }

  // ---------------------------------------------------------- collaborators

  /** §10.2: current MANAGE collaborators and the history of grants (E4: PARTICIPANTS only as history); any DIRECTIVA/ADMINISTRADOR of the tenant. */
  async collaborators(actor: InstitutionalActor, id: string): Promise<CollaboratorsViewV2> {
    return this.renderCollaborators(this.prisma, actor, id);
  }

  /**
   * §10.2: only the responsible grants, to another active DIRECTIVA or
   * ADMINISTRADOR of the tenant (never to themselves), in DRAFT, OPEN or
   * CLOSED. Granting what is already granted answers 200 without a new event.
   * Each grant writes the access row, an access event, a history event and an
   * AuditLog entry, in one transaction under the call's lock; none of them
   * carries a farmer's name or quantity.
   *
   * E4 §3.1: only MANAGE. `PARTICIPANTS` is 409 GRANT_RETIRED for anyone,
   * without a row, an event or an AuditLog entry.
   */
  async grant(actor: InstitutionalActor, id: string, command: GrantCommand): Promise<CollaboratorsViewV2> {
    await this.prisma.$transaction(async (tx) => {
      const call = await this.lockAndRead(tx, actor.tenantId, id);
      requireNotRetired(command);
      if (call.responsibleUserId !== actor.userId) throw new CallHttpError(403, "COLLABORATORS_FORBIDDEN");
      const { userRef, grant } = parseGrant(command);
      requireConfirmed(command.confirmed);
      if (call.status === "CANCELLED") throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
      if (userRef === actor.userId || userRef === call.responsibleUserId) throw new CallHttpError(422, "COLLABORATOR_NOT_ELIGIBLE");
      const grantee = await tx.member.findFirst({
        where: { ...eligibleMemberWhere(actor.tenantId), userId: userRef },
        select: { user: { select: { id: true, name: true } } },
      });
      if (!grantee) throw new CallHttpError(422, "COLLABORATOR_NOT_ELIGIBLE");
      const existing = await tx.jointPurchaseCallAccess.findUnique({
        where: { callId_userId_grant: { callId: call.id, userId: userRef, grant } },
        select: { userId: true, grant: true, grantedByUserId: true, responsibleVersion: true },
      });
      // P-A §12: granting a delegation that waits for review is confirming it (its own event).
      if (existing && rowPendingReview(call, existing)) {
        await this.confirmDelegation(tx, actor, call, userRef, grant, grantee.user.name);
        return;
      }
      if (existing) return;
      const now = this.clock.now();
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
      await this.audit(tx, actor, call.id, call.campaignId, `Permiso «${GRANT_LABEL[grant]}» concedido en la convocatoria «${call.name}».`, {
        grant,
        collaboratorUserRef: userRef,
      });
    }, CALL_TRANSACTION_OPTIONS);
    return this.collaborators(actor, id);
  }

  /**
   * §10.2: the responsible revokes a collaborator's grant, or a collaborator
   * renounces their own, in any state. Revoking what does not exist answers
   * 200 without a new event. The responsible's own permissions are not
   * collaborator grants (422 COLLABORATOR_NOT_ELIGIBLE). The permission is
   * read at every request, so the revocation applies from the next one.
   *
   * E4 §3.1: `PARTICIPANTS` is 409 GRANT_RETIRED (the stored row stays as
   * history; the database refuses to delete it).
   */
  async revoke(actor: InstitutionalActor, id: string, command: GrantCommand): Promise<CollaboratorsViewV2> {
    await this.prisma.$transaction(async (tx) => {
      const call = await this.lockAndRead(tx, actor.tenantId, id);
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
      const now = this.clock.now();
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
      await this.audit(
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
    return this.collaborators(actor, id);
  }

  /**
   * P-A §12: after a substitution, the successor reviews each delegation
   * granted under an earlier responsible version: CONFIRM grants it again
   * under the current version (a new row, its own CONFIRMED event); RETIRE
   * removes it (REVOKED). Only the current, eligible responsible reviews.
   * Confirming never goes beyond each farmer's consent: what a collaborator
   * sees is still decided by the scope and the authorization of each
   * participation. A cancelled call only admits RETIRE.
   *
   * E4 §3.1: only MANAGE; `PARTICIPANTS` is 409 GRANT_RETIRED.
   */
  async reviewDelegation(
    actor: InstitutionalActor,
    id: string,
    command: { user_ref?: unknown; grant?: unknown; decision?: unknown },
  ): Promise<CollaboratorsViewV2> {
    await this.prisma.$transaction(async (tx) => {
      const call = await this.lockAndRead(tx, actor.tenantId, id);
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
        await this.confirmDelegation(tx, actor, call, userRef, grant, row.user.name);
        return;
      }
      const now = this.clock.now();
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
      await this.audit(tx, actor, call.id, call.campaignId, `Delegación retirada en la revisión de la convocatoria «${call.name}».`, {
        grant,
        collaboratorUserRef: userRef,
        decision: "RETIRE",
        responsibleVersion: call.responsibleVersion,
      });
    }, CALL_TRANSACTION_OPTIONS);
    return this.collaborators(actor, id);
  }

  /** P-A §12: the pending row is replaced by one granted by the current responsible under the current version. */
  private async confirmDelegation(
    tx: Tx,
    actor: InstitutionalActor,
    call: { id: string; campaignId: string; name: string; responsibleVersion: number },
    userRef: string,
    grant: CallGrant,
    userName: string,
  ): Promise<void> {
    const now = this.clock.now();
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
    await this.audit(tx, actor, call.id, call.campaignId, `Delegación confirmada en la revisión de la convocatoria «${call.name}».`, {
      grant,
      collaboratorUserRef: userRef,
      decision: "CONFIRM",
      responsibleVersion: call.responsibleVersion,
    });
  }

  // ---------------------------------------------------------------- helpers

  private async findCall(db: Tx | PrismaService, tenantId: string, id: string) {
    if (!SERVER_ID.test(id)) throw NOT_FOUND();
    const call = await db.jointPurchaseCall.findFirst({
      where: { id, tenantId },
      select: { id: true, tenantId: true, campaignId: true, status: true, name: true, responsibleUserId: true, responsibleVersion: true },
    });
    if (!call) throw NOT_FOUND();
    return call;
  }

  private async lockAndRead(tx: Tx, tenantId: string, id: string) {
    if (!SERVER_ID.test(id)) throw NOT_FOUND();
    if (!(await lockCallRow(tx, tenantId, id))) throw NOT_FOUND();
    return tx.jointPurchaseCall.findUniqueOrThrow({
      where: { id },
      include: { products: { orderBy: { position: "asc" } } },
    });
  }

  private async requireCampaign(tx: Tx, tenantId: string, campaignId: string, allowed: ReadonlySet<string> = DRAFT_CAMPAIGN) {
    const campaign = await tx.agriculturalCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, status: true },
    });
    if (!campaign) throw new CallHttpError(404, "CAMPAIGN_NOT_FOUND");
    if (!allowed.has(campaign.status)) throw new CallHttpError(422, "CAMPAIGN_NOT_ELIGIBLE");
    return campaign;
  }

  /** E2-D5: an active DIRECTIVA/ADMINISTRADOR of this tenant; anyone else is not eligible. */
  private async requireResponsible(tx: Tx, tenantId: string, userId: string) {
    const member = await tx.member.findFirst({
      where: { ...eligibleMemberWhere(tenantId), userId },
      select: { user: { select: { id: true, name: true } } },
    });
    if (!member) throw new CallHttpError(422, "RESPONSIBLE_NOT_ELIGIBLE");
    return member.user;
  }

  private async requireProposal(tx: Tx, tenantId: string, campaignId: string, proposalId: string | null) {
    if (proposalId === null) return null;
    if (!SERVER_ID.test(proposalId)) throw new CallHttpError(404, "PROPOSAL_NOT_FOUND");
    const proposal = await tx.jointPurchaseProposal.findFirst({
      where: { id: proposalId, tenantId },
      select: { id: true, campaignId: true },
    });
    if (!proposal) throw new CallHttpError(404, "PROPOSAL_NOT_FOUND");
    if (proposal.campaignId !== campaignId) throw new CallHttpError(422, "PROPOSAL_CAMPAIGN_MISMATCH");
    return proposal.id;
  }

  /**
   * Products of the tenant: active, unit L or KG, canonical (not a current
   * denomination associated to another product, F07 §2). Returns productId →
   * base unit. Another tenant's product is indistinguishable from a missing one.
   */
  private async checkProducts(tx: Tx, tenantId: string, productIds: string[]): Promise<Map<string, SyncV1BaseUnit>> {
    const rows = await tx.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true, unit: true, isActive: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const aliases = await tx.productCanonicalAssociation.findMany({
      where: { tenantId, productId: { in: productIds }, validTo: null },
      select: { productId: true, canonicalProductId: true },
    });
    const aliased = new Set(aliases.filter((a) => a.canonicalProductId !== a.productId).map((a) => a.productId));
    const result = new Map<string, SyncV1BaseUnit>();
    for (const productId of productIds) {
      const product = byId.get(productId);
      if (!product) throw new CallHttpError(404, "PRODUCT_NOT_FOUND");
      if (!product.isActive) throw new CallHttpError(422, "PRODUCT_INACTIVE");
      const baseUnit = baseUnitForCentralUnit(product.unit);
      if (!baseUnit) throw new CallHttpError(422, "PRODUCT_UNIT_UNSUPPORTED");
      if (aliased.has(productId)) throw new CallHttpError(422, "PRODUCT_NOT_CANONICAL");
      result.set(productId, baseUnit);
    }
    return result;
  }

  private async resolveProducts(
    tx: Tx,
    tenantId: string,
    requested: { product_ref: string }[],
    proposalId: string | null,
  ): Promise<ResolvedProduct[]> {
    if (!Array.isArray(requested) || requested.length === 0 || requested.length > MAX_PRODUCTS) throw INVALID();
    const ids = requested.map((item) => {
      if (typeof item?.product_ref !== "string" || item.product_ref.length < 1 || item.product_ref.length > 64) {
        throw INVALID();
      }
      return item.product_ref;
    });
    if (new Set(ids).size !== ids.length) throw new CallHttpError(422, "PRODUCT_DUPLICATED");
    const checked = await this.checkProducts(tx, tenantId, ids);
    const lines = proposalId
      ? await tx.jointPurchaseProposalLine.findMany({
          where: { proposalId, canonicalProductId: { in: ids } },
          select: { position: true, canonicalProductId: true, baseUnit: true },
        })
      : [];
    return ids.map((productId) => {
      const baseUnit = checked.get(productId)!;
      const line = lines.find((l) => l.canonicalProductId === productId && l.baseUnit === baseUnit);
      return {
        productId,
        baseUnit,
        sourceProposalId: line ? proposalId : null,
        sourcePosition: line ? line.position : null,
      };
    });
  }

  /**
   * E3-P2: provenance of a call being created. From a draft: its fingerprint
   * and the revision of its saved selection now (read under the E3 lock), and
   * whether the call's products are exactly that selection (any order).
   * Without a draft: CATALOG, with no reference at all.
   */
  private async originOf(tx: Tx, proposalId: string | null, products: ResolvedProduct[]) {
    if (proposalId === null) {
      return {
        kind: "CATALOG" as const,
        proposalId: null,
        proposalFingerprint: null,
        selectionRevision: null,
        selectionMatched: null,
      };
    }
    await lockProposalSelection(tx, proposalId);
    const proposal = await tx.jointPurchaseProposal.findUniqueOrThrow({
      where: { id: proposalId },
      select: { inputsFingerprint: true, selection: { select: { revision: true, productRefs: true } } },
    });
    const selected = proposal.selection && Array.isArray(proposal.selection.productRefs) ? (proposal.selection.productRefs as string[]) : null;
    return {
      kind: "PROPOSAL" as const,
      proposalId,
      proposalFingerprint: proposal.inputsFingerprint,
      selectionRevision: proposal.selection?.revision ?? null,
      selectionMatched: proposal.selection ? sameProducts(selected ?? [], products.map((p) => p.productId)) : null,
    };
  }

  private async renderDetail(db: Tx | PrismaService, actor: InstitutionalActor, id: string): Promise<CallDetailViewV2> {
    if (!SERVER_ID.test(id)) throw NOT_FOUND();
    const call = await db.jointPurchaseCall.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        campaign: { select: { id: true, name: true, status: true } },
        responsible: { select: { id: true, name: true, members: { where: { tenantId: actor.tenantId }, select: { role: true } } } },
        createdBy: { select: { id: true, name: true } },
        openedBy: { select: { id: true, name: true } },
        cancelledBy: { select: { id: true, name: true } },
        products: {
          orderBy: { position: "asc" },
          include: {
            product: { select: { name: true, isActive: true } },
            sourceLine: {
              select: {
                proposalId: true,
                position: true,
                status: true,
                release: { select: { totalBase: true, contributorCount: true, releasedAt: true, withdrawnAt: true } },
              },
            },
          },
        },
        events: {
          orderBy: [{ at: "asc" }, { id: "asc" }],
          include: { actor: { select: { id: true, name: true } } },
        },
        closing: { include: { lines: true } },
        responsibleChanges: {
          orderBy: { version: "asc" },
          include: {
            previous: { select: { id: true, name: true } },
            next: { select: { id: true, name: true } },
            actor: { select: { id: true, name: true } },
          },
        },
        origin: {
          include: {
            recordedBy: { select: { id: true, name: true } },
            products: { orderBy: { position: "asc" }, include: { product: { select: { name: true } } } },
            proposal: {
              select: {
                generatedAt: true,
                lines: { where: { status: "DISCLOSED" }, select: { release: { select: { withdrawnAt: true } } } },
              },
            },
          },
        },
      },
    });
    if (!call) throw NOT_FOUND();
    const access = await accessOf(db, call, actor.userId);
    const totals = await this.totalsOf(db, call, call.closing);
    const disclosureAuthorized = this.collective.mode === "PROVISIONAL_SYNTHETIC";
    const responsibleEligible = await responsibleIsEligible(db, actor.tenantId, call.responsibleUserId);
    const delegations = await db.jointPurchaseCallAccess.findMany({
      where: { callId: call.id, grant: ACCESS_MANAGE, grantedByUserId: { not: null } },
      select: { userId: true, grant: true, grantedByUserId: true, responsibleVersion: true },
    });
    const collaborators = new Set(delegations.filter((row) => rowInForce(call, row, true)).map((row) => row.userId));
    const pendingReviews = delegations.filter((row) => rowPendingReview(call, row)).length;
    const canManage = access.grants.has(ACCESS_MANAGE);
    return {
      contractVersion: 2,
      call_id: call.id,
      name: call.name,
      status: call.status,
      campaign: { campaign_ref: call.campaign.id, name: call.campaign.name, status: call.campaign.status },
      deadline_at: call.deadlineAt.toISOString(),
      opened_at: iso(call.openedAt),
      closed_at: iso(call.closedAt),
      cancelled_at: iso(call.cancelledAt),
      cancel_reason: call.cancelReason,
      created_at: call.createdAt.toISOString(),
      updated_at: call.updatedAt.toISOString(),
      server_time: this.clock.now().toISOString(),
      responsible: {
        user_ref: call.responsible.id,
        name: call.responsible.name,
        role: call.responsible.members[0]?.role ?? null,
        eligible: responsibleEligible,
        version: call.responsibleVersion,
      },
      created_by: { user_ref: call.createdBy.id, name: call.createdBy.name },
      opened_by: call.openedBy ? { user_ref: call.openedBy.id, name: call.openedBy.name } : null,
      cancelled_by: call.cancelledBy ? { user_ref: call.cancelledBy.id, name: call.cancelledBy.name } : null,
      source_proposal_ref: call.sourceProposalId,
      participant_count: totals.participantCount,
      totals_source: totals.source,
      // E4 §2: by role (an eligible ADMINISTRADOR now), never by a permission row.
      can_view_participants: access.canViewParticipants,
      is_responsible: access.isResponsible,
      can_manage: canManage,
      // N2 rechazada (2026-11-12): nadie obtiene cancelar o cerrar por su rol cuando la responsable deja de estar habilitada.
      can_cancel_or_close: canManage,
      // m6: mientras la responsable no esté habilitada, los permisos que concedió quedan suspendidos (no borrados).
      delegations_suspended: !responsibleEligible,
      my_grants: canManage ? [ACCESS_MANAGE] : [],
      collaborator_count: collaborators.size,
      // E4 §3.1 / §6.3: an eligible ADMINISTRADOR, without any permission, when the responsible is no longer eligible.
      can_substitute_responsible: access.canViewParticipants && !responsibleEligible && call.status !== "CANCELLED",
      pending_delegation_reviews: pendingReviews,
      pending_consent_count: access.visibility.pendingConsentCount(totals.all),
      responsible_changes: call.responsibleChanges.map((change) => ({
        version: change.version,
        at: change.at.toISOString(),
        previous: { user_ref: change.previous.id, name: change.previous.name },
        next: { user_ref: change.next.id, name: change.next.name },
        actor: { user_ref: change.actor.id, name: change.actor.name },
        reason: change.reason,
        call_status: change.callStatus,
        suspended_delegations: change.suspendedDelegations,
      })),
      products: call.products.map((product) => ({
        position: product.position,
        product_ref: product.productId,
        name: product.product.name,
        unit: presentationUnit(product.baseUnit),
        base_unit: product.baseUnit,
        is_active: product.product.isActive,
        reference: referenceOf(product.sourceLine, disclosureAuthorized),
        totals: productTotalOf(access.visibility, totals, product.productId),
      })),
      origin: originView(call.origin, disclosureAuthorized),
      origin_differs_from_current:
        call.origin !== null &&
        !sameProducts(
          call.origin.products.map((p) => p.productId),
          call.products.map((p) => p.productId),
        ),
      history: sortHistory(
        call.events.map((event) => ({
          at: event.at.toISOString(),
          kind: event.kind,
          actor: event.actor ? { user_ref: event.actor.id, name: event.actor.name } : null,
          detail: event.detail,
        })),
      ),
    };
  }

  /**
   * Totals of each product and the participations behind them, with their
   * consent (§10.3): live from the ACTIVE participations, or from the closing
   * snapshot, whose consent is that of the participation it froze
   * (`participationId`; after the closing no operation is accepted, so it is
   * the consent of the frozen lines).
   */
  private async totalsOf(
    db: Tx | PrismaService,
    call: { id: string; status: JointPurchaseCallStatus },
    closing: { participantCount: number; lines: { productId: string; totalQuantityBase: bigint; participantCount: number }[] } | null,
  ): Promise<CallTotals> {
    const callId = call.id;
    const status = call.status;
    if (closing) {
      const frozen = await frozenParticipations(db, callId);
      return {
        source: "CLOSING",
        participantCount: closing.participantCount,
        all: frozen,
        byProduct: new Map(
          closing.lines.map((l) => [
            l.productId,
            { total: l.totalQuantityBase, count: l.participantCount, participations: frozen.filter((p) => p.productIds.includes(l.productId)) },
          ]),
        ),
      };
    }
    if (status === "DRAFT") return { source: "NONE", participantCount: 0, all: [], byProduct: new Map() };
    const active = await db.jointPurchaseParticipation.findMany({
      where: { callId, status: "ACTIVE" },
      select: { consentScope: true, lines: { select: { productId: true, quantityBase: true } } },
    });
    const byProduct = new Map<string, ProductTotals>();
    const all: ParticipationForVisibility[] = [];
    for (const participation of active) {
      const forVisibility = {
        consentScope: participation.consentScope,
        productIds: participation.lines.map((l) => l.productId),
      };
      all.push(forVisibility);
      for (const line of participation.lines) {
        const entry = byProduct.get(line.productId) ?? { total: 0n, count: 0, participations: [] };
        entry.total += line.quantityBase;
        entry.count += 1;
        entry.participations.push(forVisibility);
        byProduct.set(line.productId, entry);
      }
    }
    return { source: "LIVE", participantCount: active.length, all, byProduct };
  }

  private async renderClosing(db: Tx | PrismaService, actor: InstitutionalActor, id: string): Promise<ClosingViewV2> {
    const call = await this.findCall(db, actor.tenantId, id);
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

  private async renderCollaborators(db: Tx | PrismaService, actor: InstitutionalActor, id: string): Promise<CollaboratorsViewV2> {
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
      // E4: stored view permissions are history (retired_grants); the responsible's own earlier delegations are not collaborators.
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
        // m6 and P-A §12: in force, suspended with an ineligible responsible, or waiting for the successor's review.
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
      // P-A §12: only the current, eligible responsible reviews the MANAGE delegations of earlier versions.
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

  /** Institutional record: never a farmer's name or quantity. */
  private async audit(
    tx: Tx,
    actor: InstitutionalActor,
    callId: string,
    campaignId: string,
    summary: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        campaignId,
        actorUserId: actor.userId,
        ownerUserId: null,
        action: "OTRO",
        entityName: ENTITY_NAME,
        entityId: callId,
        summary,
        metadata,
      },
    });
  }
}

interface ProductTotals {
  total: bigint;
  count: number;
  participations: ParticipationForVisibility[];
}

interface CallTotals {
  source: "NONE" | "LIVE" | "CLOSING";
  participantCount: number;
  /** Every participation counted (live: ACTIVE; closing: frozen), for the counts of §12. */
  all: ParticipationForVisibility[];
  byProduct: Map<string, ProductTotals>;
}

/** Rule T (E4 §5.2) through the one shared decision. A draft has no participation: 0 persons and a total of 0 (nothing is withheld). */
function productTotalOf(visibility: CallVisibility, totals: CallTotals, productId: string) {
  const entry = totals.byProduct.get(productId) ?? { total: 0n, count: 0, participations: [] };
  return visibility.productTotal(entry.total, entry.count, entry.participations, totals.source === "CLOSING" ? "CLOSING" : "LIVE");
}

/** The frozen participations of a closing, with the consent in force of the participation each froze (read now). */
async function frozenParticipations(db: Tx | PrismaService, callId: string) {
  const rows = await db.jointPurchaseCallClosingParticipant.findMany({
    where: { callId },
    orderBy: [{ acceptedAt: "asc" }, { participationId: "asc" }],
    include: { lines: { orderBy: { productId: "asc" } } },
  });
  const consents = await db.jointPurchaseParticipation.findMany({
    where: { id: { in: rows.map((row) => row.participationId) } },
    select: { id: true, consentScope: true },
  });
  const consentOf = new Map(consents.map((c) => [c.id, c.consentScope as string]));
  return rows.map((row) => ({
    participationId: row.participationId,
    memberId: row.memberId,
    acceptedAt: row.acceptedAt,
    // A frozen participation always has its row (FK chain); a missing one covers nothing.
    consentScope: consentOf.get(row.participationId) ?? "",
    productIds: row.lines.map((line) => line.productId),
    lines: row.lines,
  }));
}

export function parseGrant(command: GrantCommand): { userRef: string; grant: CallGrant } {
  const userRef = command.user_ref;
  const grant = command.grant;
  if (typeof userRef !== "string" || userRef.length < 1 || userRef.length > 64) throw INVALID();
  if (typeof grant !== "string" || !(CALL_GRANTS as readonly string[]).includes(grant)) throw INVALID();
  return { userRef, grant: grant as CallGrant };
}

/** E4 §3.1: the view permission is retired from every active flow (grant, revoke, review). */
function requireNotRetired(command: { grant?: unknown }) {
  if (command.grant === ACCESS_PARTICIPANTS) throw new CallHttpError(409, "GRANT_RETIRED");
}

export function requireConfirmed(confirmed: unknown) {
  if (confirmed !== true) throw new CallHttpError(422, "CONFIRMATION_REQUIRED");
}

function normalizeName(raw: unknown): string {
  if (typeof raw !== "string") throw INVALID();
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX) throw INVALID();
  return name;
}

function parseDeadline(raw: unknown): Date {
  if (typeof raw !== "string") throw INVALID();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw INVALID();
  return date;
}

export function truncate(text: string): string {
  return text.length <= REASON_MAX ? text : `${text.slice(0, REASON_MAX - 1)}…`;
}

const KIND_ORDER = [
  "CREATED",
  "RESPONSIBLE_ASSIGNED",
  "UPDATED",
  "ACCESS_GRANTED",
  "ACCESS_REVOKED",
  "OPENED",
  "RESPONSIBLE_REPLACED",
  "ACCESS_CONFIRMED",
  "CLOSED",
  "CANCELLED",
];

function sortHistory(entries: HistoryEntryView[]): HistoryEntryView[] {
  return [...entries].sort((a, b) =>
    a.at === b.at ? KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) : a.at < b.at ? -1 : 1,
  );
}

/**
 * E2-D14: the reference of a product taken from a draft proposal is the
 * figure already disclosed in its line, served only while its release is not
 * withdrawn and the disclosure mode authorizes figures; otherwise «sin cifra».
 * It is never a committed quantity and never added to participations.
 */
/** Same products, in any order (product refs are unique within a call). */
function sameProducts(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((ref) => set.has(ref));
}

function originView(
  origin: {
    kind: CallOriginView["kind"];
    proposalId: string | null;
    proposalFingerprint: string | null;
    selectionRevision: number | null;
    selectionMatched: boolean | null;
    recordedAt: Date;
    recordedBy: { id: string; name: string };
    products: {
      position: number;
      productId: string;
      baseUnit: SyncV1BaseUnit;
      proposalPosition: number | null;
      product: { name: string };
    }[];
    proposal: { generatedAt: Date; lines: { release: { withdrawnAt: Date | null } | null }[] } | null;
  } | null,
  disclosureAuthorized: boolean,
): CallOriginView | null {
  if (!origin) return null;
  // The fingerprint follows the figures of the draft (E2-D14, F07-POL-01 R8).
  const fingerprintServed =
    disclosureAuthorized && (origin.proposal?.lines ?? []).every((line) => line.release !== null && line.release.withdrawnAt === null);
  return {
    kind: origin.kind,
    proposal_ref: origin.proposalId,
    proposal_generated_at: origin.proposal ? origin.proposal.generatedAt.toISOString() : null,
    proposal_fingerprint: fingerprintServed ? origin.proposalFingerprint : null,
    selection_revision: origin.selectionRevision,
    selection_matched: origin.selectionMatched,
    recorded_at: origin.recordedAt.toISOString(),
    recorded_by: { user_ref: origin.recordedBy.id, name: origin.recordedBy.name },
    products: origin.products.map((product) => ({
      position: product.position,
      product_ref: product.productId,
      product_name: product.product.name,
      base_unit: product.baseUnit,
      proposal_position: product.proposalPosition,
    })),
  };
}

function referenceOf(
  line: {
    proposalId: string;
    position: number;
    status: string;
    release: { totalBase: bigint; contributorCount: number; releasedAt: Date; withdrawnAt: Date | null } | null;
  } | null,
  disclosureAuthorized: boolean,
): ProposalReferenceView | null {
  if (!line) return null;
  const release = line.release;
  if (disclosureAuthorized && line.status === "DISCLOSED" && release && release.withdrawnAt === null) {
    return {
      proposal_ref: line.proposalId,
      position: line.position,
      status: "DISCLOSED",
      label: REFERENCE_DISCLOSED_LABEL,
      quantity_base: release.totalBase.toString(),
      contributors: release.contributorCount,
      released_at: release.releasedAt.toISOString(),
    };
  }
  return {
    proposal_ref: line.proposalId,
    position: line.position,
    status: "NO_FIGURE",
    label: REFERENCE_NO_FIGURE_LABEL,
    quantity_base: null,
    contributors: null,
    released_at: null,
  };
}
