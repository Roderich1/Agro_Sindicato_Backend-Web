import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type {
  CampaignStatus,
  Prisma,
  SyncV1BaseUnit,
  SyncV1ProjectionType,
} from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  Cell,
  CellKey,
  cellId,
  consolidate,
  EligibleContribution,
} from "../domain/consolidation";
import {
  CellDecision,
  decideCellWithRelated,
  PriorRelease,
  PROVISIONAL_THRESHOLD,
} from "../domain/disclosure-policy";
import { CollectiveConfig, DisclosureMode } from "./collective-config";

export type CellStatus =
  | "DISCLOSED"
  | "SUPPRESSED_UNDER_THRESHOLD"
  | "SUPPRESSED_REVISION"
  | "OVERFLOW";

/** One output cell. Only aggregates derived in Central (F06 §5). */
export interface SummaryCell {
  projection_type: SyncV1ProjectionType;
  product_ref: string;
  product_name: string;
  base_unit: SyncV1BaseUnit;
  presentation_unit: "L" | "KG";
  status: CellStatus;
  total_base: string | null;
  total_presentation: string | null;
  contributors: number | null;
  data_as_of: string | null;
  released_at: string | null;
  pending_changes: boolean;
}

export interface CollectiveSummary {
  contractVersion: 1;
  campaign: { campaign_ref: string; name: string; status: CampaignStatus };
  disclosure: {
    mode: DisclosureMode;
    policy: "F07-POL-01";
    approved: false;
    threshold: number | null;
  };
  /**
   * F10-SEC-02 (#45): `members_with_contribution` counts only the Members
   * inside a published figure («N de M con cifras publicadas»); counting the
   * contributors of suppressed cells revealed their exact count.
   * `suppressed_cells` says that some row has no figure, without a count.
   */
  coverage: { linked_members: number; members_with_contribution: number; suppressed_cells: boolean } | null;
  cells: SummaryCell[];
}

type Tx = Prisma.TransactionClient;

/**
 * A summary plus, keyed by `cellId`, the release whose figure each DISCLOSED
 * cell shows. Internal only.
 */
export interface DecidedSummary {
  summary: CollectiveSummary;
  releaseOf: ReadonlyMap<string, string>;
}

/**
 * Collective summary of a campaign (F06 #21): read-only over Sync v1
 * contributions, grouped by the current canonical product (F07-REC-01) and
 * disclosed only under the provisional policy (F07-POL-01). Every output
 * channel (JSON and CSV) is built from this result.
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

  /**
   * The summary and, for each disclosed cell, the release that backs its
   * figure (internal: never part of the JSON/CSV output). `within` runs in the
   * same transaction and advisory lock, so a consumer such as the joint
   * purchase proposal (F07 #27) sees exactly the decisions of this summary.
   */
  async decide(
    tenantId: string,
    campaignId: string,
    within?: (tx: Tx, decided: DecidedSummary) => Promise<void>,
  ): Promise<DecidedSummary> {
    // Another tenant's campaign and a missing one answer the same 404.
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
          disclosure: { mode: "POLICY_PENDING", policy: "F07-POL-01", approved: false, threshold: null },
          coverage: null,
          cells: [],
        },
        releaseOf: new Map(),
      };
    }
    const decided = await this.prisma.$transaction(async (tx) => {
      // One summary at a time per campaign: releases are decided once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`collective:${tenantId}:${campaignId}`}, 0))`;
      const { releaseOf, ...rest } = await this.provisional(tx, tenantId, campaignId);
      const result: DecidedSummary = { summary: { ...header, ...rest }, releaseOf };
      if (within) await within(tx, result);
      return result;
    });
    this.logger.log(
      `[COLLECTIVE SUMMARY] tenant=${tenantId} campaign=${campaignId} cells=${decided.summary.cells.length}`,
    );
    return decided;
  }

  private async provisional(
    tx: Tx,
    tenantId: string,
    campaignId: string,
  ): Promise<Pick<CollectiveSummary, "disclosure" | "coverage" | "cells"> & Pick<DecidedSummary, "releaseOf">> {
    const contributions = await this.eligible(tx, tenantId, campaignId);
    const canonicalOf = await this.canonicalMap(tx, tenantId);
    const cells = consolidate(contributions, canonicalOf);
    const histories = await this.releaseHistories(tx, tenantId, campaignId);
    // F10-SEC-02 (#45): which cell keys disclosed each contribution, so that a
    // cell is also compared with the disclosures of the keys its contributions
    // came from (a re-keyed product keeps its history).
    const keysOf = new Map<string, Set<string>>();
    for (const [id, { history }] of histories) {
      for (const release of history) {
        for (const contributionId of release.items.keys()) {
          keysOf.set(contributionId, (keysOf.get(contributionId) ?? new Set()).add(id));
        }
      }
    }
    const allHistories = new Map(histories);
    const now = new Date();
    const output: { key: CellKey; decision: CellDecision; cell: Cell | null; prior: PriorRelease | null }[] = [];
    for (const cell of cells) {
      const id = cellId(cell);
      const history = histories.get(id)?.history ?? [];
      const relatedKeys = new Set(cell.contributions.flatMap((c) => [...(keysOf.get(c.contributionId) ?? [])]));
      relatedKeys.delete(id);
      const related = [...relatedKeys].map((key) => allHistories.get(key)!.history);
      output.push({ key: cell, decision: decideCellWithRelated(cell, history, related), cell, prior: history[0] ?? null });
      histories.delete(id);
    }
    // Cells whose contributions all left (cancelled, disputed, regrouped,
    // inactive): the latest figure is withdrawn, not kept.
    for (const { key, history } of histories.values()) {
      const prior = history[0]!;
      output.push({
        key,
        decision: {
          kind: "SUPPRESS",
          reason: "REVISION",
          withdrawPrior: prior.withdrawnAt === null,
        },
        cell: null,
        prior,
      });
    }
    const names = await this.productNames(tx, output.map((entry) => entry.key.canonicalProductId));
    const result: SummaryCell[] = [];
    const releaseOf = new Map<string, string>();
    for (const { key, decision, cell, prior } of output) {
      if ("withdrawPrior" in decision && decision.withdrawPrior && prior) {
        await tx.collectiveRelease.update({ where: { id: prior.id }, data: { withdrawnAt: now } });
      }
      const base = {
        projection_type: key.projectionType,
        product_ref: key.canonicalProductId,
        product_name: names.get(key.canonicalProductId) ?? "",
        base_unit: key.baseUnit,
        presentation_unit: key.baseUnit === "ML" ? ("L" as const) : ("KG" as const),
      };
      const hidden = {
        total_base: null,
        total_presentation: null,
        contributors: null,
        data_as_of: null,
        released_at: null,
        pending_changes: false,
      };
      switch (decision.kind) {
        case "RELEASE": {
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
            ...hidden,
          });
          break;
        case "OVERFLOW":
          result.push({ ...base, status: "OVERFLOW", ...hidden });
          break;
      }
    }
    result.sort(
      (a, b) =>
        a.projection_type.localeCompare(b.projection_type) ||
        a.product_name.localeCompare(b.product_name) ||
        a.product_ref.localeCompare(b.product_ref) ||
        a.base_unit.localeCompare(b.base_unit),
    );
    return {
      disclosure: {
        mode: "PROVISIONAL_SYNTHETIC",
        policy: "F07-POL-01",
        approved: false,
        threshold: PROVISIONAL_THRESHOLD,
      },
      coverage: {
        linked_members: await this.linkedMembers(tx, tenantId),
        members_with_contribution: publishedMembers(output).size,
        suppressed_cells: output.some(({ decision }) => decision.kind !== "RELEASE" && decision.kind !== "SHOW_PRIOR"),
      },
      cells: result,
      releaseOf,
    };
  }

  /** ACTIVE contributions with a quantity, from active Members and accounts. */
  private async eligible(tx: Tx, tenantId: string, campaignId: string): Promise<EligibleContribution[]> {
    const rows = await tx.syncV1Contribution.findMany({
      where: {
        tenantId,
        campaignId,
        status: "ACTIVE",
        quantityBase: { not: null },
        member: { isActive: true, user: { isActive: true } },
      },
      select: {
        id: true,
        memberId: true,
        projectionType: true,
        productId: true,
        baseUnit: true,
        quantityBase: true,
        lastSequence: true,
        acceptedAt: true,
      },
    });
    return rows.map((row) => ({
      contributionId: row.id,
      memberId: row.memberId,
      projectionType: row.projectionType,
      productId: row.productId,
      baseUnit: row.baseUnit,
      quantityBase: row.quantityBase!,
      sequence: row.lastSequence,
      acceptedAt: row.acceptedAt,
    }));
  }

  /** Current associations only: corrections never rewrite earlier rows. */
  private async canonicalMap(tx: Tx, tenantId: string): Promise<Map<string, string>> {
    const rows = await tx.productCanonicalAssociation.findMany({
      where: { tenantId, validTo: null },
      select: { productId: true, canonicalProductId: true },
    });
    return new Map(rows.map((row) => [row.productId, row.canonicalProductId]));
  }

  /** Every disclosure of each cell, newest first (withdrawn ones included). */
  private async releaseHistories(
    tx: Tx,
    tenantId: string,
    campaignId: string,
  ): Promise<Map<string, { key: CellKey; history: PriorRelease[] }>> {
    const releases = await tx.collectiveRelease.findMany({
      where: { tenantId, campaignId },
      orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
      include: { items: { include: { contribution: { select: { memberId: true } } } } },
    });
    const histories = new Map<string, { key: CellKey; history: PriorRelease[] }>();
    for (const release of releases) {
      const key: CellKey = {
        projectionType: release.projectionType,
        canonicalProductId: release.canonicalProductId,
        baseUnit: release.baseUnit,
      };
      const entry = histories.get(cellId(key)) ?? { key, history: [] };
      histories.set(cellId(key), entry);
      entry.history.push({
        id: release.id,
        totalBase: release.totalBase,
        contributorCount: release.contributorCount,
        dataAsOf: release.dataAsOf,
        releasedAt: release.releasedAt,
        withdrawnAt: release.withdrawnAt,
        items: new Map(release.items.map((item) => [item.contributionId, item.quantityBase])),
        memberOf: new Map(release.items.map((item) => [item.contributionId, item.contribution.memberId])),
      });
    }
    return histories;
  }

  private async productNames(tx: Tx, ids: string[]): Promise<Map<string, string>> {
    const rows = await tx.product.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** Active farmers of the tenant: who could contribute (coverage). */
  private async linkedMembers(tx: Tx, tenantId: string): Promise<number> {
    return tx.member.count({
      where: { tenantId, role: "AGRICULTOR", isActive: true, user: { isActive: true } },
    });
  }
}

function figure(
  total: bigint,
  contributors: number,
  dataAsOf: Date | null,
  releasedAt: Date,
  pendingChanges: boolean,
) {
  return {
    total_base: total.toString(),
    total_presentation: presentation(total),
    contributors,
    data_as_of: dataAsOf?.toISOString() ?? null,
    released_at: releasedAt.toISOString(),
    pending_changes: pendingChanges,
  };
}

/** Exact base → L/KG (1000 base units each), without floats. */
export function presentation(totalBase: bigint): string {
  const whole = totalBase / 1000n;
  const fraction = (totalBase % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * F10-SEC-02 (#45): Members inside a published figure. A new figure counts
 * the cell's current Members; a figure kept from before counts the Members of
 * that disclosure. Contributors of cells without a figure are not counted.
 */
function publishedMembers(
  output: readonly { decision: CellDecision; cell: Cell | null; prior: PriorRelease | null }[],
): Set<string> {
  const members = new Set<string>();
  for (const { decision, cell, prior } of output) {
    if (decision.kind === "RELEASE") cell!.members.forEach((member) => members.add(member));
    if (decision.kind === "SHOW_PRIOR") prior!.memberOf.forEach((member) => members.add(member));
  }
  return members;
}

/**
 * Same disclosure decisions as JSON, as CSV (F07-POL-01: every channel). A
 * text that a spreadsheet would read as a formula (=, +, -, @, tab or CR at
 * the start, e.g. a product or campaign name) is prefixed with ' and quoted,
 * so it is shown, never executed (CSV injection). Figures and dates never
 * start with those characters and are left as they are.
 */
export function summaryCsv(summary: CollectiveSummary): string {
  const quote = (value: string | number | boolean | null) => {
    const raw = value === null ? "" : String(value);
    const formula = /^[=+\-@\t\r]/.test(raw);
    const text = formula ? `'${raw}` : raw;
    return formula || /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [
    ["campaign_ref", "campaign", "disclosure", "policy", "approved", "threshold", "linked_members", "members_with_contribution", "suppressed_cells"].join(","),
    [
      summary.campaign.campaign_ref,
      summary.campaign.name,
      summary.disclosure.mode,
      summary.disclosure.policy,
      summary.disclosure.approved,
      summary.disclosure.threshold,
      summary.coverage?.linked_members ?? null,
      summary.coverage?.members_with_contribution ?? null,
      summary.coverage?.suppressed_cells ?? null,
    ].map(quote).join(","),
    "",
    ["projection_type", "product_ref", "product_name", "base_unit", "presentation_unit", "status", "total_base", "total_presentation", "contributors", "data_as_of", "released_at", "pending_changes"].join(","),
    ...summary.cells.map((cell) =>
      [
        cell.projection_type,
        cell.product_ref,
        cell.product_name,
        cell.base_unit,
        cell.presentation_unit,
        cell.status,
        cell.total_base,
        cell.total_presentation,
        cell.contributors,
        cell.data_as_of,
        cell.released_at,
        cell.pending_changes,
      ].map(quote).join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
