import { Prisma } from "@prisma/client";
import { CallHttpError, InstitutionalActor } from "../../domain/call-error";
import { isEditable } from "../../domain/call-state";
import { SERVER_ID } from "../../domain/participation-input";
import { requireManage } from "../call-access";
import { CALL_TRANSACTION_OPTIONS, lockTenantCalls } from "../call-store";
import { CallDetailViewV2, ClosingViewV2 } from "../call-views";
import { renderDetailView } from "./institutional-calls.detail-view";
import {
  auditCall,
  checkProducts,
  lockAndRead,
  originOf,
  requireCampaign,
  requireProposal,
  requireResponsible,
  resolveProducts,
} from "./institutional-calls.queries";
import {
  CancelCommand,
  ConfirmCommand,
  DraftCommand,
  InstitutionalCallDeps,
  INVALID,
  normalizeName,
  NOT_FOUND,
  OPEN_CAMPAIGN,
  OPENED_DETAIL,
  parseDeadline,
  PatchCommand,
  REASON_MAX,
  requireConfirmed,
  truncate,
} from "./institutional-calls.types";
import { renderClosingView } from "./institutional-calls.views";

export async function createCall(
  deps: InstitutionalCallDeps,
  actor: InstitutionalActor,
  command: DraftCommand,
): Promise<CallDetailViewV2> {
  const name = normalizeName(command.name);
  const deadlineAt = parseDeadline(command.deadline_at);
  const id = await deps.prisma.$transaction(async (tx) => {
    const now = deps.clock.now();
    const campaign = await requireCampaign(tx, actor.tenantId, command.campaign_id);
    if (deadlineAt.getTime() <= now.getTime()) throw new CallHttpError(422, "DEADLINE_IN_PAST");
    const responsible = await requireResponsible(tx, actor.tenantId, command.responsible_user_id ?? actor.userId);
    const proposalId = await requireProposal(tx, actor.tenantId, campaign.id, command.source_proposal_id ?? null);
    const products = await resolveProducts(tx, actor.tenantId, command.products, proposalId);
    const origin = await originOf(tx, proposalId, products);
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
    if (command.responsible_user_id !== undefined) {
      await tx.jointPurchaseCallEvent.create({
        data: {
          callId: call.id,
          at: new Date(now.getTime() + 1),
          kind: "RESPONSIBLE_ASSIGNED",
          actorUserId: actor.userId,
          detail: truncate(`Responsable asignado: ${responsible.name}.`),
        },
      });
    }
    await auditCall(tx, actor, call.id, campaign.id, `Borrador de convocatoria de compra conjunta «${name}» creado.`, {
      productCount: products.length,
      responsibleUserRef: responsible.id,
      origin: origin.kind,
    });
    return call.id;
  }, CALL_TRANSACTION_OPTIONS);
  deps.logger.log(`[JOINT PURCHASE CALL CREATED] tenant=${actor.tenantId} actor=${actor.userId} call=${id}`);
  return renderDetailView(deps.prisma, deps.collective, deps.clock, actor, id);
}

/** Only DRAFT: name, deadline, responsible, products (and their source draft). */
export async function patchCall(
  deps: InstitutionalCallDeps,
  actor: InstitutionalActor,
  id: string,
  command: PatchCommand,
): Promise<CallDetailViewV2> {
  const name = command.name !== undefined ? normalizeName(command.name) : undefined;
  const deadlineAt = command.deadline_at !== undefined ? parseDeadline(command.deadline_at) : undefined;
  if (command.products !== undefined && (!Array.isArray(command.products) || command.products.length === 0)) {
    throw INVALID();
  }
  await deps.prisma.$transaction(async (tx) => {
    const call = await lockAndRead(tx, actor.tenantId, id);
    await requireManage(tx, call, actor);
    if (!isEditable(call.status)) throw new CallHttpError(409, "CALL_NOT_EDITABLE", { status: call.status });
    await requireCampaign(tx, actor.tenantId, call.campaignId);
    const now = deps.clock.now();
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
      const responsible = await requireResponsible(tx, actor.tenantId, command.responsible_user_id);
      data.responsibleUserId = responsible.id;
      responsibleName = responsible.name;
    }
    const proposalChanged =
      command.source_proposal_id !== undefined && (command.source_proposal_id ?? null) !== call.sourceProposalId;
    if (command.products !== undefined || proposalChanged) {
      const proposalId = proposalChanged
        ? await requireProposal(tx, actor.tenantId, call.campaignId, command.source_proposal_id ?? null)
        : call.sourceProposalId;
      const requested = command.products ?? call.products.map((p) => ({ product_ref: p.productId }));
      const products = await resolveProducts(tx, actor.tenantId, requested, proposalId);
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
    await auditCall(tx, actor, call.id, call.campaignId, `Borrador de convocatoria de compra conjunta «${name ?? call.name}» actualizado.`, {
      changed: [...changed, ...(responsibleName !== null ? ["responsable"] : [])],
    });
  }, CALL_TRANSACTION_OPTIONS);
  return renderDetailView(deps.prisma, deps.collective, deps.clock, actor, id);
}

/** E2-D3/D4/D5/D6: DRAFT -> OPEN. */
export async function openCall(
  deps: InstitutionalCallDeps,
  actor: InstitutionalActor,
  id: string,
  command: ConfirmCommand,
): Promise<CallDetailViewV2> {
  requireConfirmed(command.confirmed);
  try {
    await deps.prisma.$transaction(async (tx) => {
      await lockTenantCalls(tx, actor.tenantId);
      const call = await lockAndRead(tx, actor.tenantId, id);
      await requireManage(tx, call, actor);
      if (call.status !== "DRAFT") throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
      const now = deps.clock.now();
      if (call.deadlineAt.getTime() <= now.getTime()) throw new CallHttpError(422, "DEADLINE_IN_PAST");
      await requireCampaign(tx, actor.tenantId, call.campaignId, OPEN_CAMPAIGN);
      const checked = await checkProducts(tx, actor.tenantId, call.products.map((p) => p.productId));
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
      await auditCall(tx, actor, call.id, call.campaignId, `Convocatoria de compra conjunta «${call.name}» abierta.`, {
        deadlineAt: call.deadlineAt.toISOString(),
        productCount: call.products.length,
        responsibleUserRef: call.responsibleUserId,
      });
    }, CALL_TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CallHttpError(409, "PRODUCT_IN_OPEN_CALL");
    }
    throw error;
  }
  deps.logger.log(`[JOINT PURCHASE CALL OPENED] tenant=${actor.tenantId} actor=${actor.userId} call=${id}`);
  return renderDetailView(deps.prisma, deps.collective, deps.clock, actor, id);
}

/** DRAFT|OPEN -> CANCELLED with a reason; idempotent from CANCELLED. */
export async function cancelCall(
  deps: InstitutionalCallDeps,
  actor: InstitutionalActor,
  id: string,
  command: CancelCommand,
): Promise<CallDetailViewV2> {
  requireConfirmed(command.confirmed);
  const reason = typeof command.reason === "string" ? command.reason.trim() : "";
  if (!reason || reason.length > REASON_MAX) throw new CallHttpError(422, "REASON_REQUIRED");
  await deps.prisma.$transaction(async (tx) => {
    const call = await lockAndRead(tx, actor.tenantId, id);
    await requireManage(tx, call, actor);
    if (call.status === "CANCELLED") return;
    if (call.status !== "DRAFT" && call.status !== "OPEN") {
      throw new CallHttpError(409, "INVALID_TRANSITION", { status: call.status });
    }
    const now = deps.clock.now();
    await tx.jointPurchaseCallProduct.updateMany({ where: { callId: call.id }, data: { openCampaignId: null } });
    await tx.jointPurchaseCall.update({
      where: { id: call.id },
      data: { status: "CANCELLED", cancelledAt: now, cancelledByUserId: actor.userId, cancelReason: reason },
    });
    await tx.jointPurchaseCallEvent.create({
      data: { callId: call.id, at: now, kind: "CANCELLED", actorUserId: actor.userId, detail: reason },
    });
    await auditCall(tx, actor, call.id, call.campaignId, `Convocatoria de compra conjunta «${call.name}» cancelada.`, {
      from: call.status,
      reason,
    });
  }, CALL_TRANSACTION_OPTIONS);
  return renderDetailView(deps.prisma, deps.collective, deps.clock, actor, id);
}

/** OPEN -> CLOSED (manual); idempotent from CLOSED. */
export async function closeCall(
  deps: InstitutionalCallDeps,
  actor: InstitutionalActor,
  id: string,
  command: ConfirmCommand,
): Promise<ClosingViewV2> {
  requireConfirmed(command.confirmed);
  if (!SERVER_ID.test(id)) throw NOT_FOUND();
  await deps.closing.closeManually(actor.tenantId, id, actor.userId, (tx, call) => requireManage(tx, call, actor));
  return renderClosingView(deps.prisma, actor, id);
}
