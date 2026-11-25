import { Prisma, SyncV1BaseUnit } from "@prisma/client";
import { baseUnitForCentralUnit } from "@/modules/sync-v1/domain/units";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError, InstitutionalActor } from "../../domain/call-error";
import { SERVER_ID } from "../../domain/participation-input";
import { eligibleMemberWhere } from "../call-access";
import { ENTITY_NAME, lockCallRow, lockProposalSelection, Tx } from "../call-store";
import {
  DRAFT_CAMPAIGN,
  INVALID,
  MAX_PRODUCTS,
  NOT_FOUND,
  ResolvedProduct,
  sameProducts,
} from "./institutional-calls.types";

export async function findCall(db: Tx | PrismaService, tenantId: string, id: string) {
  if (!SERVER_ID.test(id)) throw NOT_FOUND();
  const call = await db.jointPurchaseCall.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      tenantId: true,
      campaignId: true,
      status: true,
      name: true,
      responsibleUserId: true,
      responsibleVersion: true,
    },
  });
  if (!call) throw NOT_FOUND();
  return call;
}

export async function lockAndRead(tx: Tx, tenantId: string, id: string) {
  if (!SERVER_ID.test(id)) throw NOT_FOUND();
  if (!(await lockCallRow(tx, tenantId, id))) throw NOT_FOUND();
  return tx.jointPurchaseCall.findUniqueOrThrow({
    where: { id },
    include: { products: { orderBy: { position: "asc" } } },
  });
}

export async function requireCampaign(
  tx: Tx,
  tenantId: string,
  campaignId: string,
  allowed: ReadonlySet<string> = DRAFT_CAMPAIGN,
) {
  const campaign = await tx.agriculturalCampaign.findFirst({
    where: { id: campaignId, tenantId },
    select: { id: true, status: true },
  });
  if (!campaign) throw new CallHttpError(404, "CAMPAIGN_NOT_FOUND");
  if (!allowed.has(campaign.status)) throw new CallHttpError(422, "CAMPAIGN_NOT_ELIGIBLE");
  return campaign;
}

/** E2-D5: an active DIRECTIVA/ADMINISTRADOR of this tenant; anyone else is not eligible. */
export async function requireResponsible(tx: Tx, tenantId: string, userId: string) {
  const member = await tx.member.findFirst({
    where: { ...eligibleMemberWhere(tenantId), userId },
    select: { user: { select: { id: true, name: true } } },
  });
  if (!member) throw new CallHttpError(422, "RESPONSIBLE_NOT_ELIGIBLE");
  return member.user;
}

export async function requireProposal(
  tx: Tx,
  tenantId: string,
  campaignId: string,
  proposalId: string | null,
) {
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

/** Products of the tenant: active, unit L or KG, canonical. Returns productId -> base unit. */
export async function checkProducts(
  tx: Tx,
  tenantId: string,
  productIds: string[],
): Promise<Map<string, SyncV1BaseUnit>> {
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

export async function resolveProducts(
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
  const checked = await checkProducts(tx, tenantId, ids);
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

/** E3-P2: provenance of a call being created. */
export async function originOf(tx: Tx, proposalId: string | null, products: ResolvedProduct[]) {
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
  const selected =
    proposal.selection && Array.isArray(proposal.selection.productRefs)
      ? (proposal.selection.productRefs as string[])
      : null;
  return {
    kind: "PROPOSAL" as const,
    proposalId,
    proposalFingerprint: proposal.inputsFingerprint,
    selectionRevision: proposal.selection?.revision ?? null,
    selectionMatched: proposal.selection
      ? sameProducts(selected ?? [], products.map((p) => p.productId))
      : null,
  };
}

/** Frozen participations of a closing, with the consent in force read now. */
export async function frozenParticipations(db: Tx | PrismaService, callId: string) {
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
    consentScope: consentOf.get(row.participationId) ?? "",
    productIds: row.lines.map((line) => line.productId),
    lines: row.lines,
  }));
}

/** Institutional record: never a farmer's name or quantity. */
export async function auditCall(
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
