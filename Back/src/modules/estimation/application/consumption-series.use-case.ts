import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { baseUnitForCentralUnit } from "../../sync-v1/domain/units";
import { assessSpan, canonicalSources, PointCoverage, SeriesScope, SourcePoint, SpanAssessment } from "../domain/series";

type Tx = Prisma.TransactionClient;

/** A series built or reused, with the coverage read from each seal. */
export interface BuiltSeries {
  seriesId: string;
  version: number;
  sourceHash: string;
  /** True when the latest version already had these exact sources. */
  reused: boolean;
  scope: SeriesScope;
  points: SourcePoint[];
}

/**
 * Why no series is built (no row is written, no figure is invented):
 * - POLICY_PENDING: no disclosure policy in force;
 * - SEASON_NOT_FOUND, PRODUCT_NOT_FOUND: not of the tenant (indistinguishable from missing);
 * - PRODUCT_NOT_ESTIMABLE: not canonical, or its central unit is not linkable;
 * - MIXED_UNITS: a sealed consumption figure of the canonical group is in another base unit;
 * - CANONICAL_CHANGED_AFTER_SEAL: a sealed figure belongs to a product that
 *   is now a denomination of this one; the sealed figures cannot be added up
 *   without publishing a new figure, so the campaign is not comparable.
 */
export type SeriesRefusal =
  | "POLICY_PENDING"
  | "SEASON_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_NOT_ESTIMABLE"
  | "MIXED_UNITS"
  | "CANONICAL_CHANGED_AFTER_SEAL";

export type SeriesOutcome = { built: BuiltSeries } | { refused: SeriesRefusal; campaignId?: string };

/** Reading of the series for a target campaign (F12-EST-03). */
export type TargetAssessment =
  | { built: BuiltSeries; target: { campaignId: string; classificationId: string; seasonId: string }; assessment: SpanAssessment }
  | {
      refused: SeriesRefusal | "TARGET_CAMPAIGN_NOT_FOUND" | "TARGET_CAMPAIGN_NOT_CLASSIFIED";
      /** The result a run would record, without figures (RN-28). */
      result: { status: "INCOMPATIBLE_DATA"; reason: "MIXED_UNITS" | "NO_COMPARABLE_CAMPAIGNS" } | null;
      campaignId?: string;
    };

/**
 * F12-EST-02 (#175): builds the consumption series of a canonical product,
 * base unit and season from permitted sources only (contract §3):
 * - the campaigns whose current classification is the season (EST-D-02,
 *   EST-D-14), in chronological order; a campaign without a record is a
 *   position, never skipped nor compressed;
 * - a verified figure only from a CERRADA campaign's sealed version, copied
 *   exactly from the release of its visible DISCLOSED entry (EST-D-03);
 * - a suppressed, overflowing or withdrawn entry is HIDDEN; no entry, no seal
 *   or a campaign not closed is NO_RECORD; neither is ever zero;
 * - the coverage of each position is read from its seal (F07 §5.3).
 * The series is written once, in one transaction with its points, and reused
 * while its sources do not change; otherwise a new version follows the
 * previous one. No SES, naive or run here.
 */
@Injectable()
export class ConsumptionSeriesUseCase {
  private readonly logger = new Logger(ConsumptionSeriesUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CollectiveConfig,
  ) {}

  async build(tenantId: string, seasonId: string, productId: string): Promise<SeriesOutcome> {
    if (this.config.mode === "POLICY_PENDING") return { refused: "POLICY_PENDING" };
    return this.prisma.$transaction(async (tx) => this.buildIn(tx, tenantId, seasonId, productId), {
      maxWait: 10000,
      timeout: 30000,
    });
  }

  /**
   * F12-EST-03 (#176): the series of the target's current season, and how it
   * reads for that target. Admissibility of the target for a job (EST-D-06)
   * is checked where jobs are created and run (F12-EST-05), not here.
   */
  async assess(tenantId: string, targetCampaignId: string, productId: string): Promise<TargetAssessment> {
    const target = await this.prisma.agriculturalCampaign.findFirst({
      where: { id: targetCampaignId, tenantId },
      select: { id: true, startDate: true },
    });
    if (!target) return { refused: "TARGET_CAMPAIGN_NOT_FOUND", result: null };
    const classification = await this.prisma.campaignSeasonClassification.findFirst({
      where: { tenantId, campaignId: target.id, nextClassification: { is: null }, seasonId: { not: null } },
      select: { id: true, seasonId: true },
    });
    if (!classification) return { refused: "TARGET_CAMPAIGN_NOT_CLASSIFIED", result: null };
    if (this.config.mode === "POLICY_PENDING") return { refused: "POLICY_PENDING", result: null };
    return this.prisma.$transaction(
      async (tx) =>
        this.assessIn(tx, tenantId, { campaignId: target.id, startDate: target.startDate, classificationId: classification.id, seasonId: classification.seasonId! }, productId),
      { maxWait: 10000, timeout: 30000 },
    );
  }

  /**
   * The same reading inside the caller's transaction (the F12-EST-05 worker),
   * for a target whose current classification the caller already read. The
   * caller checks the policy before calling.
   */
  async assessIn(
    tx: Tx,
    tenantId: string,
    target: { campaignId: string; startDate: Date; classificationId: string; seasonId: string },
    productId: string,
  ): Promise<TargetAssessment> {
    const outcome = await this.buildIn(tx, tenantId, target.seasonId, productId);
    if ("refused" in outcome) {
      const result =
        outcome.refused === "MIXED_UNITS"
          ? ({ status: "INCOMPATIBLE_DATA", reason: "MIXED_UNITS" } as const)
          : outcome.refused === "CANONICAL_CHANGED_AFTER_SEAL"
            ? ({ status: "INCOMPATIBLE_DATA", reason: "NO_COMPARABLE_CAMPAIGNS" } as const)
            : null;
      return { refused: outcome.refused, result, ...(outcome.campaignId ? { campaignId: outcome.campaignId } : {}) };
    }
    return {
      built: outcome.built,
      target: { campaignId: target.campaignId, classificationId: target.classificationId, seasonId: target.seasonId },
      assessment: assessSpan(outcome.built.points, { campaignId: target.campaignId, startDate: target.startDate }),
    };
  }

  /**
   * The sources the series of this scope would have now, without writing
   * anything: F12-EST-05 compares their hash with the series a result used
   * (SOURCES_CHANGED, EST-D-12).
   */
  async currentSources(tx: Tx, tenantId: string, seasonId: string, productId: string): Promise<{ sourceHash: string } | { refused: SeriesRefusal }> {
    const collected = await this.collectIn(tx, tenantId, seasonId, productId, false);
    return "refused" in collected ? { refused: collected.refused } : { sourceHash: collected.sourceHash };
  }

  private async buildIn(tx: Tx, tenantId: string, seasonId: string, productId: string): Promise<SeriesOutcome> {
    const collected = await this.collectIn(tx, tenantId, seasonId, productId, true);
    if ("refused" in collected) return collected;
    const { scope, points, sources, sourceHash } = collected;
    const product = { id: scope.canonicalProductId };
    const baseUnit = scope.baseUnit;
    const season = { id: scope.seasonId };
    const latest = await tx.consumptionSeries.findFirst({
      where: { tenantId, canonicalProductId: product.id, baseUnit, seasonId: season.id },
      orderBy: { version: "desc" },
      select: { id: true, version: true, sourceHash: true },
    });
    if (latest?.sourceHash === sourceHash) {
      return { built: { seriesId: latest.id, version: latest.version, sourceHash, reused: true, scope, points } };
    }
    const created = await tx.consumptionSeries.create({
      data: {
        tenantId,
        canonicalProductId: product.id,
        baseUnit,
        seasonId: season.id,
        version: (latest?.version ?? 0) + 1,
        previousSeriesId: latest?.id ?? null,
        sourceHash,
        sources: sources as Prisma.InputJsonValue,
        points: {
          create: points.map((p) => ({
            position: p.position,
            campaignId: p.campaignId,
            classificationId: p.classificationId,
            kind: p.kind,
            quantityBase: p.quantityBase,
            sourceSealId: p.sealId,
            sourceReleaseId: p.releaseId,
          })),
        },
      },
      select: { id: true, version: true },
    });
    this.logger.log(`[F12 SERIES] tenant=${tenantId} product=${product.id} unit=${baseUnit} season=${season.id} version=${created.version} points=${points.length}`);
    return { built: { seriesId: created.id, version: created.version, sourceHash, reused: false, scope, points } };
  }

  private async collectIn(
    tx: Tx,
    tenantId: string,
    seasonId: string,
    productId: string,
    lock: boolean,
  ): Promise<{ scope: SeriesScope; points: SourcePoint[]; sources: unknown[]; sourceHash: string } | { refused: SeriesRefusal; campaignId?: string }> {
    const season = await tx.comparabilitySeason.findFirst({ where: { id: seasonId, tenantId }, select: { id: true } });
    if (!season) return { refused: "SEASON_NOT_FOUND" };
    const product = await tx.product.findFirst({ where: { id: productId, tenantId }, select: { id: true, unit: true } });
    if (!product) return { refused: "PRODUCT_NOT_FOUND" };
    const baseUnit = baseUnitForCentralUnit(product.unit);
    const associations = await tx.productCanonicalAssociation.findMany({
      where: { tenantId, validTo: null, OR: [{ productId: product.id }, { canonicalProductId: product.id }] },
      select: { productId: true, canonicalProductId: true, validFrom: true },
    });
    const isDenomination = associations.some((a) => a.productId === product.id && a.canonicalProductId !== product.id);
    if (!baseUnit || isDenomination) return { refused: "PRODUCT_NOT_ESTIMABLE" };
    const aliases = associations.filter((a) => a.canonicalProductId === product.id && a.productId !== product.id);
    const group = new Set([product.id, ...aliases.map((a) => a.productId)]);
    const scope: SeriesScope = {
      seasonId: season.id,
      canonicalProductId: product.id,
      baseUnit,
      associations: aliases.map((a) => ({ productId: a.productId, validFrom: a.validFrom })),
    };

    // One build at a time per scope: two builds never create the same version.
    if (lock) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`f12-series:${tenantId}:${product.id}:${baseUnit}:${season.id}`}, 0))`;
    const classified = await tx.campaignSeasonClassification.findMany({
      where: { tenantId, seasonId: season.id, nextClassification: { is: null } },
      select: { id: true, campaign: { select: { id: true, status: true, startDate: true } } },
    });
    classified.sort((a, b) => a.campaign.startDate.getTime() - b.campaign.startDate.getTime() || a.campaign.id.localeCompare(b.campaign.id));

    const points: SourcePoint[] = [];
    for (const [index, { id: classificationId, campaign }] of classified.entries()) {
      const base = { position: index + 1, campaignId: campaign.id, classificationId, startDate: campaign.startDate, campaignStatus: campaign.status };
      const seal =
        campaign.status === "CERRADA"
          ? await tx.collectiveSeal.findFirst({
              where: { tenantId, campaignId: campaign.id },
              orderBy: { version: "desc" },
              select: {
                id: true,
                consumptionCoverage: true,
                entries: {
                  where: { projectionType: "CONSUMPTION_TOTAL", canonicalProductId: { in: [...group] } },
                  select: {
                    canonicalProductId: true,
                    baseUnit: true,
                    status: true,
                    releaseId: true,
                    visibilityWithdrawnAt: true,
                    release: { select: { totalBase: true, withdrawnAt: true } },
                  },
                },
              },
            })
          : null;
      if (!seal) {
        points.push({ ...base, kind: "NO_RECORD", quantityBase: null, sealId: null, releaseId: null, entryStatus: null, visibilityWithdrawn: false, coverage: { status: "UNKNOWN", reason: "NOT_SEALED" } });
        continue;
      }
      if (seal.entries.some((e) => e.baseUnit !== baseUnit)) return { refused: "MIXED_UNITS", campaignId: campaign.id };
      if (seal.entries.some((e) => e.canonicalProductId !== product.id)) return { refused: "CANONICAL_CHANGED_AFTER_SEAL", campaignId: campaign.id };
      const coverage = coverageOf(seal.consumptionCoverage);
      const entry = seal.entries[0];
      const sealed = { sealId: seal.id, coverage };
      if (!entry) {
        points.push({ ...base, ...sealed, kind: "NO_RECORD", quantityBase: null, releaseId: null, entryStatus: null, visibilityWithdrawn: false });
      } else if (entry.status === "DISCLOSED" && entry.visibilityWithdrawnAt === null && entry.release && entry.release.withdrawnAt === null) {
        points.push({ ...base, ...sealed, kind: "VERIFIED_CONSUMPTION", quantityBase: entry.release.totalBase, releaseId: entry.releaseId, entryStatus: entry.status, visibilityWithdrawn: false });
      } else {
        points.push({ ...base, ...sealed, kind: "HIDDEN", quantityBase: null, releaseId: null, entryStatus: entry.status, visibilityWithdrawn: entry.visibilityWithdrawnAt !== null });
      }
    }

    const { sources, sourceHash } = canonicalSources(scope, points);
    return { scope, points, sources, sourceHash };
  }
}

function coverageOf(
  row: { status: "IDENTIFIED" | "POPULATION_MISMATCH"; linkedMembers: number | null; membersInPublishedFigures: number | null } | null,
): PointCoverage {
  if (!row) return { status: "UNKNOWN", reason: "SEALED_BEFORE_COVERAGE" };
  if (row.status === "POPULATION_MISMATCH") return { status: "UNKNOWN", reason: "POPULATION_MISMATCH" };
  return { status: "IDENTIFIED", membersInPublishedFigures: row.membersInPublishedFigures!, linkedMembers: row.linkedMembers! };
}
