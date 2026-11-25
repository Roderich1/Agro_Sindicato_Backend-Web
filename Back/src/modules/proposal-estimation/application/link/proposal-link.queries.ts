import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  UnprocessableEntityException,
} from "@nestjs/common";
import { EstimationJobsUseCase } from "@/modules/estimation/application/estimation-jobs.use-case";
import { EstimationReadsUseCase } from "@/modules/estimation/application/estimation-reads.use-case";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { baseUnitForCentralUnit } from "../../../sync-v1/domain/units";
import { derivedJobRequestId } from "../../domain/proposal-link";
import {
  Action,
  EstimableLine,
  invalid,
  LINK_INCLUDE,
  LinkHttpError,
  Mode,
  NotCalculableReason,
  notFound,
  OUTCOME_OF,
  PrepareOutcome,
  ProposalHead,
  StoredLink,
  Tx,
  UUID,
} from "./proposal-link.parsers";

export async function requireProposal(prisma: PrismaService, tenantId: string, proposalId: string): Promise<ProposalHead> {
  if (!UUID.test(proposalId)) throw notFound();
  const proposal = await prisma.jointPurchaseProposal.findFirst({
    where: { id: proposalId, tenantId },
    select: {
      id: true,
      tenantId: true,
      campaignId: true,
      lines: { orderBy: { position: "asc" }, select: { position: true, canonicalProductId: true, baseUnit: true } },
    },
  });
  if (!proposal) throw notFound();
  return proposal;
}

export async function selectionOf(db: Tx | PrismaService, proposalId: string) {
  const row = await db.jointPurchaseProposalSelection.findUnique({ where: { proposalId } });
  return {
    contract_version: 1 as const,
    proposal_ref: proposalId,
    revision: row?.revision ?? 0,
    product_refs: row ? (row.productRefs as string[]) : [],
    updated_at: row?.updatedAt.toISOString() ?? null,
  };
}

export async function findRepeatedOutcome(
  tx: Tx,
  proposalId: string,
  requestId: string,
  requestHash: string,
): Promise<PrepareOutcome | null> {
  const existing = await tx.jointPurchaseProposalEstimationLink.findUnique({
    where: { proposalId_requestId: { proposalId, requestId } },
    select: { requestHash: true, action: true },
  });
  if (!existing) return null;
  if (existing.requestHash !== requestHash) throw new LinkHttpError(HttpStatus.CONFLICT, "REQUEST_ID_REUSED");
  return OUTCOME_OF[existing.action as Action];
}

export function currentLink(db: Tx | PrismaService, proposalId: string): Promise<StoredLink | null> {
  return db.jointPurchaseProposalEstimationLink.findFirst({
    where: { proposalId },
    orderBy: { sequence: "desc" },
    include: LINK_INCLUDE,
  });
}

export async function insertLink(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  proposal: ProposalHead,
  current: StoredLink | null,
  requestId: string,
  requestHash: string,
  mode: Mode,
  action: Exclude<Action, "CLEAR">,
  target: { runId?: string; jobId?: string },
) {
  await tx.jointPurchaseProposalEstimationLink.create({
    data: {
      proposalId: proposal.id,
      tenantId: proposal.tenantId,
      sequence: (current?.sequence ?? 0) + 1,
      requestId,
      requestHash,
      mode,
      action,
      runId: target.runId ?? null,
      jobId: target.jobId ?? null,
      createdByUserId: principal.sub,
      createdByRole: principal.role,
    },
  });
}

/** E3-D4: latest CALCULATED run matching every estimable line without drift. */
export async function findCompatibleRun(
  reads: EstimationReadsUseCase,
  tenantId: string,
  proposal: ProposalHead,
  estimable: EstimableLine[],
): Promise<string | null> {
  const latest = await reads.latestCalculatedRunId(tenantId, proposal.campaignId);
  if (!latest) return null;
  const facts = await reads.resultFacts(tenantId, latest);
  if (!facts || facts.policy_pending) return null;
  for (const line of estimable) {
    const result = facts.results.find((r) => r.product_ref === line.productId && r.base_unit === line.baseUnit);
    if (!result) return null;
    if (result.facts.sourcesChanged || result.facts.classificationCorrected || result.facts.sourcesWithdrawn) return null;
  }
  return latest;
}

/** E3-D5: queues an F12 job via `EstimationJobsUseCase.request` with derived request_id. */
export async function requestEstimationJob(
  jobs: EstimationJobsUseCase,
  principal: AuthenticatedPrincipal,
  proposal: ProposalHead,
  requestId: string,
  estimable: EstimableLine[],
): Promise<{ jobId: string } | { reason: NotCalculableReason }> {
  try {
    const { job } = await jobs.request(principal, {
      requestId: derivedJobRequestId(proposal.id, requestId),
      targetCampaignId: proposal.campaignId,
      productRefs: [...new Set(estimable.map((line) => line.productId))],
    });
    return { jobId: job.job_ref };
  } catch (error) {
    if (error instanceof UnprocessableEntityException) {
      const message = error.message;
      if (message === "TARGET_CAMPAIGN_NOT_ELIGIBLE" || message === "TARGET_CAMPAIGN_NOT_CLASSIFIED") return { reason: message };
      if (message === "PRODUCT_NOT_ESTIMABLE") return { reason: "NO_ESTIMABLE_PRODUCTS" };
    }
    if (error instanceof ConflictException && (error.message === "POLICY_PENDING" || error.message === "REQUEST_ID_REUSED")) {
      throw new LinkHttpError(HttpStatus.CONFLICT, error.message);
    }
    if (error instanceof BadRequestException) throw invalid();
    throw error;
  }
}

/** E3-D3: prepare, clear and the selection of one draft are serialized. */
export async function lockProposal(tx: Tx, proposalId: string): Promise<void> {
  const key = `e3-proposal:${proposalId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Lines F12 can estimate now: active unit mapping cleanly and non-aliased canonical product. */
export async function estimableLines(db: Tx | PrismaService, proposal: ProposalHead): Promise<EstimableLine[]> {
  const ids = [...new Set(proposal.lines.map((line) => line.canonicalProductId))];
  const products = await db.product.findMany({ where: { tenantId: proposal.tenantId, id: { in: ids } }, select: { id: true, unit: true } });
  const denominations = await db.productCanonicalAssociation.findMany({
    where: { tenantId: proposal.tenantId, productId: { in: ids }, validTo: null },
    select: { productId: true, canonicalProductId: true },
  });
  const aliased = new Set(denominations.filter((d) => d.canonicalProductId !== d.productId).map((d) => d.productId));
  const unitOf = new Map(products.map((p) => [p.id, baseUnitForCentralUnit(p.unit)]));
  return proposal.lines
    .filter((line) => unitOf.get(line.canonicalProductId) === line.baseUnit && !aliased.has(line.canonicalProductId))
    .map((line) => ({ position: line.position, productId: line.canonicalProductId, baseUnit: line.baseUnit }));
}

export async function campaignBlocker(db: Tx | PrismaService, proposal: ProposalHead): Promise<NotCalculableReason | null> {
  const campaign = await db.agriculturalCampaign.findFirst({ where: { id: proposal.campaignId, tenantId: proposal.tenantId }, select: { id: true, status: true } });
  if (!campaign || (campaign.status !== "PLANIFICADA" && campaign.status !== "ABIERTA")) return "TARGET_CAMPAIGN_NOT_ELIGIBLE";
  const classified = await db.campaignSeasonClassification.count({
    where: { tenantId: proposal.tenantId, campaignId: campaign.id, nextClassification: { is: null }, seasonId: { not: null } },
  });
  return classified === 0 ? "TARGET_CAMPAIGN_NOT_CLASSIFIED" : null;
}

/** E3-D5: a QUEUED or RUNNING job covering all estimable products explicitly. */
export async function reusableJob(db: Tx | PrismaService, proposal: ProposalHead, estimable: EstimableLine[]): Promise<string | null> {
  const jobs = await db.estimationJob.findMany({
    where: { tenantId: proposal.tenantId, targetCampaignId: proposal.campaignId, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: [{ enqueuedAt: "asc" }, { id: "asc" }],
    select: { id: true, productRefs: true },
  });
  const needed = estimable.map((line) => line.productId);
  const found = jobs.find((job) => Array.isArray(job.productRefs) && needed.every((id) => (job.productRefs as string[]).includes(id)));
  return found?.id ?? null;
}
