import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { CampaignStatus } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { cellId } from "../domain/consolidation";
import { reviewFingerprint, sealLockKey } from "../domain/seal";
import { CollectiveConfig } from "./collective-config";
import {
  CollectiveSummaryUseCase,
  DecidedSummary,
  SealRef,
  summaryLockKey,
} from "./collective-summary.use-case";

type Tx = Prisma.TransactionClient;

export type SealBlock = "SEALING_DISABLED" | "POLICY_PENDING" | "CAMPAIGN_NOT_CLOSED";

/**
 * What the Directiva reviews before sealing (contract §3.3). Flags carry no
 * count. `accepted_until` is the instant of this decision: each figure is only
 * as recent as its own `data_as_of`, and Central cannot know what phones did
 * not publish.
 */
export interface SealReview {
  review_ref: string;
  accepted_until: string;
  coverage: { linked_members: number; members_with_contribution: number; suppressed_cells: boolean };
  open_disputes: boolean;
  pending_changes: boolean;
  cells_without_figure: boolean;
}

export interface SealState {
  contractVersion: 1;
  campaign: { campaign_ref: string; name: string; status: CampaignStatus };
  state: "SEALED" | "NOT_SEALED";
  seal: SealRef | null;
  can_seal: boolean;
  blocked_by: SealBlock[];
  review: SealReview | null;
}

export interface SealCommand {
  confirmed: boolean;
  reviewRef: string;
}

const SEAL_ROLES: readonly UserRole[] = [UserRole.DIRECTIVA, UserRole.ADMINISTRADOR];

/**
 * F07 manual seal (F07_SEALED_HISTORY_CONTRACT §3–§4): DIRECTIVA or
 * ADMINISTRADOR of the tenant, either alone, fixes the disclosure decisions of
 * a CERRADA campaign as version 1. One transaction holds the seal lock
 * (exclusive; pushes take it shared), the summary lock, the decision, the
 * check of what was reviewed and the writes: all or nothing. A second request
 * gets the existing seal. No reopening, correction or later version.
 */
@Injectable()
export class CollectiveSealUseCase {
  private readonly logger = new Logger(CollectiveSealUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CollectiveConfig,
    private readonly summary: CollectiveSummaryUseCase,
  ) {}

  /**
   * Seal state and, when the campaign can be sealed, the review. The review
   * is the same decision a summary read makes (same lock, same effects); a
   * sealed campaign is only read.
   */
  async state(tenantId: string, campaignId: string): Promise<SealState> {
    const campaign = await this.findCampaign(this.prisma, tenantId, campaignId);
    const seal = await this.summary.sealRef(this.prisma, tenantId, campaignId);
    if (seal) return this.view(campaign, seal, []);
    const blocked = this.blocks(campaign.status);
    if (blocked.length > 0) return this.view(campaign, null, blocked);
    let review: SealReview | null = null;
    const decided = await this.summary.decide(tenantId, campaignId, async (tx, d) => {
      if (!d.summary.seal) review = await this.review(tx, tenantId, campaignId, d);
    });
    if (decided.summary.seal) return this.view(campaign, decided.summary.seal, []);
    return { ...this.view(campaign, null, []), review };
  }

  async seal(
    tenantId: string,
    actor: { userId: string; role: UserRole },
    campaignId: string,
    command: SealCommand,
  ): Promise<SealState & { created: boolean }> {
    // The confirmation is checked before anything else, also for a campaign
    // already sealed: an unconfirmed request never gets a success.
    if (command.confirmed !== true) throw new UnprocessableEntityException("CONFIRMATION_REQUIRED");
    if (!SEAL_ROLES.includes(actor.role)) throw new ForbiddenException();
    const created = await this.prisma.$transaction(
      async (tx) => {
        const campaign = await this.findCampaign(tx, tenantId, campaignId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sealLockKey(tenantId, campaignId)}, 0))`;
        if (await this.summary.sealRef(tx, tenantId, campaignId)) return false;
        const blocked = this.blocks(campaign.status);
        if (blocked.length > 0) throw new ConflictException(blocked[0]);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${summaryLockKey(tenantId, campaignId)}, 0))`;
        const header = {
          contractVersion: 1 as const,
          campaign: { campaign_ref: campaign.id, name: campaign.name, status: campaign.status },
        };
        const decided = await this.summary.decideLocked(tx, tenantId, header);
        const review = await this.review(tx, tenantId, campaignId, decided);
        // What is sealed is exactly what was reviewed, or nothing (the whole
        // transaction, releases of this decision included, rolls back).
        if (review.review_ref !== command.reviewRef) throw new ConflictException("SEAL_REVIEW_STALE");
        const sealedAt = new Date();
        const seal = await tx.collectiveSeal.create({
          data: {
            tenantId,
            campaignId,
            version: 1,
            sealedAt,
            sealedByUserId: actor.userId,
            sealedByRole: actor.role,
            disclosureMode: decided.summary.disclosure.mode,
            policy: decided.summary.disclosure.policy,
            threshold: decided.summary.disclosure.threshold!,
            linkedMembers: review.coverage.linked_members,
            membersWithContribution: review.coverage.members_with_contribution,
            suppressedCells: review.coverage.suppressed_cells,
            openDisputes: review.open_disputes,
            reviewRef: review.review_ref,
          },
          select: { id: true },
        });
        // A separate statement, after the seal row exists in this transaction
        // (the entry trigger checks it).
        await tx.collectiveSealEntry.createMany({
          data: decided.summary.cells.map((cell) => {
            const key = { projectionType: cell.projection_type, canonicalProductId: cell.product_ref, baseUnit: cell.base_unit };
            const disclosed = cell.status === "DISCLOSED";
            if (cell.status === "WITHDRAWN_AFTER_SEAL") throw new Error("Unsealed decision with a sealed state");
            return {
              sealId: seal.id,
              projectionType: cell.projection_type,
              canonicalProductId: cell.product_ref,
              baseUnit: cell.base_unit,
              status: cell.status,
              releaseId: disclosed ? requireRelease(decided, cellId(key)) : null,
              pendingChanges: disclosed && cell.pending_changes,
            };
          }),
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            campaignId,
            actorUserId: actor.userId,
            action: "OTRO",
            entityName: "CollectiveSeal",
            entityId: seal.id,
            summary: "Consolidado colectivo sellado (versión 1)",
          },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 },
    );
    if (created) {
      this.logger.log(`[COLLECTIVE SEAL] tenant=${tenantId} campaign=${campaignId} actor=${actor.userId} role=${actor.role}`);
    }
    return { ...(await this.state(tenantId, campaignId)), created };
  }

  private blocks(status: CampaignStatus): SealBlock[] {
    const blocked: SealBlock[] = [];
    if (!this.config.sealingEnabled) blocked.push("SEALING_DISABLED");
    if (this.config.mode === "POLICY_PENDING") blocked.push("POLICY_PENDING");
    if (status !== "CERRADA") blocked.push("CAMPAIGN_NOT_CLOSED");
    return blocked;
  }

  private async review(tx: Tx, tenantId: string, campaignId: string, decided: DecidedSummary): Promise<SealReview> {
    const { summary, releaseOf } = decided;
    const coverage = summary.coverage!;
    const openDisputes =
      (await tx.syncV1Contribution.count({ where: { tenantId, campaignId, reconciliationReference: { not: null } } })) > 0;
    const pendingChanges = summary.cells.some((cell) => cell.status === "DISCLOSED" && cell.pending_changes);
    const cells = summary.cells.map((cell) => ({
      projection_type: cell.projection_type,
      product_ref: cell.product_ref,
      base_unit: cell.base_unit,
      status: cell.status,
      pending_changes: cell.pending_changes,
      release_ref:
        releaseOf.get(cellId({ projectionType: cell.projection_type, canonicalProductId: cell.product_ref, baseUnit: cell.base_unit })) ??
        null,
    }));
    return {
      review_ref: reviewFingerprint({
        campaign_ref: summary.campaign.campaign_ref,
        mode: summary.disclosure.mode,
        threshold: summary.disclosure.threshold,
        coverage,
        open_disputes: openDisputes,
        pending_changes: pendingChanges,
        cells,
      }),
      accepted_until: new Date().toISOString(),
      coverage: {
        linked_members: coverage.linked_members,
        members_with_contribution: coverage.members_with_contribution,
        suppressed_cells: coverage.suppressed_cells,
      },
      open_disputes: openDisputes,
      pending_changes: pendingChanges,
      cells_without_figure: coverage.suppressed_cells,
    };
  }

  private view(
    campaign: { id: string; name: string; status: CampaignStatus },
    seal: SealRef | null,
    blocked: SealBlock[],
  ): SealState {
    return {
      contractVersion: 1,
      campaign: { campaign_ref: campaign.id, name: campaign.name, status: campaign.status },
      state: seal ? "SEALED" : "NOT_SEALED",
      seal,
      can_seal: seal === null && blocked.length === 0,
      blocked_by: blocked,
      review: null,
    };
  }

  private async findCampaign(db: Tx | PrismaService, tenantId: string, campaignId: string) {
    // Another tenant's campaign and a missing one answer the same 404.
    const campaign = await db.agriculturalCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!campaign) throw new NotFoundException("CAMPAIGN_NOT_FOUND");
    return campaign;
  }
}

function requireRelease(decided: DecidedSummary, id: string): string {
  const release = decided.releaseOf.get(id);
  // A DISCLOSED cell of a writing decision always has a stored release.
  if (!release) throw new Error("DISCLOSED cell without release");
  return release;
}
