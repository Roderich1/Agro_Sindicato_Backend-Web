import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import * as bcrypt from "bcrypt";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/**
 * F07 Web/JP (#23–#27, #108) on PostgreSQL: the D4 dataset and its
 * hand-written oracle (test-support/d4) published through POST /sync/v1/push,
 * the summary and the draft joint purchase proposal before and after the
 * Belator/Bellator association, regeneration, roles, tenant isolation, the
 * absence of individual effects and the provisional policy F07-POL-01
 * (NOT approved: k = 3, synthetic data only).
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
  headers: Record<string, string>;
}

interface OracleCell {
  stage: "RAW" | "CANONICAL";
  campaign: string;
  projection_type: Type;
  product: string;
  base_unit: "ML" | "G";
  members: string;
  total_base: string;
  status: string;
  visible_total_base: string;
  visible_contributors: string;
}

function csv(name: string): Record<string, string>[] {
  const [header, ...rows] = readFileSync(resolve(process.cwd(), "src/modules/collective/test-support/d4", name), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
  return rows.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ""])));
}

describePostgres("F07 Web summary and joint purchase proposal on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: CollectiveConfig;
  let f: Fixture;
  let director: TestSession;
  let admin: TestSession;
  let farmerSession: TestSession;
  let otherTenantDirector: TestSession;
  const farmers: Record<string, TestSession> = {};
  const campaigns: Record<string, string> = {};
  const products: Record<string, string> = {};
  const logged: string[] = [];

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f07_web");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    config = app.get(CollectiveConfig);
    f = await seedFixture(prisma);
    farmers["F1"] = await createSession(prisma, jwt, f.members.farmerA);
    farmers["F2"] = await createSession(prisma, jwt, f.members.farmerA2);
    farmers["F3"] = await fresh("AGRICULTOR");
    // F4 is linked but never contributes: absence is unknown, not zero.
    await fresh("AGRICULTOR");
    farmerSession = farmers["F1"];
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    otherTenantDirector = await fresh("DIRECTIVA", f.tenantB);
    for (const [key, name] of [["C1", "Campana Verano 2026"], ["C2", "Campana Invierno 2026"], ["C3", "=Campana, con fórmula"], ["C4", "Campana R1 R2"]]) {
      campaigns[key] = randomUUID();
      await prisma.agriculturalCampaign.create({
        data: { id: campaigns[key], tenantId: f.tenantA, name, status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
      });
    }
    for (const [name, unit] of [["Belator", "L"], ["Bellator", "L"], ["Glifosato F06", "L"], ["Urea F06", "kg"], ["Mancozeb F06", "kg"]]) {
      products[name] = (await prisma.product.create({ data: { tenantId: f.tenantA, name, unit } })).id;
    }
    for (const level of ["log", "warn", "error"] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }
    // The D4 dataset: 26 heads, one of them cancelled after publication.
    for (const row of csv("F06_EXPECTED_CONTRIBUTIONS.csv")) {
      const target = {
        campaign: campaigns[row["campaign"]],
        product: products[row["product"]],
        type: row["projection_type"] as Type,
        unit: row["base_unit"] as "ML" | "G",
      };
      if (row["status"] === "CANCELLED") {
        const published = await push(farmers[row["farmer"]], { ...target, quantity: "1000" });
        await push(farmers[row["farmer"]], { ...target, action: "CANCEL", pred: published });
      } else {
        await push(farmers[row["farmer"]], { ...target, quantity: row["quantity_base"] });
      }
    }
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function fresh(role: "AGRICULTOR" | "DIRECTIVA", tenantId = f.tenantA): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name: "Usuario sintético", email: `f07-${userId}@example.test`,
        passwordHash: unusablePasswordHash(), role,
        members: { create: { id: memberId, tenantId, role } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function push(
    session: TestSession,
    e: { campaign: string; product: string; type: Type; unit: "ML" | "G"; quantity?: string; action?: "PUBLISH" | "SUPERSEDE" | "CANCEL"; pred?: string },
  ): Promise<string> {
    const operationId = randomUUID();
    const action = e.action ?? "PUBLISH";
    const res: Res = await http()
      .post(PUSH)
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${session.token}`)
      .send(JSON.stringify({
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
      }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("APPLIED");
    return operationId;
  }

  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });
  const summary = (campaign: string, session = director): Promise<Res> =>
    http().get(`/api/v1/collective/campaigns/${campaign}/summary`).set(auth(session));
  const generate = (campaign: string, session = director): Promise<Res> =>
    http().post(`/api/v1/collective/campaigns/${campaign}/proposals`).set(auth(session));
  const proposal = (id: string, session = director): Promise<Res> =>
    http().get(`/api/v1/collective/proposals/${id}`).set(auth(session));
  const proposalCsv = (id: string, session = director): Promise<Res> =>
    http().get(`/api/v1/collective/proposals/${id}/csv`).set(auth(session));
  const history = (campaign: string, session = director): Promise<Res> =>
    http().get(`/api/v1/collective/campaigns/${campaign}/proposals`).set(auth(session));

  const nameOf = (ref: string) => Object.entries(products).find(([, id]) => id === ref)?.[0];

  /** Oracle rows of one stage/campaign that the summary shows (ABSENT: no cell). */
  function oracle(stage: "RAW" | "CANONICAL", campaign: string, type?: Type): OracleCell[] {
    return (csv("F06_EXPECTED_CELLS.csv") as unknown as OracleCell[]).filter(
      (row) => row.stage === stage && row.campaign === campaign && row.status !== "ABSENT" && (!type || row.projection_type === type),
    );
  }

  function expectSummaryMatches(res: Res, stage: "RAW" | "CANONICAL", campaign: string) {
    expect(res.status).toBe(200);
    const got = (res.body.cells as any[])
      .map((cell) => [cell.projection_type, nameOf(cell.product_ref), cell.base_unit, cell.status, cell.total_base, cell.contributors].join("|"))
      .sort();
    const expected = oracle(stage, campaign)
      .map((row) => [
        row.projection_type, row.product, row.base_unit, row.status,
        row.visible_total_base || null, row.visible_contributors ? Number(row.visible_contributors) : null,
      ].join("|"))
      .sort();
    expect(got).toEqual(expected);
  }

  /** Proposal lines = the summary's DECLARED_NEED cells, nothing more. */
  function expectProposalMatches(res: Res, stage: "RAW" | "CANONICAL", campaign: string) {
    expect([200, 201]).toContain(res.status);
    const got = (res.body.lines as any[])
      .map((line) => [nameOf(line.product_ref), line.base_unit, line.status, line.quantity_base, line.contributors].join("|"))
      .sort();
    const expected = oracle(stage, campaign, "DECLARED_NEED")
      .map((row) => [row.product, row.base_unit, row.status, row.visible_total_base || null, row.visible_contributors ? Number(row.visible_contributors) : null].join("|"))
      .sort();
    expect(got).toEqual(expected);
  }

  /** Hidden totals of suppressed cells must not appear as numbers anywhere. */
  function expectNoHiddenTotals(text: string, stage: "RAW" | "CANONICAL", campaign: string) {
    for (const row of csv("F06_EXPECTED_CELLS.csv") as unknown as OracleCell[]) {
      if (row.stage !== stage || row.campaign !== campaign || row.status === "DISCLOSED" || !row.total_base) continue;
      expect(text).not.toMatch(new RegExp(`(^|[^0-9a-f-])${row.total_base}([^0-9a-f-]|$)`));
    }
  }

  async function effectCounts() {
    const [purchases, purchaseItems, allocations, participants, lots, movements, payables, payments, contributions, journal] =
      await Promise.all([
        prisma.purchase.count(),
        prisma.purchaseItem.count(),
        prisma.purchaseItemAllocation.count(),
        prisma.purchaseParticipant.count(),
        prisma.inventoryLot.count(),
        prisma.stockMovement.count(),
        prisma.payableAccount.count(),
        prisma.payment.count(),
        prisma.syncV1Contribution.findMany({
          orderBy: { id: "asc" },
          select: { id: true, status: true, quantityBase: true, lastSequence: true, productId: true },
        }),
        prisma.syncV1OperationJournal.count(),
      ]);
    const catalogue = await prisma.product.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, currentStock: true, updatedAt: true },
    });
    return JSON.stringify({ purchases, purchaseItems, allocations, participants, lots, movements, payables, payments, contributions, journal, catalogue }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  }

  let rawC1: Res;
  let rawC2: Res;

  it("RAW stage: summary and proposal match the D4 oracle; suppressed figures never appear", async () => {
    for (const [key, ref] of [["C1", campaigns.C1], ["C2", campaigns.C2]] as const) {
      const s = await summary(ref);
      expectSummaryMatches(s, "RAW", key);
      // Absence is unknown: F4 counts in linked_members only.
      expect(s.body.coverage).toEqual({ linked_members: 4, members_with_contribution: 3, suppressed_cells: true });
    }
    rawC1 = await generate(campaigns.C1);
    rawC2 = await generate(campaigns.C2);
    expect(rawC1.status).toBe(201);
    expectProposalMatches(rawC1, "RAW", "C1");
    expectProposalMatches(rawC2, "RAW", "C2");
    expect(rawC1.body).toMatchObject({
      status: "DRAFT",
      basis: "DECLARED_NEED",
      disclosure: { mode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", approved: false },
      coverage: { linked_members: 4, members_with_contribution: 3 },
    });
    expect(rawC1.body.notice).toMatch(/no es necesidad neta/);
    expect(rawC1.body.inputs_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // Explicit zero: Urea C1 includes F2's 0 and is 25000 from 3 Members.
    expect(rawC1.body.lines.find((l: any) => nameOf(l.product_ref) === "Urea F06")).toMatchObject({
      status: "DISCLOSED", quantity_base: "25000", quantity_presentation: "25", contributors: 3,
    });
    for (const line of rawC1.body.lines.filter((l: any) => l.status !== "DISCLOSED")) {
      expect(line).toMatchObject({ quantity_base: null, quantity_presentation: null, contributors: null, data_as_of: null });
    }
    const detail = await proposal(rawC1.body.proposal_ref);
    const file = await proposalCsv(rawC1.body.proposal_ref);
    expect(detail.body).toEqual(rawC1.body);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toMatch(/text\/csv/);
    for (const text of [rawC1.text, detail.text, file.text]) expectNoHiddenTotals(text, "RAW", "C1");
    expectNoHiddenTotals(rawC2.text, "RAW", "C2");
    // CSV carries exactly the JSON states, nothing more.
    const csvLines = file.text.trim().split("\n").slice(5);
    expect(csvLines).toHaveLength(rawC1.body.lines.length);
    expect(file.text).toContain(",DISCLOSED,25000,25,3,");
  });

  it("regeneration with the same authorized inputs gives the same lines, order and fingerprint", async () => {
    const again = await generate(campaigns.C1);
    expect(again.body.proposal_ref).not.toBe(rawC1.body.proposal_ref);
    expect(again.body.inputs_fingerprint).toBe(rawC1.body.inputs_fingerprint);
    const strip = (lines: any[]) => lines.map(({ released_at: _r, ...rest }) => rest);
    expect(strip(again.body.lines)).toEqual(strip(rawC1.body.lines));
    const list = await history(campaigns.C1);
    expect(list.status).toBe(200);
    expect(list.body.map((p: any) => p.proposal_ref)).toEqual([again.body.proposal_ref, rawC1.body.proposal_ref]);
    // History carries no quantities.
    for (const entry of list.body) {
      expect(Object.keys(entry).sort()).toEqual(["generated_at", "generated_by", "inputs_fingerprint", "line_count", "proposal_ref", "status"]);
    }
  });

  it("generation creates no purchase, lot, movement, payable or payment and leaves contributions untouched", async () => {
    const before = await effectCounts();
    const proposalsBefore = await prisma.jointPurchaseProposal.count();
    const res = await generate(campaigns.C2);
    expect(res.status).toBe(201);
    await proposal(res.body.proposal_ref);
    await proposalCsv(res.body.proposal_ref);
    expect(await effectCounts()).toBe(before);
    expect(await prisma.jointPurchaseProposal.count()).toBe(proposalsBefore + 1);
    // The stored lines hold no quantity column at all, only a release reference.
    const stored = await prisma.jointPurchaseProposalLine.findMany({ where: { proposalId: res.body.proposal_ref } });
    for (const line of stored) {
      expect(Object.keys(line).sort()).toEqual(["baseUnit", "canonicalProductId", "pendingChanges", "position", "proposalId", "releaseId", "status"]);
      expect(line.releaseId !== null).toBe(line.status === "DISCLOSED");
    }
  });

  it("CANONICAL stage: after confirming Bellator → Belator, summary and regenerated proposal follow the oracle", async () => {
    const res = await http().post(ASSOCIATIONS).set(auth(director)).send({
      productId: products["Bellator"], canonicalProductId: products["Belator"], reason: "misma formulación (D4)", confirmed: true,
    });
    expect(res.status).toBe(200);
    const c1 = await summary(campaigns.C1);
    expectSummaryMatches(c1, "CANONICAL", "C1");
    expectSummaryMatches(await summary(campaigns.C2), "CANONICAL", "C2");
    const regenerated = await generate(campaigns.C1);
    expectProposalMatches(regenerated, "CANONICAL", "C1");
    expect(regenerated.body.lines.find((l: any) => nameOf(l.product_ref) === "Belator")).toMatchObject({
      status: "DISCLOSED", quantity_base: "11000", quantity_presentation: "11", contributors: 3,
    });
    // Only the Belator line changed: Bellator merged into it; Urea is identical.
    expect(regenerated.body.inputs_fingerprint).not.toBe(rawC1.body.inputs_fingerprint);
    // (Its position moves up because the Bellator line is gone.)
    const urea = (body: any) => {
      const { position: _p, ...line } = body.lines.find((l: any) => nameOf(l.product_ref) === "Urea F06");
      return line;
    };
    expect(urea(regenerated.body)).toEqual(urea(rawC1.body));
    expectNoHiddenTotals(regenerated.text, "CANONICAL", "C1");
    // C2 declared needs are not affected by the association: same fingerprint.
    const c2 = await generate(campaigns.C2);
    expectProposalMatches(c2, "CANONICAL", "C2");
    expect(c2.body.inputs_fingerprint).toBe(rawC2.body.inputs_fingerprint);
    // The earlier RAW draft still shows only what it showed (Urea), never the Belator total.
    const old = await proposal(rawC1.body.proposal_ref);
    expectProposalMatches(old, "RAW", "C1");
  });

  it("roles and tenant: DIRECTIVA and ADMINISTRADOR of the tenant; AGRICULTOR 403; other tenant 404; no session 401", async () => {
    const id = rawC1.body.proposal_ref;
    const asAdmin = await generate(campaigns.C1, admin);
    expect(asAdmin.status).toBe(201);
    expect((await proposal(id, admin)).status).toBe(200);
    // One request at a time: parallel supertest servers reset connections on CI.
    const routes = async (session?: TestSession): Promise<Res[]> => {
      const h = session ? auth(session) : {};
      const calls = [
        () => http().get(`/api/v1/collective/campaigns/${campaigns.C1}/summary`).set(h),
        () => http().post(`/api/v1/collective/campaigns/${campaigns.C1}/proposals`).set(h),
        () => http().get(`/api/v1/collective/campaigns/${campaigns.C1}/proposals`).set(h),
        () => http().get(`/api/v1/collective/proposals/${id}`).set(h),
        () => http().get(`/api/v1/collective/proposals/${id}/csv`).set(h),
        () => http().get(`${ASSOCIATIONS}/catalog`).set(h),
        () => http().get(ASSOCIATIONS).set(h),
      ];
      const results: Res[] = [];
      for (const call of calls) results.push(await call());
      return results;
    };
    const count = await prisma.jointPurchaseProposal.count();
    for (const res of await routes(farmerSession)) {
      expect(res.status).toBe(403);
      expect(res.text).not.toContain("25000");
    }
    for (const res of await routes()) expect(res.status).toBe(401);
    const foreign = await routes(otherTenantDirector);
    // Campaign- and proposal-scoped routes: 404, indistinguishable from missing.
    for (const res of foreign.slice(0, 5)) {
      expect(res.status).toBe(404);
      expect(res.text).not.toContain("25000");
    }
    // Catalogue and associations of tenant B: nothing from tenant A.
    expect(foreign[5].status).toBe(200);
    expect(foreign[5].text).not.toContain(products["Belator"]);
    expect(foreign[6].text).not.toContain(products["Belator"]);
    expect(await prisma.jointPurchaseProposal.count()).toBe(count);
  });

  it("the Web's current Auth V1 client (POST /auth/login) reaches the same endpoints", async () => {
    const password = randomBytes(18).toString("base64url");
    const member = await prisma.member.findUniqueOrThrow({ where: { id: f.members.directorA }, include: { user: true } });
    await prisma.user.update({ where: { id: member.userId }, data: { passwordHash: await bcrypt.hash(password, 4) } });
    const login: Res = await http().post("/api/v1/auth/login").send({ email: member.user.email, password });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;
    const res: Res = await http().get(`/api/v1/collective/proposals/${rawC1.body.proposal_ref}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.proposal_ref).toBe(rawC1.body.proposal_ref);
    await prisma.user.update({ where: { id: member.userId }, data: { passwordHash: unusablePasswordHash() } });
  });

  it("the reconciliation catalogue exposes name and unit only, and history names actors", async () => {
    const catalog: Res = await http().get(`${ASSOCIATIONS}/catalog`).set(auth(director));
    expect(catalog.status).toBe(200);
    const belator = catalog.body.find((p: any) => p.product_ref === products["Belator"]);
    expect(belator).toEqual({ product_ref: products["Belator"], product_name: "Belator", unit: "L", base_unit: "ML", is_active: true });
    expect(catalog.body.find((p: any) => p.product_name === "Coadyuvante por unidad").base_unit).toBeNull();
    expect(catalog.text).not.toMatch(/currentStock|minimumStock|qrCode|safetyDataSheet/);
    const list: Res = await http().get(ASSOCIATIONS).set(auth(director));
    expect(list.body.current[0]).toMatchObject({ actor_name: "Usuario sintético directorA", closed_by_name: null });
  });

  it("pending changes keep the prior figure flagged; an overflow never shows a figure", async () => {
    const [a, b, c] = [farmers.F1, farmers.F2, farmers.F3];
    const target = { campaign: campaigns.C3, product: products["Glifosato F06"], type: "DECLARED_NEED" as Type, unit: "ML" as const };
    const first = await push(a, { ...target, quantity: "1000" });
    await push(b, { ...target, quantity: "2000" });
    await push(c, { ...target, quantity: "3000" });
    const released = await generate(campaigns.C3);
    expect(released.body.lines[0]).toMatchObject({ status: "DISCLOSED", quantity_base: "6000", pending_changes: false });
    await push(a, { ...target, action: "SUPERSEDE", pred: first, quantity: "1500" });
    const pending = await generate(campaigns.C3);
    // One Member changed: the prior figure stays, flagged; the new total never appears.
    expect(pending.body.lines[0]).toMatchObject({ status: "DISCLOSED", quantity_base: "6000", pending_changes: true });
    expect(pending.text).not.toContain("6500");
    expect(pending.body.inputs_fingerprint).not.toBe(released.body.inputs_fingerprint);
    const big = { ...target, product: products["Urea F06"], unit: "G" as const };
    for (const s of [a, b, c]) await push(s, { ...big, quantity: "4000000000000000000" });
    const overflow = await generate(campaigns.C3);
    expect(overflow.body.lines.find((l: any) => nameOf(l.product_ref) === "Urea F06")).toMatchObject({
      status: "OVERFLOW", quantity_base: null, quantity_presentation: null, contributors: null,
    });
    // User-controlled text is neutralised in the CSV.
    const file = await proposalCsv(overflow.body.proposal_ref);
    expect(file.text).toContain(`"'=Campana, con fórmula"`);
    expect(file.text).not.toMatch(/(^|,)=Campana/m);
  });

  /**
   * After a figure leaves the summary, no new response serves it: detail,
   * listing/history and CSV of every earlier draft, a fresh draft with its
   * CSV, and the summary JSON/CSV. Fingerprints that covered it are hidden.
   */
  async function expectNoLongerServed(campaign: string, drafts: string[], amounts: string[], fingerprints: string[]) {
    const number = new RegExp(`(^|[^0-9a-f-])(${amounts.join("|")})([^0-9a-f-]|$)`);
    const fresh = await generate(campaign);
    expect(fresh.status).toBe(201);
    const responses: Res[] = [
      fresh,
      await proposalCsv(fresh.body.proposal_ref),
      await summary(campaign),
      await http().get(`/api/v1/collective/campaigns/${campaign}/summary.csv`).set(auth(director)),
    ];
    for (const id of drafts) {
      const detail = await proposal(id);
      expect(detail.status).toBe(200);
      for (const line of detail.body.lines) {
        if (line.status !== "DISCLOSED") expect(line).toMatchObject({ quantity_base: null, quantity_presentation: null, contributors: null });
      }
      expect(detail.body.inputs_fingerprint).toBeNull();
      responses.push(detail, await proposalCsv(id));
    }
    const list = await history(campaign);
    expect(list.status).toBe(200);
    for (const id of drafts) {
      expect(list.body.find((entry: any) => entry.proposal_ref === id).inputs_fingerprint).toBeNull();
    }
    responses.push(list);
    for (const res of responses) {
      expect(res.text).not.toMatch(number);
      for (const fingerprint of fingerprints) expect(res.text).not.toContain(fingerprint);
    }
  }

  it("a figure withdrawn by the summary is not served by an earlier proposal, JSON or CSV", async () => {
    const c1 = await generate(campaigns.C1);
    expect(c1.body.lines.find((l: any) => nameOf(l.product_ref) === "Urea F06").status).toBe("DISCLOSED");
    // F3 cancels its Urea need: two Members remain, the summary withdraws 25000 (R4).
    const ureaF3 = await prisma.syncV1Contribution.findFirstOrThrow({
      where: { campaignId: campaigns.C1, productId: products["Urea F06"], projectionType: "DECLARED_NEED", memberId: farmers.F3.memberId },
      select: { headOperationId: true },
    });
    await push(farmers.F3, { campaign: campaigns.C1, product: products["Urea F06"], type: "DECLARED_NEED", unit: "G", action: "CANCEL", pred: ureaF3.headOperationId! });
    // Read the old draft first, before anyone asks for the summary.
    for (const id of [c1.body.proposal_ref, rawC1.body.proposal_ref]) {
      const detail = await proposal(id);
      expect(detail.body.lines.find((l: any) => nameOf(l.product_ref) === "Urea F06")).toMatchObject({
        status: "WITHDRAWN", quantity_base: null, quantity_presentation: null, contributors: null,
      });
      expect(detail.text).not.toContain("25000");
      const file = await proposalCsv(id);
      expect(file.text).not.toContain("25000");
      expect(file.text).toContain(",WITHDRAWN,");
    }
    const s = await summary(campaigns.C1);
    expect(s.body.cells.find((cell: any) => cell.projection_type === "DECLARED_NEED" && nameOf(cell.product_ref) === "Urea F06").status)
      .toBe("SUPPRESSED_UNDER_THRESHOLD");
    // Every C1 draft has the Urea line: none serves 25000 or the fingerprint that covered it.
    const drafts = (await prisma.jointPurchaseProposal.findMany({ where: { campaignId: campaigns.C1 }, select: { id: true } })).map((p) => p.id);
    expect(drafts.length).toBeGreaterThanOrEqual(4);
    await expectNoLongerServed(campaigns.C1, drafts, ["25000"], [c1.body.inputs_fingerprint, rawC1.body.inputs_fingerprint]);
  });

  it("an older release that the summary no longer shows is never served: superseded, then withdrawn (R4/R8)", async () => {
    const [a, b, c] = [farmers.F1, farmers.F2, farmers.F3];
    const target = { campaign: campaigns.C4, product: products["Glifosato F06"], type: "DECLARED_NEED" as Type, unit: "ML" as const };
    const heads = [
      await push(a, { ...target, quantity: "1000" }),
      await push(b, { ...target, quantity: "2000" }),
      await push(c, { ...target, quantity: "3000" }),
    ];
    // P1 rests on R1 = 6000.
    const p1 = await generate(campaigns.C4);
    expect(p1.body.lines[0]).toMatchObject({ status: "DISCLOSED", quantity_base: "6000" });
    expect(p1.body.inputs_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // k = 3 Members change: the summary publishes R2 = 6600; R1 is not withdrawn.
    for (const [i, session] of [a, b, c].entries()) {
      heads[i] = await push(session, { ...target, action: "SUPERSEDE", pred: heads[i], quantity: String((i + 1) * 1100) });
    }
    const s2 = await summary(campaigns.C4);
    expect(s2.body.cells[0]).toMatchObject({ status: "DISCLOSED", total_base: "6600" });
    const r1 = await prisma.collectiveRelease.findFirstOrThrow({ where: { campaignId: campaigns.C4, totalBase: 6000n } });
    expect(r1.withdrawnAt).toBeNull();
    const p2 = await generate(campaigns.C4);
    expect(p2.body.lines[0]).toMatchObject({ status: "DISCLOSED", quantity_base: "6600" });
    // P1 does not serve R1 next to R2: superseded, no figure, no fingerprint.
    const superseded = await proposal(p1.body.proposal_ref);
    expect(superseded.body.lines[0]).toMatchObject({ status: "SUPERSEDED", quantity_base: null, contributors: null });
    expect(superseded.body.inputs_fingerprint).toBeNull();
    expect(superseded.text).not.toContain("6000");
    // A cancellation withdraws R2; the cell is suppressed. R1 still has withdrawnAt = null.
    await push(c, { ...target, action: "CANCEL", pred: heads[2] });
    for (const id of [p1.body.proposal_ref, p2.body.proposal_ref]) {
      const detail = await proposal(id);
      expect(detail.body.lines[0]).toMatchObject({ status: "WITHDRAWN", quantity_base: null, quantity_presentation: null });
      expect(detail.body.inputs_fingerprint).toBeNull();
      const file = await proposalCsv(id);
      for (const text of [detail.text, file.text]) {
        expect(text).not.toMatch(/(^|[^0-9a-f-])(6000|6600)([^0-9a-f-]|$)/);
        expect(text).not.toContain(p1.body.inputs_fingerprint);
      }
    }
    expect((await prisma.collectiveRelease.findUniqueOrThrow({ where: { id: r1.id } })).withdrawnAt).toBeNull();
    const list = await history(campaigns.C4);
    expect(list.body.map((entry: any) => entry.inputs_fingerprint)).toEqual([null, null]);
    const cell = (await summary(campaigns.C4)).body.cells[0];
    expect(cell.status).toMatch(/^SUPPRESSED_/);
    expect(cell.total_base).toBeNull();
    // Detail, listing/history and CSV of P1 and P2, a fresh draft and the summary: neither figure.
    await expectNoLongerServed(
      campaigns.C4,
      [p1.body.proposal_ref, p2.body.proposal_ref],
      ["6000", "6600"],
      [p1.body.inputs_fingerprint, p2.body.inputs_fingerprint],
    );
  });

  it("POLICY_PENDING: nothing is generated or stored and no stored proposal serves a figure", async () => {
    const mutable = config as unknown as { mode: string };
    const previous = mutable.mode;
    mutable.mode = "POLICY_PENDING";
    try {
      const count = await prisma.jointPurchaseProposal.count();
      const refused = await generate(campaigns.C2);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe("POLICY_PENDING");
      expect(await prisma.jointPurchaseProposal.count()).toBe(count);
      const detail = await proposal(rawC2.body.proposal_ref);
      expect(detail.status).toBe(200);
      expect(detail.body.disclosure.mode).toBe("POLICY_PENDING");
      expect(detail.body.coverage).toBeNull();
      for (const line of detail.body.lines) {
        expect(line).toMatchObject({ status: "POLICY_PENDING", quantity_base: null, quantity_presentation: null, contributors: null });
      }
      expect(detail.text).not.toContain("11500");
      const file = await proposalCsv(rawC2.body.proposal_ref);
      expect(file.text).not.toContain("11500");
      // A campaign of another tenant is still 404, not 409.
      expect((await generate(campaigns.C2, otherTenantDirector)).status).toBe(404);
    } finally {
      mutable.mode = previous;
    }
  });

  it("logs carry no quantities", () => {
    const text = logged.join("\n");
    for (const quantity of ["25000", "11000", "11500", "4000000000000000000"]) expect(text).not.toContain(quantity);
  });
});
