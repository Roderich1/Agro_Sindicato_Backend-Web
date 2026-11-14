import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { AuthenticatedPrincipal } from "../../iam/application/types/authenticated-principal.type";
import { byCodeUnits } from "../domain/run-content";
import { deriveValidity, figuresWithheld, ValidityFacts } from "../domain/validity";
import { ConsumptionSeriesUseCase } from "./consumption-series.use-case";
import { campaignRefOf, coverageViewOf, NOTICE, presentationUnitOf, seasonRefOf } from "./estimation-views";

const CAMPAIGN = { id: true, name: true, status: true, startDate: true, estimatedEndDate: true, closedAt: true } as const;

const RESULT_INCLUDE = {
  canonicalProduct: { select: { id: true, name: true } },
  series: {
    include: {
      points: {
        orderBy: { position: "asc" },
        include: {
          campaign: { select: CAMPAIGN },
          classification: { select: { nextClassification: { select: { id: true } } } },
          sourceSeal: { select: { id: true, consumptionCoverage: true } },
        },
      },
    },
  },
} satisfies Prisma.EstimationResultInclude;

type StoredResult = Prisma.EstimationResultGetPayload<{ include: typeof RESULT_INCLUDE }>;
type StoredPoint = NonNullable<StoredResult["series"]>["points"][number];
interface ChainRun {
  id: string;
  outcome: "CALCULATED" | "FAILED";
  generatedAt: Date;
  seasonId: string;
  targetClassificationId: string;
  keys: Set<string>;
}

/**
 * F12-EST-05 (#178; contract §4.3, §8): reading runs and results. Nothing is
 * written here and validity is never stored: it is derived at each reading
 * from the chain of runs of the target and the current state of the sources.
 * - The policy in force applies when reading: POLICY_PENDING gives 409 and no
 *   figure (3.12.3.4).
 * - Every verified point is checked again against its sealed entry: if it is
 *   no longer DISCLOSED and visible, it is delivered HIDDEN (E4 §3.4: no
 *   count of contributors is required any more; a sealed DISCLOSED entry of
 *   F07-POL-01 already had 3 or more), and a result that used it loses its figures
 *   (SOURCES_WITHDRAWN), so the estimate never reveals what the direct
 *   reading hides (3.12.6.3).
 * - The permission is the caller's at this request (RolesGuard and the
 *   authorization context, revalidated in the base); the profile follows the
 *   role: the Farmer gets only the estimate (EST-D-05).
 */
@Injectable()
export class EstimationReadsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collective: CollectiveConfig,
    private readonly series: ConsumptionSeriesUseCase,
  ) {}

  async run(tenantId: string, runId: string) {
    this.requirePolicy();
    const run = await this.prisma.estimationRun.findFirst({
      where: { id: runId, tenantId },
      include: { targetCampaign: { select: CAMPAIGN }, season: true, results: { include: RESULT_INCLUDE } },
    });
    if (!run) throw new NotFoundException("RUN_NOT_FOUND");
    const reading = new Reading(this.prisma, this.series, tenantId, await this.chain(tenantId, run.targetCampaignId));
    const results = [];
    for (const result of sortResults(run.results)) results.push(await reading.detail(run, result));
    return {
      ...summaryOf(run),
      parameters: run.parameters,
      disclosure: { mode: run.disclosureMode, policy: run.policy, threshold: run.threshold },
      results,
    };
  }

  /**
   * Earlier runs of the tenant (RN-27), optionally of one target, newest
   * first (`generatedAt`, then `id`), failed and superseded ones included.
   * The cursor is opaque: it encodes the last run of the page. A summary has
   * no figures nor validity; the detail of each run carries them.
   */
  async list(tenantId: string, query: { targetCampaignId?: string; limit?: number; cursor?: string }) {
    this.requirePolicy();
    if (query.targetCampaignId) {
      const target = await this.prisma.agriculturalCampaign.findFirst({ where: { id: query.targetCampaignId, tenantId }, select: { id: true } });
      if (!target) throw new NotFoundException("TARGET_CAMPAIGN_NOT_FOUND");
    }
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const limit = query.limit ?? 20;
    const rows = await this.prisma.estimationRun.findMany({
      where: {
        tenantId,
        ...(query.targetCampaignId ? { targetCampaignId: query.targetCampaignId } : {}),
        ...(after ? { OR: [{ generatedAt: { lt: after.generatedAt } }, { generatedAt: after.generatedAt, id: { lt: after.id } }] } : {}),
      },
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { targetCampaign: { select: CAMPAIGN }, season: true, results: { select: { status: true } } },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      contract_version: 1,
      items: page.map(summaryOf),
      next_cursor: rows.length > limit && last ? encodeCursor(last.generatedAt, last.id) : null,
    };
  }

  /**
   * CU-21: per product and unit, the result of the latest CALCULATED run of
   * the target that includes it; without one, that of the latest run (a
   * FAILED one, NOT_USABLE). A later failed run never hides a usable result.
   */
  async results(principal: AuthenticatedPrincipal, targetCampaignId: string) {
    this.requirePolicy();
    const target = await this.prisma.agriculturalCampaign.findFirst({ where: { id: targetCampaignId, tenantId: principal.tenantId }, select: CAMPAIGN });
    if (!target) throw new NotFoundException("TARGET_CAMPAIGN_NOT_FOUND");
    const classification = await this.prisma.campaignSeasonClassification.findFirst({
      where: { tenantId: principal.tenantId, campaignId: target.id, nextClassification: { is: null }, seasonId: { not: null } },
      select: { season: true },
    });
    const chain = await this.chain(principal.tenantId, target.id);
    const chosen = new Map<string, ChainRun>();
    for (const outcome of ["FAILED", "CALCULATED"] as const) {
      for (const run of chain) if (run.outcome === outcome) for (const key of run.keys) chosen.set(key, run);
    }
    const reading = new Reading(this.prisma, this.series, principal.tenantId, chain);
    const farmer = principal.role === UserRole.AGRICULTOR;
    const results = [];
    const runs = new Map<string, Awaited<ReturnType<typeof this.loadRun>>>();
    for (const key of [...chosen.keys()].sort(byCodeUnits)) {
      const runId = chosen.get(key)!.id;
      if (!runs.has(runId)) runs.set(runId, await this.loadRun(runId));
      const run = runs.get(runId)!;
      const result = run.results.find((r) => `${r.canonicalProductId}|${r.baseUnit}` === key)!;
      const summary = await reading.summary(run, result);
      // EST-D-05: the Farmer gets the estimate, never the naive baseline nor the coverage.
      results.push(
        farmer
          ? {
              product: summary.product,
              base_unit: summary.base_unit,
              presentation_unit: summary.presentation_unit,
              status: summary.status,
              reason_code: summary.reason_code,
              method: summary.method,
              run_ref: summary.run_ref,
              generated_at: summary.generated_at,
              span_length: summary.span_length,
              estimate_base: summary.estimate_base,
              validity: summary.validity,
              validity_reason: summary.validity_reason,
            }
          : summary,
      );
    }
    return {
      contract_version: 1,
      profile: farmer ? ("FARMER" as const) : ("INSTITUTIONAL" as const),
      scope: { tenant_ref: principal.tenantId },
      target: campaignRefOf(target),
      season: classification?.season ? seasonRefOf(classification.season) : null,
      evaluated_at: new Date().toISOString(),
      results,
      notice: NOTICE,
    };
  }

  /**
   * RF-40 (contract §9): the copy to read offline. It is `results` itself —
   * same selection, profile, policy and authorization at this request — with
   * the identity that downloads (`subject`), the server time of the download,
   * the validity each result had at that moment and the rules of the copy.
   * It carries no series point, contribution nor private figure; the Farmer
   * profile has neither the naive baseline nor the coverage. The copy is not
   * a current authorization: offline, the client knows no revocation nor
   * change of sources (`may_be_outdated`).
   */
  async download(principal: AuthenticatedPrincipal, targetCampaignId: string) {
    const read = await this.results(principal, targetCampaignId);
    return {
      contract_version: 1,
      kind: "ESTIMATION_DOWNLOAD" as const,
      profile: read.profile,
      scope: read.scope,
      subject: { member_ref: principal.memberId, role: principal.role },
      downloaded_at: read.evaluated_at,
      target: read.target,
      season: read.season,
      results: read.results.map(({ validity, ...result }) => ({ ...result, validity_at_download: validity })),
      may_be_outdated: true as const,
      notice: read.notice,
      storage: {
        backup: "EXCLUDED_FROM_PRIVATE_BACKUP" as const,
        discard_on: ["IDENTITY_CHANGE", "SIGN_OUT"] as const,
        replace_only_with: "NEWER_SAME_SUBJECT_AND_SCOPE" as const,
      },
    };
  }

  /**
   * E3 (proposal estimation link): the validity facts of §8 for every result
   * of one run, derived exactly as `run()` and `results()` derive them (the
   * same `Reading.facts`), so that a caller can tell whether a result is
   * outdated even when it has no figure (an INSUFFICIENT_DATA whose sources
   * changed). Nothing is written and no figure F12 would withhold is
   * delivered: `estimate_base` is null when the result has no figure, when a
   * source was withdrawn or when the policy is pending. Null when the run is
   * not of this tenant. It does not refuse under POLICY_PENDING: the caller
   * decides, and gets no figure.
   */
  async resultFacts(tenantId: string, runId: string) {
    const run = await this.prisma.estimationRun.findFirst({
      where: { id: runId, tenantId },
      include: { targetCampaign: { select: CAMPAIGN }, season: true, results: { include: RESULT_INCLUDE } },
    });
    if (!run) return null;
    const chain = await this.chain(tenantId, run.targetCampaignId);
    const reading = new Reading(this.prisma, this.series, tenantId, chain);
    const pending = this.collective.mode === "POLICY_PENDING";
    const index = chain.findIndex((r) => r.id === run.id);
    const results = [];
    for (const result of sortResults(run.results)) {
      const { facts } = await reading.facts(run, result);
      const { validity, reason } = deriveValidity(facts);
      const withheld = pending || figuresWithheld(facts);
      results.push({
        product_ref: result.canonicalProductId,
        base_unit: result.baseUnit,
        status: result.status,
        reason_code: result.reasonCode,
        estimate_base: result.estimateBase && !withheld ? result.estimateBase.toFixed(6) : null,
        validity,
        validity_reason: reason,
        facts,
      });
    }
    return {
      run: {
        ...summaryOf(run),
        disclosure: { mode: run.disclosureMode, policy: run.policy, threshold: run.threshold },
      },
      /** A later CALCULATED run exists in the chain of the same target (whatever products it includes). */
      later_calculated_run: chain.slice(index + 1).some((r) => r.outcome === "CALCULATED"),
      policy_pending: pending,
      results,
    };
  }

  /** E3: the latest CALCULATED run of the chain of a target, or null. */
  async latestCalculatedRunId(tenantId: string, targetCampaignId: string): Promise<string | null> {
    const chain = await this.chain(tenantId, targetCampaignId);
    const calculated = chain.filter((r) => r.outcome === "CALCULATED");
    return calculated.length > 0 ? calculated[calculated.length - 1]!.id : null;
  }

  private requirePolicy() {
    if (this.collective.mode === "POLICY_PENDING") throw new ConflictException("POLICY_PENDING");
  }

  private loadRun(runId: string) {
    return this.prisma.estimationRun.findUniqueOrThrow({ where: { id: runId }, include: { results: { include: RESULT_INCLUDE } } });
  }

  /** The runs of a target in the order of their chain (root first), with the results each includes. */
  private async chain(tenantId: string, targetCampaignId: string): Promise<ChainRun[]> {
    const runs = await this.prisma.estimationRun.findMany({
      where: { tenantId, targetCampaignId },
      select: {
        id: true,
        previousRunId: true,
        outcome: true,
        generatedAt: true,
        seasonId: true,
        targetClassificationId: true,
        results: { select: { canonicalProductId: true, baseUnit: true } },
      },
    });
    const next = new Map(runs.filter((r) => r.previousRunId).map((r) => [r.previousRunId!, r]));
    const ordered: ChainRun[] = [];
    for (let run = runs.find((r) => r.previousRunId === null); run; run = next.get(run.id)) {
      ordered.push({ ...run, keys: new Set(run.results.map((r) => `${r.canonicalProductId}|${r.baseUnit}`)) });
    }
    return ordered;
  }
}

/** One reading: the facts of each result, computed once per request. */
class Reading {
  private readonly hashes = new Map<string, string | null>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly series: ConsumptionSeriesUseCase,
    private readonly tenantId: string,
    private readonly chain: ChainRun[],
  ) {}

  async summary(run: { id: string; outcome: string; method: string; generatedAt: Date; seasonId: string; targetClassificationId: string }, result: StoredResult) {
    const { facts } = await this.facts(run, result);
    const { validity, reason } = deriveValidity(facts);
    const withheld = figuresWithheld(facts);
    const campaigns = spanPoints(result).map((p) => ({ campaign_ref: p.campaignId, coverage: coverageViewOf(p.sourceSeal?.consumptionCoverage, p.sourceSealId !== null) }));
    return {
      product: { product_ref: result.canonicalProduct.id, name: result.canonicalProduct.name },
      base_unit: result.baseUnit,
      presentation_unit: presentationUnitOf(result.baseUnit),
      status: result.status,
      reason_code: result.reasonCode,
      method: run.method,
      run_ref: run.id,
      generated_at: run.generatedAt.toISOString(),
      span_length: spanLength(result),
      estimate_base: result.estimateBase && !withheld ? result.estimateBase.toFixed(6) : null,
      naive_base: result.naiveBase !== null && !withheld ? result.naiveBase.toString() : null,
      coverage: {
        status: campaigns.length > 0 && campaigns.every((c) => c.coverage.status === "IDENTIFIED") ? ("IDENTIFIED" as const) : ("UNKNOWN" as const),
        campaigns,
      },
      validity,
      validity_reason: reason,
    };
  }

  async detail(run: { id: string; outcome: string; method: string; generatedAt: Date; seasonId: string; targetClassificationId: string }, result: StoredResult) {
    const { facts, visible } = await this.facts(run, result);
    const { validity, reason } = deriveValidity(facts);
    const withheld = figuresWithheld(facts);
    const points = result.series?.points ?? [];
    const exclusions = new Map(((result.exclusions as { position: number; reason: string }[]) ?? []).map((e) => [e.position, e.reason]));
    const first = result.spanFirstPosition;
    const last = result.spanLastPosition;
    const at = (position: number | null) => points.find((p) => p.position === position);
    return {
      product: { product_ref: result.canonicalProduct.id, name: result.canonicalProduct.name },
      base_unit: result.baseUnit,
      presentation_unit: presentationUnitOf(result.baseUnit),
      status: result.status,
      reason_code: result.reasonCode,
      method: run.method,
      run_ref: run.id,
      generated_at: run.generatedAt.toISOString(),
      span_length: spanLength(result),
      estimate_base: result.estimateBase && !withheld ? result.estimateBase.toFixed(6) : null,
      naive_base: result.naiveBase !== null && !withheld ? result.naiveBase.toString() : null,
      alpha: result.alpha && !withheld ? result.alpha.toFixed(2) : null,
      fit_informative: withheld ? null : result.fitInformative,
      fit_criterion: result.fitCriterion && !withheld ? result.fitCriterion.toFixed(6) : null,
      span:
        first !== null && last !== null && at(first) && at(last)
          ? { first_position: first, last_position: last, length: last - first + 1, first_campaign_ref: at(first)!.campaignId, last_campaign_ref: at(last)!.campaignId }
          : null,
      series: result.series
        ? { series_ref: result.series.id, version: result.series.version, source_hash: result.series.sourceHash, built_at: result.series.builtAt.toISOString() }
        : null,
      points: points.map((p) => {
        const shown = p.kind === "VERIFIED_CONSUMPTION" && !visible.has(p.position) ? "HIDDEN" : p.kind;
        return {
          position: p.position,
          campaign: campaignRefOf(p.campaign),
          kind: shown,
          quantity_base: shown === "VERIFIED_CONSUMPTION" ? p.quantityBase!.toString() : null,
          seal_ref: p.sourceSealId,
          classification_ref: p.classificationId,
          coverage: coverageViewOf(p.sourceSeal?.consumptionCoverage, p.sourceSealId !== null),
          in_span: first !== null && last !== null && p.position >= first && p.position <= last,
          exclusion_reason: exclusions.get(p.position) ?? null,
        };
      }),
      validations: result.validations,
      metrics: null,
      validity,
      validity_reason: reason,
    };
  }

  /** The facts of §8 for one result, and which verified positions are still disclosed. */
  async facts(
    run: { id: string; outcome: string; seasonId: string; targetClassificationId: string },
    result: StoredResult,
  ): Promise<{ facts: ValidityFacts; visible: Set<number> }> {
    const key = `${result.canonicalProductId}|${result.baseUnit}`;
    const index = this.chain.findIndex((r) => r.id === run.id);
    const later = this.chain.slice(index + 1).some((r) => r.outcome === "CALCULATED" && r.keys.has(key));
    const visible = new Set<number>();
    const points = result.series?.points ?? [];
    for (const point of points) {
      if (point.kind === "VERIFIED_CONSUMPTION" && (await this.stillDisclosed(point, result))) visible.add(point.position);
    }
    const sourcesWithdrawn = spanPoints(result).some((p) => p.kind === "VERIFIED_CONSUMPTION" && !visible.has(p.position));
    const targetCurrent = await this.prisma.campaignSeasonClassification.count({ where: { id: run.targetClassificationId, nextClassification: { is: null } } });
    const classificationCorrected = targetCurrent === 0 || points.some((p) => p.classification.nextClassification !== null);
    const sourcesChanged = result.series ? (await this.currentHash(result.canonicalProductId, result.series.seasonId)) !== result.series.sourceHash : false;
    return {
      facts: {
        runFailed: run.outcome === "FAILED",
        hasFigure: result.status === "ESTIMATED",
        laterCalculatedRunIncludesIt: later,
        sourcesWithdrawn,
        classificationCorrected,
        sourcesChanged,
      },
      visible,
    };
  }

  /** The sealed entry of a verified point is still DISCLOSED and visible (E4 §3.4: without a count of contributors). */
  private async stillDisclosed(point: StoredPoint, result: StoredResult): Promise<boolean> {
    if (!point.sourceSealId || !point.sourceReleaseId) return false;
    const entry = await this.prisma.collectiveSealEntry.findUnique({
      where: {
        sealId_projectionType_canonicalProductId_baseUnit: {
          sealId: point.sourceSealId,
          projectionType: "CONSUMPTION_TOTAL",
          canonicalProductId: result.canonicalProductId,
          baseUnit: result.baseUnit,
        },
      },
      select: { status: true, releaseId: true, visibilityWithdrawnAt: true, release: { select: { withdrawnAt: true } } },
    });
    return (
      !!entry &&
      entry.status === "DISCLOSED" &&
      entry.visibilityWithdrawnAt === null &&
      entry.releaseId === point.sourceReleaseId &&
      !!entry.release &&
      entry.release.withdrawnAt === null
    );
  }

  /** EST-D-12: the hash the series of this scope would have if it were built now. */
  private async currentHash(productId: string, seasonId: string): Promise<string | null> {
    const key = `${productId}|${seasonId}`;
    if (!this.hashes.has(key)) {
      const current = await this.series.currentSources(this.prisma, this.tenantId, seasonId, productId);
      this.hashes.set(key, "sourceHash" in current ? current.sourceHash : null);
    }
    return this.hashes.get(key)!;
  }
}

/** The part of a run that `RunSummary` and `Run` share. */
function summaryOf(run: {
  id: string;
  jobId: string;
  tenantId: string;
  requestedByRole: string;
  targetCampaign: Parameters<typeof campaignRefOf>[0];
  season: Parameters<typeof seasonRefOf>[0];
  targetClassificationId: string;
  method: string;
  methodVersion: string;
  outcome: string;
  failureCode: string | null;
  previousRunId: string | null;
  contentHash: string;
  generatedAt: Date;
  results: { status: string }[];
}) {
  const count = (status: string) => run.results.filter((r) => r.status === status).length;
  return {
    contract_version: 1,
    run_ref: run.id,
    job_ref: run.jobId,
    scope: { tenant_ref: run.tenantId },
    requested_by_role: run.requestedByRole,
    target: campaignRefOf(run.targetCampaign),
    season: seasonRefOf(run.season),
    target_classification_ref: run.targetClassificationId,
    method: run.method,
    method_version: run.methodVersion,
    outcome: run.outcome,
    failure_code: run.failureCode,
    previous_run_ref: run.previousRunId,
    content_hash: run.contentHash,
    generated_at: run.generatedAt.toISOString(),
    counts: {
      estimated: count("ESTIMATED"),
      insufficient_data: count("INSUFFICIENT_DATA"),
      incompatible_data: count("INCOMPATIBLE_DATA"),
      calculation_failed: count("CALCULATION_FAILED"),
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodeCursor(generatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([generatedAt.toISOString(), id]), "utf8").toString("base64url");
}

/** A cursor this route did not issue is a bad request, never a silent first page. */
function decodeCursor(cursor: string): { generatedAt: Date; id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string" && UUID.test(parsed[1])) {
    const generatedAt = new Date(parsed[0]);
    if (!Number.isNaN(generatedAt.getTime()) && generatedAt.toISOString() === parsed[0]) return { generatedAt, id: parsed[1] };
  }
  throw new BadRequestException(["cursor inválido"]);
}

function spanPoints(result: StoredResult): StoredPoint[] {
  const first = result.spanFirstPosition;
  const last = result.spanLastPosition;
  if (first === null || last === null) return [];
  return (result.series?.points ?? []).filter((p) => p.position >= first && p.position <= last);
}

function spanLength(result: { spanFirstPosition: number | null; spanLastPosition: number | null }): number | null {
  return result.spanFirstPosition === null || result.spanLastPosition === null ? null : result.spanLastPosition - result.spanFirstPosition + 1;
}

function sortResults<T extends { canonicalProductId: string; baseUnit: string }>(results: T[]): T[] {
  return [...results].sort((a, b) => (`${a.canonicalProductId}|${a.baseUnit}` < `${b.canonicalProductId}|${b.baseUnit}` ? -1 : 1));
}
