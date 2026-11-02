import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { createIsolatedDatabase, createSession, createSyncV1App, Fixture, seedFixture, TestSession, unusablePasswordHash } from "../../sync-v1/test-support/sync-v1-test-app";
import { ConsumptionSeriesUseCase } from "../application/consumption-series.use-case";
import { EstimationConfig } from "../application/estimation-config";
import { CarryOutcome, EstimationWorker, resultContentOf } from "../application/estimation-worker";
import { runContentHash } from "../domain/run-content";
import { sealedConsumptionCampaigns } from "../test-support/synthetic-sources";
import { shapeErrors } from "../test-support/openapi-shape";

/**
 * F12-EST-05 (#178): jobs, the batch worker, insert-only runs and results,
 * and their reading with derived validity, over PostgreSQL and HTTP.
 *
 * Only synthetic data. The sources are real F07 seals: Sync v1 publications
 * by synthetic farmers, campaign close and the manual seal over the API. The
 * worker does not run on its own here (ESTIMATION_WORKER=disabled): each test
 * drives it explicitly, and concurrent tests coordinate with explicit gates
 * and bounded waits. Every HTTP body is checked against the INT-09 schemas.
 *
 * With F12_DEMO_OUT set, the demonstration is written there as JSON.
 */
const postgresUrl = process.env["F12_EST_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const PUSH = "/api/v1/sync/v1/push";
const ESTIMATION_TABLES = ["ConsumptionSeries", "SeriesPoint", "EstimationJob", "EstimationRun", "EstimationResult"];

interface PointBody {
  campaign: { campaign_ref: string };
  kind: string;
  quantity_base: string | null;
  in_span: boolean;
  exclusion_reason: string | null;
}
interface ResultBody {
  product: { product_ref: string };
  run_ref: string;
  validity: string;
  validity_reason: string | null;
  estimate_base: string | null;
  points: PointBody[];
  [key: string]: unknown;
}
interface Answer {
  status: number;
  body: { job_ref: string; status: string; message: string };
}

describePostgres("F12-EST-05 jobs, runs and results with derived validity", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let collective: CollectiveConfig;
  let config: EstimationConfig;
  let series: ConsumptionSeriesUseCase;
  let worker: EstimationWorker;
  let f: Fixture;
  let director: TestSession;
  let farmer: TestSession;
  let directorUser: string;
  const farmers: Record<string, TestSession> = {};
  const products: Record<string, string> = {};
  const campaigns: Record<string, string> = {};
  const seasons: Record<string, string> = {};
  const classifications: Record<string, string> = {};
  const heads = new Map<string, string>();
  const runs: Record<string, string> = {};
  const demo: Record<string, unknown> = {};

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    process.env["COLLECTIVE_SEALING"] = "enabled";
    process.env["ESTIMATION_WORKER"] = "disabled";
    const url = await createIsolatedDatabase(postgresUrl!, "f12_runs");
    ({ app, prisma, jwt } = await createSyncV1App(url));
    collective = app.get(CollectiveConfig);
    config = app.get(EstimationConfig);
    series = app.get(ConsumptionSeriesUseCase);
    worker = app.get(EstimationWorker);
    f = await seedFixture(prisma);
    directorUser = (await prisma.member.findUniqueOrThrow({ where: { id: f.members.directorA } })).userId;
    director = await createSession(prisma, jwt, f.members.directorA);
    farmer = await createSession(prisma, jwt, f.members.farmerA);
    for (const key of ["F1", "F2", "F3"]) farmers[key] = await person("AGRICULTOR");
    for (const [key, label, unit] of [["Herbicida", "Herbicida estimación", "L"], ["Fungicida", "Fungicida estimación", "L"], ["Pieza", "Pieza estimación", "unidad"]] as const) {
      products[key] = (await prisma.product.create({ data: { tenantId: f.tenantA, name: label, unit } })).id;
    }
    // INVIERNO: the 3.12.5 example in mL (96, 120, 104 and 116 L), sealed over the API; Fungicida only in the last two.
    await sealedCampaign("C1", 2015, [["Herbicida", ["32000", "32000", "32000"]]]);
    await sealedCampaign("C2", 2016, [["Herbicida", ["40000", "40000", "40000"]]]);
    await sealedCampaign("C3", 2017, [["Herbicida", ["34000", "35000", "35000"]], ["Fungicida", ["100", "100", "100"]]]);
    await sealedCampaign("C4", 2018, [["Herbicida", ["38000", "39000", "39000"]], ["Fungicida", ["200", "200", "200"]]]);
    for (const key of ["T1", "T2"]) await plannedCampaign(key, 2019);
    await plannedCampaign("X", 2020);
    for (let i = 1; i <= 12; i += 1) await plannedCampaign(`U${i}`, 2019);
    await plannedCampaign("UN", 2019);
    for (const key of ["INVIERNO", "VERANO", "OTRA"]) await season(key);
    await classify("INVIERNO", ["C1", "C2", "C3", "C4", "T1", "T2"]);
    await classify("VERANO", Array.from({ length: 12 }, (_, i) => `U${i + 1}`));
  }, 300000);

  afterAll(async () => {
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    delete process.env["COLLECTIVE_SEALING"];
    delete process.env["ESTIMATION_WORKER"];
    if (process.env["F12_DEMO_OUT"]) {
      writeFileSync(process.env["F12_DEMO_OUT"], `${JSON.stringify(demo, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`, "utf8");
    }
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });
  const shaped = (schema: string, body: unknown) => expect(shapeErrors(schema, body)).toEqual([]);

  async function person(role: "AGRICULTOR" | "DIRECTIVA", tenantId = f.tenantA): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name: `Persona sintética ${role}`, email: `f12r-${userId}@example.test`, passwordHash: unusablePasswordHash(), role,
        members: { create: { id: memberId, tenantId, role } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function push(farmerKey: string, campaign: string, product: string, quantity: string | null) {
    const key = `${farmerKey}|${campaign}|${product}`;
    const operationId = randomUUID();
    const action = quantity === null ? "CANCEL" : heads.has(key) ? "SUPERSEDE" : "PUBLISH";
    const payload = JSON.stringify({
      contractVersion: 1, operationId, projectionType: "CONSUMPTION_TOTAL", action,
      causal: { predecessorOperationId: heads.get(key) ?? null, reconciliationReference: null },
      payload: { campaign_ref: campaign, product_ref: products[product], base_unit: "ML", ...(quantity === null ? {} : { quantity_base: quantity }) },
    });
    const res = await http().post(PUSH).set("Content-Type", "application/json").set(auth(farmers[farmerKey]!)).send(payload);
    expect(res.body.outcome).toBe("APPLIED");
    heads.set(key, operationId);
  }

  /** A real campaign: open, published by three farmers, closed and sealed over the API. */
  async function sealedCampaign(key: string, year: number, rows: [string, [string, string, string]][]) {
    campaigns[key] = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id: campaigns[key], tenantId: f.tenantA, name: `Campaña sintética ${key}`, status: "ABIERTA", isActive: true, startDate: new Date(`${year}-09-01T00:00:00.000Z`) },
    });
    for (const [product, quantities] of rows) for (const [i, quantity] of quantities.entries()) await push(`F${i + 1}`, campaigns[key], product, quantity);
    expect((await http().post(`/api/v1/campaigns/${campaigns[key]}/close`).set(auth(director)).send({})).status).toBe(200);
    const state = await http().get(`/api/v1/collective/campaigns/${campaigns[key]}/seal`).set(auth(director));
    expect(state.body.can_seal).toBe(true);
    const sealed = await http().post(`/api/v1/collective/campaigns/${campaigns[key]}/seal`).set(auth(director)).send({ confirmed: true, review_ref: state.body.review.review_ref });
    expect(sealed.status).toBe(200);
  }

  async function plannedCampaign(key: string, year: number) {
    campaigns[key] = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id: campaigns[key], tenantId: f.tenantA, name: `Objetivo sintético ${key}`, status: "PLANIFICADA", startDate: new Date(`${year}-09-01T00:00:00.000Z`) },
    });
  }

  async function season(key: string) {
    seasons[key] = (
      await prisma.comparabilitySeason.create({
        data: { tenantId: f.tenantA, key, definition: `Temporada sintética ${key}`, durationDays: 180, createdByUserId: directorUser, createdByRole: "DIRECTIVA" },
      })
    ).id;
  }

  async function classify(seasonKey: string, keys: string[]) {
    for (const key of keys) {
      classifications[key] = (
        await prisma.campaignSeasonClassification.create({
          data: { tenantId: f.tenantA, campaignId: campaigns[key]!, version: 1, seasonId: seasons[seasonKey]!, classifiedByUserId: directorUser, classifiedByRole: "DIRECTIVA" },
        })
      ).id;
    }
  }

  const ask = (session: TestSession, body: Record<string, unknown>) =>
    http().post("/api/v1/estimation/jobs").set(auth(session)).send({ contract_version: 1, request_id: randomUUID(), ...body });
  /** Queues a job over HTTP and returns its reference. */
  async function queue(target: string, productRefs?: string[], session = director): Promise<string> {
    const res = await ask(session, { target_campaign_ref: campaigns[target], ...(productRefs ? { product_refs: productRefs } : {}) });
    expect(res.status).toBe(202);
    shaped("Job", res.body);
    return res.body.job_ref;
  }
  const job = (jobId: string) => prisma.estimationJob.findUniqueOrThrow({ where: { id: jobId }, include: { run: true } });
  const runOf = async (jobId: string) => (await job(jobId)).run!;
  const herbicide = (body: { results: ResultBody[] }): ResultBody => body.results.find((r) => r.product.product_ref === products["Herbicida"])!;
  const workerWith = (leaseMs: number) => new EstimationWorker(prisma, { ...config, leaseMs } as EstimationConfig, collective, series);
  /** Waits, at most `ms`, until the job's lease has expired by the database clock. */
  async function leaseExpired(jobId: string, ms = 5000) {
    const deadline = Date.now() + ms;
    for (;;) {
      const [row] = await prisma.$queryRaw<{ expired: boolean }[]>`SELECT "leaseExpiresAt" < clock_timestamp() AS expired FROM "EstimationJob" WHERE "id" = ${jobId}::uuid`;
      if (row?.expired) return;
      if (Date.now() > deadline) throw new Error("lease did not expire in time");
      await sleep(50);
    }
  }
  /** md5 of every table, to show that only estimation tables change. */
  async function snapshot(): Promise<Map<string, string>> {
    const tables = await prisma.$queryRaw<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`;
    const hashes = new Map<string, string>();
    for (const { name } of tables) {
      const [row] = await prisma.$queryRawUnsafe<{ h: string }[]>(`SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${name}" x`);
      hashes.set(name, row!.h);
    }
    return hashes;
  }
  const changed = (before: Map<string, string>, after: Map<string, string>) => [...after.keys()].filter((name) => before.get(name) !== after.get(name)).sort();
  /** Recomputes `contentHash` from the stored rows (contract §5). */
  async function storedHash(runId: string) {
    const run = await prisma.estimationRun.findUniqueOrThrow({ where: { id: runId }, include: { results: true } });
    return runContentHash(
      {
        run_ref: run.id, job_ref: run.jobId, job_attempt: run.jobAttempt!, tenant_ref: run.tenantId, requested_by_user_ref: run.requestedByUserId,
        requested_by_role: run.requestedByRole, target_campaign_ref: run.targetCampaignId, target_classification_ref: run.targetClassificationId,
        season_ref: run.seasonId, contract_version: run.contractVersion, method: run.method, method_version: run.methodVersion, parameters: run.parameters,
        horizon: run.horizon, disclosure_mode: run.disclosureMode, policy: run.policy, threshold: run.threshold, outcome: run.outcome,
        failure_code: run.failureCode, previous_run_ref: run.previousRunId, generated_at: run.generatedAt.toISOString(),
      },
      run.results.map((r) =>
        resultContentOf({
          ...r,
          estimateBase: r.estimateBase?.toFixed(6) ?? null,
          alpha: r.alpha?.toFixed(2) ?? null,
          fitCriterion: r.fitCriterion?.toFixed(6) ?? null,
        }),
      ),
    );
  }

  it("rejects over HTTP before queuing anything: authentication, role, body, scope, target, products and policy", async () => {
    const target = campaigns["T1"]!;
    expect((await http().post("/api/v1/estimation/jobs").send({ contract_version: 1, request_id: randomUUID(), target_campaign_ref: target })).status).toBe(401);
    const forbidden = await ask(farmer, { target_campaign_ref: target });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ statusCode: 403, message: "No tienes permisos para esta acción", error: "Forbidden" });
    for (const body of [
      { target_campaign_ref: target, tenant_id: f.tenantA },
      { target_campaign_ref: target, contract_version: 2 },
      { target_campaign_ref: "no-es-uuid" },
      { target_campaign_ref: target, product_refs: [] },
    ]) {
      const res = await ask(director, body);
      expect(res.status).toBe(400);
      shaped("Error", res.body);
    }
    const expectCode = async (body: Record<string, unknown>, status: number, message: string) => {
      const res = await ask(director, body);
      expect([res.status, res.body.message]).toEqual([status, message]);
      shaped("Error", res.body);
    };
    await expectCode({ target_campaign_ref: f.campaigns.openB }, 404, "TARGET_CAMPAIGN_NOT_FOUND");
    await expectCode({ target_campaign_ref: randomUUID() }, 404, "TARGET_CAMPAIGN_NOT_FOUND");
    await expectCode({ target_campaign_ref: f.campaigns.closedA }, 422, "TARGET_CAMPAIGN_NOT_ELIGIBLE");
    await expectCode({ target_campaign_ref: campaigns["UN"] }, 422, "TARGET_CAMPAIGN_NOT_CLASSIFIED");
    await expectCode({ target_campaign_ref: target, product_refs: [randomUUID()] }, 404, "PRODUCT_NOT_FOUND");
    await expectCode({ target_campaign_ref: target, product_refs: [f.products.liquidB] }, 404, "PRODUCT_NOT_FOUND");
    await expectCode({ target_campaign_ref: target, product_refs: [products["Pieza"]] }, 422, "PRODUCT_NOT_ESTIMABLE");
    const limit = config.maxProducts;
    (config as { maxProducts: number }).maxProducts = 1;
    try {
      expect((await ask(director, { target_campaign_ref: target, product_refs: [products["Herbicida"], products["Fungicida"]] })).status).toBe(400);
    } finally {
      (config as { maxProducts: number }).maxProducts = limit;
    }
    (collective as { mode: string }).mode = "POLICY_PENDING";
    try {
      await expectCode({ target_campaign_ref: target }, 409, "POLICY_PENDING");
    } finally {
      (collective as { mode: string }).mode = "PROVISIONAL_SYNTHETIC";
    }
    expect(await prisma.estimationJob.count()).toBe(0);
    expect(await prisma.estimationRun.count()).toBe(0);
  });

  it("carries the whole path: F07 seals → series → span → SES/naive → stored run → reading by profile", async () => {
    const before = await snapshot();
    const queued = await ask(director, { target_campaign_ref: campaigns["T1"] });
    expect(queued.status).toBe(202);
    shaped("Job", queued.body);
    expect(queued.body).toMatchObject({ status: "QUEUED", attempts: 0, max_attempts: 3, product_refs: null, run_ref: null, requested_by_role: "DIRECTIVA" });
    const jobId = queued.body.job_ref as string;
    // Nothing is calculated in the request.
    expect(await prisma.estimationRun.count()).toBe(0);

    const outcome = await worker.processNext();
    expect(outcome).toMatchObject({ jobId, status: "COMPLETED", outcome: "CALCULATED", attempt: 1 });
    const state = await http().get(`/api/v1/estimation/jobs/${jobId}`).set(auth(director));
    shaped("Job", state.body);
    expect(state.body).toMatchObject({ status: "COMPLETED", attempts: 1, stop_code: null, stop_evidence: null, run_ref: expect.any(String) });
    runs["T1a"] = state.body.run_ref;

    const detail = await http().get(`/api/v1/estimation/runs/${runs["T1a"]}`).set(auth(director));
    expect(detail.status).toBe(200);
    shaped("Run", detail.body);
    expect(detail.body).toMatchObject({
      outcome: "CALCULATED", failure_code: null, previous_run_ref: null, method: "SES_NAIVE", method_version: "F12-EST-04/1",
      season: { season_ref: seasons["INVIERNO"], key: "INVIERNO" }, target_classification_ref: classifications["T1"],
      counts: { estimated: 1, insufficient_data: 1, incompatible_data: 0, calculation_failed: 0 },
      disclosure: { mode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", threshold: 3 },
      parameters: { alpha_step: "0.05", tie_tolerance: "1e-9", tie_break: "LARGEST_ALPHA", rounding: "ROUND_HALF_UP", result_scale: 6, horizon: 1 },
    });
    const h = herbicide(detail.body);
    // 3.12.5 in mL: α = 0.50, SES 111 L, naive 116 L.
    expect(h).toMatchObject({
      status: "ESTIMATED", reason_code: null, estimate_base: "111000.000000", naive_base: "116000", alpha: "0.50", fit_informative: true,
      fit_criterion: "116000000.000000", span_length: 4, span: { first_position: 1, last_position: 4, length: 4 }, validity: "CURRENT", validity_reason: null,
    });
    const key = (id: string) => Object.entries(campaigns).find(([, v]) => v === id)![0];
    expect(h.points.map((p) => [key(p.campaign.campaign_ref), p.kind, p.quantity_base, p.in_span, p.exclusion_reason]).sort()).toEqual([
      ["C1", "VERIFIED_CONSUMPTION", "96000", true, null],
      ["C2", "VERIFIED_CONSUMPTION", "120000", true, null],
      ["C3", "VERIFIED_CONSUMPTION", "104000", true, null],
      ["C4", "VERIFIED_CONSUMPTION", "116000", true, null],
      ["T1", "NO_RECORD", null, false, "NOT_BEFORE_TARGET"],
      ["T2", "NO_RECORD", null, false, "NOT_BEFORE_TARGET"],
    ]);
    const fungicide = (detail.body.results as ResultBody[]).find((r) => r.product.product_ref === products["Fungicida"]);
    expect(fungicide).toMatchObject({ status: "INSUFFICIENT_DATA", reason_code: "SPAN_TOO_SHORT", estimate_base: null, naive_base: null, span_length: 2, validity: "NOT_USABLE", validity_reason: "NO_FIGURE" });

    // The stored run matches its content hash, recomputed from its rows.
    const stored = await prisma.estimationRun.findUniqueOrThrow({ where: { id: runs["T1a"] } });
    expect(await storedHash(runs["T1a"]!)).toBe(stored.contentHash);
    expect(stored.jobAttempt).toBe(1);

    const institutional = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T1"]}`).set(auth(director));
    shaped("InstitutionalResults", institutional.body);
    expect(institutional.body.profile).toBe("INSTITUTIONAL");
    expect(herbicide(institutional.body)).toMatchObject({ estimate_base: "111000.000000", naive_base: "116000", validity: "CURRENT", coverage: { status: "IDENTIFIED" } });
    const asFarmer = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T1"]}`).set(auth(farmer));
    shaped("FarmerResults", asFarmer.body);
    expect(asFarmer.body.profile).toBe("FARMER");
    expect(Object.keys(herbicide(asFarmer.body)).sort()).toEqual(
      ["base_unit", "estimate_base", "generated_at", "method", "presentation_unit", "product", "reason_code", "run_ref", "span_length", "status", "validity", "validity_reason"],
    );
    expect(herbicide(asFarmer.body)).toMatchObject({ estimate_base: "111000.000000", validity: "CURRENT" });
    // Only the estimation tables changed: nothing in inventories, needs, proposals or purchases.
    expect(changed(before, await snapshot()).filter((name) => !["AuthSession"].includes(name))).toEqual(ESTIMATION_TABLES.slice().sort());
    demo["full_path"] = { job: state.body, run: detail.body, results_institutional: institutional.body, results_farmer: asFarmer.body };
  });

  it("is idempotent: the same request returns the same job; concurrent repetitions queue one job", async () => {
    const requestId = randomUUID();
    const body = { contract_version: 1, request_id: requestId, target_campaign_ref: campaigns["U1"], product_refs: [products["Herbicida"]] };
    const first = await http().post("/api/v1/estimation/jobs").set(auth(director)).send(body);
    const again = await http().post("/api/v1/estimation/jobs").set(auth(director)).send(body);
    expect([first.status, again.status]).toEqual([202, 200]);
    expect(again.body.job_ref).toBe(first.body.job_ref);
    const reused = await http().post("/api/v1/estimation/jobs").set(auth(director)).send({ ...body, product_refs: [products["Fungicida"]] });
    expect([reused.status, reused.body.message]).toEqual([409, "REQUEST_ID_REUSED"]);

    const concurrent = { ...body, request_id: randomUUID(), target_campaign_ref: campaigns["U2"] };
    const answers: Answer[] = await Promise.all(Array.from({ length: 6 }, () => http().post("/api/v1/estimation/jobs").set(auth(director)).send(concurrent)));
    expect(answers.map((a) => a.status).sort()).toEqual([200, 200, 200, 200, 200, 202]);
    expect(new Set(answers.map((a) => a.body.job_ref)).size).toBe(1);
    expect(await prisma.estimationJob.count({ where: { requestId: concurrent.request_id } })).toBe(1);
    // Processing them gives one run per job, never two.
    while (await worker.processNext()) {
      /* drain */
    }
    for (const jobId of [first.body.job_ref, answers[0]!.body.job_ref]) {
      expect(await prisma.estimationRun.count({ where: { jobId } })).toBe(1);
      const res = await http().post("/api/v1/estimation/jobs").set(auth(director)).send(jobId === first.body.job_ref ? body : concurrent);
      expect([res.status, res.body.status]).toEqual([200, "COMPLETED"]);
    }
    demo["idempotency"] = { statuses: answers.map((a) => a.status), distinct_jobs: 1 };
  });

  it("supersedes with a later calculated run, never with a later failed one", async () => {
    const second = await queue("T1");
    expect(await worker.processNext()).toMatchObject({ jobId: second, status: "COMPLETED", outcome: "CALCULATED" });
    runs["T1b"] = (await runOf(second)).id;
    expect((await runOf(second)).previousRunId).toBe(runs["T1a"]);
    const older = await http().get(`/api/v1/estimation/runs/${runs["T1a"]}`).set(auth(director));
    expect(herbicide(older.body)).toMatchObject({ validity: "SUPERSEDED", validity_reason: "LATER_RUN", estimate_base: "111000.000000" });

    // A deterministic failure in the calculation: the run is FAILED (RN-27), with no figure.
    const spy = jest.spyOn(series, "assessIn").mockRejectedValueOnce(new Error("fallo determinista sintético"));
    const third = await queue("T1");
    try {
      expect(await worker.processNext()).toMatchObject({ jobId: third, status: "COMPLETED", outcome: "FAILED" });
    } finally {
      spy.mockRestore();
    }
    const failed = await runOf(third);
    runs["T1c"] = failed.id;
    expect(failed).toMatchObject({ outcome: "FAILED", failureCode: "CALCULATION_FAILED", previousRunId: runs["T1b"] });
    expect((await job(third)).attempts).toBe(1);
    const failedDetail = await http().get(`/api/v1/estimation/runs/${failed.id}`).set(auth(director));
    shaped("Run", failedDetail.body);
    expect(herbicide(failedDetail.body)).toMatchObject({ status: "CALCULATION_FAILED", reason_code: "CALCULATION_ERROR", estimate_base: null, validity: "NOT_USABLE", validity_reason: "RUN_FAILED" });
    // The latest CALCULATED run is still the one read, CURRENT: the failure does not hide it.
    const read = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T1"]}`).set(auth(director));
    expect(herbicide(read.body)).toMatchObject({ run_ref: runs["T1b"], validity: "CURRENT", estimate_base: "111000.000000" });
    expect(herbicide((await http().get(`/api/v1/estimation/runs/${runs["T1b"]}`).set(auth(director))).body).validity).toBe("CURRENT");
    demo["supersession"] = {
      T1a: herbicide(older.body).validity,
      T1b: herbicide(read.body).validity,
      T1c: { outcome: failed.outcome, failure_code: failed.failureCode, validity: herbicide(failedDetail.body).validity },
    };
  });

  it("corrects a classification over HTTP, keeps the history and marks the affected results OUTDATED", async () => {
    const base = `/api/v1/estimation/campaign-classifications/${campaigns["T1"]}`;
    const body = { contract_version: 1, previous_classification_ref: classifications["T1"], season_ref: seasons["OTRA"], reason: "La campaña objetivo se definió en otra temporada" };
    const correct = (session: TestSession, data: Record<string, unknown>, path = `${base}/corrections`) => http().post(path).set(auth(session)).send(data);
    expect((await correct(farmer, body)).status).toBe(403);
    for (const [data, status, message] of [
      [{ ...body, season_ref: seasons["INVIERNO"] }, 422, "CLASSIFICATION_UNCHANGED"],
      [{ ...body, season_ref: randomUUID() }, 404, "SEASON_NOT_FOUND"],
      [{ ...body, previous_classification_ref: classifications["T2"] }, 404, "CLASSIFICATION_NOT_FOUND"],
    ] as const) {
      const res = await correct(director, data);
      expect([res.status, res.body.message]).toEqual([status, message]);
      shaped("Error", res.body);
    }
    expect((await correct(director, body, `/api/v1/estimation/campaign-classifications/${randomUUID()}/corrections`)).body.message).toBe("CAMPAIGN_NOT_FOUND");
    expect((await correct(director, { ...body, reason: "   " })).status).toBe(400);
    const corrected = await correct(director, body);
    expect(corrected.status).toBe(201);
    shaped("Classification", corrected.body);
    expect(corrected.body).toMatchObject({ version: 2, previous_classification_ref: classifications["T1"], season: { key: "OTRA" }, current: true, classified_by_role: "DIRECTIVA" });
    const correction = { id: corrected.body.classification_ref as string };
    // The corrected version is no longer current: citing it again is stale.
    const stale = await correct(director, { ...body, season_ref: seasons["VERANO"] });
    expect([stale.status, stale.body.message]).toEqual([409, "CLASSIFICATION_STALE"]);
    const history = await http().get(`${base}/history`).set(auth(director));
    shaped("ClassificationList", history.body);
    expect(history.body.items.map((k: { version: number; current: boolean; reason: string | null }) => [k.version, k.current, k.reason])).toEqual([
      [1, false, null],
      [2, true, body.reason],
    ]);
    // Two simultaneous corrections of the same version: one wins, the other is stale.
    await classify("OTRA", ["UN"]);
    const race = await Promise.all(
      [seasons["INVIERNO"], seasons["VERANO"]].map((season) =>
        correct(director, { ...body, previous_classification_ref: classifications["UN"], season_ref: season }, `/api/v1/estimation/campaign-classifications/${campaigns["UN"]}/corrections`),
      ),
    );
    expect(race.map((r: Answer) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.campaignSeasonClassification.count({ where: { campaignId: campaigns["UN"] } })).toBe(2);
    const read = await http().get(`/api/v1/estimation/runs/${runs["T1b"]}`).set(auth(director));
    expect(herbicide(read.body)).toMatchObject({ validity: "OUTDATED", validity_reason: "CLASSIFICATION_CORRECTED", estimate_base: "111000.000000" });
    expect(read.body.target_classification_ref).toBe(classifications["T1"]);
    // The run is unchanged (same rows, same hash) and both versions of the classification remain.
    const stored = await prisma.estimationRun.findUniqueOrThrow({ where: { id: runs["T1b"] } });
    expect(await storedHash(runs["T1b"]!)).toBe(stored.contentHash);
    expect((await prisma.campaignSeasonClassification.findMany({ where: { campaignId: campaigns["T1"] }, orderBy: { version: "asc" } })).map((c) => [c.id, c.version])).toEqual([
      [classifications["T1"], 1],
      [correction.id, 2],
    ]);
    const results = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T1"]}`).set(auth(director));
    expect(results.body.season).toMatchObject({ key: "OTRA" });
    expect(herbicide(results.body)).toMatchObject({ validity: "OUTDATED", validity_reason: "CLASSIFICATION_CORRECTED" });
    demo["classification_corrected"] = { run: runs["T1b"], validity: herbicide(read.body).validity, reason: herbicide(read.body).validity_reason };
  });

  it("marks a result OUTDATED when its sources change, and withholds its figures when a source is withdrawn", async () => {
    const first = await queue("T2", [products["Herbicida"]!]);
    await worker.processNext();
    runs["T2a"] = (await runOf(first)).id;
    expect(herbicide((await http().get(`/api/v1/estimation/runs/${runs["T2a"]}`).set(auth(director))).body)).toMatchObject({ validity: "CURRENT", estimate_base: "111000.000000" });
    // A new campaign is classified in the season: the series would be built with other sources now.
    await classify("INVIERNO", ["X"]);
    const changedRead = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T2"]}`).set(auth(director));
    expect(herbicide(changedRead.body)).toMatchObject({ run_ref: runs["T2a"], validity: "OUTDATED", validity_reason: "SOURCES_CHANGED", estimate_base: "111000.000000" });

    const second = await queue("T2", [products["Herbicida"]!]);
    await worker.processNext();
    runs["T2b"] = (await runOf(second)).id;
    expect(herbicide((await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T2"]}`).set(auth(director))).body)).toMatchObject({ run_ref: runs["T2b"], validity: "CURRENT" });
    // After the seal of C4, F3 cancels its consumption: F07 withdraws the visibility of that sealed figure.
    await push("F3", campaigns["C4"]!, "Herbicida", null);
    const withdrawn = await http().get(`/api/v1/estimation/runs/${runs["T2b"]}`).set(auth(director));
    shaped("Run", withdrawn.body);
    const h = herbicide(withdrawn.body);
    expect(h).toMatchObject({ validity: "OUTDATED", validity_reason: "SOURCES_WITHDRAWN", estimate_base: null, naive_base: null, alpha: null, fit_criterion: null });
    expect(h.points.find((p) => p.campaign.campaign_ref === campaigns["C4"])).toMatchObject({ kind: "HIDDEN", quantity_base: null });
    // The stored row keeps what it had; only its delivery changes.
    expect((await prisma.estimationResult.findFirstOrThrow({ where: { runId: runs["T2b"], canonicalProductId: products["Herbicida"] } })).estimateBase?.toFixed(6)).toBe("111000.000000");
    const asDirector = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T2"]}`).set(auth(director));
    expect(herbicide(asDirector.body)).toMatchObject({ validity: "OUTDATED", validity_reason: "SOURCES_WITHDRAWN", estimate_base: null, naive_base: null });
    const asFarmer = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T2"]}`).set(auth(farmer));
    shaped("FarmerResults", asFarmer.body);
    expect(herbicide(asFarmer.body)).toMatchObject({ estimate_base: null, validity: "OUTDATED" });
    // The earlier run, already SUPERSEDED, also loses its figures.
    expect(herbicide((await http().get(`/api/v1/estimation/runs/${runs["T2a"]}`).set(auth(director))).body)).toMatchObject({ validity: "SUPERSEDED", estimate_base: null });
    demo["sources"] = {
      changed: { run: runs["T2a"], validity: herbicide(changedRead.body).validity_reason },
      withdrawn: { run: runs["T2b"], validity: h.validity, reason: h.validity_reason, estimate_base: h.estimate_base },
    };
  });

  it("marks a result OUTDATED when a denomination is associated to its product after the run", async () => {
    const product = (await prisma.product.create({ data: { tenantId: f.tenantA, name: "Insecticida estimación", unit: "L" } })).id;
    const sources = await sealedConsumptionCampaigns(prisma, {
      tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: product, baseUnit: "ML", firstYear: 2010,
      quantities: [3000n, 3000n, 3000n], namePrefix: "Campaña sellada para la asociación", coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3 },
    });
    sources.forEach((source, i) => (campaigns[`A${i + 1}`] = source.campaignId));
    await plannedCampaign("TA", 2013);
    await season("ASOCIACION");
    await classify("ASOCIACION", ["A1", "A2", "A3", "TA"]);
    const jobId = await queue("TA", [product]);
    expect(await worker.processNext()).toMatchObject({ jobId, status: "COMPLETED", outcome: "CALCULATED" });
    const runId = (await runOf(jobId)).id;
    const read = async () => ((await http().get(`/api/v1/estimation/runs/${runId}`).set(auth(director))).body as { results: ResultBody[] }).results[0]!;
    expect(await read()).toMatchObject({ status: "ESTIMATED", estimate_base: "3000.000000", validity: "CURRENT" });
    // A denomination is associated to the product: the series would be built with another scope now.
    const alias = (await prisma.product.create({ data: { tenantId: f.tenantA, name: "Insecticida genérico estimación", unit: "L" } })).id;
    await prisma.productCanonicalAssociation.create({
      data: { tenantId: f.tenantA, productId: alias, canonicalProductId: product, actorUserId: directorUser, reason: "Misma sustancia, asociada después de la ejecución" },
    });
    expect(await read()).toMatchObject({ validity: "OUTDATED", validity_reason: "SOURCES_CHANGED", estimate_base: "3000.000000" });
    demo["association_changed"] = { run: runId, validity: "OUTDATED", reason: "SOURCES_CHANGED" };
  });

  it("does not deliver a result to an identity that lost its permission, nor to another tenant", async () => {
    const second = await person("DIRECTIVA");
    const path = `/api/v1/estimation/runs/${runs["T1b"]}`;
    expect((await http().get(path).set(auth(second))).status).toBe(200);
    await prisma.member.update({ where: { id: second.memberId }, data: { role: "AGRICULTOR" } });
    const demoted = await http().get(path).set(auth(second));
    expect([demoted.status, demoted.body.message]).toEqual([403, "No tienes permisos para esta acción"]);
    const asFarmerNow = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T1"]}`).set(auth(second));
    expect(asFarmerNow.body.profile).toBe("FARMER");
    expect(herbicide(asFarmerNow.body)).not.toHaveProperty("naive_base");
    await prisma.member.update({ where: { id: second.memberId }, data: { isActive: false } });
    expect((await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T1"]}`).set(auth(second))).status).toBe(401);

    const other = await person("DIRECTIVA", f.tenantB);
    for (const [route, code] of [
      [path, "RUN_NOT_FOUND"],
      [`/api/v1/estimation/jobs/${(await prisma.estimationRun.findUniqueOrThrow({ where: { id: runs["T1b"] } })).jobId}`, "JOB_NOT_FOUND"],
      [`/api/v1/estimation/results?target_campaign_ref=${campaigns["T1"]}`, "TARGET_CAMPAIGN_NOT_FOUND"],
    ] as const) {
      const res = await http().get(route).set(auth(other));
      expect([res.status, res.body.message]).toEqual([404, code]);
    }
    for (const route of [path, `/api/v1/estimation/jobs/${randomUUID()}`]) expect((await http().get(route).set(auth(farmer))).status).toBe(403);
  });

  it("lists earlier runs newest first, with an opaque cursor, failed ones included and no figures", async () => {
    const list = (session: TestSession, query = "") => http().get(`/api/v1/estimation/runs${query}`).set(auth(session));
    const target = `?target_campaign_ref=${campaigns["T1"]}`;
    const first = await list(director, `${target}&limit=2`);
    expect(first.status).toBe(200);
    shaped("RunList", first.body);
    expect(first.body.items.map((r: { run_ref: string }) => r.run_ref)).toEqual([runs["T1c"], runs["T1b"]]);
    expect(first.body.items[0]).toMatchObject({ outcome: "FAILED", failure_code: "CALCULATION_FAILED", previous_run_ref: runs["T1b"], counts: { calculation_failed: 2 } });
    expect(first.body.items[1]).toMatchObject({ outcome: "CALCULATED", previous_run_ref: runs["T1a"], counts: { estimated: 1, insufficient_data: 1 } });
    expect(first.body.next_cursor).toEqual(expect.any(String));
    const second = await list(director, `${target}&limit=2&cursor=${encodeURIComponent(first.body.next_cursor)}`);
    shaped("RunList", second.body);
    expect([second.body.items.map((r: { run_ref: string }) => r.run_ref), second.body.next_cursor]).toEqual([[runs["T1a"]], null]);

    // Every run of the tenant, page after page, once each and in order.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await list(director, `?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      shaped("RunList", page.body);
      seen.push(...page.body.items.map((r: { run_ref: string }) => r.run_ref));
      cursor = page.body.next_cursor;
    } while (cursor);
    const stored = await prisma.estimationRun.findMany({ where: { tenantId: f.tenantA }, orderBy: [{ generatedAt: "desc" }, { id: "desc" }], select: { id: true } });
    expect(seen).toEqual(stored.map((r) => r.id));

    expect((await list(farmer)).status).toBe(403);
    const other = await person("DIRECTIVA", f.tenantB);
    const otherList = await list(other);
    expect([otherList.status, otherList.body.items, otherList.body.next_cursor]).toEqual([200, [], null]);
    const hidden = await list(other, target);
    expect([hidden.status, hidden.body.message]).toEqual([404, "TARGET_CAMPAIGN_NOT_FOUND"]);
    const forged = Buffer.from(JSON.stringify(["no-es-fecha", randomUUID()]), "utf8").toString("base64url");
    for (const query of ["?limit=0", "?limit=51", "?limit=dos", "?target_campaign_ref=no-es-uuid", `?cursor=${forged}`, "?cursor=%25%25"]) {
      const res = await list(director, query);
      expect([query, res.status]).toEqual([query, 400]);
      shaped("Error", res.body);
    }
    demo["runs_list"] = { first_page: first.body.items.map((r: { run_ref: string; outcome: string }) => [r.run_ref, r.outcome]), pages_cover_all: seen.length };
  });

  it("F12-EST-07: GET /download is /results with subject, dates, validity at download and the copy rules; the Farmer profile has no naive, coverage nor series", async () => {
    const target = campaigns["T1"]!;
    const path = `/api/v1/estimation/download?target_campaign_ref=${target}`;
    const read = await http().get(`/api/v1/estimation/results?target_campaign_ref=${target}`).set(auth(director));
    const copy = await http().get(path).set(auth(director));
    expect(copy.status).toBe(200);
    expect(copy.headers["cache-control"]).toBe("no-store");
    shaped("InstitutionalDownload", copy.body);
    expect(copy.body).toMatchObject({
      contract_version: 1, kind: "ESTIMATION_DOWNLOAD", profile: "INSTITUTIONAL", scope: { tenant_ref: f.tenantA },
      subject: { member_ref: f.members.directorA, role: "DIRECTIVA" }, target: read.body.target, season: read.body.season, may_be_outdated: true,
      notice: read.body.notice, storage: { backup: "EXCLUDED_FROM_PRIVATE_BACKUP", discard_on: ["IDENTITY_CHANGE", "SIGN_OUT"], replace_only_with: "NEWER_SAME_SUBJECT_AND_SCOPE" },
    });
    // The same selection as /results at the same moment: every field but the validity, which is the one at download.
    expect(copy.body.results.length).toBeGreaterThan(0);
    expect(copy.body.results).toEqual(read.body.results.map(({ validity, ...rest }: { validity: string }) => ({ ...rest, validity_at_download: validity })));
    expect(Date.parse(copy.body.downloaded_at)).toBeGreaterThanOrEqual(Date.parse(read.body.evaluated_at));
    // No series point, contribution nor private figure.
    expect(JSON.stringify(copy.body)).not.toMatch(/"points"|"quantity_base"|"series"|"alpha"|"fit_criterion"|"members"/);

    const asFarmer = await http().get(path).set(auth(farmer));
    expect(asFarmer.status).toBe(200);
    shaped("FarmerDownload", asFarmer.body);
    expect(asFarmer.body).toMatchObject({ profile: "FARMER", subject: { member_ref: f.members.farmerA, role: "AGRICULTOR" } });
    for (const result of asFarmer.body.results as Record<string, unknown>[]) {
      expect(result).not.toHaveProperty("naive_base");
      expect(result).not.toHaveProperty("coverage");
    }
    expect(JSON.stringify(asFarmer.body)).not.toMatch(/"naive_base"|"coverage"|"points"|"series"/);

    // The permission is the caller's at this request: a demoted Directiva gets the Farmer profile, an inactive one nothing.
    const second = await person("DIRECTIVA");
    expect((await http().get(path).set(auth(second))).body.profile).toBe("INSTITUTIONAL");
    await prisma.member.update({ where: { id: second.memberId }, data: { role: "AGRICULTOR" } });
    const demoted = await http().get(path).set(auth(second));
    expect([demoted.body.profile, JSON.stringify(demoted.body).includes("naive_base")]).toEqual(["FARMER", false]);
    await prisma.member.update({ where: { id: second.memberId }, data: { isActive: false } });
    expect((await http().get(path).set(auth(second))).status).toBe(401);

    const other = await person("DIRECTIVA", f.tenantB);
    for (const [session, route, status, message] of [
      [other, path, 404, "TARGET_CAMPAIGN_NOT_FOUND"],
      [director, `/api/v1/estimation/download?target_campaign_ref=${randomUUID()}`, 404, "TARGET_CAMPAIGN_NOT_FOUND"],
    ] as const) {
      const res = await http().get(route).set(auth(session));
      expect([res.status, res.body.message]).toEqual([status, message]);
    }
    expect((await http().get("/api/v1/estimation/download?target_campaign_ref=no-uuid").set(auth(director))).status).toBe(400);
    expect((await http().get(path)).status).toBe(401);
    (collective as { mode: string }).mode = "POLICY_PENDING";
    try {
      const pending = await http().get(path).set(auth(director));
      expect([pending.status, pending.body.message]).toEqual([409, "POLICY_PENDING"]);
    } finally {
      (collective as { mode: string }).mode = "PROVISIONAL_SYNTHETIC";
    }
    demo["download"] = { institutional: copy.body, farmer: asFarmer.body };
  });

  it("stops before calculating, without a run, on lost permission, pending policy or an ineligible target", async () => {
    const revoked = await person("DIRECTIVA");
    const byRevoked = await queue("U3", [products["Herbicida"]!], revoked);
    await prisma.member.update({ where: { id: revoked.memberId }, data: { isActive: false } });
    expect(await worker.processNext()).toMatchObject({ jobId: byRevoked, status: "NOT_EXECUTED", stopCode: "REQUESTER_NOT_AUTHORIZED" });

    const pending = await queue("U4", [products["Herbicida"]!]);
    (collective as { mode: string }).mode = "POLICY_PENDING";
    try {
      expect(await worker.processNext()).toMatchObject({ jobId: pending, status: "NOT_EXECUTED", stopCode: "POLICY_PENDING" });
      for (const route of [`/api/v1/estimation/runs/${runs["T1b"]}`, "/api/v1/estimation/runs", `/api/v1/estimation/results?target_campaign_ref=${campaigns["T1"]}`]) {
        const res = await http().get(route).set(auth(director));
        expect([res.status, res.body.message]).toEqual([409, "POLICY_PENDING"]);
      }
      expect((await http().get(`/api/v1/estimation/jobs/${pending}`).set(auth(director))).status).toBe(200);
    } finally {
      (collective as { mode: string }).mode = "PROVISIONAL_SYNTHETIC";
    }

    const closing = await queue("U5", [products["Herbicida"]!]);
    await prisma.agriculturalCampaign.update({ where: { id: campaigns["U5"] }, data: { status: "CERRADA", closedAt: new Date() } });
    expect(await worker.processNext()).toMatchObject({ jobId: closing, status: "NOT_EXECUTED", stopCode: "TARGET_CAMPAIGN_NOT_ELIGIBLE" });

    const evidence: Record<string, unknown> = {};
    for (const [jobId, code] of [[byRevoked, "REQUESTER_NOT_AUTHORIZED"], [pending, "POLICY_PENDING"], [closing, "TARGET_CAMPAIGN_NOT_ELIGIBLE"]] as const) {
      const res = await http().get(`/api/v1/estimation/jobs/${jobId}`).set(auth(director));
      shaped("Job", res.body);
      expect(res.body).toMatchObject({ status: "NOT_EXECUTED", stop_code: code, attempts: 1, run_ref: null });
      expect(await prisma.estimationRun.count({ where: { jobId } })).toBe(0);
      evidence[code] = res.body.stop_evidence;
    }
    expect(evidence["REQUESTER_NOT_AUTHORIZED"]).toMatchObject({ member_active: false, account_active: true, role: "DIRECTIVA" });
    expect(evidence["POLICY_PENDING"]).toMatchObject({ disclosure_mode: "POLICY_PENDING" });
    expect(evidence["TARGET_CAMPAIGN_NOT_ELIGIBLE"]).toMatchObject({ campaign_status: "CERRADA", classified: true });
    demo["stops"] = evidence;
  });

  it("retries only transient errors, up to the maximum, and then registers RETRIES_EXHAUSTED", async () => {
    const transient = () => new Prisma.PrismaClientKnownRequestError("write conflict or deadlock (synthetic)", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
    const recovered = await queue("U6", [products["Herbicida"]!]);
    const once = jest.spyOn(series, "assessIn").mockRejectedValueOnce(transient());
    try {
      expect(await worker.processNext()).toMatchObject({ jobId: recovered, status: "COMPLETED", outcome: "CALCULATED", attempt: 2 });
    } finally {
      once.mockRestore();
    }
    expect([(await job(recovered)).attempts, (await runOf(recovered)).jobAttempt]).toEqual([2, 2]);

    const exhausted = await queue("U7", [products["Herbicida"]!]);
    const always = jest.spyOn(series, "assessIn").mockRejectedValue(transient());
    try {
      expect(await worker.processNext()).toMatchObject({ jobId: exhausted, status: "COMPLETED", outcome: "FAILED", attempt: 3 });
    } finally {
      always.mockRestore();
    }
    const failed = await runOf(exhausted);
    expect(failed).toMatchObject({ outcome: "FAILED", failureCode: "RETRIES_EXHAUSTED", jobAttempt: 3 });
    expect((await job(exhausted)).attempts).toBe(3);
    const detail = await http().get(`/api/v1/estimation/runs/${failed.id}`).set(auth(director));
    shaped("Run", detail.body);
    expect(herbicide(detail.body)).toMatchObject({ status: "CALCULATION_FAILED", estimate_base: null, validity: "NOT_USABLE", validity_reason: "RUN_FAILED" });
    demo["retries"] = { recovered_attempts: 2, exhausted: { attempts: 3, failure_code: failed.failureCode } };
  });

  it("EST-D-08: a later run with insufficient data replaces the estimate and never reuses its figure", async () => {
    const product = (await prisma.product.create({ data: { tenantId: f.tenantA, name: "Fungicida para EST-D-08", unit: "L" } })).id;
    const sources = await sealedConsumptionCampaigns(prisma, {
      tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: product, baseUnit: "ML", firstYear: 2020,
      quantities: [4000n, 5000n, 6000n], namePrefix: "Campaña sellada EST-D-08", coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3 },
    });
    sources.forEach((source, i) => (campaigns[`D${i + 1}`] = source.campaignId));
    await plannedCampaign("TD8", 2024);
    await season("EST-D-08");
    await classify("EST-D-08", ["D1", "D2", "D3", "TD8"]);
    const first = await queue("TD8", [product]);
    await worker.processNext();
    const firstRun = (await runOf(first)).id;
    const pick = (body: { results: ResultBody[] }) => body.results.find((r) => r.product.product_ref === product)!;
    expect(pick((await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["TD8"]}`).set(auth(director))).body)).toMatchObject({
      run_ref: firstRun, status: "ESTIMATED", estimate_base: "6000.000000", naive_base: "6000", validity: "CURRENT",
    });
    // A campaign without a seal is classified between the sources and the target: the last relevant campaign has no verified figure.
    await plannedCampaign("GAP8", 2023);
    await classify("EST-D-08", ["GAP8"]);
    const second = await queue("TD8", [product]);
    await worker.processNext();
    const secondRun = (await runOf(second)).id;
    const read = pick((await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["TD8"]}`).set(auth(director))).body);
    // The result delivered is the new run's: no figure, never the earlier 6000.
    expect(read).toMatchObject({
      run_ref: secondRun, status: "INSUFFICIENT_DATA", reason_code: "LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED", estimate_base: null, naive_base: null,
      validity: "NOT_USABLE", validity_reason: "NO_FIGURE",
    });
    // The earlier result is still readable in its own run, as SUPERSEDED.
    const earlier = pick((await http().get(`/api/v1/estimation/runs/${firstRun}`).set(auth(director))).body);
    expect(earlier).toMatchObject({ run_ref: firstRun, validity: "SUPERSEDED", validity_reason: "LATER_RUN", estimate_base: "6000.000000" });
    demo["est_d_08"] = { earlier: { run: firstRun, validity: earlier.validity }, later: { run: secondRun, status: read["status"], estimate_base: read.estimate_base } };
  });

  it("EST-D-10: a job retaken after a transient error checks the policy again and stops without calculating", async () => {
    await plannedCampaign("U13", 2019);
    await classify("VERANO", ["U13"]);
    const jobId = await queue("U13", [products["Herbicida"]!]);
    const spy = jest.spyOn(series, "assessIn").mockImplementationOnce(async () => {
      // The policy becomes pending while the first attempt fails transiently.
      (collective as { mode: string }).mode = "POLICY_PENDING";
      throw new Prisma.PrismaClientKnownRequestError("write conflict or deadlock (synthetic)", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
    });
    try {
      expect(await worker.processNext()).toMatchObject({ jobId, status: "NOT_EXECUTED", stopCode: "POLICY_PENDING", attempt: 2 });
      // Only the first attempt reached the calculation; the second stopped before it.
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      (collective as { mode: string }).mode = "PROVISIONAL_SYNTHETIC";
    }
    const stored = await job(jobId);
    expect(stored).toMatchObject({ status: "NOT_EXECUTED", stopCode: "POLICY_PENDING", attempts: 2, run: null });
    expect(stored.stopEvidence).toMatchObject({ disclosure_mode: "POLICY_PENDING" });
  });

  it("recovers a job whose worker stopped, and a worker that lost the job cannot register its run", async () => {
    const slow = workerWith(300);
    const fresh = workerWith(config.leaseMs);
    // A worker takes the job and stops (no carry): its lease expires and another takes it with a new attempt.
    const interrupted = await queue("U8", [products["Herbicida"]!]);
    expect(await slow.claim()).toMatchObject({ id: interrupted, attempt: 1 });
    await leaseExpired(interrupted);
    expect(await fresh.processNext()).toMatchObject({ jobId: interrupted, status: "COMPLETED", outcome: "CALCULATED", attempt: 2 });

    // The old worker comes back after another took the job: it writes nothing.
    const contested = await queue("U9", [products["Herbicida"]!]);
    const old = (await slow.claim())!;
    await leaseExpired(contested);
    const current = (await fresh.claim())!;
    expect([old.attempt, current.attempt]).toEqual([1, 2]);
    expect(await slow.carry(old)).toEqual({ jobId: contested, status: "LOST", attempt: 1 });
    expect(await prisma.estimationRun.count({ where: { jobId: contested } })).toBe(0);
    expect(await fresh.carry(current)).toMatchObject({ jobId: contested, status: "COMPLETED", attempt: 2 });
    expect(await prisma.estimationRun.count({ where: { jobId: contested } })).toBe(1);

    // The base refuses the same even to code that skips the worker's checks.
    const guarded = await queue("U10", [products["Herbicida"]!]);
    const owner = (await slow.claim())!;
    const runData = (jobAttempt: number) => ({
      tenantId: f.tenantA, jobId: guarded, jobAttempt, requestedByUserId: directorUser, requestedByRole: "DIRECTIVA" as const, targetCampaignId: campaigns["U10"]!,
      seasonId: seasons["VERANO"]!, targetClassificationId: classifications["U10"]!, contractVersion: 1, method: "SES_NAIVE", methodVersion: "F12-EST-04/1",
      parameters: { horizon: 1 }, horizon: 1, disclosureMode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", threshold: 3, outcome: "CALCULATED" as const,
      contentHash: "0".repeat(64),
    });
    await expect(prisma.estimationRun.create({ data: runData(owner.attempt + 1) })).rejects.toThrow(/el intento no es el vigente del trabajo/);
    await leaseExpired(guarded);
    await expect(prisma.estimationRun.create({ data: runData(owner.attempt) })).rejects.toThrow(/el plazo del trabajo venció/);
    expect(await fresh.processNext()).toMatchObject({ jobId: guarded, status: "COMPLETED", attempt: 2 });
    demo["ownership"] = { interrupted: "retaken with attempt 2", stale_worker: "LOST, nothing written", base: ["el intento no es el vigente del trabajo", "el plazo del trabajo venció"] };
  });

  it("lets concurrent workers take different jobs and keeps one chain per target", async () => {
    const jobs = [await queue("U11", [products["Herbicida"]!]), await queue("U11", [products["Herbicida"]!]), await queue("U12", [products["Herbicida"]!]), await queue("U1", [products["Herbicida"]!])];
    // Gate: the first two calculations wait for each other (bounded), so two workers hold two jobs at once.
    const real = series.assessIn.bind(series);
    let entered = 0;
    let overlapped = false;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const spy = jest.spyOn(series, "assessIn").mockImplementation(async (...args) => {
      entered += 1;
      if (entered === 2) {
        overlapped = true;
        open();
      }
      if (entered <= 2) await Promise.race([gate, sleep(5000)]);
      return real(...args);
    });
    const workers = [workerWith(config.leaseMs), workerWith(config.leaseMs), workerWith(config.leaseMs)];
    const outcomes: CarryOutcome[] = [];
    try {
      await Promise.all(
        workers.map(async (w) => {
          for (let outcome = await w.processNext(); outcome; outcome = await w.processNext()) outcomes.push(outcome);
        }),
      );
    } finally {
      spy.mockRestore();
    }
    expect(overlapped).toBe(true);
    expect(outcomes.filter((o) => o.status === "COMPLETED").map((o) => o.jobId).sort()).toEqual([...jobs].sort());
    for (const jobId of jobs) expect(await prisma.estimationRun.count({ where: { jobId } })).toBe(1);
    const chain = await prisma.estimationRun.findMany({ where: { targetCampaignId: campaigns["U11"] }, orderBy: { generatedAt: "asc" } });
    expect(chain).toHaveLength(2);
    expect([chain[0]!.previousRunId, chain[1]!.previousRunId]).toEqual([null, chain[0]!.id]);
    demo["concurrency"] = { workers: 3, jobs: jobs.length, attempts: outcomes.map((o) => o.attempt), overlapped };
  });

  it("never updates nor deletes runs and results", async () => {
    const runId = runs["T1a"]!;
    await expect(prisma.estimationRun.update({ where: { id: runId }, data: { methodVersion: "otra" } })).rejects.toThrow(/inmutable/);
    await expect(prisma.estimationRun.delete({ where: { id: runId } })).rejects.toThrow(/inmutable/);
    await expect(prisma.estimationResult.updateMany({ where: { runId }, data: { reasonCode: null } })).rejects.toThrow(/inmutable/);
    await expect(prisma.estimationResult.deleteMany({ where: { runId } })).rejects.toThrow(/inmutable/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE "EstimationResult"')).rejects.toThrow(/inmutable/);
    const jobId = (await prisma.estimationRun.findUniqueOrThrow({ where: { id: runId } })).jobId;
    await expect(prisma.estimationJob.delete({ where: { id: jobId } })).rejects.toThrow(/EstimationJob no se borra/);
    expect(await storedHash(runId)).toBe((await prisma.estimationRun.findUniqueOrThrow({ where: { id: runId } })).contentHash);
    // And no route modifies them: every INT-09 route is GET or POST.
    for (const method of ["put", "patch", "delete"] as const) {
      expect((await http()[method](`/api/v1/estimation/runs/${runId}`).set(auth(director))).status).toBe(404);
    }
  });
});
