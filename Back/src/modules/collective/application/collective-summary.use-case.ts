import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { Cell, CellKey, cellId, consolidate } from "../domain/consolidation";
import {
  CellDecision,
  decideCells,
  decideCellsWithoutThreshold,
  PriorRelease,
} from "../domain/disclosure-policy";
import { CollectiveConfig, storedPolicy, thresholdOf } from "./collective-config";
import {
  figure,
  publishedMembers,
  servedSealed,
  sortCells,
  summaryLockKey,
  toSealRef,
} from "./summary/collective-summary.formatters";
import {
  fetchCanonicalMap,
  fetchEligibleContributions,
  fetchLinkedMembers,
  fetchProductNames,
  fetchReleaseHistories,
  findLatestSealRef,
  loadSealedVersion,
} from "./summary/collective-summary.queries";
import {
  CollectiveSummary,
  DecidedSummary,
  DecideOptions,
  HIDDEN,
  PENDING_RELEASE_PREFIX,
  SealedVersion,
  SealRef,
  SummaryCell,
  Tx,
} from "./summary/collective-summary.types";

export {
  PENDING_RELEASE_PREFIX,
  SEALED_VERSION_INCLUDE,
} from "./summary/collective-summary.types";
export type {
  CellStatus,
  CollectiveSummary,
  DecidedSummary,
  DecideOptions,
  DecisionPopulation,
  SealedVersion,
  SealRef,
  SummaryCell,
} from "./summary/collective-summary.types";
export {
  presentation,
  servedSealed,
  summaryLockKey,
  toSealRef,
} from "./summary/collective-summary.formatters";

/**
 * Collective summary of a campaign (F06 #21): read-only over Sync v1
 * contributions, grouped by the current canonical product (F07-REC-01) and
 * disclosed only under the provisional policy (F07-POL-01). Every output
 * channel (the JSON, and the Web's Excel built from it) comes from this result.
 */
@Injectable()
export class CollectiveSummaryUseCase {
  private readonly logger = new Logger(CollectiveSummaryUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CollectiveConfig,
  ) {}

  async execute(tenantId: string, campaignId: string): Promise<CollectiveSummary> {
    return (await this.decide(tenantId, campaignId)).summary;
  }

  /** The seal of a campaign, if any. Read-only. */
  async sealRef(db: Tx | PrismaService, tenantId: string, campaignId: string): Promise<SealRef | null> {
    return findLatestSealRef(db, tenantId, campaignId);
  }

  /**
   * The summary and, for each disclosed cell, the release that backs its
   * figure (internal: never part of the JSON output). `within` runs in the
   * same transaction and advisory lock, so a consumer such as the joint
   * purchase proposal (F07 #27) sees exactly the decisions of this summary.
   */
  async decide(
    tenantId: string,
    campaignId: string,
    within?: (tx: Tx, decided: DecidedSummary) => Promise<void>,
    options: DecideOptions = { persist: true },
  ): Promise<DecidedSummary> {
    const campaign = await this.prisma.agriculturalCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!campaign) throw new NotFoundException("CAMPAIGN_NOT_FOUND");
    const header = {
      contractVersion: 1 as const,
      campaign: { campaign_ref: campaign.id, name: campaign.name, status: campaign.status },
    };
    if (this.config.mode === "POLICY_PENDING") {
      return {
        summary: {
          ...header,
          seal: await this.sealRef(this.prisma, tenantId, campaignId),
          disclosure: { mode: "POLICY_PENDING", policy: this.config.policy, approved: false, threshold: null },
          coverage: null,
          cells: [],
        },
        releaseOf: new Map(),
      };
    }
    const decided = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${summaryLockKey(tenantId, campaignId)}, 0))`;
      const sealed = await loadSealedVersion(tx, tenantId, campaignId);
      const result = sealed
        ? this.fromSealed(header, sealed)
        : await this.decideLocked(tx, tenantId, header, options);
      if (within) await within(tx, result);
      return result;
    });
    this.logger.log(
      `[COLLECTIVE SUMMARY] tenant=${tenantId} campaign=${campaignId} cells=${decided.summary.cells.length}`,
    );
    return decided;
  }

  /**
   * The disclosure decision of an unsealed campaign, in the caller's
   * transaction. The caller holds the summary lock and has checked that no
   * seal exists.
   */
  async decideLocked(
    tx: Tx,
    tenantId: string,
    header: Pick<CollectiveSummary, "contractVersion" | "campaign">,
    options: DecideOptions = { persist: true },
  ): Promise<DecidedSummary> {
    const { releaseOf, population, ...rest } = await this.provisional(
      tx,
      tenantId,
      header.campaign.campaign_ref,
      options.persist,
    );
    return { summary: { ...header, seal: null, ...rest }, releaseOf, population };
  }

  private fromSealed(
    header: Pick<CollectiveSummary, "contractVersion" | "campaign">,
    sealed: SealedVersion,
  ): DecidedSummary {
    const { cells, coverage, releaseOf } = servedSealed(sealed);
    return {
      summary: {
        ...header,
        seal: toSealRef(sealed),
        disclosure: {
          mode: "PROVISIONAL_SYNTHETIC",
          policy: storedPolicy(sealed.policy),
          approved: false,
          threshold: sealed.threshold,
        },
        coverage,
        cells,
      },
      releaseOf,
    };
  }

  private async provisional(
    tx: Tx,
    tenantId: string,
    campaignId: string,
    persist: boolean,
  ): Promise<
    Pick<CollectiveSummary, "disclosure" | "coverage" | "cells"> &
      Required<Pick<DecidedSummary, "releaseOf" | "population">>
  > {
    const contributions = await fetchEligibleContributions(tx, tenantId, campaignId);
    const canonicalOf = await fetchCanonicalMap(tx, tenantId);
    const cells = consolidate(contributions, canonicalOf);
    const histories = await fetchReleaseHistories(tx, tenantId, campaignId);
    const policy = this.config.policy;
    const byCell = new Map([...histories].map(([id, { history }]) => [id, history]));
    const decisions =
      policy === "F07-POL-02" ? decideCellsWithoutThreshold(cells, byCell) : decideCells(cells, byCell);
    const now = new Date();
    const output: { key: CellKey; decision: CellDecision; cell: Cell | null; prior: PriorRelease | null }[] = [];
    for (const cell of cells) {
      const id = cellId(cell);
      const history = histories.get(id)?.history ?? [];
      output.push({ key: cell, decision: decisions.get(id)!, cell, prior: history[0] ?? null });
      histories.delete(id);
    }
    for (const { key, history } of histories.values()) {
      const prior = history[0]!;
      output.push({
        key,
        decision: { kind: "SUPPRESS", reason: "REVISION", withdrawPrior: prior.withdrawnAt === null },
        cell: null,
        prior,
      });
    }
    const names = await fetchProductNames(tx, output.map((entry) => entry.key.canonicalProductId));
    const { result, releaseOf } = await this.materializeCells(tx, tenantId, campaignId, policy, now, persist, output, names);
    sortCells(result);
    const linked = await fetchLinkedMembers(tx, tenantId);
    return {
      disclosure: { mode: "PROVISIONAL_SYNTHETIC", policy, approved: false, threshold: thresholdOf(policy) },
      coverage: {
        linked_members: linked.size,
        members_with_contribution: publishedMembers(output).size,
        suppressed_cells: output.some(({ decision }) => decision.kind !== "RELEASE" && decision.kind !== "SHOW_PRIOR"),
      },
      cells: result,
      releaseOf,
      population: {
        linked,
        published: new Map(
          (["DECLARED_NEED", "CONSUMPTION_TOTAL"] as const).map((type) => [
            type,
            publishedMembers(output.filter(({ key }) => key.projectionType === type)),
          ]),
        ),
      },
    };
  }

  private async materializeCells(
    tx: Tx,
    tenantId: string,
    campaignId: string,
    policy: CollectiveSummary["disclosure"]["policy"],
    now: Date,
    persist: boolean,
    output: { key: CellKey; decision: CellDecision; cell: Cell | null; prior: PriorRelease | null }[],
    names: Map<string, string>,
  ) {
    const result: SummaryCell[] = [];
    const releaseOf = new Map<string, string>();
    for (const { key, decision, cell, prior } of output) {
      if (persist && "withdrawPrior" in decision && decision.withdrawPrior && prior) {
        await tx.collectiveRelease.update({ where: { id: prior.id }, data: { withdrawnAt: now } });
      }
      const base = {
        projection_type: key.projectionType,
        product_ref: key.canonicalProductId,
        product_name: names.get(key.canonicalProductId) ?? "",
        base_unit: key.baseUnit,
        presentation_unit: key.baseUnit === "ML" ? ("L" as const) : ("KG" as const),
      };
      switch (decision.kind) {
        case "RELEASE": {
          if (!persist) {
            releaseOf.set(cellId(key), `${PENDING_RELEASE_PREFIX}${cellId(key)}`);
            result.push({ ...base, status: "DISCLOSED", ...HIDDEN });
            break;
          }
          const released = await tx.collectiveRelease.create({
            data: {
              tenantId,
              campaignId,
              canonicalProductId: key.canonicalProductId,
              projectionType: key.projectionType,
              baseUnit: key.baseUnit,
              totalBase: cell!.total,
              contributorCount: cell!.members.size,
              dataAsOf: cell!.dataAsOf,
              releasedAt: now,
              policy,
              items: {
                create: cell!.contributions.map((contribution) => ({
                  contributionId: contribution.contributionId,
                  sequence: contribution.sequence,
                  quantityBase: contribution.quantityBase,
                })),
              },
            },
          });
          releaseOf.set(cellId(key), released.id);
          result.push({ ...base, status: "DISCLOSED", ...figure(released.totalBase, cell!.members.size, cell!.dataAsOf, now, false) });
          break;
        }
        case "SHOW_PRIOR":
          releaseOf.set(cellId(key), prior!.id);
          result.push({
            ...base,
            status: "DISCLOSED",
            ...figure(prior!.totalBase, prior!.contributorCount, prior!.dataAsOf, prior!.releasedAt, decision.pendingChanges),
          });
          break;
        case "SUPPRESS":
          result.push({
            ...base,
            status: decision.reason === "UNDER_THRESHOLD" ? "SUPPRESSED_UNDER_THRESHOLD" : "SUPPRESSED_REVISION",
            ...HIDDEN,
          });
          break;
        case "OVERFLOW":
          result.push({ ...base, status: "OVERFLOW", ...HIDDEN });
          break;
      }
    }
    return { result, releaseOf };
  }
}
