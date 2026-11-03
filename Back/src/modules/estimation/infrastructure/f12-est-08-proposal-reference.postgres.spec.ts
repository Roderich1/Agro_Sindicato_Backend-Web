import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { proposalCsv, ProposalView } from "../../collective/application/joint-purchase-proposal.use-case";
import { createIsolatedDatabase, createSession, createSyncV1App, Fixture, seedFixture, TestSession, unusablePasswordHash } from "../../sync-v1/test-support/sync-v1-test-app";
import { EstimationWorker } from "../application/estimation-worker";

/**
 * F12-EST-08 (#181): the estimation as a separate reference of a joint
 * purchase proposal and of its CSV export, over PostgreSQL and HTTP.
 *
 * Only synthetic data. The consumption sources are real F07 seals (Sync v1
 * publications by synthetic farmers, close and manual seal over the API); the
 * proposal comes from declared needs published the same way. The worker is
 * driven explicitly (ESTIMATION_WORKER=disabled).
 *
 * With F12_DEMO_OUT set, the demonstration is written there as JSON.
 */
const postgresUrl = process.env["F12_EST_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const PUSH = "/api/v1/sync/v1/push";
/** Private tables of purchases, lots, movements, debts and payments. */
const PRIVATE_TABLES = ["Purchase", "PurchaseItem", "PurchaseItemAllocation", "PurchaseParticipant", "InventoryLot", "StockMovement", "PayableAccount", "Payment"];
const REFERENCE_HEAD = ["estimation_reference", "estimation_availability", "estimation_evaluated_at", "estimation_season", "estimation_notice"];
const REFERENCE_LINE = [
  "estimation_absence",
  "estimation_status",
  "estimation_reason_code",
  "estimation_estimate_base",
  "estimation_validity",
  "estimation_validity_reason",
  "estimation_method",
  "estimation_run_ref",
  "estimation_run_generated_at",
  "estimation_run_relation",
];

type Type = "CONSUMPTION_TOTAL" | "DECLARED_NEED";
interface Estimation {
  status: string;
  reason_code: string | null;
  estimate_base: string | null;
  validity: string;
  validity_reason: string | null;
  method: string;
  run_ref: string;
  generated_at: string;
  span_length: number | null;
  run_relation: "BEFORE_PROPOSAL" | "AFTER_PROPOSAL";
}
interface ReferenceLine {
  position: number;
  product_ref: string;
  base_unit: string;
  presentation_unit: string;
  absence: "NO_RESULT" | "POLICY_PENDING" | null;
  estimation: Estimation | null;
}
interface Reference {
  label: string;
  proposal_ref: string;
  proposal_generated_at: string;
  target_campaign_ref: string;
  availability: "AVAILABLE" | "POLICY_PENDING";
  evaluated_at: string;
  season: { key: string } | null;
  lines: ReferenceLine[];
  notice: string;
}

/** RFC 4180 rows, as the proposal CSV writes them (quoted fields, `\n`). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  return rows;
}

describePostgres("F12-EST-08 estimation reference of a joint purchase proposal", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let collective: CollectiveConfig;
  let worker: EstimationWorker;
  let f: Fixture;
  let director: TestSession;
  let admin: TestSession;
  let farmer: TestSession;
  let directorB: TestSession;
  let directorUser: string;
  const farmers: Record<string, TestSession> = {};
  const products: Record<string, string> = {};
  const campaigns: Record<string, string> = {};
  const seasons: Record<string, string> = {};
  const heads = new Map<string, string>();
  const proposals: Record<string, string> = {};
  const views: Record<string, ProposalView> = {};
  const runs: Record<string, string> = {};
  const demo: Record<string, unknown> = {};

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    process.env["COLLECTIVE_SEALING"] = "enabled";
    process.env["ESTIMATION_WORKER"] = "disabled";
    const url = await createIsolatedDatabase(postgresUrl!, "f12_est08");
    ({ app, prisma, jwt } = await createSyncV1App(url));
    collective = app.get(CollectiveConfig);
    worker = app.get(EstimationWorker);
    f = await seedFixture(prisma);
    directorUser = (await prisma.member.findUniqueOrThrow({ where: { id: f.members.directorA } })).userId;
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    farmer = await createSession(prisma, jwt, f.members.farmerA);
    directorB = await person("DIRECTIVA", f.tenantB);
    for (const key of ["F1", "F2", "F3"]) farmers[key] = await person("AGRICULTOR");
    farmers["B1"] = await person("AGRICULTOR", f.tenantB);
    for (const [key, label] of [["Herbicida", "Herbicida de referencia"], ["Fungicida", "Fungicida de referencia"], ["Insecticida", "Insecticida de referencia"]] as const) {
      products[key] = (await prisma.product.create({ data: { tenantId: f.tenantA, name: label, unit: "L" } })).id;
    }
    // INVIERNO: the 3.12.5 example (96, 120, 104 and 116 L); Fungicida only in the last two campaigns.
    await sealedCampaign("C1", 2015, [["Herbicida", ["32000", "32000", "32000"]]]);
    await sealedCampaign("C2", 2016, [["Herbicida", ["40000", "40000", "40000"]]]);
    await sealedCampaign("C3", 2017, [["Herbicida", ["34000", "35000", "35000"]], ["Fungicida", ["100", "100", "100"]]]);
    await sealedCampaign("C4", 2018, [["Herbicida", ["38000", "39000", "39000"]], ["Fungicida", ["200", "200", "200"]]]);
    // The target: open, with needs declared by three farmers (Insecticida by two: under the threshold).
    await campaign("T", 2019, "ABIERTA");
    for (const [i, quantity] of ["30000", "40000", "50000"].entries()) await push(`F${i + 1}`, "DECLARED_NEED", campaigns["T"]!, "Herbicida", quantity);
    for (const [i, quantity] of ["500", "700", "800"].entries()) await push(`F${i + 1}`, "DECLARED_NEED", campaigns["T"]!, "Fungicida", quantity);
    for (const [i, quantity] of ["1000", "2000"].entries()) await push(`F${i + 1}`, "DECLARED_NEED", campaigns["T"]!, "Insecticida", quantity);
    await campaign("X", 2020, "PLANIFICADA");
    await season("INVIERNO");
    await classify("INVIERNO", ["C1", "C2", "C3", "C4", "T"]);
  }, 300000);

  afterAll(async () => {
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    delete process.env["COLLECTIVE_SEALING"];
    delete process.env["ESTIMATION_WORKER"];
    if (process.env["F12_DEMO_OUT"]) writeFileSync(process.env["F12_DEMO_OUT"], `${JSON.stringify(demo, null, 2)}\n`, "utf8");
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });

  async function person(role: "AGRICULTOR" | "DIRECTIVA", tenantId = f.tenantA): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name: `Persona sintética ${role}`, email: `f12r8-${userId}@example.test`, passwordHash: unusablePasswordHash(), role,
        members: { create: { id: memberId, tenantId, role } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function push(farmerKey: string, type: Type, campaignId: string, product: string, quantity: string | null, productRef = products[product]) {
    const key = `${farmerKey}|${type}|${campaignId}|${product}`;
    const operationId = randomUUID();
    const action = quantity === null ? "CANCEL" : heads.has(key) ? "SUPERSEDE" : "PUBLISH";
    const payload = JSON.stringify({
      contractVersion: 1, operationId, projectionType: type, action,
      causal: { predecessorOperationId: heads.get(key) ?? null, reconciliationReference: null },
      payload: { campaign_ref: campaignId, product_ref: productRef, base_unit: "ML", ...(quantity === null ? {} : { quantity_base: quantity }) },
    });
    const res = await http().post(PUSH).set("Content-Type", "application/json").set(auth(farmers[farmerKey]!)).send(payload);
    expect(res.body.outcome).toBe("APPLIED");
    heads.set(key, operationId);
  }

  async function campaign(key: string, year: number, status: "ABIERTA" | "PLANIFICADA") {
    campaigns[key] = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id: campaigns[key], tenantId: f.tenantA, name: `Campaña sintética ${key}`, status, isActive: status === "ABIERTA", startDate: new Date(`${year}-09-01T00:00:00.000Z`) },
    });
  }

  async function closeAndSeal(campaignId: string) {
    expect((await http().post(`/api/v1/campaigns/${campaignId}/close`).set(auth(director)).send({})).status).toBe(200);
    const state = await http().get(`/api/v1/collective/campaigns/${campaignId}/seal`).set(auth(director));
    expect(state.body.can_seal).toBe(true);
    const sealed = await http().post(`/api/v1/collective/campaigns/${campaignId}/seal`).set(auth(director)).send({ confirmed: true, review_ref: state.body.review.review_ref });
    expect(sealed.status).toBe(200);
  }

  async function sealedCampaign(key: string, year: number, rows: [string, [string, string, string]][]) {
    await campaign(key, year, "ABIERTA");
    for (const [product, quantities] of rows) for (const [i, quantity] of quantities.entries()) await push(`F${i + 1}`, "CONSUMPTION_TOTAL", campaigns[key]!, product, quantity);
    await closeAndSeal(campaigns[key]!);
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
      await prisma.campaignSeasonClassification.create({
        data: { tenantId: f.tenantA, campaignId: campaigns[key]!, version: 1, seasonId: seasons[seasonKey]!, classifiedByUserId: directorUser, classifiedByRole: "DIRECTIVA" },
      });
    }
  }

  /** Queues a job for T over HTTP and lets the worker carry it out. */
  async function estimate(): Promise<string> {
    const res = await http().post("/api/v1/estimation/jobs").set(auth(director)).send({ contract_version: 1, request_id: randomUUID(), target_campaign_ref: campaigns["T"] });
    expect(res.status).toBe(202);
    expect(await worker.processNext()).toMatchObject({ jobId: res.body.job_ref, status: "COMPLETED", outcome: "CALCULATED" });
    return (await prisma.estimationJob.findUniqueOrThrow({ where: { id: res.body.job_ref }, include: { run: true } })).run!.id;
  }

  async function generate(): Promise<ProposalView> {
    const res = await http().post(`/api/v1/collective/campaigns/${campaigns["T"]}/proposals`).set(auth(director));
    expect(res.status).toBe(201);
    return res.body as ProposalView;
  }
  const view = async (id: string, session = director): Promise<ProposalView> => {
    const res = await http().get(`/api/v1/collective/proposals/${id}`).set(auth(session));
    expect(res.status).toBe(200);
    return res.body as ProposalView;
  };
  const reference = async (id: string, session = director): Promise<Reference> => {
    const res = await http().get(`/api/v1/collective/proposals/${id}/estimation-reference`).set(auth(session));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    return res.body as Reference;
  };
  const csv = async (id: string, session = director): Promise<string> => {
    const res = await http().get(`/api/v1/collective/proposals/${id}/csv`).set(auth(session));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    return res.text as string;
  };
  const lineOf = (ref: Reference, product: string) => ref.lines.find((l) => l.product_ref === products[product])!;
  /** What the lines carry: the functional content of the draft, without the reference. */
  const linesOf = (v: ProposalView) => v.lines.map((l) => [l.position, l.product_ref, l.base_unit, l.status, l.quantity_base, l.contributors]);
  /** Sum of the published line quantities, in base units, as the draft serves them. */
  const total = (v: ProposalView) => v.lines.reduce((sum, l) => sum + BigInt(l.quantity_base ?? "0"), 0n).toString();

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
  async function privateCounts() {
    return Promise.all([
      prisma.purchase.count(), prisma.purchaseItem.count(), prisma.purchaseItemAllocation.count(), prisma.purchaseParticipant.count(),
      prisma.inventoryLot.count(), prisma.stockMovement.count(), prisma.payableAccount.count(), prisma.payment.count(),
    ]);
  }

  /**
   * The CSV is the proposal's own CSV with the reference appended: without the
   * `estimation_*` columns it is `proposalCsv(view)` field by field, and those
   * columns carry exactly the JSON reference read in the same state.
   */
  function expectConsistentCsv(text: string, v: ProposalView, ref: Reference) {
    const own = parseCsv(proposalCsv(v));
    const rows = parseCsv(text);
    expect(rows).toHaveLength(own.length);
    const extra = (i: number) => (i === 0 || i === 1 ? REFERENCE_HEAD.length : i === 2 || i === 3 ? 0 : REFERENCE_LINE.length);
    rows.forEach((row, i) => {
      expect(row.slice(0, own[i]!.length)).toEqual(own[i]);
      expect(row.length - own[i]!.length).toBe(extra(i));
    });
    expect(rows[0]!.slice(-REFERENCE_HEAD.length)).toEqual(REFERENCE_HEAD);
    const [label, availability, evaluatedAt, seasonKey, notice] = rows[1]!.slice(-REFERENCE_HEAD.length);
    expect([label, availability, seasonKey, notice]).toEqual([ref.label, ref.availability, ref.season?.key ?? "", ref.notice]);
    // The export evaluates validity at its own moment, after the JSON read it is compared with.
    expect(Date.parse(evaluatedAt!)).toBeGreaterThanOrEqual(Date.parse(ref.evaluated_at));
    expect(rows[4]!.slice(-REFERENCE_LINE.length)).toEqual(REFERENCE_LINE);
    for (const row of rows.slice(5)) {
      const position = Number(row[0]);
      const line = ref.lines.find((l) => l.position === position)!;
      const e = line.estimation;
      expect(row.slice(-REFERENCE_LINE.length)).toEqual(
        [line.absence, e?.status, e?.reason_code, e?.estimate_base, e?.validity, e?.validity_reason, e?.method, e?.run_ref, e?.generated_at, e?.run_relation].map((value) => value ?? ""),
      );
    }
  }

  it("rejects without a session, for the Farmer and across tenants, and writes nothing", async () => {
    const before = await snapshot();
    const own = await generate();
    proposals["P0"] = own.proposal_ref;
    views["P0"] = own;
    const afterGenerate = await snapshot();
    // A tenant B draft on its own open campaign, with three farmers of B.
    for (const key of ["B2", "B3"]) farmers[key] = await person("AGRICULTOR", f.tenantB);
    for (const key of ["B1", "B2", "B3"]) await push(key, "DECLARED_NEED", f.campaigns.openB, "HerbicidaB", "1000", f.products.liquidB);
    const other = await http().post(`/api/v1/collective/campaigns/${f.campaigns.openB}/proposals`).set(auth(directorB));
    expect(other.status).toBe(201);
    const reads = await snapshot();
    for (const path of ["estimation-reference", "csv"]) {
      expect((await http().get(`/api/v1/collective/proposals/${proposals["P0"]}/${path}`)).status).toBe(401);
      const forbidden = await http().get(`/api/v1/collective/proposals/${proposals["P0"]}/${path}`).set(auth(farmer));
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual({ statusCode: 403, message: "No tienes permisos para esta acción", error: "Forbidden" });
      // Another tenant's draft is indistinguishable from a missing one, in both directions.
      expect((await http().get(`/api/v1/collective/proposals/${other.body.proposal_ref}/${path}`).set(auth(director))).status).toBe(404);
      expect((await http().get(`/api/v1/collective/proposals/${proposals["P0"]}/${path}`).set(auth(directorB))).status).toBe(404);
      expect((await http().get(`/api/v1/collective/proposals/${randomUUID()}/${path}`).set(auth(director))).status).toBe(404);
      expect((await http().get(`/api/v1/collective/proposals/no-es-uuid/${path}`).set(auth(director))).status).toBe(400);
    }
    // The Administrador reads it like the Directiva.
    expect((await reference(proposals["P0"]!, admin)).lines).toHaveLength(3);
    expect(changed(reads, await snapshot())).toEqual([]);
    demo["rejections"] = { generated_tables: changed(before, afterGenerate) };
  });

  it("without any estimation, explains the absence per line, never a zero; reading writes nothing", async () => {
    const before = await snapshot();
    const ref = await reference(proposals["P0"]!);
    expect(ref).toMatchObject({
      label: "Estimación del consumo", proposal_ref: proposals["P0"], target_campaign_ref: campaigns["T"], availability: "AVAILABLE",
      season: { key: "INVIERNO" }, proposal_generated_at: views["P0"]!.generated_at,
    });
    expect(ref.lines.map((l) => [l.product_ref, l.absence, l.estimation])).toEqual(views["P0"]!.lines.map((l) => [l.product_ref, "NO_RESULT", null]));
    expect(ref.notice).toMatch(/no se suma a la necesidad declarada/i);
    const text = await csv(proposals["P0"]!);
    expectConsistentCsv(text, views["P0"]!, ref);
    expect(changed(before, await snapshot())).toEqual([]);
    demo["without_estimation"] = { lines: ref.lines.map((l) => ({ position: l.position, absence: l.absence })) };
  });

  it("with an estimation available, a new draft has the same lines, totals and fingerprint; the earlier one is unchanged", async () => {
    const privateBefore = await privateCounts();
    const tablesBefore = await snapshot();
    runs["R1"] = await estimate();
    const p1 = await generate();
    proposals["P1"] = p1.proposal_ref;
    views["P1"] = p1;
    const p0 = views["P0"]!;
    expect(p1.inputs_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(p1.inputs_fingerprint).toBe(p0.inputs_fingerprint);
    expect(linesOf(p1)).toEqual(linesOf(p0));
    expect(total(p1)).toBe(total(p0));
    // Herbicida 30 + 40 + 50 L and Fungicida 0.5 + 0.7 + 0.8 L; Insecticida is under the threshold.
    expect(total(p1)).toBe("122000");
    // The stored lines carry no estimate: same columns, same values.
    const stored = await prisma.jointPurchaseProposalLine.findMany({ where: { proposalId: { in: [p0.proposal_ref, p1.proposal_ref] } }, orderBy: [{ proposalId: "asc" }, { position: "asc" }] });
    const strip = (rows: typeof stored, id: string) => rows.filter((r) => r.proposalId === id).map(({ proposalId: _, ...rest }) => rest);
    expect(strip(stored, p1.proposal_ref)).toEqual(strip(stored, p0.proposal_ref));
    // Reading P0 again gives exactly what it gave before the estimation existed.
    expect(await view(p0.proposal_ref)).toEqual(p0);
    expect(await privateCounts()).toEqual(privateBefore);
    const generatedChanges = changed(tablesBefore, await snapshot());
    expect(generatedChanges.filter((name) => PRIVATE_TABLES.includes(name))).toEqual([]);

    const before = await snapshot();
    const r1 = await reference(p1.proposal_ref);
    const herbicide = lineOf(r1, "Herbicida");
    expect(herbicide).toMatchObject({
      absence: null,
      estimation: { status: "ESTIMATED", reason_code: null, estimate_base: "111000.000000", validity: "CURRENT", validity_reason: null, method: "SES_NAIVE", run_ref: runs["R1"], span_length: 4, run_relation: "BEFORE_PROPOSAL" },
    });
    // Insufficient data: the reason and no figure.
    expect(lineOf(r1, "Fungicida")).toMatchObject({
      absence: null,
      estimation: { status: "INSUFFICIENT_DATA", reason_code: "SPAN_TOO_SHORT", estimate_base: null, validity: "NOT_USABLE", validity_reason: "NO_FIGURE", run_ref: runs["R1"] },
    });
    // A line under the threshold keeps its own state; no run includes its product.
    expect(p1.lines.find((l) => l.product_ref === products["Insecticida"])).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD", quantity_base: null });
    expect(lineOf(r1, "Insecticida")).toMatchObject({ absence: "NO_RESULT", estimation: null });
    // The same run read for the earlier draft is marked as later than it.
    expect(lineOf(await reference(p0.proposal_ref), "Herbicida").estimation).toMatchObject({ run_ref: runs["R1"], run_relation: "AFTER_PROPOSAL" });
    // It is /estimation/results itself.
    const results = await http().get(`/api/v1/estimation/results?target_campaign_ref=${campaigns["T"]}`).set(auth(director));
    const direct = results.body.results.find((r: { product: { product_ref: string } }) => r.product.product_ref === products["Herbicida"]);
    expect(herbicide.estimation).toMatchObject({ estimate_base: direct.estimate_base, validity: direct.validity, run_ref: direct.run_ref, generated_at: direct.generated_at });
    const text = await csv(p1.proposal_ref);
    expectConsistentCsv(text, p1, r1);
    // The estimate is never in a need column.
    expect(parseCsv(text).slice(5).map((row) => row[6])).toEqual(p1.lines.map((l) => l.quantity_base ?? ""));
    expect(changed(before, await snapshot())).toEqual([]);
    demo["with_estimation"] = {
      fingerprint_p0: p0.inputs_fingerprint, fingerprint_p1: p1.inputs_fingerprint, total_base_p0: total(p0), total_base_p1: total(p1),
      generated_tables: generatedChanges, private_counts: privateBefore,
      reference: r1.lines.map((l) => ({ position: l.position, absence: l.absence, status: l.estimation?.status ?? null, estimate_base: l.estimation?.estimate_base ?? null, validity: l.estimation?.validity ?? null, run_relation: l.estimation?.run_relation ?? null })),
      csv_header: parseCsv(text)[4],
    };
  });

  it("shows the run that supersedes an earlier one, never the superseded result", async () => {
    runs["R2"] = await estimate();
    const ref = await reference(proposals["P1"]!);
    expect(lineOf(ref, "Herbicida").estimation).toMatchObject({ run_ref: runs["R2"], validity: "CURRENT", estimate_base: "111000.000000", run_relation: "AFTER_PROPOSAL" });
    expect(ref.lines.every((l) => l.estimation?.validity !== "SUPERSEDED")).toBe(true);
    const earlier = await http().get(`/api/v1/estimation/runs/${runs["R1"]}`).set(auth(director));
    expect(earlier.body.results.find((r: { product: { product_ref: string } }) => r.product.product_ref === products["Herbicida"])).toMatchObject({ validity: "SUPERSEDED", validity_reason: "LATER_RUN" });
    expect(await view(proposals["P1"]!)).toEqual(views["P1"]);
    demo["superseded"] = { earlier: runs["R1"], shown: runs["R2"], relation: lineOf(ref, "Herbicida").estimation!.run_relation };
  });

  it("marks the reference OUTDATED when its sources change, and withholds the figure when a source is withdrawn", async () => {
    await classify("INVIERNO", ["X"]);
    const outdated = await reference(proposals["P1"]!);
    expect(lineOf(outdated, "Herbicida").estimation).toMatchObject({ run_ref: runs["R2"], validity: "OUTDATED", validity_reason: "SOURCES_CHANGED", estimate_base: "111000.000000" });
    expectConsistentCsv(await csv(proposals["P1"]!), views["P1"]!, outdated);
    // After the seal of C4, F3 cancels its consumption: F07 withdraws the visibility of that sealed figure.
    await push("F3", "CONSUMPTION_TOTAL", campaigns["C4"]!, "Herbicida", null);
    const withdrawn = await reference(proposals["P1"]!);
    expect(lineOf(withdrawn, "Herbicida").estimation).toMatchObject({ validity: "OUTDATED", validity_reason: "SOURCES_WITHDRAWN", estimate_base: null, status: "ESTIMATED" });
    const text = await csv(proposals["P1"]!);
    expectConsistentCsv(text, views["P1"]!, withdrawn);
    expect(text).not.toContain("111000");
    // The draft's lines and fingerprint do not move.
    expect(await view(proposals["P1"]!)).toEqual(views["P1"]);
    demo["outdated"] = { reason: lineOf(outdated, "Herbicida").estimation!.validity_reason, estimate_base: lineOf(outdated, "Herbicida").estimation!.estimate_base };
    demo["withdrawn"] = { reason: lineOf(withdrawn, "Herbicida").estimation!.validity_reason, estimate_base: lineOf(withdrawn, "Herbicida").estimation!.estimate_base };
  });

  it("with the policy pending, delivers no figure and still serves the draft and its CSV", async () => {
    (collective as { mode: string }).mode = "POLICY_PENDING";
    try {
      const before = await snapshot();
      const ref = await reference(proposals["P1"]!);
      expect(ref.availability).toBe("POLICY_PENDING");
      expect(ref.lines.map((l) => [l.absence, l.estimation])).toEqual(ref.lines.map(() => ["POLICY_PENDING", null]));
      const text = await csv(proposals["P1"]!);
      expect(text).toContain("POLICY_PENDING");
      expect(text).not.toMatch(/111000|30000|40000|50000/);
      expect(changed(before, await snapshot())).toEqual([]);
      demo["policy_pending"] = { availability: ref.availability };
    } finally {
      (collective as { mode: string }).mode = "PROVISIONAL_SYNTHETIC";
    }
  });

  it("a sealed campaign: reading the draft, its reference and its CSV recalculates and modifies nothing", async () => {
    const draftBefore = await prisma.jointPurchaseProposal.findUniqueOrThrow({ where: { id: proposals["P1"] }, include: { lines: { orderBy: { position: "asc" } } } });
    await closeAndSeal(campaigns["T"]!);
    const sealed = await view(proposals["P1"]!);
    expect(sealed.seal).toMatchObject({ version: 1 });
    expect(sealed.campaign.status).toBe("CERRADA");
    // The lines and fingerprint of the draft are the same before and after the seal.
    expect(sealed.inputs_fingerprint).toBe(views["P1"]!.inputs_fingerprint);
    expect(linesOf(sealed)).toEqual(linesOf(views["P1"]!));
    const before = await snapshot();
    const ref = await reference(proposals["P1"]!);
    const text = await csv(proposals["P1"]!);
    expectConsistentCsv(text, sealed, ref);
    for (let i = 0; i < 3; i += 1) {
      await view(proposals["P1"]!);
      await reference(proposals["P1"]!);
      await csv(proposals["P1"]!);
    }
    expect(changed(before, await snapshot())).toEqual([]);
    expect(await prisma.jointPurchaseProposal.findUniqueOrThrow({ where: { id: proposals["P1"] }, include: { lines: { orderBy: { position: "asc" } } } })).toEqual(draftBefore);
    // The reference still says which run and moment it belongs to.
    expect(lineOf(ref, "Herbicida").estimation).toMatchObject({ run_ref: runs["R2"], run_relation: "AFTER_PROPOSAL" });
    expect(Date.parse(ref.evaluated_at)).toBeGreaterThan(Date.parse(ref.proposal_generated_at));
    demo["sealed"] = { seal: sealed.seal?.seal_ref, fingerprint: sealed.inputs_fingerprint, tables_changed_by_reads: [], run: lineOf(ref, "Herbicida").estimation!.run_ref };
  });
});
