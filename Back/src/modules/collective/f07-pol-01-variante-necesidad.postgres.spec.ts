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
 * Experimental DECLARED_NEED variant `threshold-only` (2026-11-05, PR #204,
 * NOT approved: #107) on PostgreSQL, end to end through POST /sync/v1/push and
 * the Directiva endpoints, in an isolated synthetic database:
 * - two distinct farmers: hidden; the third: 10 + 15 + 5 = 30 L;
 * - a new accepted contribution from a fourth: 38 L on the next read, with no
 *   other action; comparing both totals gives +8 L, the fourth farmer's need;
 * - a replay does not duplicate; withdrawals down to two hide the figure again;
 * - unchanged: consumption keeps the combinations rule, a seal is decided with
 *   the combinations rule and read from its sealed version, and a draft
 *   proposal already saved is never rewritten.
 *
 * The variant never runs in production (collective-config.spec.ts).
 */
const postgresUrl = process.env["F07_WEB_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

const PUSH = "/api/v1/sync/v1/push";
type Type = "CONSUMPTION_TOTAL" | "DECLARED_NEED";

interface Res {
  status: number;
  body: any;
  text: string;
}

describePostgres("F07-POL-01 variant threshold-only for the declared need", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let director: TestSession;

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    process.env["COLLECTIVE_DECLARED_NEED_RULE"] = "threshold-only";
    process.env["COLLECTIVE_SEALING"] = "enabled";
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f07_variante");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    director = await createSession(prisma, jwt, f.members.directorA);
    for (const level of ["log", "warn"] as const) jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    delete process.env["COLLECTIVE_DECLARED_NEED_RULE"];
    delete process.env["COLLECTIVE_SEALING"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });

  async function farmers(n: number): Promise<TestSession[]> {
    const sessions: TestSession[] = [];
    for (let i = 0; i < n; i++) {
      const userId = randomUUID();
      const memberId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId, tenantId: f.tenantA, name: `Agricultor variante ${i + 1}`, email: `f07var-${userId}@example.test`,
          passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
          members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
        },
      });
      sessions.push(await createSession(prisma, jwt, memberId));
    }
    return sessions;
  }

  async function campaign(): Promise<string> {
    const id = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id, tenantId: f.tenantA, name: `Campaña variante ${id.slice(0, 8)}`, status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
    });
    return id;
  }

  async function product(): Promise<string> {
    return (await prisma.product.create({ data: { tenantId: f.tenantA, name: `Herbicida variante ${randomUUID().slice(0, 8)}`, unit: "L" } })).id;
  }

  function envelope(e: { campaign: string; product: string; type?: Type; litres?: number; action?: "PUBLISH" | "CANCEL"; pred?: string }) {
    const action = e.action ?? "PUBLISH";
    return {
      contractVersion: 1,
      operationId: randomUUID(),
      projectionType: e.type ?? "DECLARED_NEED",
      action,
      causal: { predecessorOperationId: e.pred ?? null, reconciliationReference: null },
      payload: {
        campaign_ref: e.campaign,
        product_ref: e.product,
        base_unit: "ML",
        ...(action === "CANCEL" ? {} : { quantity_base: String(e.litres! * 1000) }),
      },
    };
  }

  async function send(session: TestSession, body: object): Promise<Res> {
    const res = await http().post(PUSH).set("Content-Type", "application/json").set(auth(session)).send(JSON.stringify(body));
    expect(res.status).toBe(200);
    return res;
  }

  async function push(session: TestSession, e: Parameters<typeof envelope>[0]) {
    const body = envelope(e);
    const res = await send(session, body);
    expect(res.body.outcome).toBe("APPLIED");
    return body;
  }

  const summary = (id: string): Promise<Res> => http().get(`/api/v1/collective/campaigns/${id}/summary`).set(auth(director));

  /** The cell as the Directiva reads it: [status, total in L, contributors, pending changes]. */
  async function read(campaignId: string, productId: string, type: Type = "DECLARED_NEED") {
    const res = await summary(campaignId);
    expect(res.status).toBe(200);
    const cell = (res.body.cells as any[]).find((c) => c.projection_type === type && c.product_ref === productId);
    return [cell.status, cell.total_presentation, cell.contributors, cell.pending_changes];
  }

  const releases = (campaignId: string, productId: string) =>
    prisma.collectiveRelease.findMany({
      where: { tenantId: f.tenantA, campaignId, canonicalProductId: productId, projectionType: "DECLARED_NEED" },
      orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
      select: { id: true, totalBase: true, contributorCount: true, withdrawnAt: true },
    });

  it("hidden with two farmers, 30 L with the third, 38 L with the fourth; a replay does not duplicate; withdrawals hide it again", async () => {
    const [f1, f2, f3, f4] = await farmers(4);
    const c = await campaign();
    const p = await product();
    const hidden = ["SUPPRESSED_UNDER_THRESHOLD", null, null, false];

    await push(f1!, { campaign: c, product: p, litres: 10 });
    expect(await read(c, p)).toEqual(hidden);
    await push(f2!, { campaign: c, product: p, litres: 15 });
    expect(await read(c, p)).toEqual(hidden);
    const third = await push(f3!, { campaign: c, product: p, litres: 5 });
    expect(await read(c, p)).toEqual(["DISCLOSED", "30", 3, false]);

    // A draft saved while 30 L is the figure.
    const draft = await http().post(`/api/v1/collective/campaigns/${c}/proposals`).set(auth(director));
    expect(draft.status).toBe(201);
    const line = (draft.body.lines as any[]).find((l) => l.product_ref === p);
    expect(line).toMatchObject({ status: "DISCLOSED", quantity_presentation: "30", contributors: 3 });
    const storedBefore = await prisma.jointPurchaseProposalLine.findMany({ where: { proposalId: draft.body.proposal_ref }, orderBy: { position: "asc" } });

    // The fourth farmer's accepted contribution: the next read shows 38 L.
    const fourth = envelope({ campaign: c, product: p, litres: 8 });
    expect((await send(f4!, fourth)).body.outcome).toBe("APPLIED");
    expect(await read(c, p)).toEqual(["DISCLOSED", "38", 4, false]);

    // Anyone who kept the previous figure deduces the fourth farmer's need.
    const shown = await releases(c, p);
    const [r30, r38] = shown.slice(-2);
    expect([r30!.totalBase, r30!.contributorCount, r38!.totalBase, r38!.contributorCount]).toEqual([30000n, 3, 38000n, 4]);
    expect(r38!.totalBase - r30!.totalBase).toBe(8000n);

    // A replay (same operationId and body) is ALREADY_APPLIED and adds nothing.
    const releasesBeforeReplay = (await releases(c, p)).length;
    expect((await send(f4!, fourth)).body.outcome).toBe("ALREADY_APPLIED");
    expect(await read(c, p)).toEqual(["DISCLOSED", "38", 4, false]);
    expect(await prisma.syncV1Contribution.count({ where: { campaignId: c, productId: p, projectionType: "DECLARED_NEED", status: "ACTIVE" } })).toBe(4);
    expect((await releases(c, p)).length).toBe(releasesBeforeReplay);

    // The saved draft is not rewritten; it no longer serves 30 L as current.
    expect(await prisma.jointPurchaseProposalLine.findMany({ where: { proposalId: draft.body.proposal_ref }, orderBy: { position: "asc" } })).toEqual(storedBefore);
    const view = await http().get(`/api/v1/collective/proposals/${draft.body.proposal_ref}`).set(auth(director));
    expect((view.body.lines as any[]).find((l) => l.product_ref === p)).toMatchObject({ status: "SUPERSEDED", quantity_base: null });

    // Withdrawals: the fourth leaves (30 L, 3), then the third (two left: hidden).
    await push(f4!, { campaign: c, product: p, action: "CANCEL", pred: fourth.operationId });
    expect(await read(c, p)).toEqual(["DISCLOSED", "30", 3, false]);
    await push(f3!, { campaign: c, product: p, action: "CANCEL", pred: third.operationId });
    expect(await read(c, p)).toEqual(hidden);
    // The figure in force is withdrawn: nothing is served for this cell.
    const after = await releases(c, p);
    expect(after.at(-1)!.withdrawnAt).not.toBeNull();
  });

  it("consumption keeps the combinations rule: 30 L stays with pending changes after the fourth", async () => {
    const [f1, f2, f3, f4] = await farmers(4);
    const c = await campaign();
    const p = await product();
    for (const [farmer, litres] of [[f1, 10], [f2, 15], [f3, 5]] as const) {
      await push(farmer!, { campaign: c, product: p, type: "CONSUMPTION_TOTAL", litres });
    }
    expect(await read(c, p, "CONSUMPTION_TOTAL")).toEqual(["DISCLOSED", "30", 3, false]);
    await push(f4!, { campaign: c, product: p, type: "CONSUMPTION_TOTAL", litres: 8 });
    expect(await read(c, p, "CONSUMPTION_TOTAL")).toEqual(["DISCLOSED", "30", 3, true]);
  });

  it("a seal is decided with the combinations rule and then served from its sealed version", async () => {
    const [f1, f2, f3, f4] = await farmers(4);
    const c = await campaign();
    const p = await product();
    for (const [farmer, litres] of [[f1, 10], [f2, 15], [f3, 5]] as const) await push(farmer!, { campaign: c, product: p, litres });
    expect(await read(c, p)).toEqual(["DISCLOSED", "30", 3, false]);
    // The fourth arrives and nobody reads the summary before the campaign closes.
    await push(f4!, { campaign: c, product: p, litres: 8 });
    expect((await http().post(`/api/v1/campaigns/${c}/close`).set(auth(director)).send({})).status).toBe(200);

    const state = await http().get(`/api/v1/collective/campaigns/${c}/seal`).set(auth(director));
    expect(state.status).toBe(200);
    expect(state.body.can_seal).toBe(true);
    const sealed = await http().post(`/api/v1/collective/campaigns/${c}/seal`).set(auth(director)).send({ confirmed: true, review_ref: state.body.review.review_ref });
    expect(sealed.status).toBe(200);
    expect(sealed.body).toMatchObject({ state: "SEALED", created: true });

    // With the variant active, the sealed figure is still 30 L (combinations), never 38 L.
    expect(await read(c, p)).toEqual(["DISCLOSED", "30", 3, true]);
    const entry = await prisma.collectiveSealEntry.findFirstOrThrow({
      where: { seal: { campaignId: c }, projectionType: "DECLARED_NEED", canonicalProductId: p },
      include: { release: { select: { totalBase: true } } },
    });
    expect(entry.release?.totalBase).toBe(30000n);
    expect(await prisma.collectiveRelease.count({ where: { campaignId: c, totalBase: 38000n } })).toBe(0);
  });
});
