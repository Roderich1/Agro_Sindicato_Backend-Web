import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { createIsolatedDatabase, createSession, createSyncV1App, Fixture, seedFixture, TestSession, unusablePasswordHash } from "../../sync-v1/test-support/sync-v1-test-app";
import { ConsumptionSeriesUseCase } from "../application/consumption-series.use-case";
import { EstimationReadsUseCase } from "../application/estimation-reads.use-case";
import { EstimationWorker } from "../application/estimation-worker";
import { derivedJobRequestId } from "../domain/proposal-link";
import { sealedConsumptionCampaigns, SyntheticSource } from "../test-support/synthetic-sources";

/**
 * E3 (E3_ESTIMACION_EN_BORRADOR_CONTRATO.md §9): the consumption estimate
 * fixed as a reference of a draft joint purchase proposal, over PostgreSQL
 * and HTTP, with the real Nest application.
 *
 * Only synthetic data. Consumption sources are sealed synthetic campaigns
 * (test-support/synthetic-sources.ts); the draft comes from declared needs
 * published over Sync v1 by three synthetic farmers. The F12 worker is driven
 * explicitly (ESTIMATION_WORKER=disabled). With E3_DEMO_OUT set, an example
 * of the view is written there as JSON.
 */
const postgresUrl = process.env["E3_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const PUSH = "/api/v1/sync/v1/push";
const COLLECTIVE = "/api/v1/collective";
const POPULATION_MESSAGE =
  "No se calcula la diferencia: no hay datos para comprobar que la necesidad y la estimación cubran a las mismas personas.";
/** Tables E3 must never write (besides F12's own job queue). */
const UNTOUCHED = [
  "Purchase", "PurchaseItem", "PurchaseParticipant", "InventoryLot", "StockMovement", "PayableAccount", "Payment",
  "SyncV1Contribution", "JointPurchaseProposal", "JointPurchaseProposalLine", "JointPurchaseCall", "JointPurchaseParticipation",
];

interface Res {
  status: number;
  body: any;
}

describePostgres("E3 estimation reference fixed in a draft proposal", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let collective: CollectiveConfig;
  let worker: EstimationWorker;
  let series: ConsumptionSeriesUseCase;
  let f: Fixture;
  let director: TestSession;
  let admin: TestSession;
  let farmer: TestSession;
  let directorB: TestSession;
  let director3: TestSession;
  let directorUser: string;
  const farmers: Record<string, TestSession> = {};
  const products: Record<string, string> = {};
  const campaigns: Record<string, string> = {};
  const proposals: Record<string, string> = {};
  const runs: Record<string, string> = {};
  const jobs: Record<string, string> = {};
  let season: string;
  let sources: SyntheticSource[] = [];
  let foreignProposal: string;
  const demo: Record<string, unknown> = {};
  let untouchedAtStart: Map<string, string>;
  let draftAtStart: unknown;

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    process.env["ESTIMATION_WORKER"] = "disabled";
    const url = await createIsolatedDatabase(postgresUrl!, "e3_link");
    ({ app, prisma, jwt } = await createSyncV1App(url));
    collective = app.get(CollectiveConfig);
    worker = app.get(EstimationWorker);
    series = app.get(ConsumptionSeriesUseCase);
    f = await seedFixture(prisma);
    directorUser = (await prisma.member.findUniqueOrThrow({ where: { id: f.members.directorA } })).userId;
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    farmer = await createSession(prisma, jwt, f.members.farmerA);
    directorB = await person("DIRECTIVA", f.tenantB);
    director3 = await person("DIRECTIVA");
    for (const key of ["F1", "F2", "F3"]) farmers[key] = await person("AGRICULTOR");
    for (const [key, unit] of [["Herbicida", "L"], ["Fungicida", "L"], ["Coadyuvante", "unidad"]] as const) {
      products[key] = (await prisma.product.create({ data: { tenantId: f.tenantA, name: `${key} sintético E3`, unit } })).id;
    }
    // Consumption of Herbicida published and sealed in four campaigns (the 3.12.5 example: 96, 120, 104 and 116 L).
    sources = await sealedConsumptionCampaigns(prisma, {
      tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: products["Herbicida"]!, baseUnit: "ML",
      firstYear: 2015, quantities: [96000n, 120000n, 104000n, 116000n], namePrefix: "Campaña sintética E3",
      coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3 },
    });
    for (const [key, year, status] of [["T", 2019, "ABIERTA"], ["X", 2020, "PLANIFICADA"], ["Y", 2021, "PLANIFICADA"], ["Z", 2022, "PLANIFICADA"]] as const) {
      campaigns[key] = randomUUID();
      await prisma.agriculturalCampaign.create({
        data: { id: campaigns[key], tenantId: f.tenantA, name: `Campaña sintética ${key}`, status, isActive: status === "ABIERTA", startDate: new Date(`${year}-09-01T00:00:00.000Z`) },
      });
    }
    season = (
      await prisma.comparabilitySeason.create({
        data: { tenantId: f.tenantA, key: "INVIERNO", definition: "Temporada sintética INVIERNO", durationDays: 180, createdByUserId: directorUser, createdByRole: "DIRECTIVA" },
      })
    ).id;
    for (const campaignId of [...sources.map((s) => s.campaignId), campaigns["T"]!]) await classify(campaignId);
    // Declared needs of the target, published by three farmers: both cells disclosed in the draft.
    for (const [i, quantity] of ["30000", "40000", "50000"].entries()) await push(`F${i + 1}`, campaigns["T"]!, "Herbicida", quantity);
    for (const [i, quantity] of ["500", "700", "800"].entries()) await push(`F${i + 1}`, campaigns["T"]!, "Fungicida", quantity);
    foreignProposal = (
      await prisma.jointPurchaseProposal.create({
        data: { tenantId: f.tenantB, campaignId: f.campaigns.openB, inputsFingerprint: "c".repeat(64), linkedMembers: 0, membersWithContribution: 0, generatedByUserId: (await prisma.member.findUniqueOrThrow({ where: { id: directorB.memberId } })).userId },
      })
    ).id;
  }, 300000);

  afterAll(async () => {
    jest.restoreAllMocks();
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    delete process.env["ESTIMATION_WORKER"];
    if (process.env["E3_DEMO_OUT"]) writeFileSync(process.env["E3_DEMO_OUT"], `${JSON.stringify(demo, null, 2)}\n`, "utf8");
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });

  async function person(role: "AGRICULTOR" | "DIRECTIVA", tenantId = f.tenantA): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name: `Persona sintética E3 ${role}`, email: `e3-${userId}@example.test`, passwordHash: unusablePasswordHash(), role,
        members: { create: { id: memberId, tenantId, role } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function push(farmerKey: string, campaignId: string, product: string, quantity: string) {
    const payload = JSON.stringify({
      contractVersion: 1, operationId: randomUUID(), projectionType: "DECLARED_NEED", action: "PUBLISH",
      causal: { predecessorOperationId: null, reconciliationReference: null },
      payload: { campaign_ref: campaignId, product_ref: products[product], base_unit: "ML", quantity_base: quantity },
    });
    const res = await http().post(PUSH).set("Content-Type", "application/json").set(auth(farmers[farmerKey]!)).send(payload);
    expect(res.body.outcome).toBe("APPLIED");
  }

  async function classify(campaignId: string) {
    await prisma.campaignSeasonClassification.create({
      data: { tenantId: f.tenantA, campaignId, version: 1, seasonId: season, classifiedByUserId: directorUser, classifiedByRole: "DIRECTIVA" },
    });
  }

  async function generate(): Promise<string> {
    const res = await http().post(`${COLLECTIVE}/campaigns/${campaigns["T"]}/proposals`).set(auth(director));
    expect(res.status).toBe(201);
    return res.body.proposal_ref;
  }

  /** A draft stored directly (as generation would store it) on another campaign, for the non-calculable cases. */
  async function storedDraft(campaignId: string, lineProducts: string[]): Promise<string> {
    return (
      await prisma.jointPurchaseProposal.create({
        data: {
          tenantId: f.tenantA, campaignId, inputsFingerprint: "d".repeat(64), linkedMembers: 0, membersWithContribution: 0, generatedByUserId: directorUser,
          lines: { create: lineProducts.map((productId, position) => ({ position, canonicalProductId: productId, baseUnit: "ML", status: "SUPPRESSED_UNDER_THRESHOLD" })) },
        },
      })
    ).id;
  }

  const view = async (id: string, session = director): Promise<any> => {
    const res = await http().get(`${COLLECTIVE}/proposals/${id}/estimation-link`).set(auth(session));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    return res.body;
  };
  const prepare = (id: string, body: object, session = director): Promise<Res> =>
    http().post(`${COLLECTIVE}/proposals/${id}/estimation-link/prepare`).set(auth(session)).send(body);
  const clear = (id: string, body: object, session = director): Promise<Res> =>
    http().post(`${COLLECTIVE}/proposals/${id}/estimation-link/clear`).set(auth(session)).send(body);
  const putSelection = (id: string, body: object, session = director): Promise<Res> =>
    http().put(`${COLLECTIVE}/proposals/${id}/selection`).set(auth(session)).send(body);
  const initial = (id: string, requestId = randomUUID(), session = director) => prepare(id, { request_id: requestId, mode: "INITIAL" }, session);
  const update = (id: string, expected: string, requestId = randomUUID(), session = director) =>
    prepare(id, { request_id: requestId, mode: "UPDATE", expected_link_ref: expected }, session);
  const lineOf = (v: any, product: string) => v.lines.find((l: any) => l.product.product_ref === products[product]);
  const linkCount = (id: string) => prisma.jointPurchaseProposalEstimationLink.count({ where: { proposalId: id } });

  /** Queues a job through the F12 route (explicit products) and lets the worker carry it out. */
  async function runF12(): Promise<string> {
    const res = await http()
      .post("/api/v1/estimation/jobs")
      .set(auth(director))
      .send({ contract_version: 1, request_id: randomUUID(), target_campaign_ref: campaigns["T"], product_refs: [products["Herbicida"], products["Fungicida"]] });
    expect(res.status).toBe(202);
    expect(await worker.processNext()).toMatchObject({ jobId: res.body.job_ref, status: "COMPLETED", outcome: "CALCULATED" });
    return (await prisma.estimationJob.findUniqueOrThrow({ where: { id: res.body.job_ref }, include: { run: true } })).run!.id;
  }

  /** md5 of every table. */
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

  it("permissions and separation between tenants; reading writes nothing", async () => {
    proposals["P1"] = await generate();
    untouchedAtStart = await snapshot();
    draftAtStart = await prisma.jointPurchaseProposal.findUniqueOrThrow({ where: { id: proposals["P1"] }, include: { lines: { orderBy: { position: "asc" } } } });
    const before = await snapshot();
    const paths = (id: string) => [
      ["get", `${COLLECTIVE}/proposals/${id}/estimation-link`],
      ["post", `${COLLECTIVE}/proposals/${id}/estimation-link/prepare`],
      ["post", `${COLLECTIVE}/proposals/${id}/estimation-link/clear`],
      ["get", `${COLLECTIVE}/proposals/${id}/selection`],
      ["put", `${COLLECTIVE}/proposals/${id}/selection`],
    ] as const;
    const body = { request_id: randomUUID(), mode: "INITIAL", expected_link_ref: randomUUID(), expected_revision: 0, product_refs: [] };
    for (const [method, path] of paths(proposals["P1"]!)) {
      expect((await http()[method](path).send({})).status).toBe(401);
      expect((await http()[method](path).set(auth(farmer)).send({})).status).toBe(403);
      const foreign = await http()[method](path).set(auth(directorB)).send(body);
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ errorCode: "PROPOSAL_NOT_FOUND" });
    }
    for (const [method, path] of paths(foreignProposal)) expect((await http()[method](path).set(auth(director)).send(body)).status).toBe(404);
    for (const [method, path] of paths(randomUUID())) expect((await http()[method](path).set(auth(director)).send(body)).status).toBe(404);
    expect((await http().get(`${COLLECTIVE}/proposals/no-es-uuid/estimation-link`).set(auth(director))).status).toBe(400);

    const none = await view(proposals["P1"]!, admin);
    expect(none).toMatchObject({
      proposal_ref: proposals["P1"], target_campaign_ref: campaigns["T"], state: "NONE", link: null, run: null,
      update: { available: false, reason: null }, prepare_blocker: null, history: [],
    });
    expect(lineOf(none, "Herbicida")).toMatchObject({
      need: { status: "DISCLOSED", quantity_base: "120000" },
      estimation: { state: "NONE", estimate_base: null },
      comparison: { comparable: false, blockers: ["ESTIMATE_NOT_AVAILABLE", "POPULATION_NOT_VERIFIED"], difference: null },
    });
    for (let i = 0; i < 3; i += 1) await view(proposals["P1"]!);
    expect(changed(before, await snapshot())).toEqual([]);
  });

  it("prepare without a compatible run queues one job; idempotent, serialized, explicit update only; the selection stays editable", async () => {
    const before = await snapshot();
    const jobsBefore = await prisma.estimationJob.count();
    const requestId = randomUUID();
    const first = await initial(proposals["P1"]!, requestId);
    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe("REQUESTED_JOB");
    expect(first.body.view).toMatchObject({ state: "CALCULATING", update: { available: false, reason: null }, link: { sequence: 1, mode: "INITIAL", action: "REQUEST_JOB", job_status: "QUEUED", run_ref: null } });
    expect(first.body.view.lines.map((l: any) => l.estimation.state)).toEqual(["CALCULATING", "CALCULATING"]);
    jobs["J1"] = first.body.view.link.job_ref;
    const job = await prisma.estimationJob.findUniqueOrThrow({ where: { id: jobs["J1"] } });
    expect(job.requestId).toBe(derivedJobRequestId(proposals["P1"]!, requestId));
    expect([...(job.productRefs as string[])].sort()).toEqual([products["Herbicida"], products["Fungicida"]].sort());
    expect(await prisma.estimationJob.count()).toBe(jobsBefore + 1);

    // A retry (double tap) answers the same without writing; another body with the same id is refused.
    expect((await initial(proposals["P1"]!, requestId)).body.outcome).toBe("REQUESTED_JOB");
    const reused = await update(proposals["P1"]!, first.body.view.link.link_ref, requestId);
    expect(reused.status).toBe(409);
    expect(reused.body).toEqual({ errorCode: "REQUEST_ID_REUSED" });
    // Another tab: INITIAL with a reference in force writes nothing.
    expect((await initial(proposals["P1"]!)).body.outcome).toBe("EXISTING");
    // No update while it calculates; a stale reference is refused with the view in force.
    const upToDate = await update(proposals["P1"]!, first.body.view.link.link_ref);
    expect(upToDate.status).toBe(409);
    expect(upToDate.body.errorCode).toBe("REFERENCE_UP_TO_DATE");
    expect(upToDate.body.view.state).toBe("CALCULATING");
    const stale = await update(proposals["P1"]!, randomUUID());
    expect(stale.status).toBe(409);
    expect(stale.body.errorCode).toBe("REFERENCE_CHANGED");
    expect(stale.body.view.link.link_ref).toBe(first.body.view.link.link_ref);
    expect((await prepare(proposals["P1"]!, { request_id: "x", mode: "INITIAL" })).body).toEqual({ errorCode: "PAYLOAD_INVALID" });
    expect((await prepare(proposals["P1"]!, { request_id: randomUUID(), mode: "UPDATE" })).body).toEqual({ errorCode: "PAYLOAD_INVALID" });
    expect((await prepare(proposals["P1"]!, { request_id: randomUUID(), mode: "INITIAL", extra: 1 })).body).toEqual({ errorCode: "PAYLOAD_INVALID" });
    expect(await linkCount(proposals["P1"]!)).toBe(1);
    expect(await prisma.estimationJob.count()).toBe(jobsBefore + 1);
    expect(changed(before, await snapshot())).toEqual(["EstimationJob", "JointPurchaseProposalEstimationLink"]);

    // The selection is editable while it calculates, with optimistic control and an audit entry.
    const sel = `${COLLECTIVE}/proposals/${proposals["P1"]}/selection`;
    expect((await http().get(sel).set(auth(director))).body).toMatchObject({ revision: 0, product_refs: [] });
    const saved = await putSelection(proposals["P1"]!, { expected_revision: 0, product_refs: [products["Fungicida"], products["Herbicida"]] });
    expect(saved.status).toBe(200);
    const order = (await view(proposals["P1"]!)).lines.map((l: any) => l.product.product_ref);
    expect(saved.body).toMatchObject({ revision: 1, product_refs: order });
    const secondTab = await putSelection(proposals["P1"]!, { expected_revision: 0, product_refs: [products["Herbicida"]] }, admin);
    expect(secondTab.status).toBe(409);
    expect(secondTab.body).toMatchObject({ errorCode: "SELECTION_STALE", selection: { revision: 1, product_refs: order } });
    expect((await putSelection(proposals["P1"]!, { expected_revision: 1, product_refs: [products["Coadyuvante"]] })).body).toEqual({ errorCode: "PRODUCT_NOT_IN_PROPOSAL" });
    expect((await putSelection(proposals["P1"]!, { expected_revision: 1, product_refs: [products["Herbicida"], products["Herbicida"]] })).body).toEqual({ errorCode: "PAYLOAD_INVALID" });
    expect((await putSelection(proposals["P1"]!, { expected_revision: 1, product_refs: [products["Herbicida"]] }, admin)).body).toMatchObject({ revision: 2 });
    expect(await prisma.auditLog.count({ where: { entityName: "JointPurchaseProposalSelection", entityId: proposals["P1"] } })).toBe(2);
    await expect(prisma.jointPurchaseProposalSelection.delete({ where: { proposalId: proposals["P1"] } })).rejects.toThrow();

    // Two prepares at once on another draft: one queue entry is reused once, the other sees it.
    proposals["P2"] = await generate();
    const pair = await Promise.all([initial(proposals["P2"]!), initial(proposals["P2"]!)]);
    expect(pair.map((r) => r.body.outcome).sort()).toEqual(["EXISTING", "REUSED_JOB"]);
    expect(await linkCount(proposals["P2"]!)).toBe(1);
    // The same request twice at once: the same answer, one link.
    proposals["P3"] = await generate();
    const same = randomUUID();
    const twins = await Promise.all([initial(proposals["P3"]!, same), initial(proposals["P3"]!, same)]);
    expect(twins.map((r) => r.body.outcome)).toEqual(["REUSED_JOB", "REUSED_JOB"]);
    expect(await linkCount(proposals["P3"]!)).toBe(1);
    expect((await view(proposals["P3"]!)).link.job_ref).toBe(jobs["J1"]);
    expect(await prisma.estimationJob.count()).toBe(jobsBefore + 1);
  });

  it("once calculated, the line shows need and estimate separately and never a difference without verified population", async () => {
    expect(await worker.processNext()).toMatchObject({ jobId: jobs["J1"], status: "COMPLETED", outcome: "CALCULATED" });
    runs["R1"] = (await prisma.estimationRun.findUniqueOrThrow({ where: { jobId: jobs["J1"] } })).id;
    const before = await snapshot();
    const linked = await view(proposals["P1"]!);
    expect(linked).toMatchObject({
      state: "LINKED",
      run: { run_ref: runs["R1"], job_ref: jobs["J1"], outcome: "CALCULATED", method: "SES_NAIVE", season: { key: "INVIERNO" }, target: { campaign_ref: campaigns["T"] } },
      update: { available: false, reason: null },
      prepare_blocker: null,
    });
    expect(lineOf(linked, "Herbicida")).toMatchObject({
      need: { status: "DISCLOSED", quantity_base: "120000" },
      estimation: { state: "AVAILABLE", status: "ESTIMATED", estimate_base: "111000.000000", validity: "CURRENT" },
      comparison: { comparable: false, blockers: ["POPULATION_NOT_VERIFIED"], message: POPULATION_MESSAGE, difference: null },
    });
    expect(lineOf(linked, "Fungicida")).toMatchObject({ estimation: { state: "INSUFFICIENT_DATA", estimate_base: null } });
    expect(lineOf(linked, "Fungicida").comparison.blockers).toEqual(["ESTIMATE_NOT_AVAILABLE", "POPULATION_NOT_VERIFIED"]);
    expect(linked.history).toEqual([expect.objectContaining({ sequence: 1, action: "REQUEST_JOB", run_ref: runs["R1"], job_status: "COMPLETED", current: true })]);
    // It is F12's own reading of that run.
    const direct = await http().get(`/api/v1/estimation/runs/${runs["R1"]}`).set(auth(director));
    expect(direct.body.results.find((r: any) => r.product.product_ref === products["Herbicida"]).estimate_base).toBe("111000.000000");
    demo["estimation_link_view"] = linked;
    expect(changed(before, await snapshot())).toEqual([]);

    // A compatible run is reused: no new job.
    proposals["P4"] = await generate();
    const jobsBefore = await prisma.estimationJob.count();
    const linkedExisting = await initial(proposals["P4"]!);
    expect(linkedExisting.body).toMatchObject({ outcome: "LINKED_EXISTING_RUN", view: { state: "LINKED", link: { action: "LINK_EXISTING_RUN", run_ref: runs["R1"], job_ref: null } } });
    expect(await prisma.estimationJob.count()).toBe(jobsBefore);
    // The F12 routes are unchanged: the reference «vigente al consultar» and the draft itself.
    expect((await http().get(`${COLLECTIVE}/proposals/${proposals["P1"]}/estimation-reference`).set(auth(director))).status).toBe(200);
  });

  it("a later run only enables «Actualizar referencia»; the update is explicit and REFERENCE_CHANGED protects it", async () => {
    runs["R2"] = await runF12();
    const p4 = await view(proposals["P4"]!);
    expect(p4.update).toEqual({ available: true, reason: "NEWER_RUN" });
    expect(p4.run.run_ref).toBe(runs["R1"]);
    expect(lineOf(p4, "Herbicida")).toMatchObject({
      estimation: { state: "OUTDATED", estimate_base: "111000.000000", validity: "SUPERSEDED", validity_reason: "LATER_RUN" },
      comparison: { blockers: ["ESTIMATE_NOT_CURRENT", "POPULATION_NOT_VERIFIED"], difference: null },
    });
    const updated = await update(proposals["P4"]!, p4.link.link_ref);
    expect(updated.body).toMatchObject({ outcome: "LINKED_EXISTING_RUN", view: { state: "LINKED", run: { run_ref: runs["R2"] }, link: { sequence: 2, mode: "UPDATE" }, update: { available: false } } });
    expect(updated.body.view.history.map((h: any) => [h.sequence, h.run_ref, h.current])).toEqual([[1, runs["R1"], false], [2, runs["R2"], true]]);
    // The tab that still shows the first reference.
    const late = await update(proposals["P4"]!, p4.link.link_ref);
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({ errorCode: "REFERENCE_CHANGED", view: { link: { sequence: 2 } } });
    expect((await view(proposals["P1"]!)).update).toEqual({ available: true, reason: "NEWER_RUN" });
  });

  it("changed sources make a run incompatible, also for a line without figure; a queued job is reused", async () => {
    // Only the Fungicida line (no consumption: INSUFFICIENT_DATA): compatible before the change.
    proposals["PF"] = await storedDraft(campaigns["T"]!, [products["Fungicida"]!]);
    const reads = app.get(EstimationReadsUseCase);
    const fungicideFacts = async () => (await reads.resultFacts(f.tenantA, runs["R2"]!))!.results.find((r) => r.product_ref === products["Fungicida"])!;
    expect(await fungicideFacts()).toMatchObject({ status: "INSUFFICIENT_DATA", estimate_base: null, facts: { sourcesChanged: false } });
    expect((await view(proposals["PF"]!)).prepare_blocker).toBeNull();
    await classify(campaigns["X"]!);
    // Without a figure, its validity says nothing (NOT_USABLE/NO_FIGURE), but the facts do: its sources changed.
    expect(await fungicideFacts()).toMatchObject({ status: "INSUFFICIENT_DATA", validity: "NOT_USABLE", validity_reason: "NO_FIGURE", estimate_base: null, facts: { sourcesChanged: true } });
    const p4 = await view(proposals["P4"]!);
    expect(p4.update).toEqual({ available: true, reason: "OUTDATED" });
    expect(lineOf(p4, "Herbicida").estimation).toMatchObject({ state: "OUTDATED", validity: "OUTDATED", validity_reason: "SOURCES_CHANGED", estimate_base: "111000.000000" });
    const fungicide = await http().get(`/api/v1/estimation/runs/${runs["R2"]}`).set(auth(director));
    expect(fungicide.body.results.find((r: any) => r.product.product_ref === products["Fungicida"])).toMatchObject({ status: "INSUFFICIENT_DATA", validity: "NOT_USABLE" });
    const queued = await http()
      .post("/api/v1/estimation/jobs")
      .set(auth(admin))
      .send({ contract_version: 1, request_id: randomUUID(), target_campaign_ref: campaigns["T"], product_refs: [products["Herbicida"], products["Fungicida"]] });
    jobs["J3"] = queued.body.job_ref;
    const onlyFungicide = await initial(proposals["PF"]!);
    expect(onlyFungicide.body).toMatchObject({ outcome: "REUSED_JOB", view: { state: "CALCULATING", link: { job_ref: jobs["J3"] } } });
    const p1 = await view(proposals["P1"]!);
    const updated = await update(proposals["P1"]!, p1.link.link_ref);
    expect(updated.body).toMatchObject({ outcome: "REUSED_JOB", view: { state: "CALCULATING", link: { job_ref: jobs["J3"], sequence: 2 } } });
  });

  it("a late result has no effect on a cleared reference; it only shows in the history", async () => {
    proposals["P5"] = await generate();
    const prepared = await initial(proposals["P5"]!);
    expect(prepared.body).toMatchObject({ outcome: "REUSED_JOB", view: { link: { job_ref: jobs["J3"] } } });
    const clearId = randomUUID();
    const cleared = await clear(proposals["P5"]!, { request_id: clearId, expected_link_ref: prepared.body.view.link.link_ref });
    expect(cleared.body).toMatchObject({ outcome: "CLEARED", view: { state: "NONE", link: null } });
    expect((await clear(proposals["P5"]!, { request_id: clearId, expected_link_ref: prepared.body.view.link.link_ref })).body.outcome).toBe("CLEARED");
    const again = await clear(proposals["P5"]!, { request_id: randomUUID(), expected_link_ref: cleared.body.view.history[1].link_ref });
    expect(again.status).toBe(409);
    expect(again.body.errorCode).toBe("REFERENCE_UP_TO_DATE");
    expect(await linkCount(proposals["P5"]!)).toBe(2);

    expect(await worker.processNext()).toMatchObject({ jobId: jobs["J3"], status: "COMPLETED", outcome: "CALCULATED" });
    runs["R3"] = (await prisma.estimationRun.findUniqueOrThrow({ where: { jobId: jobs["J3"] } })).id;
    const p5 = await view(proposals["P5"]!);
    expect(p5).toMatchObject({ state: "NONE", link: null, run: null });
    expect(p5.history.map((h: any) => [h.action, h.run_ref, h.current])).toEqual([["REUSE_JOB", runs["R3"], false], ["CLEAR", null, true]]);
    expect(p5.lines.every((l: any) => l.estimation.state === "NONE" && l.estimation.estimate_base === null)).toBe(true);
    // The drafts that kept it now show it.
    expect((await view(proposals["P1"]!)).run.run_ref).toBe(runs["R3"]);
    expect((await view(proposals["PF"]!)).state).toBe("LINKED");
    // After clearing, INITIAL fixes the compatible run that exists now.
    expect((await initial(proposals["P5"]!)).body).toMatchObject({ outcome: "LINKED_EXISTING_RUN", view: { link: { run_ref: runs["R3"], sequence: 3 } } });
  });

  it("a failed calculation and a job not executed leave the draft usable and offer an update", async () => {
    await classify(campaigns["Y"]!);
    proposals["P6"] = await generate();
    const prepared = await initial(proposals["P6"]!);
    expect(prepared.body.outcome).toBe("REQUESTED_JOB");
    const spy = jest.spyOn(series, "assessIn").mockRejectedValueOnce(new Error("fallo determinista sintético"));
    try {
      expect(await worker.processNext()).toMatchObject({ status: "COMPLETED", outcome: "FAILED" });
    } finally {
      spy.mockRestore();
    }
    const failed = await view(proposals["P6"]!);
    expect(failed).toMatchObject({ state: "UNAVAILABLE", update: { available: true, reason: "FAILED" }, link: { failure_code: "CALCULATION_FAILED" } });
    expect(failed.lines.map((l: any) => [l.estimation.state, l.need.status])).toEqual([["ERROR", "DISCLOSED"], ["ERROR", "DISCLOSED"]]);
    expect((await putSelection(proposals["P6"]!, { expected_revision: 0, product_refs: [products["Herbicida"]] })).status).toBe(200);

    // Asked by another Directiva who is deactivated before the worker takes the job: NOT_EXECUTED.
    const retried = await update(proposals["P6"]!, failed.link.link_ref, randomUUID(), director3);
    expect(retried.body.outcome).toBe("REQUESTED_JOB");
    await prisma.member.update({ where: { id: director3.memberId }, data: { isActive: false } });
    try {
      expect(await worker.processNext()).toMatchObject({ status: "NOT_EXECUTED", stopCode: "REQUESTER_NOT_AUTHORIZED" });
    } finally {
      await prisma.member.update({ where: { id: director3.memberId }, data: { isActive: true } });
    }
    const stopped = await view(proposals["P6"]!);
    expect(stopped).toMatchObject({
      state: "UNAVAILABLE",
      update: { available: true, reason: "NOT_EXECUTED" },
      link: { job_status: "NOT_EXECUTED", stop_code: "REQUESTER_NOT_AUTHORIZED", created_by: { role: "DIRECTIVA" } },
    });
    expect(stopped.lines.every((l: any) => l.estimation.state === "ERROR")).toBe(true);
  });

  it("explains why it cannot calculate and writes nothing", async () => {
    const before = await snapshot();
    const unclassified = await storedDraft(campaigns["Z"]!, [products["Herbicida"]!]);
    const closed = await storedDraft(f.campaigns.closedA, [products["Herbicida"]!]);
    const notEstimable = await storedDraft(campaigns["T"]!, [products["Coadyuvante"]!]);
    const afterDrafts = await snapshot();
    for (const [id, reason] of [[unclassified, "TARGET_CAMPAIGN_NOT_CLASSIFIED"], [closed, "TARGET_CAMPAIGN_NOT_ELIGIBLE"], [notEstimable, "NO_ESTIMABLE_PRODUCTS"]] as const) {
      expect((await view(id)).prepare_blocker).toBe(reason);
      const res = await initial(id);
      expect(res.body).toMatchObject({ outcome: "NOT_CALCULABLE", reason, view: { state: "NONE" } });
      expect(await linkCount(id)).toBe(0);
    }
    expect(changed(afterDrafts, await snapshot())).toEqual([]);
    expect(changed(before, afterDrafts)).toEqual(["JointPurchaseProposal", "JointPurchaseProposalLine"]);
    // The base refuses a link whose run is of another campaign, and any change of a link.
    await expect(
      prisma.jointPurchaseProposalEstimationLink.create({
        data: { proposalId: unclassified, tenantId: f.tenantA, sequence: 1, requestId: randomUUID(), requestHash: "e".repeat(64), mode: "INITIAL", action: "LINK_EXISTING_RUN", runId: runs["R1"], createdByUserId: directorUser, createdByRole: "DIRECTIVA" },
      }),
    ).rejects.toThrow();
    const link = await prisma.jointPurchaseProposalEstimationLink.findFirstOrThrow({ where: { proposalId: proposals["P1"] } });
    await expect(prisma.jointPurchaseProposalEstimationLink.update({ where: { id: link.id }, data: { createdByRole: "ADMINISTRADOR" } })).rejects.toThrow();
    await expect(prisma.jointPurchaseProposalEstimationLink.delete({ where: { id: link.id } })).rejects.toThrow();
  });

  it("with the policy pending: no figure, the link stays visible and prepare writes nothing", async () => {
    (collective as { mode: string }).mode = "POLICY_PENDING";
    try {
      const before = await snapshot();
      const restricted = await view(proposals["P5"]!);
      expect(restricted).toMatchObject({ state: "RESTRICTED", prepare_blocker: "POLICY_PENDING", link: { run_ref: runs["R3"] } });
      expect(restricted.lines.map((l: any) => [l.estimation.state, l.estimation.estimate_base, l.need.quantity_base])).toEqual([["RESTRICTED", null, null], ["RESTRICTED", null, null]]);
      expect(JSON.stringify(restricted)).not.toMatch(/111000|120000/);
      const refused = await initial(proposals["P6"]!);
      expect(refused.status).toBe(409);
      expect(refused.body).toEqual({ errorCode: "POLICY_PENDING" });
      expect(changed(before, await snapshot())).toEqual([]);
    } finally {
      (collective as { mode: string }).mode = "PROVISIONAL_SYNTHETIC";
    }
  });

  it("a withdrawn source hides the fixed figure (RESTRICTED) and makes the run incompatible", async () => {
    // F07 withdraws the visibility of a sealed figure (a sealed release itself cannot change).
    await prisma.collectiveSealEntry.update({
      where: {
        sealId_projectionType_canonicalProductId_baseUnit: {
          sealId: sources[3]!.sealId, projectionType: "CONSUMPTION_TOTAL", canonicalProductId: products["Herbicida"]!, baseUnit: "ML",
        },
      },
      data: { visibilityWithdrawnAt: new Date() },
    });
    const p5 = await view(proposals["P5"]!);
    expect(lineOf(p5, "Herbicida").estimation).toMatchObject({ state: "RESTRICTED", estimate_base: null, validity_reason: "SOURCES_WITHDRAWN" });
    expect(p5.update).toEqual({ available: true, reason: "OUTDATED" });
    expect(p5.link.run_ref).toBe(runs["R3"]);
    expect(JSON.stringify(p5)).not.toContain("111000");
    // The F12 reference hides it the same way.
    const reference = await http().get(`${COLLECTIVE}/proposals/${proposals["P5"]}/estimation-reference`).set(auth(director));
    expect(JSON.stringify(reference.body)).not.toContain("111000");
  });

  it("has no effects on needs, the draft, calls, participations, purchases, stock, accounts or payments", async () => {
    const end = await snapshot();
    expect(UNTOUCHED.filter((name) => name !== "JointPurchaseProposal" && name !== "JointPurchaseProposalLine").map((name) => end.get(name))).toEqual(
      UNTOUCHED.filter((name) => name !== "JointPurchaseProposal" && name !== "JointPurchaseProposalLine").map((name) => untouchedAtStart.get(name)),
    );
    // The first draft, its lines and its fingerprint are as generated.
    expect(await prisma.jointPurchaseProposal.findUniqueOrThrow({ where: { id: proposals["P1"] }, include: { lines: { orderBy: { position: "asc" } } } })).toEqual(draftAtStart);
  });
});
