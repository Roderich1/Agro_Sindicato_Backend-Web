import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Prisma, SyncV1BaseUnit, UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { clearInterval, setInterval } from "node:timers";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { PROVISIONAL_THRESHOLD } from "../../collective/domain/disclosure-policy";
import { baseUnitForCentralUnit } from "../../sync-v1/domain/units";
import { ResultContent, runContentHash } from "../domain/run-content";
import { SpanAssessment } from "../domain/series";
import { estimateSesNaive, SES_NAIVE_METHOD, SES_NAIVE_METHOD_VERSION, SES_NAIVE_PARAMETERS } from "../domain/ses-naive";
import { ConsumptionSeriesUseCase } from "./consumption-series.use-case";
import { EstimationConfig } from "./estimation-config";

type Tx = Prisma.TransactionClient;
type StopCode = "REQUESTER_NOT_AUTHORIZED" | "POLICY_PENDING" | "TARGET_CAMPAIGN_NOT_ELIGIBLE";
type FailureCode = "CALCULATION_FAILED" | "RETRIES_EXHAUSTED";

/** A job this worker owns for one attempt (the fencing token is `attempt`). */
export interface ClaimedJob {
  id: string;
  tenantId: string;
  targetCampaignId: string;
  requestedByUserId: string;
  requestedByRole: UserRole;
  productRefs: string[] | null;
  attempt: number;
  maxAttempts: number;
}

/**
 * How carrying a job ended for this worker:
 * - COMPLETED: its run is registered (CALCULATED or FAILED);
 * - NOT_EXECUTED: stopped before calculating, without a run (EST-D-15);
 * - LOST: the worker no longer owns the job (its lease expired or another
 *   worker took a newer attempt); it wrote nothing.
 */
export type CarryOutcome =
  | { jobId: string; status: "COMPLETED"; runId: string; outcome: "CALCULATED" | "FAILED"; attempt: number }
  | { jobId: string; status: "NOT_EXECUTED"; stopCode: StopCode; attempt: number }
  | { jobId: string; status: "LOST"; attempt: number };

const POLICY = "F07-POL-01";
const ELIGIBLE = ["PLANIFICADA", "ABIERTA"];

/**
 * F12-EST-05 (#178; contract §4.2, EST-D-04, EST-D-15, EST-D-16): the batch
 * worker, a provider of the Backend itself with no queue platform.
 * - It takes the oldest QUEUED job, or a RUNNING one whose lease expired with
 *   attempts left, in one statement with FOR UPDATE SKIP LOCKED.
 * - Before calculating it checks, in this order, the requester's permission,
 *   the policy and the target campaign; a stop ends the job NOT_EXECUTED
 *   with what it observed, without a run, and is never retried.
 * - It reads the sources, builds or reuses the series, reads the span, runs
 *   SES/naive and registers the run, its results and COMPLETED in one
 *   transaction, while it still owns the job: the row is locked and must
 *   still be RUNNING with this attempt and a live lease (the base checks the
 *   same at the run's insert).
 * - Transient errors (connection, serialization or deadlock, a succession
 *   conflict, a concurrent correction) retake the job with one more attempt,
 *   up to its maximum; then the run is FAILED with RETRIES_EXHAUSTED. A
 *   deterministic error is FAILED with CALCULATION_FAILED. A product whose
 *   calculation fails is CALCULATION_FAILED in a CALCULATED run.
 * Nothing here writes to inventories, needs, proposals or purchases.
 */
@Injectable()
export class EstimationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EstimationWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: EstimationConfig,
    private readonly collective: CollectiveConfig,
    private readonly series: ConsumptionSeriesUseCase,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.workerEnabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (await this.processNext()) {
        /* one job after another while there are any */
      }
    } catch (error) {
      this.logger.error(`[F12 WORKER] ${String(error)}`);
    } finally {
      this.busy = false;
    }
  }

  /** Takes one job and carries it to its end; null when there is nothing to take. */
  async processNext(): Promise<CarryOutcome | null> {
    const claimed = await this.claim();
    if (claimed) return this.carry(claimed);
    return this.closeExhausted();
  }

  /** The claim of the contract (§4.2): one statement, oldest first, skipping locked rows. */
  async claim(): Promise<ClaimedJob | null> {
    const rows = await this.prisma.$queryRaw<RawJob[]>`
      UPDATE "EstimationJob"
      SET "status" = 'RUNNING', "attempts" = "attempts" + 1, "startedAt" = clock_timestamp(),
          "leaseExpiresAt" = clock_timestamp() + (${this.config.leaseMs}::int * interval '1 millisecond')
      WHERE "id" = (
        SELECT "id" FROM "EstimationJob"
        WHERE "status" = 'QUEUED'
           OR ("status" = 'RUNNING' AND "leaseExpiresAt" < clock_timestamp() AND "attempts" < "maxAttempts")
        ORDER BY "enqueuedAt", "id"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "tenantId", "targetCampaignId", "requestedByUserId", "requestedByRole", "productRefs", "attempts", "maxAttempts"`;
    return rows[0] ? claimedOf(rows[0]) : null;
  }

  /** Carries a claimed job, retaking it after transient errors while attempts are left. */
  async carry(job: ClaimedJob): Promise<CarryOutcome> {
    let current = job;
    for (;;) {
      try {
        return await this.attempt(current);
      } catch (error) {
        if (!isTransient(error)) {
          this.logger.warn(`[F12 WORKER] job=${current.id} attempt=${current.attempt} deterministic error: ${messageOf(error)}`);
          return this.fail(current, "CALCULATION_FAILED");
        }
        this.logger.warn(`[F12 WORKER] job=${current.id} attempt=${current.attempt} transient error: ${messageOf(error)}`);
        if (current.attempt >= current.maxAttempts) return this.fail(current, "RETRIES_EXHAUSTED");
        const retaken = await this.retake(current);
        if (!retaken) return { jobId: current.id, status: "LOST", attempt: current.attempt };
        current = retaken;
      }
    }
  }

  /** A job whose last attempt's lease expired: its calculation started and did not finish. */
  private async closeExhausted(): Promise<CarryOutcome | null> {
    const rows = await this.prisma.$queryRaw<RawJob[]>`
      SELECT "id", "tenantId", "targetCampaignId", "requestedByUserId", "requestedByRole", "productRefs", "attempts", "maxAttempts"
      FROM "EstimationJob"
      WHERE "status" = 'RUNNING' AND "leaseExpiresAt" < clock_timestamp() AND "attempts" >= "maxAttempts"
      ORDER BY "enqueuedAt", "id"
      LIMIT 1`;
    if (!rows[0]) return null;
    return this.fail(claimedOf(rows[0]), "RETRIES_EXHAUSTED");
  }

  private async retake(job: ClaimedJob): Promise<ClaimedJob | null> {
    const rows = await this.prisma.$queryRaw<RawJob[]>`
      UPDATE "EstimationJob"
      SET "attempts" = "attempts" + 1, "startedAt" = clock_timestamp(),
          "leaseExpiresAt" = clock_timestamp() + (${this.config.leaseMs}::int * interval '1 millisecond')
      WHERE "id" = ${job.id}::uuid AND "status" = 'RUNNING' AND "attempts" = ${job.attempt} AND "attempts" < "maxAttempts"
      RETURNING "id", "tenantId", "targetCampaignId", "requestedByUserId", "requestedByRole", "productRefs", "attempts", "maxAttempts"`;
    return rows[0] ? claimedOf(rows[0]) : null;
  }

  /** One attempt, in one transaction that holds the job's row while it owns it. */
  private async attempt(job: ClaimedJob): Promise<CarryOutcome> {
    return this.prisma.$transaction(
      async (tx) => {
        if (!(await this.own(tx, job, true))) return { jobId: job.id, status: "LOST", attempt: job.attempt };
        const observed = await this.observe(tx, job);
        const stop = stopOf(job, observed);
        if (stop) return this.stopJob(tx, job, stop, observed);
        const target = observed.target!;

        const products = job.productRefs ?? (await this.defaultProducts(tx, job.tenantId, target.seasonId));
        const results: ResultRow[] = [];
        for (const productId of [...products].sort()) {
          const row = await this.resultFor(tx, job.tenantId, target, productId);
          if (row) results.push(row);
        }
        const runId = await this.register(tx, job, target, "CALCULATED", null, results);
        return { jobId: job.id, status: "COMPLETED", runId, outcome: "CALCULATED", attempt: job.attempt };
      },
      { maxWait: 10000, timeout: 120000 },
    );
  }

  /**
   * Registers a FAILED run without figures (RN-27): CALCULATION_FAILED, or
   * RETRIES_EXHAUSTED once the attempts are spent. A stop observed now
   * still wins: without permission there is no run at all.
   */
  private async fail(job: ClaimedJob, code: FailureCode): Promise<CarryOutcome> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (!(await this.own(tx, job, code !== "RETRIES_EXHAUSTED"))) return { jobId: job.id, status: "LOST", attempt: job.attempt } as const;
          const observed = await this.observe(tx, job);
          const stop = stopOf(job, observed);
          if (stop) return this.stopJob(tx, job, stop, observed);
          const target = observed.target!;
          const products = job.productRefs ?? (await this.defaultProducts(tx, job.tenantId, target.seasonId));
          const results: ResultRow[] = [];
          for (const productId of [...products].sort()) {
            const product = await tx.product.findFirst({ where: { id: productId, tenantId: job.tenantId }, select: { unit: true } });
            const baseUnit = product ? baseUnitForCentralUnit(product.unit) : null;
            if (!baseUnit) continue;
            results.push(noFigure(productId, baseUnit, null, "CALCULATION_FAILED", "CALCULATION_ERROR", null, []));
          }
          const runId = await this.register(tx, job, target, "FAILED", code, results);
          return { jobId: job.id, status: "COMPLETED", runId, outcome: "FAILED", attempt: job.attempt } as const;
        },
        { maxWait: 10000, timeout: 60000 },
      );
    } catch (error) {
      // Nothing was written; the lease will expire and the job be taken again.
      this.logger.error(`[F12 WORKER] job=${job.id} could not register ${code}: ${messageOf(error)}`);
      return { jobId: job.id, status: "LOST", attempt: job.attempt };
    }
  }

  /** Locks the job's row and checks it is still this worker's attempt. */
  private async own(tx: Tx, job: ClaimedJob, leaseRequired: boolean): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "EstimationJob"
      WHERE "id" = ${job.id}::uuid AND "status" = 'RUNNING' AND "attempts" = ${job.attempt}
        AND (${!leaseRequired}::boolean OR "leaseExpiresAt" > clock_timestamp())
      FOR UPDATE`;
    return rows.length === 1;
  }

  private async observe(tx: Tx, job: ClaimedJob): Promise<Observed> {
    const member = await tx.member.findFirst({
      where: { tenantId: job.tenantId, userId: job.requestedByUserId },
      select: { isActive: true, role: true, user: { select: { isActive: true } } },
    });
    const campaign = await tx.agriculturalCampaign.findFirst({
      where: { id: job.targetCampaignId, tenantId: job.tenantId },
      select: { id: true, status: true, startDate: true },
    });
    const classification = await tx.campaignSeasonClassification.findFirst({
      where: { tenantId: job.tenantId, campaignId: job.targetCampaignId, nextClassification: { is: null }, seasonId: { not: null } },
      select: { id: true, seasonId: true },
    });
    return {
      evidence: {
        observed_at: new Date().toISOString(),
        member_active: member ? member.isActive : false,
        account_active: member ? member.user.isActive : null,
        role: member ? member.role : null,
        campaign_status: campaign ? campaign.status : null,
        classified: classification !== null,
        disclosure_mode: this.collective.mode,
      },
      target:
        campaign && classification
          ? { campaignId: campaign.id, startDate: campaign.startDate, classificationId: classification.id, seasonId: classification.seasonId! }
          : null,
    };
  }

  private async stopJob(tx: Tx, job: ClaimedJob, stopCode: StopCode, observed: Observed): Promise<CarryOutcome> {
    await tx.estimationJob.update({
      where: { id: job.id },
      data: { status: "NOT_EXECUTED", finishedAt: new Date(), leaseExpiresAt: null, stopCode, stopEvidence: observed.evidence as Prisma.InputJsonValue },
    });
    this.logger.log(`[F12 WORKER] job=${job.id} NOT_EXECUTED ${stopCode}`);
    return { jobId: job.id, status: "NOT_EXECUTED", stopCode, attempt: job.attempt };
  }

  /**
   * Without `product_refs`: the canonical estimable products with consumption
   * published in a sealed campaign of the target's season (contract §4.2).
   */
  private async defaultProducts(tx: Tx, tenantId: string, seasonId: string): Promise<string[]> {
    const entries = await tx.collectiveSealEntry.findMany({
      where: {
        projectionType: "CONSUMPTION_TOTAL",
        seal: { tenantId, campaign: { seasonClassifications: { some: { seasonId, nextClassification: { is: null } } } } },
      },
      select: { canonicalProductId: true },
      distinct: ["canonicalProductId"],
    });
    const canonical = new Set<string>();
    for (const { canonicalProductId } of entries) {
      const association = await tx.productCanonicalAssociation.findFirst({
        where: { tenantId, productId: canonicalProductId, validTo: null },
        select: { canonicalProductId: true },
      });
      const productId = association?.canonicalProductId ?? canonicalProductId;
      const product = await tx.product.findFirst({ where: { id: productId, tenantId }, select: { unit: true } });
      if (product && baseUnitForCentralUnit(product.unit)) canonical.add(productId);
    }
    return [...canonical].sort().slice(0, this.config.maxProducts);
  }

  /** The result of one product: figures only from a READY span (RN-28). */
  private async resultFor(tx: Tx, tenantId: string, target: Target, productId: string): Promise<ResultRow | null> {
    const assessed = await this.series.assessIn(tx, tenantId, target, productId);
    if ("refused" in assessed) {
      if (!assessed.result) {
        // A product that is no longer canonical or estimable cannot carry a result (the base requires a canonical product).
        this.logger.warn(`[F12 WORKER] product=${productId} skipped: ${assessed.refused}`);
        return null;
      }
      const product = await tx.product.findFirstOrThrow({ where: { id: productId, tenantId }, select: { unit: true } });
      return noFigure(productId, baseUnitForCentralUnit(product.unit)!, null, assessed.result.status, assessed.result.reason, null, [
        { code: "UNITS_COMPATIBLE", passed: assessed.result.reason !== "MIXED_UNITS" },
      ]);
    }
    const { built, assessment } = assessed;
    const unit = built.scope.baseUnit;
    const exclusions = assessment.exclusions.map((e) => ({ position: e.position, campaign_ref: e.campaignId, reason: e.reason }));
    const validations = validationsOf(assessment);
    if (assessment.status !== "READY") {
      return noFigure(productId, unit, built.seriesId, assessment.status, assessment.reason, assessment.span, validations, exclusions);
    }
    try {
      const estimate = estimateSesNaive(assessment);
      return {
        canonicalProductId: productId,
        baseUnit: unit,
        seriesId: built.seriesId,
        status: "ESTIMATED",
        reasonCode: null,
        estimateBase: estimate.estimateBase,
        naiveBase: estimate.naiveBase,
        alpha: estimate.alpha,
        fitInformative: estimate.fitInformative,
        fitCriterion: estimate.fitCriterion,
        spanFirstPosition: estimate.span.firstPosition,
        spanLastPosition: estimate.span.lastPosition,
        exclusions,
        validations,
      };
    } catch (error) {
      this.logger.warn(`[F12 WORKER] product=${productId} calculation failed: ${messageOf(error)}`);
      return noFigure(productId, unit, built.seriesId, "CALCULATION_FAILED", "CALCULATION_ERROR", assessment.span, validations, exclusions);
    }
  }

  /** Inserts the run with its results and completes the job, in the caller's transaction. */
  private async register(tx: Tx, job: ClaimedJob, target: Target, outcome: "CALCULATED" | "FAILED", failureCode: FailureCode | null, results: ResultRow[]) {
    const [previous] = await tx.$queryRaw<{ id: string; generatedAt: Date }[]>`
      SELECT r."id", r."generatedAt" FROM "EstimationRun" r
      WHERE r."tenantId" = ${job.tenantId} AND r."targetCampaignId" = ${job.targetCampaignId}
        AND NOT EXISTS (SELECT 1 FROM "EstimationRun" n WHERE n."previousRunId" = r."id")`;
    const runId = randomUUID();
    const generatedAt = new Date(Math.max(Date.now(), previous?.generatedAt.getTime() ?? 0));
    const disclosure = { disclosureMode: this.collective.mode, policy: POLICY, threshold: PROVISIONAL_THRESHOLD };
    const contentHash = runContentHash(
      {
        run_ref: runId,
        job_ref: job.id,
        job_attempt: job.attempt,
        tenant_ref: job.tenantId,
        requested_by_user_ref: job.requestedByUserId,
        requested_by_role: job.requestedByRole,
        target_campaign_ref: job.targetCampaignId,
        target_classification_ref: target.classificationId,
        season_ref: target.seasonId,
        contract_version: 1,
        method: SES_NAIVE_METHOD,
        method_version: SES_NAIVE_METHOD_VERSION,
        parameters: SES_NAIVE_PARAMETERS,
        horizon: 1,
        disclosure_mode: disclosure.disclosureMode,
        policy: disclosure.policy,
        threshold: disclosure.threshold,
        outcome,
        failure_code: failureCode,
        previous_run_ref: previous?.id ?? null,
        generated_at: generatedAt.toISOString(),
      },
      results.map(resultContentOf),
    );
    await tx.estimationRun.create({
      data: {
        id: runId,
        tenantId: job.tenantId,
        jobId: job.id,
        jobAttempt: job.attempt,
        requestedByUserId: job.requestedByUserId,
        requestedByRole: job.requestedByRole,
        targetCampaignId: job.targetCampaignId,
        seasonId: target.seasonId,
        targetClassificationId: target.classificationId,
        contractVersion: 1,
        method: SES_NAIVE_METHOD,
        methodVersion: SES_NAIVE_METHOD_VERSION,
        parameters: SES_NAIVE_PARAMETERS,
        horizon: 1,
        ...disclosure,
        outcome,
        failureCode,
        previousRunId: previous?.id ?? null,
        contentHash,
        generatedAt,
        results: {
          create: results.map((r) => ({
            ...r,
            exclusions: r.exclusions as Prisma.InputJsonValue,
            validations: r.validations as Prisma.InputJsonValue,
          })),
        },
      },
    });
    await tx.estimationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", finishedAt: new Date(), leaseExpiresAt: null } });
    this.logger.log(`[F12 WORKER] job=${job.id} attempt=${job.attempt} run=${runId} ${outcome}${failureCode ? ` ${failureCode}` : ""} results=${results.length}`);
    return runId;
  }
}

interface RawJob {
  id: string;
  tenantId: string;
  targetCampaignId: string;
  requestedByUserId: string;
  requestedByRole: UserRole;
  productRefs: unknown;
  attempts: number;
  maxAttempts: number;
}

interface Target {
  campaignId: string;
  startDate: Date;
  classificationId: string;
  seasonId: string;
}

interface Observed {
  evidence: {
    observed_at: string;
    member_active: boolean | null;
    account_active: boolean | null;
    role: UserRole | null;
    campaign_status: string | null;
    classified: boolean | null;
    disclosure_mode: string;
  };
  target: Target | null;
}

export interface ResultRow {
  canonicalProductId: string;
  baseUnit: SyncV1BaseUnit;
  seriesId: string | null;
  status: "ESTIMATED" | "INSUFFICIENT_DATA" | "INCOMPATIBLE_DATA" | "CALCULATION_FAILED";
  reasonCode: string | null;
  estimateBase?: string;
  naiveBase?: bigint;
  alpha?: string;
  fitInformative?: boolean;
  fitCriterion?: string;
  spanFirstPosition: number | null;
  spanLastPosition: number | null;
  exclusions: unknown[];
  validations: { code: string; passed: boolean }[];
}

function claimedOf(row: RawJob): ClaimedJob {
  return {
    id: row.id,
    tenantId: row.tenantId,
    targetCampaignId: row.targetCampaignId,
    requestedByUserId: row.requestedByUserId,
    requestedByRole: row.requestedByRole,
    productRefs: Array.isArray(row.productRefs) ? (row.productRefs as string[]) : null,
    attempt: row.attempts,
    maxAttempts: row.maxAttempts,
  };
}

/** EST-D-15, in this order: permission, policy, target campaign. */
function stopOf(job: ClaimedJob, observed: Observed): StopCode | null {
  const e = observed.evidence;
  if (!(e.member_active && e.account_active && e.role === job.requestedByRole)) return "REQUESTER_NOT_AUTHORIZED";
  if (e.disclosure_mode === "POLICY_PENDING") return "POLICY_PENDING";
  if (!(e.campaign_status && ELIGIBLE.includes(e.campaign_status) && e.classified)) return "TARGET_CAMPAIGN_NOT_ELIGIBLE";
  return null;
}

function noFigure(
  productId: string,
  baseUnit: SyncV1BaseUnit,
  seriesId: string | null,
  status: Exclude<ResultRow["status"], "ESTIMATED">,
  reasonCode: string,
  span: { firstPosition: number; lastPosition: number } | null,
  validations: ResultRow["validations"],
  exclusions: unknown[] = [],
): ResultRow {
  return {
    canonicalProductId: productId,
    baseUnit,
    seriesId,
    status,
    reasonCode,
    spanFirstPosition: span?.firstPosition ?? null,
    spanLastPosition: span?.lastPosition ?? null,
    exclusions,
    validations,
  };
}

/** What the reading of the span checked, as recorded with the result. */
function validationsOf(assessment: SpanAssessment): ResultRow["validations"] {
  const length = assessment.span?.length ?? 0;
  return [
    { code: "SOURCES_SEALED", passed: true },
    { code: "LAST_RELEVANT_CAMPAIGN_VERIFIED", passed: !(assessment.status === "INSUFFICIENT_DATA" && assessment.reason === "LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED") },
    { code: "MINIMUM_SPAN", passed: length >= 3 },
    { code: "COVERAGE_IDENTIFIED", passed: assessment.status === "READY" },
  ];
}

export function resultContentOf(r: {
  canonicalProductId: string;
  baseUnit: string;
  seriesId: string | null;
  status: string;
  reasonCode: string | null;
  estimateBase?: string | null;
  naiveBase?: bigint | null;
  alpha?: string | null;
  fitInformative?: boolean | null;
  fitCriterion?: string | null;
  spanFirstPosition: number | null;
  spanLastPosition: number | null;
  exclusions: unknown;
  validations: unknown;
  metrics?: unknown;
}): ResultContent {
  return {
    product_ref: r.canonicalProductId,
    base_unit: r.baseUnit,
    series_ref: r.seriesId,
    status: r.status,
    reason_code: r.reasonCode,
    estimate_base: r.estimateBase ?? null,
    naive_base: r.naiveBase === null || r.naiveBase === undefined ? null : r.naiveBase.toString(),
    alpha: r.alpha ?? null,
    fit_informative: r.fitInformative ?? null,
    fit_criterion: r.fitCriterion ?? null,
    span_first_position: r.spanFirstPosition,
    span_last_position: r.spanLastPosition,
    exclusions: r.exclusions,
    validations: r.validations,
    metrics: r.metrics ?? null,
  };
}

/**
 * EST-D-16: errors worth another attempt — lost connection, serialization
 * failure or deadlock, a succession conflict with another run of the same
 * target, or a classification corrected while calculating.
 */
export function isTransient(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034"].includes(error.code)) return true;
    if (error.code === "P2002") {
      const target = JSON.stringify(error.meta ?? {});
      return /previousRunId|one_root/.test(target);
    }
  }
  const text = messageOf(error);
  return /40001|40P01|could not serialize|deadlock detected|versión vigente|no está clasificada/i.test(text);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
