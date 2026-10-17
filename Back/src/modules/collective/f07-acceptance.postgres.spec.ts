import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
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

/**
 * F07 acceptance on PostgreSQL (#24–#28, GATE-F07 #29), end to end through
 * POST /sync/v1/push and the Directiva endpoints, after PR #126:
 * declared need and consumption stay separate; only current versions count;
 * a replay does not duplicate; cancellations do not count; absence is not
 * zero and an explicit zero is a contributor; units are never mixed; the
 * date of the accepted data is the latest acceptance of the cell; coverage
 * counts only Members inside published figures; two cells decided in the same
 * read are checked against each other (S1); the DRAFT proposal has no
 * individual effects; JSON and CSV carry the same decisions.
 *
 * Functional acceptance, not a performance series. Policy F07-POL-01 is NOT
 * approved: provisional k = 3 with synthetic data only.
 */
const postgresUrl = process.env["F07_WEB_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

const PUSH = "/api/v1/sync/v1/push";
const ASSOCIATIONS = "/api/v1/collective/product-associations";

type Type = "CONSUMPTION_TOTAL" | "DECLARED_NEED";

interface Res {
  status: number;
  body: any;
  text: string;
}

describePostgres("F07 acceptance: summary, coverage and proposal through the API", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let director: TestSession;

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f07_acc");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    director = await createSession(prisma, jwt, f.members.directorA);
    for (const level of ["log", "warn"] as const) jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });

  async function farmer(): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId: f.tenantA, name: "Agricultor sintético", email: `f07acc-${userId}@example.test`,
        passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function campaign(): Promise<string> {
    const id = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id, tenantId: f.tenantA, name: `Campaña ${id.slice(0, 8)}`, status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
    });
    return id;
  }

  async function product(unit: "L" | "kg"): Promise<string> {
    return (await prisma.product.create({ data: { tenantId: f.tenantA, name: `Producto ${randomUUID().slice(0, 8)}`, unit } })).id;
  }

  function envelope(e: { campaign: string; product: string; type: Type; unit: "ML" | "G"; quantity?: string; action?: "PUBLISH" | "SUPERSEDE" | "CANCEL"; pred?: string }, operationId = randomUUID()) {
    const action = e.action ?? "PUBLISH";
    return {
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
    };
  }

  async function send(session: TestSession, body: object): Promise<Res> {
    return http().post(PUSH).set("Content-Type", "application/json").set(auth(session)).send(JSON.stringify(body));
  }

  async function push(session: TestSession, e: Parameters<typeof envelope>[0]): Promise<string> {
    const body = envelope(e);
    const res = await send(session, body);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("APPLIED");
    return body.operationId;
  }

  const summary = (id: string): Promise<Res> => http().get(`/api/v1/collective/campaigns/${id}/summary`).set(auth(director));
  const summaryCsv = (id: string): Promise<Res> => http().get(`/api/v1/collective/campaigns/${id}/summary.csv`).set(auth(director));
  const cell = (res: Res, type: Type, productRef: string) =>
    (res.body.cells as any[]).find((c) => c.projection_type === type && c.product_ref === productRef);

  /** Rows of a CSV section (after its header line), as objects. */
  function csvRows(text: string, firstColumn: string): Record<string, string>[] {
    const lines = text.trim().split("\n");
    const start = lines.findIndex((line) => line.startsWith(`${firstColumn},`));
    const header = lines[start]!.split(",");
    return lines.slice(start + 1).filter((line) => line !== "").map((line) => Object.fromEntries(line.split(",").map((v, i) => [header[i], v])));
  }

  async function effectCounts() {
    const counts = await Promise.all([
      prisma.purchase.count(), prisma.purchaseItem.count(), prisma.purchaseItemAllocation.count(), prisma.purchaseParticipant.count(),
      prisma.inventoryLot.count(), prisma.stockMovement.count(), prisma.payableAccount.count(), prisma.payment.count(),
      prisma.calendarEvent.count(), prisma.syncV1OperationJournal.count(),
    ]);
    const contributions = await prisma.syncV1Contribution.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, quantityBase: true, lastSequence: true } });
    return JSON.stringify({ counts, contributions }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  }

  it("needs and consumption stay separate; current versions only; a replay or a cancellation adds nothing; absence is not zero", async () => {
    const k = await campaign();
    const p = await product("L");
    const [f1, f2, f3, f4, f5] = [await farmer(), await farmer(), await farmer(), await farmer(), await farmer()];
    const need = { campaign: k, product: p, type: "DECLARED_NEED" as const, unit: "ML" as const };
    const used = { ...need, type: "CONSUMPTION_TOTAL" as const };
    const first = await push(f1, { ...need, quantity: "1000" });
    const supersede = envelope({ ...need, action: "SUPERSEDE", pred: first, quantity: "1500" });
    expect((await send(f1, supersede)).body.outcome).toBe("APPLIED");
    // The same operation again (a retry from the outbox): the persisted result, no second effect.
    expect((await send(f1, supersede)).status).toBe(200);
    await push(f2, { ...need, quantity: "2000" });
    await push(f3, { ...need, quantity: "0" });
    const cancelled = await push(f5, { ...need, quantity: "9000" });
    await push(f5, { ...need, action: "CANCEL", pred: cancelled });
    for (const [session, quantity] of [[f1, "100"], [f2, "200"], [f3, "300"], [f4, "700"]] as const) await push(session, { ...used, quantity });

    const res = await summary(k);
    expect(res.status).toBe(200);
    // 1500 + 2000 + 0: the superseded 1000, the replay and the cancelled 9000 do not count.
    expect(cell(res, "DECLARED_NEED", p)).toMatchObject({ status: "DISCLOSED", total_base: "3500", total_presentation: "3.5", contributors: 3 });
    // Consumption is a different concept: its own cell, never added to or subtracted from the need.
    expect(cell(res, "CONSUMPTION_TOTAL", p)).toMatchObject({ status: "DISCLOSED", total_base: "1300", contributors: 4 });
    expect(res.body.cells).toHaveLength(2);
    // f4 declared no need: it is not a zero in the need cell (3 contributors, not 4).
    // Coverage: the Members inside published figures (f1–f4), not f5 (cancelled), out of every linked farmer.
    const linked = await prisma.member.count({ where: { tenantId: f.tenantA, role: "AGRICULTOR", isActive: true, user: { isActive: true } } });
    expect(res.body.coverage).toEqual({ linked_members: linked, members_with_contribution: 4, suppressed_cells: false });
    expect(linked).toBeGreaterThan(4);
  });

  it("the date of the accepted data is the latest acceptance of the cell's current contributions, in JSON and CSV", async () => {
    const k = await campaign();
    const p = await product("L");
    for (const quantity of ["10", "20", "30"]) await push(await farmer(), { campaign: k, product: p, type: "DECLARED_NEED", unit: "ML", quantity });
    const latest = await prisma.syncV1Contribution.aggregate({ where: { campaignId: k, productId: p, status: "ACTIVE" }, _max: { acceptedAt: true } });
    const res = await summary(k);
    const shown = cell(res, "DECLARED_NEED", p);
    expect(shown.data_as_of).toBe(latest._max.acceptedAt!.toISOString());
    expect(shown.released_at).not.toBeNull();
    const row = csvRows((await summaryCsv(k)).text, "projection_type").find((r) => r["product_ref"] === p)!;
    expect(row["data_as_of"]).toBe(shown.data_as_of);
  });

  it("units: ML and G are never added, and an association across dimensions is refused without effect", async () => {
    const k = await campaign();
    const liquid = await product("L");
    const solid = await product("kg");
    const [a, b, c] = [await farmer(), await farmer(), await farmer()];
    for (const session of [a, b, c]) {
      await push(session, { campaign: k, product: liquid, type: "DECLARED_NEED", unit: "ML", quantity: "1000" });
      await push(session, { campaign: k, product: solid, type: "DECLARED_NEED", unit: "G", quantity: "1000" });
    }
    const before = await summary(k);
    expect(cell(before, "DECLARED_NEED", liquid)).toMatchObject({ base_unit: "ML", presentation_unit: "L", total_base: "3000" });
    expect(cell(before, "DECLARED_NEED", solid)).toMatchObject({ base_unit: "G", presentation_unit: "KG", total_base: "3000" });
    const refused = await http().post(ASSOCIATIONS).set(auth(director)).send({ productId: solid, canonicalProductId: liquid, reason: "dimensión distinta", confirmed: true });
    expect(refused.status).toBe(422);
    const after = await summary(k);
    expect(after.body.cells.map((x: any) => [x.product_ref, x.base_unit, x.total_base]).sort()).toEqual(
      before.body.cells.map((x: any) => [x.product_ref, x.base_unit, x.total_base]).sort(),
    );
  });

  it("coverage counts only the Members inside published figures (#126), in the summary and the proposal", async () => {
    const k = await campaign();
    const disclosed = await product("L");
    const small = await product("L");
    for (const quantity of ["10", "20", "30"]) await push(await farmer(), { campaign: k, product: disclosed, type: "DECLARED_NEED", unit: "ML", quantity });
    // Two other farmers in a cell under the threshold: suppressed, and not counted.
    for (const quantity of ["40", "50"]) await push(await farmer(), { campaign: k, product: small, type: "DECLARED_NEED", unit: "ML", quantity });
    const res = await summary(k);
    expect(cell(res, "DECLARED_NEED", small)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD", total_base: null, contributors: null });
    expect(res.body.coverage).toMatchObject({ members_with_contribution: 3, suppressed_cells: true });
    const draft = await http().post(`/api/v1/collective/campaigns/${k}/proposals`).set(auth(director));
    expect(draft.status).toBe(201);
    expect(draft.body.coverage).toMatchObject({ members_with_contribution: 3, basis: "PUBLISHED_FIGURES" });
    expect(draft.text).not.toMatch(/"90"|"2"/);
  });

  it("S1 (#126): a split decided in one read never publishes both P1 = 65 and P2 = 600 after 660", async () => {
    const k = await campaign();
    const p1 = await product("L");
    const p2 = await product("L");
    const heads: [TestSession, string][] = [];
    for (const [target, quantity] of [[p1, "10"], [p1, "20"], [p1, "30"], [p2, "100"], [p2, "200"], [p2, "300"]] as const) {
      const session = await farmer();
      heads.push([session, await push(session, { campaign: k, product: target, type: "DECLARED_NEED", unit: "ML", quantity })]);
    }
    expect((await http().post(ASSOCIATIONS).set(auth(director)).send({ productId: p2, canonicalProductId: p1, reason: "misma formulación", confirmed: true })).status).toBe(200);
    expect(cell(await summary(k), "DECLARED_NEED", p1)).toMatchObject({ status: "DISCLOSED", total_base: "660", contributors: 6 });
    // g joins P1 and the association is undone; both cells are decided in the next read.
    await push(await farmer(), { campaign: k, product: p1, type: "DECLARED_NEED", unit: "ML", quantity: "5" });
    expect((await http().post(`${ASSOCIATIONS}/${p2}/close`).set(auth(director)).send({ reason: "se separan", confirmed: true })).status).toBe(200);
    const split = await summary(k);
    const shown = [p1, p2].map((ref) => cell(split, "DECLARED_NEED", ref)).filter((c) => c?.status === "DISCLOSED").map((c) => c.total_base);
    // 65 + 600 − 660 = 5 would isolate g: at most one of the two cells is published.
    expect(shown.length).toBeLessThanOrEqual(1);
    expect(shown.length).toBe(1);
    // The CSV carries the same decisions.
    const rows = csvRows((await summaryCsv(k)).text, "projection_type").filter((r) => [p1, p2].includes(r["product_ref"]!));
    expect(rows.filter((r) => r["status"] === "DISCLOSED").map((r) => r["total_base"])).toEqual(shown);
  });

  it("the proposal is a DRAFT with no individual effect; its JSON, CSV and the summary agree; no savings are claimed", async () => {
    const k = await campaign();
    const p = await product("L");
    const q = await product("kg");
    for (const quantity of ["1000", "2000", "3000"]) {
      const session = await farmer();
      await push(session, { campaign: k, product: p, type: "DECLARED_NEED", unit: "ML", quantity });
      await push(session, { campaign: k, product: p, type: "CONSUMPTION_TOTAL", unit: "ML", quantity: "1" });
    }
    await push(await farmer(), { campaign: k, product: q, type: "DECLARED_NEED", unit: "G", quantity: "500" });
    const before = await effectCounts();
    const draft = await http().post(`/api/v1/collective/campaigns/${k}/proposals`).set(auth(director));
    expect(draft.status).toBe(201);
    expect(await effectCounts()).toBe(before);
    expect(draft.body).toMatchObject({ status: "DRAFT", basis: "DECLARED_NEED" });
    // Lines are the summary's DECLARED_NEED cells and nothing else (no consumption line).
    const res = await summary(k);
    const needCells = (res.body.cells as any[]).filter((c) => c.projection_type === "DECLARED_NEED");
    expect(draft.body.lines.map((l: any) => [l.product_ref, l.status, l.quantity_base]).sort()).toEqual(
      needCells.map((c) => [c.product_ref, c.status, c.total_base]).sort(),
    );
    const file = await http().get(`/api/v1/collective/proposals/${draft.body.proposal_ref}/csv`).set(auth(director));
    expect(file.status).toBe(200);
    const rows = csvRows(file.text, "position");
    expect(rows.map((r) => [r["product_ref"], r["status"], r["quantity_base"] || null]).sort()).toEqual(
      draft.body.lines.map((l: any) => [l.product_ref, l.status, l.quantity_base]).sort(),
    );
    const summaryRows = csvRows((await summaryCsv(k)).text, "projection_type");
    expect(summaryRows.map((r) => [r["projection_type"], r["product_ref"], r["status"], r["total_base"] || null]).sort()).toEqual(
      (res.body.cells as any[]).map((c) => [c.projection_type, c.product_ref, c.status, c.total_base]).sort(),
    );
    expect(`${JSON.stringify(draft.body)}${file.text}`).not.toMatch(/ahorro|saving|precio|price|costo/i);
  });
});
