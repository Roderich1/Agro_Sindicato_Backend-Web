import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { URL } from "node:url";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  Fixture,
  seedFixture,
  TestSession,
  unusablePasswordHash,
} from "../sync-v1/test-support/sync-v1-test-app";
import { CollectiveConfig } from "./application/collective-config";
import { sealLockKey } from "./domain/seal";

/**
 * F07 sealed history (F07_SEALED_HISTORY_CONTRACT, 2026-10-23) on a
 * disposable PostgreSQL with synthetic accounts and values only: manual seal
 * by DIRECTIVA and ADMINISTRADOR, all-or-nothing, idempotent and concurrent;
 * Sync v1 after the seal (CAMPAIGN_SEALED, replay, CANCEL and its race with
 * the seal); reads without hidden writes; summary, proposal, trends and CSV
 * under the same policy; database immutability; migration from the previous
 * base. Provisional policy F07-POL-01 (NOT approved, k = 3).
 *
 * ORACLE (written before running; values are synthetic):
 * Campaign CA ("Campaña sellada 2025"), linked AGRICULTOR in tenant A = 7
 * (fixture farmerA, farmerA2 + F1..F5):
 *   DECLARED_NEED    Herbicida (ML): F1 1000, F2 2000, F3 3000 → DISCLOSED 6000, 3
 *   DECLARED_NEED    Urea (G):       F1 500,  F2 700          → SUPPRESSED_UNDER_THRESHOLD (hidden total 1200)
 *   CONSUMPTION_TOTAL Herbicida (ML): F1 400, F2 600, F3 800, F4 200 → DISCLOSED 2000, 4
 *   CONSUMPTION_TOTAL Urea (G):     F1 100, F2 200, F3 300, F4 400 → DISCLOSED 1000, 4; F3
 *                                   cancels before the seal: 3 remain, 1 net change against
 *                                   the figure → SUPPRESSED_REVISION (hidden 700)
 *   Sealed coverage: linked 7, with published figures 4 (F1–F4), suppressed_cells true.
 *   After the seal: F2 cancels DECLARED_NEED Herbicida → WITHDRAWN_AFTER_SEAL (6000 never
 *   served again); CONSUMPTION_TOTAL Herbicida stays 2000, 4; F4 deactivated → unchanged.
 * Campaign CB ("Campaña abierta 2026"): open, never sealed → NOT_SEALED in trends.
 */
const postgresUrl = process.env["F07_SEAL_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

const PUSH = "/api/v1/sync/v1/push";
const SEAL_MIGRATION = "20261023100000_f07_collective_seal";

type Type = "CONSUMPTION_TOTAL" | "DECLARED_NEED";
type Action = "PUBLISH" | "SUPERSEDE" | "CANCEL";

interface Res {
  status: number;
  body: any;
  text: string;
}

interface Envelope {
  campaign: string;
  product: string;
  type: Type;
  unit: "ML" | "G";
  quantity?: string;
  action?: Action;
  pred?: string | null;
}

describePostgres("F07 collective seal and sealed history on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: CollectiveConfig;
  let f: Fixture;
  let director: TestSession;
  let admin: TestSession;
  let otherTenantDirector: TestSession;
  const farmers: Record<string, { session: TestSession; memberId: string; userId: string }> = {};
  const campaigns: Record<string, string> = {};
  const products: Record<string, string> = {};
  /** Head operation of each (farmer, campaign, type, product). */
  const heads = new Map<string, string>();

  const mutable = () => config as unknown as { mode: string; sealingEnabled: boolean };

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    process.env["COLLECTIVE_SEALING"] = "enabled";
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f07_seal");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    config = app.get(CollectiveConfig);
    f = await seedFixture(prisma);
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    otherTenantDirector = (await fresh("DIRECTIVA", f.tenantB)).session;
    for (const key of ["F1", "F2", "F3", "F4", "F5"]) farmers[key] = await fresh("AGRICULTOR");
    const start = { CA: "2025-09-01", CB: "2026-09-01", CC: "2025-10-01", CD: "2025-11-01", CE: "2025-12-01", CF: "2026-01-01" };
    for (const [key, name] of [
      ["CA", "Campaña sellada 2025"],
      ["CB", "Campaña abierta 2026"],
      ["CC", "Campaña carrera"],
      ["CD", "Campaña concurrente"],
      ["CE", "Campaña con fallo"],
      ["CF", "Campaña bloqueo"],
    ] as const) {
      campaigns[key] = randomUUID();
      await prisma.agriculturalCampaign.create({
        data: { id: campaigns[key], tenantId: f.tenantA, name, status: "ABIERTA", isActive: true, startDate: new Date(`${start[key]}T00:00:00.000Z`) },
      });
    }
    for (const [key, name, unit] of [["Herbicida", "Herbicida sello", "L"], ["Urea", "Urea sello", "kg"]]) {
      products[key] = (await prisma.product.create({ data: { tenantId: f.tenantA, name, unit } })).id;
    }
  }, 240000);

  afterAll(async () => {
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    delete process.env["COLLECTIVE_SEALING"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });

  async function fresh(role: "AGRICULTOR" | "DIRECTIVA", tenantId = f.tenantA) {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name: `Sintético ${role}`, email: `f07s-${userId}@example.test`,
        passwordHash: unusablePasswordHash(), role,
        members: { create: { id: memberId, tenantId, role } },
      },
    });
    return { session: await createSession(prisma, jwt, memberId), memberId, userId };
  }

  function body(e: Envelope, operationId: string) {
    const action = e.action ?? "PUBLISH";
    return JSON.stringify({
      contractVersion: 1,
      operationId,
      projectionType: e.type,
      action,
      causal: { predecessorOperationId: e.pred ?? null, reconciliationReference: null },
      payload: {
        campaign_ref: e.campaign,
        product_ref: e.product,
        base_unit: e.unit,
        ...(action === "CANCEL" ? {} : { quantity_base: e.quantity }),
      },
    });
  }

  async function send(session: TestSession, payload: string): Promise<Res> {
    return http().post(PUSH).set("Content-Type", "application/json").set(auth(session)).send(payload);
  }

  /** Pushes with the right predecessor; returns the response and its operation. */
  async function push(farmer: string, e: Envelope): Promise<{ res: Res; operationId: string; payload: string }> {
    const key = `${farmer}|${e.campaign}|${e.type}|${e.product}`;
    const operationId = randomUUID();
    const action = e.action ?? (heads.has(key) ? "SUPERSEDE" : "PUBLISH");
    const payload = body({ ...e, action, pred: e.pred === undefined ? heads.get(key) ?? null : e.pred }, operationId);
    const res = await send(farmers[farmer]!.session, payload);
    if (res.status === 200 && res.body.outcome === "APPLIED") heads.set(key, operationId);
    return { res, operationId, payload };
  }

  async function publishAll(campaign: string, rows: [string, Type, string, "ML" | "G", string][]) {
    for (const [farmer, type, product, unit, quantity] of rows) {
      const { res } = await push(farmer, { campaign, type, product: products[product]!, unit, quantity });
      expect(res.body.outcome).toBe("APPLIED");
    }
  }

  async function cancel(farmer: string, campaign: string, type: Type, product: string, unit: "ML" | "G") {
    return push(farmer, { campaign, type, product: products[product]!, unit, action: "CANCEL" });
  }

  const summary = (campaign: string, session = director): Promise<Res> =>
    http().get(`/api/v1/collective/campaigns/${campaign}/summary`).set(auth(session));
  const summaryCsv = (campaign: string): Promise<Res> =>
    http().get(`/api/v1/collective/campaigns/${campaign}/summary.csv`).set(auth(director));
  const sealState = (campaign: string, session = director): Promise<Res> =>
    http().get(`/api/v1/collective/campaigns/${campaign}/seal`).set(auth(session));
  const seal = (campaign: string, payload: unknown, session = director): Promise<Res> =>
    http().post(`/api/v1/collective/campaigns/${campaign}/seal`).set(auth(session)).send(payload as object);
  const close = (campaign: string, session = director): Promise<Res> =>
    http().post(`/api/v1/campaigns/${campaign}/close`).set(auth(session)).send({});
  const trends = (query = ""): Promise<Res> => http().get(`/api/v1/collective/trends${query}`).set(auth(director));
  const trendsCsv = (query = ""): Promise<Res> => http().get(`/api/v1/collective/trends.csv${query}`).set(auth(director));
  const generate = (campaign: string): Promise<Res> =>
    http().post(`/api/v1/collective/campaigns/${campaign}/proposals`).set(auth(director));
  const proposal = (id: string): Promise<Res> => http().get(`/api/v1/collective/proposals/${id}`).set(auth(director));
  const proposalCsv = (id: string): Promise<Res> => http().get(`/api/v1/collective/proposals/${id}/csv`).set(auth(director));
  const proposals = (campaign: string): Promise<Res> =>
    http().get(`/api/v1/collective/campaigns/${campaign}/proposals`).set(auth(director));

  /** Reviews and seals; returns the seal response. */
  async function reviewAndSeal(campaign: string, session = director): Promise<Res> {
    const state = await sealState(campaign, session);
    expect(state.status).toBe(200);
    expect(state.body.can_seal).toBe(true);
    return seal(campaign, { confirmed: true, review_ref: state.body.review.review_ref }, session);
  }

  const cellsOf = (res: Res) =>
    (res.body.cells as any[])
      .map((cell) => [cell.projection_type, cell.product_name, cell.base_unit, cell.status, cell.total_base, cell.contributors].join("|"))
      .sort();

  /** Every row that could change because of a read. */
  async function writeSnapshot() {
    const [releases, items, seals, entries, proposalRows, lines, audit, journal, contributions] = await Promise.all([
      prisma.collectiveRelease.findMany({ orderBy: { id: "asc" }, select: { id: true, withdrawnAt: true } }),
      prisma.collectiveReleaseItem.count(),
      prisma.collectiveSeal.findMany({ orderBy: { id: "asc" } }),
      prisma.collectiveSealEntry.findMany({ orderBy: [{ sealId: "asc" }, { canonicalProductId: "asc" }, { projectionType: "asc" }] }),
      prisma.jointPurchaseProposal.count(),
      prisma.jointPurchaseProposalLine.count(),
      prisma.auditLog.count(),
      prisma.syncV1OperationJournal.count(),
      prisma.syncV1Contribution.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, lastSequence: true } }),
    ]);
    return JSON.stringify({ releases, items, seals, entries, proposalRows, lines, audit, journal, contributions }, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  }

  // The value is matched literally: unescaped, the "." of "1.2" matched any
  // character, e.g. ".112Z" in an ISO timestamp (intermittent, by milliseconds).
  function numberPattern(value: string): RegExp {
    const literal = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^0-9a-f-])${literal}([^0-9a-f-]|$)`);
  }

  function expectNoNumber(text: string, value: string) {
    expect(text).not.toMatch(numberPattern(value));
  }

  it("expectNoNumber matches the value literally (control for the timestamp false positive)", () => {
    // Negative control: the hidden presentation value present → detected.
    expect("product,1.2,L").toMatch(numberPattern("1.2"));
    expect("1200").toMatch(numberPattern("1200"));
    // The text that failed in CI run 40087793244: a timestamp, not the figure.
    expect("data_as_of,2026-10-24T10:56:12.112Z").not.toMatch(numberPattern("1.2"));
    expect("1x2").not.toMatch(numberPattern("1.2"));
  });

  // State shared by the ordered tests below.
  let proposalBeforeSeal: string;
  let preSealPublish: { operationId: string; payload: string; serverAcceptedAt: string };
  let afterClosePublish: { operationId: string; payload: string; res: Res };
  let sealedA: Res;

  it("CA before the seal: the summary matches the oracle and a draft is generated", async () => {
    await publishAll(campaigns.CA!, [
      ["F2", "DECLARED_NEED", "Herbicida", "ML", "2000"],
      ["F3", "DECLARED_NEED", "Herbicida", "ML", "3000"],
      ["F1", "DECLARED_NEED", "Urea", "G", "500"],
      ["F2", "DECLARED_NEED", "Urea", "G", "700"],
      ["F1", "CONSUMPTION_TOTAL", "Herbicida", "ML", "400"],
      ["F2", "CONSUMPTION_TOTAL", "Herbicida", "ML", "600"],
      ["F3", "CONSUMPTION_TOTAL", "Herbicida", "ML", "800"],
      ["F4", "CONSUMPTION_TOTAL", "Herbicida", "ML", "200"],
      ["F1", "CONSUMPTION_TOTAL", "Urea", "G", "100"],
      ["F2", "CONSUMPTION_TOTAL", "Urea", "G", "200"],
      ["F3", "CONSUMPTION_TOTAL", "Urea", "G", "300"],
      ["F4", "CONSUMPTION_TOTAL", "Urea", "G", "400"],
    ]);
    const first = await push("F1", { campaign: campaigns.CA!, type: "DECLARED_NEED", product: products["Herbicida"]!, unit: "ML", quantity: "1000" });
    expect(first.res.body.outcome).toBe("APPLIED");
    preSealPublish = { operationId: first.operationId, payload: first.payload, serverAcceptedAt: first.res.body.serverAcceptedAt };

    const before = await summary(campaigns.CA!);
    expect(before.body.seal).toBeNull();
    expect(cellsOf(before)).toEqual(
      [
        "CONSUMPTION_TOTAL|Herbicida sello|ML|DISCLOSED|2000|4",
        "CONSUMPTION_TOTAL|Urea sello|G|DISCLOSED|1000|4",
        "DECLARED_NEED|Herbicida sello|ML|DISCLOSED|6000|3",
        "DECLARED_NEED|Urea sello|G|SUPPRESSED_UNDER_THRESHOLD||",
      ].sort(),
    );
    const generated = await generate(campaigns.CA!);
    expect(generated.status).toBe(201);
    proposalBeforeSeal = generated.body.proposal_ref;

    // F3 withdraws its Urea consumption before the seal (rule 3: revision).
    expect((await cancel("F3", campaigns.CA!, "CONSUMPTION_TOTAL", "Urea", "G")).res.body.outcome).toBe("APPLIED");
    expect(cellsOf(await summary(campaigns.CA!))).toContain("CONSUMPTION_TOTAL|Urea sello|G|SUPPRESSED_REVISION||");
  });

  it("reading an unsealed proposal never writes (F06 §7.2): a would-be new figure is SUPERSEDED and a would-be withdrawal WITHDRAWN, without values", async () => {
    const herbicida = { campaign: campaigns.CA!, type: "DECLARED_NEED" as const, product: products["Herbicida"]!, unit: "ML" as const };
    const readAll = async () => {
      const snapshot = await writeSnapshot();
      const view = await proposal(proposalBeforeSeal);
      const list = await proposals(campaigns.CA!);
      const csv = await proposalCsv(proposalBeforeSeal);
      expect([view.status, list.status, csv.status]).toEqual([200, 200, 200]);
      // Discriminating: the writing decision would create (or withdraw) a release here.
      expect(await writeSnapshot()).toBe(snapshot);
      return { line: (view.body.lines as any[]).find((l) => l.product_name === "Herbicida sello"), view, csv };
    };
    // Three net changes (F4 and F5 join, F1 1000 → 1100): the summary would publish 13100.
    expect((await push("F4", { ...herbicida, quantity: "4000" })).res.body.outcome).toBe("APPLIED");
    expect((await push("F5", { ...herbicida, quantity: "5000" })).res.body.outcome).toBe("APPLIED");
    expect((await push("F1", { ...herbicida, quantity: "1100" })).res.body.outcome).toBe("APPLIED");
    const superseded = await readAll();
    expect(superseded.line).toMatchObject({ status: "SUPERSEDED", quantity_base: null, contributors: null });
    expect(superseded.view.body.inputs_fingerprint).toBeNull();
    expectNoNumber(superseded.csv.text, "13100");
    // Back to the disclosed state, then F3 withdraws: the summary would withdraw 6000.
    expect((await push("F1", { ...herbicida, quantity: "1000" })).res.body.outcome).toBe("APPLIED");
    expect((await cancel("F4", campaigns.CA!, "DECLARED_NEED", "Herbicida", "ML")).res.body.outcome).toBe("APPLIED");
    expect((await cancel("F5", campaigns.CA!, "DECLARED_NEED", "Herbicida", "ML")).res.body.outcome).toBe("APPLIED");
    expect((await cancel("F3", campaigns.CA!, "DECLARED_NEED", "Herbicida", "ML")).res.body.outcome).toBe("APPLIED");
    const withdrawn = await readAll();
    expect(withdrawn.line).toMatchObject({ status: "WITHDRAWN", quantity_base: null });
    // F3 declares 3000 again: exactly the disclosed state (oracle of the seal).
    expect((await push("F3", { ...herbicida, action: "PUBLISH", quantity: "3000" })).res.body.outcome).toBe("APPLIED");
    const back = await readAll();
    expect(back.line).toMatchObject({ status: "DISCLOSED", quantity_base: "6000", pending_changes: false });
  });

  it("closing is not sealing; a publication after closing gets CAMPAIGN_NOT_OPEN", async () => {
    expect((await close(campaigns.CA!)).status).toBe(200);
    const late = await push("F5", { campaign: campaigns.CA!, type: "DECLARED_NEED", product: products["Herbicida"]!, unit: "ML", quantity: "900" });
    expect(late.res.body).toMatchObject({ outcome: "REJECTED", code: "CAMPAIGN_NOT_OPEN" });
    afterClosePublish = { operationId: late.operationId, payload: late.payload, res: late.res };
    const state = await sealState(campaigns.CA!);
    expect(state.body).toMatchObject({ state: "NOT_SEALED", seal: null, can_seal: true, blocked_by: [] });
  });

  it("only DIRECTIVA/ADMINISTRADOR of the tenant reach the seal; nothing tells others whether it exists", async () => {
    const snapshot = await writeSnapshot();
    const farmer = farmers["F1"]!.session;
    expect((await sealState(campaigns.CA!, farmer)).status).toBe(403);
    expect((await seal(campaigns.CA!, { confirmed: true, review_ref: "0".repeat(64) }, farmer)).status).toBe(403);
    expect((await sealState(campaigns.CA!, otherTenantDirector)).status).toBe(404);
    expect((await seal(campaigns.CA!, { confirmed: true, review_ref: "0".repeat(64) }, otherTenantDirector)).status).toBe(404);
    expect((await http().get(`/api/v1/collective/campaigns/${campaigns.CA}/seal`)).status).toBe(401);
    expect((await http().get("/api/v1/collective/trends").set(auth(farmer))).status).toBe(403);
    expect(await writeSnapshot()).toBe(snapshot);
  });

  it("a missing confirmation, a stale review, a disabled flag, an open campaign and POLICY_PENDING leave no effect", async () => {
    const state = await sealState(campaigns.CA!);
    const reviewRef = state.body.review.review_ref as string;
    expect(state.body.review).toMatchObject({
      coverage: { linked_members: 7, members_with_contribution: 4, suppressed_cells: true },
      open_disputes: false,
      pending_changes: false,
      cells_without_figure: true,
    });
    const snapshot = await writeSnapshot();
    expect((await seal(campaigns.CA!, { confirmed: false, review_ref: reviewRef })).status).toBe(422);
    expect((await seal(campaigns.CA!, { review_ref: reviewRef })).status).toBe(400);
    expect((await seal(campaigns.CA!, { confirmed: true, review_ref: "xyz" })).status).toBe(400);
    expect((await seal(campaigns.CA!, { confirmed: true, review_ref: reviewRef, extra: 1 })).status).toBe(400);
    const stale = await seal(campaigns.CA!, { confirmed: true, review_ref: "0".repeat(64) });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toBe("SEAL_REVIEW_STALE");

    mutable().sealingEnabled = false;
    try {
      expect((await sealState(campaigns.CA!)).body).toMatchObject({ can_seal: false, blocked_by: ["SEALING_DISABLED"], review: null });
      const disabled = await seal(campaigns.CA!, { confirmed: true, review_ref: reviewRef });
      expect([disabled.status, disabled.body.message]).toEqual([409, "SEALING_DISABLED"]);
    } finally {
      mutable().sealingEnabled = true;
    }
    const open = await sealState(campaigns.CB!);
    expect(open.body).toMatchObject({ state: "NOT_SEALED", can_seal: false, blocked_by: ["CAMPAIGN_NOT_CLOSED"], review: null });
    const notClosed = await seal(campaigns.CB!, { confirmed: true, review_ref: reviewRef });
    expect([notClosed.status, notClosed.body.message]).toEqual([409, "CAMPAIGN_NOT_CLOSED"]);
    mutable().mode = "POLICY_PENDING";
    try {
      const pending = await seal(campaigns.CA!, { confirmed: true, review_ref: reviewRef });
      expect([pending.status, pending.body.message]).toEqual([409, "POLICY_PENDING"]);
    } finally {
      mutable().mode = "PROVISIONAL_SYNTHETIC";
    }
    expect(await writeSnapshot()).toBe(snapshot);
  });

  it("DIRECTIVA seals CA once: the version matches the oracle; a double tap returns the same seal", async () => {
    sealedA = await reviewAndSeal(campaigns.CA!);
    expect(sealedA.status).toBe(200);
    expect(sealedA.body).toMatchObject({ state: "SEALED", created: true, can_seal: false });
    expect(sealedA.body.seal).toMatchObject({ version: 1, sealed_by: { user_ref: expect.any(String), role: "DIRECTIVA" } });
    expect(sealedA.body.seal.accepted_until).toBe(sealedA.body.seal.sealed_at);
    const again = await seal(campaigns.CA!, { confirmed: true, review_ref: "f".repeat(64) });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, seal: { seal_ref: sealedA.body.seal.seal_ref } });
    // The confirmation is checked even when already sealed.
    expect((await seal(campaigns.CA!, { confirmed: false, review_ref: "f".repeat(64) })).status).toBe(422);

    expect(await prisma.collectiveSeal.count({ where: { campaignId: campaigns.CA } })).toBe(1);
    const sealed = await summary(campaigns.CA!);
    expect(sealed.body.seal.seal_ref).toBe(sealedA.body.seal.seal_ref);
    expect(cellsOf(sealed)).toEqual(
      [
        "CONSUMPTION_TOTAL|Herbicida sello|ML|DISCLOSED|2000|4",
        "CONSUMPTION_TOTAL|Urea sello|G|SUPPRESSED_REVISION||",
        "DECLARED_NEED|Herbicida sello|ML|DISCLOSED|6000|3",
        "DECLARED_NEED|Urea sello|G|SUPPRESSED_UNDER_THRESHOLD||",
      ].sort(),
    );
    expect(sealed.body.coverage).toEqual({ linked_members: 7, members_with_contribution: 4, suppressed_cells: true });
    const audit = await prisma.auditLog.findMany({ where: { entityName: "CollectiveSeal" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorUserId: expect.any(String), campaignId: campaigns.CA, action: "OTRO", before: null, after: null });
    expect(audit[0]!.summary).not.toMatch(/[0-9]{3,}/);
  });

  it("sealed reads never write, never recompute, and the CSV carries the same decisions", async () => {
    const snapshot = await writeSnapshot();
    const json = await summary(campaigns.CA!);
    const csv = await summaryCsv(campaigns.CA!);
    const state = await sealState(campaigns.CA!);
    const list = await proposals(campaigns.CA!);
    const view = await proposal(proposalBeforeSeal);
    const pcsv = await proposalCsv(proposalBeforeSeal);
    const t = await trends();
    const tcsv = await trendsCsv();
    for (const res of [json, csv, state, list, view, pcsv, t, tcsv]) expect(res.status).toBe(200);
    expect(await writeSnapshot()).toBe(snapshot);
    expect(state.body).toMatchObject({ state: "SEALED", review: null, seal: { seal_ref: sealedA.body.seal.seal_ref } });
    expect(csv.text).toContain(sealedA.body.seal.seal_ref);
    expect(csv.text).toContain("DECLARED_NEED,");
    expect(csv.text).toContain(",DISCLOSED,6000,6,3,");
    for (const hidden of ["1200", "1.2"]) expectNoNumber(csv.text, hidden);
    // The draft generated before the seal shows the sealed figure (same release).
    const line = (view.body.lines as any[]).find((l) => l.product_name === "Herbicida sello");
    expect(line).toMatchObject({ status: "DISCLOSED", quantity_base: "6000", contributors: 3 });
    expect(view.body.seal.seal_ref).toBe(sealedA.body.seal.seal_ref);
    expect(pcsv.text).toContain(sealedA.body.seal.seal_ref);
  });

  it("the database refuses any change to the sealed version or a new disclosure of the sealed campaign", async () => {
    const sealRow = await prisma.collectiveSeal.findFirstOrThrow({ where: { campaignId: campaigns.CA } });
    const entry = await prisma.collectiveSealEntry.findFirstOrThrow({ where: { sealId: sealRow.id, status: "DISCLOSED" } });
    await expect(prisma.collectiveSeal.update({ where: { id: sealRow.id }, data: { threshold: 5 } })).rejects.toThrow(/inmutable/);
    await expect(prisma.collectiveSeal.delete({ where: { id: sealRow.id } })).rejects.toThrow(/inmutable/);
    const key = { sealId: entry.sealId, projectionType: entry.projectionType, canonicalProductId: entry.canonicalProductId, baseUnit: entry.baseUnit };
    await expect(prisma.collectiveSealEntry.update({ where: { sealId_projectionType_canonicalProductId_baseUnit: key }, data: { pendingChanges: true } })).rejects.toThrow(/visibilidad/);
    await expect(prisma.collectiveSealEntry.delete({ where: { sealId_projectionType_canonicalProductId_baseUnit: key } })).rejects.toThrow(/borrado/);
    await expect(
      prisma.collectiveSealEntry.create({
        data: { sealId: sealRow.id, projectionType: "DECLARED_NEED", canonicalProductId: products["Urea"]!, baseUnit: "ML", status: "OVERFLOW" },
      }),
    ).rejects.toThrow(/posteriores/);
    await expect(
      prisma.collectiveRelease.create({
        data: { tenantId: f.tenantA, campaignId: campaigns.CA!, canonicalProductId: products["Herbicida"]!, projectionType: "DECLARED_NEED", baseUnit: "ML", totalBase: 1n, contributorCount: 3 },
      }),
    ).rejects.toThrow(/sellado/);
    await expect(prisma.collectiveRelease.update({ where: { id: entry.releaseId! }, data: { withdrawnAt: new Date() } })).rejects.toThrow(/sellado/);
    await expect(prisma.agriculturalCampaign.update({ where: { id: campaigns.CA }, data: { status: "ABIERTA" } })).rejects.toThrow(/sellada/);
    // A seal of an open campaign is refused by the database too.
    await expect(
      prisma.collectiveSeal.create({
        data: {
          tenantId: f.tenantA, campaignId: campaigns.CB!, sealedAt: new Date(), sealedByUserId: (await prisma.member.findUniqueOrThrow({ where: { id: f.members.directorA } })).userId, sealedByRole: "DIRECTIVA",
          disclosureMode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", threshold: 3, linkedMembers: 0, membersWithContribution: 0,
          suppressedCells: false, openDisputes: false, reviewRef: "a".repeat(64),
        },
      }),
    ).rejects.toThrow(/CERRADA/);
  });

  it("Sync v1 after the seal: a new publication is CAMPAIGN_SEALED, identical on resend; replays keep their original result", async () => {
    const before = await summary(campaigns.CA!);
    const journalBefore = await prisma.syncV1OperationJournal.count();
    const late = await push("F5", { campaign: campaigns.CA!, type: "DECLARED_NEED", product: products["Herbicida"]!, unit: "ML", quantity: "900" });
    expect(late.res.status).toBe(200);
    expect(late.res.body).toEqual({
      contractVersion: 1,
      operationId: late.operationId,
      outcome: "REJECTED",
      code: "CAMPAIGN_SEALED",
      disposition: "MOVE_TO_TERMINAL_FAILURE",
      serverAcceptedAt: null,
      reconciliationReference: null,
    });
    const resend = await send(farmers["F5"]!.session, late.payload);
    expect(resend.body).toEqual(late.res.body);
    expect(await prisma.syncV1OperationJournal.count()).toBe(journalBefore + 1);
    // A SUPERSEDE of an accepted value is refused the same way.
    const supersede = await push("F1", { campaign: campaigns.CA!, type: "DECLARED_NEED", product: products["Herbicida"]!, unit: "ML", quantity: "1500" });
    expect(supersede.res.body).toMatchObject({ outcome: "REJECTED", code: "CAMPAIGN_SEALED", disposition: "MOVE_TO_TERMINAL_FAILURE" });
    // Replays of intentions resolved before the seal: their original result.
    const replay = await send(farmers["F1"]!.session, preSealPublish.payload);
    expect(replay.body).toMatchObject({ outcome: "ALREADY_APPLIED", code: "OK", serverAcceptedAt: preSealPublish.serverAcceptedAt });
    const replayClosed = await send(farmers["F5"]!.session, afterClosePublish.payload);
    expect(replayClosed.body).toEqual(afterClosePublish.res.body);
    // Nothing of the sealed version changed.
    const after = await summary(campaigns.CA!);
    expect(after.body).toEqual(before.body);
    const contribution = await prisma.syncV1Contribution.findFirstOrThrow({
      where: { memberId: farmers["F1"]!.memberId, campaignId: campaigns.CA, projectionType: "DECLARED_NEED", productId: products["Herbicida"] },
    });
    expect(contribution.quantityBase).toBe(1000n);
  });

  it("a CANCEL after the seal withdraws the visibility of the sealed figures that included it, in every channel", async () => {
    const releasesBefore = await prisma.collectiveRelease.findMany({ orderBy: { id: "asc" } });
    const sealRow = await prisma.collectiveSeal.findFirstOrThrow({ where: { campaignId: campaigns.CA } });
    const withdrawn = await cancel("F2", campaigns.CA!, "DECLARED_NEED", "Herbicida", "ML");
    expect(withdrawn.res.body).toMatchObject({ outcome: "APPLIED", code: "OK" });
    const sealed = await summary(campaigns.CA!);
    expect(cellsOf(sealed)).toEqual(
      [
        "CONSUMPTION_TOTAL|Herbicida sello|ML|DISCLOSED|2000|4",
        "CONSUMPTION_TOTAL|Urea sello|G|SUPPRESSED_REVISION||",
        "DECLARED_NEED|Herbicida sello|ML|WITHDRAWN_AFTER_SEAL||",
        "DECLARED_NEED|Urea sello|G|SUPPRESSED_UNDER_THRESHOLD||",
      ].sort(),
    );
    // Coverage stays the one of the seal: a recount would reveal the cell.
    expect(sealed.body.coverage).toEqual({ linked_members: 7, members_with_contribution: 4, suppressed_cells: true });
    const csv = await summaryCsv(campaigns.CA!);
    const view = await proposal(proposalBeforeSeal);
    const pcsv = await proposalCsv(proposalBeforeSeal);
    const t = await trends();
    const tcsv = await trendsCsv();
    for (const text of [JSON.stringify(sealed.body), csv.text, JSON.stringify(view.body), pcsv.text, JSON.stringify(t.body), tcsv.text]) {
      expectNoNumber(text, "6000");
      expectNoNumber(text, "1200");
    }
    expect((view.body.lines as any[]).find((l) => l.product_name === "Herbicida sello").status).toBe("WITHDRAWN");
    expect(view.body.inputs_fingerprint).toBeNull();
    // The sealed data itself did not change: same seal, same entry, same releases.
    expect(await prisma.collectiveSeal.findFirstOrThrow({ where: { campaignId: campaigns.CA } })).toEqual(sealRow);
    expect(await prisma.collectiveRelease.findMany({ orderBy: { id: "asc" } })).toEqual(releasesBefore);
    const entry = await prisma.collectiveSealEntry.findFirstOrThrow({
      where: { sealId: sealRow.id, projectionType: "DECLARED_NEED", canonicalProductId: products["Herbicida"] },
    });
    expect(entry.status).toBe("DISCLOSED");
    expect(entry.visibilityWithdrawnAt).not.toBeNull();
  });

  it("an eligibility change after the seal does not move sealed figures (no inference by deactivating)", async () => {
    await prisma.member.update({ where: { id: farmers["F4"]!.memberId }, data: { isActive: false } });
    const sealed = await summary(campaigns.CA!);
    expect(cellsOf(sealed)).toContain("CONSUMPTION_TOTAL|Herbicida sello|ML|DISCLOSED|2000|4");
    // The deactivated farmer cannot push at all (no withdrawal path: declared limit).
    const blocked = await push("F4", { campaign: campaigns.CA!, type: "CONSUMPTION_TOTAL", product: products["Herbicida"]!, unit: "ML", action: "CANCEL" });
    expect(blocked.res.status).toBe(403);
    await prisma.member.update({ where: { id: farmers["F4"]!.memberId }, data: { isActive: true } });
  });

  it("POLICY_PENDING hides sealed figures in every channel; the seal stays identifiable", async () => {
    mutable().mode = "POLICY_PENDING";
    try {
      const s = await summary(campaigns.CA!);
      expect(s.body).toMatchObject({ seal: { seal_ref: sealedA.body.seal.seal_ref }, cells: [], coverage: null });
      const t = await trends();
      expect(t.body.series).toEqual([]);
      expect((t.body.campaigns as any[]).every((c) => c.coverage === null)).toBe(true);
      const view = await proposal(proposalBeforeSeal);
      expect((view.body.lines as any[]).every((l) => l.status === "POLICY_PENDING" && l.quantity_base === null)).toBe(true);
      for (const res of [await summaryCsv(campaigns.CA!), await trendsCsv(), await proposalCsv(proposalBeforeSeal)]) {
        expectNoNumber(res.text, "2000");
      }
    } finally {
      mutable().mode = "PROVISIONAL_SYNTHETIC";
    }
  });

  it("ADMINISTRADOR seals too; concurrent seals and double taps make one seal", async () => {
    await publishAll(campaigns.CD!, [
      ["F1", "DECLARED_NEED", "Urea", "G", "1000"],
      ["F2", "DECLARED_NEED", "Urea", "G", "1000"],
      ["F3", "DECLARED_NEED", "Urea", "G", "1000"],
    ]);
    expect((await close(campaigns.CD!, admin)).status).toBe(200);
    const state = await sealState(campaigns.CD!, admin);
    const payload = { confirmed: true, review_ref: state.body.review.review_ref };
    const results = await Promise.all([
      seal(campaigns.CD!, payload, admin),
      seal(campaigns.CD!, payload, director),
      seal(campaigns.CD!, payload, admin),
      seal(campaigns.CD!, payload, director),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(results.filter((r) => r.body.created === true)).toHaveLength(1);
    expect(new Set(results.map((r) => r.body.seal.seal_ref)).size).toBe(1);
    expect(await prisma.collectiveSeal.count({ where: { campaignId: campaigns.CD } })).toBe(1);
    expect(await prisma.collectiveSealEntry.count({ where: { seal: { campaignId: campaigns.CD } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityName: "CollectiveSeal", campaignId: campaigns.CD } })).toBe(1);
    // ADMINISTRADOR seals CC on its own below; here the winner is either role.
    expect(["DIRECTIVA", "ADMINISTRADOR"]).toContain(results.find((r) => r.body.created)!.body.seal.sealed_by.role);
  });

  it("a failure at the last step of the seal leaves no seal, entry, audit row or release of that decision", async () => {
    await publishAll(campaigns.CE!, [
      ["F1", "CONSUMPTION_TOTAL", "Herbicida", "ML", "100"],
      ["F2", "CONSUMPTION_TOTAL", "Herbicida", "ML", "100"],
      ["F3", "CONSUMPTION_TOTAL", "Herbicida", "ML", "100"],
    ]);
    expect((await close(campaigns.CE!)).status).toBe(200);
    const state = await sealState(campaigns.CE!);
    // The failure is injected at the last write of the seal (its audit row).
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION f07_test_fail_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW."entityName" = 'CollectiveSeal' THEN RAISE EXCEPTION 'injected failure'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER f07_test_fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION f07_test_fail_audit()`);
    try {
      const snapshot = await writeSnapshot();
      const failed = await seal(campaigns.CE!, { confirmed: true, review_ref: state.body.review.review_ref });
      expect(failed.status).toBe(500);
      expect(await writeSnapshot()).toBe(snapshot);
      expect(await prisma.collectiveSeal.count({ where: { campaignId: campaigns.CE } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER f07_test_fail_audit ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION f07_test_fail_audit()`);
    }
    // The same review still seals once the failure is gone.
    const ok = await seal(campaigns.CE!, { confirmed: true, review_ref: state.body.review.review_ref });
    expect(ok.body).toMatchObject({ created: true, state: "SEALED" });
  });

  it("a push waits for a seal in progress (shared ↔ exclusive lock), so it is never half-way", async () => {
    await publishAll(campaigns.CF!, [
      ["F1", "DECLARED_NEED", "Herbicida", "ML", "10"],
      ["F2", "DECLARED_NEED", "Herbicida", "ML", "20"],
      ["F3", "DECLARED_NEED", "Herbicida", "ML", "30"],
    ]);
    const holdMs = 1500;
    let released = 0;
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sealLockKey(f.tenantA, campaigns.CF!)}, 0))`;
        await new Promise((done) => setTimeout(done, holdMs));
        released = Date.now();
      },
      { timeout: holdMs + 10000 },
    );
    await new Promise((done) => setTimeout(done, 200));
    const started = Date.now();
    const pushed = await push("F1", { campaign: campaigns.CF!, type: "DECLARED_NEED", product: products["Herbicida"]!, unit: "ML", quantity: "11" });
    const finished = Date.now();
    await holder;
    expect(pushed.res.body.outcome).toBe("APPLIED");
    expect(finished).toBeGreaterThanOrEqual(released);
    expect(finished - started).toBeGreaterThanOrEqual(holdMs - 400);
  });

  it("CANCEL ↔ seal race (ADMINISTRADOR): before → SUPPRESSED_REVISION in the version; after → WITHDRAWN_AFTER_SEAL; never in between", async () => {
    const outcomes: string[] = [];
    for (let round = 0; round < 3; round++) {
      const campaign = randomUUID();
      await prisma.agriculturalCampaign.create({
        data: { id: campaign, tenantId: f.tenantA, name: `Carrera ${round}`, status: "ABIERTA", isActive: true, startDate: new Date(`2024-0${round + 1}-01T00:00:00.000Z`) },
      });
      // 4 contributors: after F3's withdrawal 3 remain, so a withdrawal before
      // the seal is SUPPRESSED_REVISION (not under the threshold).
      await publishAll(campaign, [
        ["F1", "CONSUMPTION_TOTAL", "Urea", "G", "50"],
        ["F2", "CONSUMPTION_TOTAL", "Urea", "G", "60"],
        ["F3", "CONSUMPTION_TOTAL", "Urea", "G", "70"],
        ["F4", "CONSUMPTION_TOTAL", "Urea", "G", "80"],
      ]);
      // The figure 260 is disclosed before closing.
      expect((await summary(campaign)).body.cells[0]).toMatchObject({ status: "DISCLOSED", total_base: "260" });
      expect((await close(campaign, admin)).status).toBe(200);
      const state = await sealState(campaign, admin);
      const review = state.body.review.review_ref;
      // Round 0: cancel strictly before; round 1: strictly after; round 2: concurrent.
      if (round === 0) await cancel("F3", campaign, "CONSUMPTION_TOTAL", "Urea", "G");
      let sealRes: Res;
      if (round === 2) {
        const [s] = await Promise.all([seal(campaign, { confirmed: true, review_ref: review }, admin), cancel("F3", campaign, "CONSUMPTION_TOTAL", "Urea", "G")]);
        sealRes = s;
      } else {
        sealRes = await seal(campaign, { confirmed: true, review_ref: review }, admin);
        if (round === 1) await cancel("F3", campaign, "CONSUMPTION_TOTAL", "Urea", "G");
      }
      // A cancel that landed first makes the reviewed state stale: review again.
      if (sealRes.status === 409) {
        expect(sealRes.body.message).toBe("SEAL_REVIEW_STALE");
        sealRes = await reviewAndSeal(campaign, admin);
      }
      expect(sealRes.body).toMatchObject({ state: "SEALED", seal: { sealed_by: { role: "ADMINISTRADOR" } } });
      const entry = await prisma.collectiveSealEntry.findFirstOrThrow({ where: { seal: { campaignId: campaign } } });
      const served = (await summary(campaign)).body.cells[0];
      if (entry.status === "SUPPRESSED_REVISION") {
        expect(entry.visibilityWithdrawnAt).toBeNull();
        expect(served).toMatchObject({ status: "SUPPRESSED_REVISION", total_base: null });
        outcomes.push("before");
      } else {
        expect(entry.status).toBe("DISCLOSED");
        expect(entry.visibilityWithdrawnAt).not.toBeNull();
        expect(served).toMatchObject({ status: "WITHDRAWN_AFTER_SEAL", total_base: null });
        outcomes.push("after");
      }
      expectNoNumber(JSON.stringify(served), "260");
      expectNoNumber(JSON.stringify(served), "190");
    }
    expect(outcomes[0]).toBe("before");
    expect(outcomes[1]).toBe("after");
  });

  it("trends: only sealed versions, cell by cell, without sums; NO_DATA and NOT_SEALED are never zero; CSV has the same points", async () => {
    // CB has published figures and a decided summary, but it is not sealed.
    await publishAll(campaigns.CB!, [
      ["F1", "DECLARED_NEED", "Herbicida", "ML", "7000"],
      ["F2", "DECLARED_NEED", "Herbicida", "ML", "7000"],
      ["F3", "DECLARED_NEED", "Herbicida", "ML", "7000"],
    ]);
    expect((await summary(campaigns.CB!)).body.cells[0]).toMatchObject({ status: "DISCLOSED", total_base: "21000" });
    const snapshot = await writeSnapshot();
    const res = await trends("?projection_type=DECLARED_NEED");
    const csv = await trendsCsv("?projection_type=DECLARED_NEED");
    expect(await writeSnapshot()).toBe(snapshot);
    expect(res.status).toBe(200);
    expect(res.body.projection_type).toBe("DECLARED_NEED");
    const order = (res.body.campaigns as any[]).map((c) => c.campaign_ref);
    const pointOf = (product: string, unit: string, campaign: string) => {
      const line = (res.body.series as any[]).find((s) => s.product_name === product && s.base_unit === unit);
      return line?.points[order.indexOf(campaign)];
    };
    expect((res.body.series as any[]).every((s) => s.projection_type === "DECLARED_NEED")).toBe(true);
    expect(pointOf("Herbicida sello", "ML", campaigns.CA!)).toMatchObject({ status: "WITHDRAWN_AFTER_SEAL", total_base: null });
    expect(pointOf("Urea sello", "G", campaigns.CA!)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD", total_base: null });
    expect(pointOf("Urea sello", "G", campaigns.CD!)).toMatchObject({ status: "DISCLOSED", total_base: "3000", contributors: 3 });
    expect(pointOf("Herbicida sello", "ML", campaigns.CD!)).toMatchObject({ status: "NO_DATA", total_base: null });
    expect(pointOf("Herbicida sello", "ML", campaigns.CB!)).toMatchObject({ status: "NOT_SEALED", total_base: null });
    // ML and G never share a series; nothing is summed across campaigns.
    expect(new Set((res.body.series as any[]).map((s) => `${s.product_ref}|${s.base_unit}`)).size).toBe(res.body.series.length);
    expectNoNumber(JSON.stringify(res.body), "21000");
    expectNoNumber(csv.text, "21000");
    // CSV parity: every point, same status and figure.
    for (const line of res.body.series as any[]) {
      for (const point of line.points) {
        const row = [line.projection_type, line.product_ref].join(",");
        const match = csv.text.split("\n").find((l: string) => l.startsWith(row) && l.includes(`,${point.campaign_ref},`));
        expect(match).toBeDefined();
        expect(match).toContain(`,${point.status},${point.total_base ?? ""},`);
      }
    }
    // Coverage of each campaign is the sealed one; unsealed campaigns have none.
    const coverageOf = (campaign: string) => (res.body.campaigns as any[]).find((c) => c.campaign_ref === campaign).coverage;
    expect(coverageOf(campaigns.CA!)).toEqual({ linked_members: 7, members_with_contribution: 4, suppressed_cells: true });
    expect(coverageOf(campaigns.CB!)).toBeNull();
  });

  it("a draft generated from a sealed campaign takes the sealed version and creates no disclosure", async () => {
    const releases = await prisma.collectiveRelease.count();
    const generated = await generate(campaigns.CD!);
    expect(generated.status).toBe(201);
    expect(generated.body.seal).not.toBeNull();
    expect(generated.body.lines).toEqual([expect.objectContaining({ status: "DISCLOSED", quantity_base: "3000" })]);
    expect(await prisma.collectiveRelease.count()).toBe(releases);
    // A sealed figure withdrawn after the seal is never carried by a new draft.
    const fromA = await generate(campaigns.CA!);
    const line = (fromA.body.lines as any[]).find((l) => l.product_name === "Herbicida sello");
    expect(line).toMatchObject({ status: "SUPPRESSED_REVISION", quantity_base: null });
  });
});

/**
 * Migration from the previous base: rows written before
 * 20261023100000_f07_collective_seal survive it unchanged, and the new
 * triggers apply to them.
 */
describePostgres("F07 seal migration from the previous base", () => {
  it("keeps every earlier row and value; the new invariants hold on old data", async () => {
    const admin = new PrismaClient({ datasources: { db: { url: postgresUrl! } } });
    const name = `f07_seal_mig_${randomUUID().replaceAll("-", "")}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    await admin.$disconnect();
    const url = new URL(postgresUrl!);
    url.pathname = `/${name}`;
    const deploy = (schemaDir: string) =>
      spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", join(schemaDir, "schema.prisma")], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url.toString() },
        encoding: "utf8",
        timeout: 120000,
      });
    const previous = mkdtempSync(join(tmpdir(), "f07-prev-"));
    try {
      cpSync(resolve("prisma/schema.prisma"), join(previous, "schema.prisma"));
      cpSync(resolve("prisma/migrations"), join(previous, "migrations"), { recursive: true });
      rmSync(join(previous, "migrations", SEAL_MIGRATION), { recursive: true });
      expect(readdirSync(join(previous, "migrations"))).not.toContain(SEAL_MIGRATION);
      expect(deploy(previous).status).toBe(0);
    } finally {
      rmSync(previous, { recursive: true, force: true });
    }
    const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try {
      const f = await seedFixture(db as unknown as PrismaService);
      const contribution = await db.syncV1Contribution.create({
        data: {
          tenantId: f.tenantA, memberId: f.members.farmerA, projectionType: "DECLARED_NEED", campaignId: f.campaigns.closedA,
          productId: f.products.liquidA, baseUnit: "ML", status: "ACTIVE", quantityBase: 4200n, lastSequence: 1,
          headOperationId: randomUUID(), acceptedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      });
      const release = await db.collectiveRelease.create({
        data: {
          tenantId: f.tenantA, campaignId: f.campaigns.closedA, canonicalProductId: f.products.liquidA, projectionType: "DECLARED_NEED",
          baseUnit: "ML", totalBase: 4200n, contributorCount: 3,
          items: { create: [{ contributionId: contribution.id, sequence: 1, quantityBase: 4200n }] },
        },
      });
      const dump = async () =>
        JSON.stringify(
          {
            campaigns: await db.agriculturalCampaign.findMany({ orderBy: { id: "asc" } }),
            contributions: await db.syncV1Contribution.findMany({ orderBy: { id: "asc" } }),
            releases: await db.collectiveRelease.findMany({ orderBy: { id: "asc" }, include: { items: true } }),
          },
          (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        );
      const before = await dump();
      const result = deploy(resolve("prisma"));
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(SEAL_MIGRATION);
      expect(await dump()).toBe(before);
      // Old memory rows stay immutable; the new guards apply to old data.
      await expect(db.collectiveReleaseItem.deleteMany({ where: { releaseId: release.id } })).rejects.toThrow(/inmutable/);
      await expect(
        db.collectiveSeal.create({
          data: {
            tenantId: f.tenantA, campaignId: f.campaigns.openA, sealedAt: new Date(), sealedByUserId: (await db.member.findUniqueOrThrow({ where: { id: f.members.directorA } })).userId,
            sealedByRole: "DIRECTIVA", disclosureMode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", threshold: 3, linkedMembers: 1,
            membersWithContribution: 0, suppressedCells: false, openDisputes: false, reviewRef: "b".repeat(64),
          },
        }),
      ).rejects.toThrow(/CERRADA/);
    } finally {
      await db.$disconnect();
    }
  }, 240000);
});
