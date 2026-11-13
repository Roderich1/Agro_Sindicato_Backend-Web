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
import { CollectiveConfig } from "./application/collective-config";
import { CollectivePolicyActivation } from "./application/collective-policy-activation";

/**
 * E4 §5.1, §5.3 and §8 tests 11 and 13 against a real PostgreSQL and the
 * real Nest application: the explicit, traced activation of F07-POL-02 and
 * the collective figures without a farmer threshold. The same throwaway
 * database is started several times with different values of
 * COLLECTIVE_DISCLOSURE_POLICY (one application at a time). Every identity,
 * name and value is synthetic. The F07-POL-01 suites stay as they were (they
 * run without the variable, the default policy) and are the evidence of the
 * earlier policy.
 */
const postgresUrl = process.env["E4_COLL_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const PUSH = "/api/v1/sync/v1/push";

interface Res {
  status: number;
  body: any;
}

describePostgres("E4 F07-POL-02 and its activation on PostgreSQL", () => {
  let databaseUrl: string;
  let app: INestApplication;
  let prisma: PrismaService;
  const jwt = new JwtService();
  let f: Fixture;
  let farmers: TestSession[];
  let director: TestSession;
  let sealedCampaign: string;
  let sealedBefore: Res;
  let oldDraft: string;
  let suppressedProduct: string;

  async function start(policy: string | undefined) {
    if (app) await app.close();
    if (policy === undefined) delete process.env["COLLECTIVE_DISCLOSURE_POLICY"];
    else process.env["COLLECTIVE_DISCLOSURE_POLICY"] = policy;
    ({ app, prisma } = await createSyncV1App(databaseUrl));
  }

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    process.env["COLLECTIVE_SEALING"] = "enabled";
    process.env["ESTIMATION_WORKER"] = "disabled";
    process.env["JOINT_PURCHASE_CLOSE_INTERVAL_MS"] = "disabled";
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    databaseUrl = await createIsolatedDatabase(postgresUrl!, "e4_pol02");
    await start(undefined);
    f = await seedFixture(prisma);
    farmers = [
      await createSession(prisma, jwt, f.members.farmerA),
      await createSession(prisma, jwt, f.members.farmerA2),
      await fresh(),
      await fresh(),
    ];
    director = await createSession(prisma, jwt, f.members.directorA);
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    for (const key of ["COLLECTIVE_DISCLOSURE_MODE", "COLLECTIVE_SEALING", "COLLECTIVE_DISCLOSURE_POLICY", "ESTIMATION_WORKER", "JOINT_PURCHASE_CLOSE_INTERVAL_MS"]) {
      delete process.env[key];
    }
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });

  async function fresh(): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId: f.tenantA, name: "Agricultor sintético E4", email: `e4-${userId}@example.test`,
        passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function product(name: string, unit = "L"): Promise<string> {
    return (await prisma.product.create({ data: { tenantId: f.tenantA, name: `${name} ${randomUUID().slice(0, 8)}`, unit } })).id;
  }

  async function campaign(name: string): Promise<string> {
    const id = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id, tenantId: f.tenantA, name, status: "ABIERTA", isActive: true, startDate: new Date("2026-01-01T00:00:00.000Z") },
    });
    return id;
  }

  async function push(
    session: TestSession,
    e: { campaign?: string; product: string; quantity?: string; action?: "PUBLISH" | "SUPERSEDE" | "CANCEL"; pred?: string; unit?: "ML" | "G" },
    expected = "APPLIED",
  ): Promise<string> {
    const operationId = randomUUID();
    const action = e.action ?? "PUBLISH";
    const res: Res = await http()
      .post(PUSH)
      .set("Content-Type", "application/json")
      .set(auth(session))
      .send(
        JSON.stringify({
          contractVersion: 1,
          operationId,
          projectionType: "DECLARED_NEED",
          action,
          causal: { predecessorOperationId: e.pred ?? null, reconciliationReference: null },
          payload: {
            campaign_ref: e.campaign ?? f.campaigns.openA,
            product_ref: e.product,
            base_unit: e.unit ?? "ML",
            ...(action === "CANCEL" ? {} : { quantity_base: e.quantity ?? "1000" }),
          },
        }),
      );
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe(expected);
    return operationId;
  }

  const summary = (campaignId = f.campaigns.openA): Promise<Res> => http().get(`/api/v1/collective/campaigns/${campaignId}/summary`).set(auth(director));
  const cellOf = (res: Res, productId: string) => (res.body.cells as any[]).find((cell) => cell.product_ref === productId);
  const activations = () => prisma.collectiveDisclosurePolicyActivation.findMany({ orderBy: { activatedAt: "asc" } });

  async function closeAndSeal(campaignId: string): Promise<Res> {
    const closed = await http().post(`/api/v1/campaigns/${campaignId}/close`).set(auth(director)).send({});
    expect(closed.status).toBeLessThan(300);
    const state = await http().get(`/api/v1/collective/campaigns/${campaignId}/seal`).set(auth(director));
    expect(state.body.can_seal).toBe(true);
    const sealed = await http()
      .post(`/api/v1/collective/campaigns/${campaignId}/seal`)
      .set(auth(director))
      .send({ confirmed: true, review_ref: state.body.review.review_ref });
    expect(sealed.status).toBe(200);
    return sealed;
  }

  it("test 13: without COLLECTIVE_DISCLOSURE_POLICY nothing changes (F07-POL-01, k = 3) and no activation is recorded; a sealed campaign, a draft and the seal keep F07-POL-01", async () => {
    expect(app.get(CollectiveConfig).policy).toBe("F07-POL-01");
    expect(await activations()).toEqual([]);
    // Two contributors: under the threshold of the earlier policy.
    suppressedProduct = await product("Bajo umbral");
    await push(farmers[0]!, { product: suppressedProduct, quantity: "1500" });
    await push(farmers[1]!, { product: suppressedProduct, quantity: "2500" });
    const before = await summary();
    expect(before.body.disclosure).toEqual({ mode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", approved: false, threshold: 3 });
    expect(cellOf(before, suppressedProduct)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD", total_base: null });
    // A draft generated now keeps the line without a figure, with its policy.
    const draft = await http().post(`/api/v1/collective/campaigns/${f.campaigns.openA}/proposals`).set(auth(director));
    expect(draft.status).toBe(201);
    oldDraft = draft.body.proposal_ref;
    expect(draft.body.disclosure.policy).toBe("F07-POL-01");
    expect((await prisma.jointPurchaseProposal.findUniqueOrThrow({ where: { id: oldDraft } })).disclosurePolicy).toBe("F07-POL-01");

    // A campaign sealed with F07-POL-01: one figure of 3 and one cell under the threshold.
    sealedCampaign = await campaign("Campaña sintética sellada con F07-POL-01");
    const disclosed = await product("Sellado visible");
    const hidden = await product("Sellado bajo umbral");
    for (const farmer of farmers.slice(0, 3)) await push(farmer, { campaign: sealedCampaign, product: disclosed, quantity: "1000" });
    await push(farmers[3]!, { campaign: sealedCampaign, product: hidden, quantity: "700" });
    const sealed = await closeAndSeal(sealedCampaign);
    expect(sealed.body.seal).toMatchObject({ version: 1, policy: "F07-POL-01", threshold: 3 });
    expect(await prisma.collectiveSeal.findFirstOrThrow({ where: { campaignId: sealedCampaign } })).toMatchObject({ policy: "F07-POL-01", threshold: 3 });
    sealedBefore = await summary(sealedCampaign);
    expect(sealedBefore.body.disclosure).toMatchObject({ policy: "F07-POL-01", threshold: 3 });
    expect(cellOf(sealedBefore, hidden)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD", total_base: null });
    expect(cellOf(sealedBefore, disclosed)).toMatchObject({ status: "DISCLOSED", total_base: "3000", contributors: 3 });
    // Releases decided now record their policy.
    expect(await prisma.collectiveRelease.count({ where: { policy: { not: "F07-POL-01" } } })).toBe(0);
  });

  it("test 13: an unknown value does not start; F07-POL-02 is recorded once, at the first start with that value, and the table is insert-only", async () => {
    await app.close();
    process.env["COLLECTIVE_DISCLOSURE_POLICY"] = "F07-POL-9";
    await expect(createSyncV1App(databaseUrl)).rejects.toThrow();
    // `start` closes the previous application only when there is one running.
    app = undefined as unknown as INestApplication;
    await start("F07-POL-02");
    const first = await activations();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ policy: "F07-POL-02", previousPolicy: null, source: "CONFIG" });
    expect(Math.abs(first[0]!.activatedAt.getTime() - Date.now())).toBeLessThan(120_000);
    await start("F07-POL-02");
    expect(await activations()).toHaveLength(1);
    // Calling it again (another instance) records nothing new either.
    expect((await app.get(CollectivePolicyActivation).activate()).inserted).toBe(false);
    await expect(prisma.collectiveDisclosurePolicyActivation.update({ where: { id: first[0]!.id }, data: { policy: "F07-POL-01" } })).rejects.toThrow(/inmutable/);
    await expect(prisma.collectiveDisclosurePolicyActivation.delete({ where: { id: first[0]!.id } })).rejects.toThrow(/inmutable/);
    await expect(
      prisma.collectiveDisclosurePolicyActivation.create({ data: { policy: "F07-POL-02", previousPolicy: "F07-POL-02", activatedAt: new Date(), source: "CONFIG" } }),
    ).rejects.toThrow(/CollectiveDisclosurePolicyActivation_values/);
    // The activation reopens nothing: the sealed campaign is served exactly as before.
    expect(await summary(sealedCampaign)).toMatchObject({ status: 200, body: sealedBefore.body });
  });

  it("test 11: cells of 1 and 2 contributors are DISCLOSED with F07-POL-02; explicit zero and absence; units apart", async () => {
    const one = await product("Uno");
    const two = await product("Dos");
    const zero = await product("Cero");
    const absent = await product("Ausente");
    const solid = await product("Sólido", "kg");
    await push(farmers[0]!, { product: one, quantity: "12500" });
    await push(farmers[0]!, { product: two, quantity: "1000" });
    await push(farmers[1]!, { product: two, quantity: "3000" });
    await push(farmers[2]!, { product: zero, quantity: "0" });
    await push(farmers[3]!, { product: solid, quantity: "4000", unit: "G" });
    const res = await summary();
    expect(res.body.disclosure).toEqual({ mode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-02", approved: false, threshold: null });
    expect(cellOf(res, one)).toMatchObject({ status: "DISCLOSED", total_base: "12500", total_presentation: "12.5", contributors: 1, pending_changes: false });
    expect(cellOf(res, two)).toMatchObject({ status: "DISCLOSED", total_base: "4000", contributors: 2 });
    expect(cellOf(res, zero)).toMatchObject({ status: "DISCLOSED", total_base: "0", contributors: 1 });
    expect(cellOf(res, absent)).toBeUndefined();
    expect(cellOf(res, solid)).toMatchObject({ status: "DISCLOSED", base_unit: "G", presentation_unit: "KG", total_presentation: "4" });
    // The cell under the earlier threshold (decided with F07-POL-01 before) is published now.
    expect(cellOf(res, suppressedProduct)).toMatchObject({ status: "DISCLOSED", total_base: "4000", contributors: 2 });
    expect(res.body.cells.some((cell: any) => cell.status === "SUPPRESSED_UNDER_THRESHOLD")).toBe(false);
    for (const productId of [one, two, zero, suppressedProduct]) {
      const release = await prisma.collectiveRelease.findFirstOrThrow({ where: { canonicalProductId: productId }, orderBy: { releasedAt: "desc" } });
      expect(release.policy).toBe("F07-POL-02");
    }
  });

  it("test 11: cancellation, dispute and an inactive Member withdraw the earlier figure; a new one is published with the rest", async () => {
    const p = await product("Retiradas");
    const heads: string[] = [];
    for (const farmer of farmers) heads.push(await push(farmer, { product: p, quantity: "2000" }));
    expect(cellOf(await summary(), p)).toMatchObject({ status: "DISCLOSED", total_base: "8000", contributors: 4 });
    const releases = () => prisma.collectiveRelease.findMany({ where: { canonicalProductId: p }, orderBy: { releasedAt: "asc" } });

    await push(farmers[3]!, { product: p, action: "CANCEL", pred: heads[3] });
    expect(cellOf(await summary(), p)).toMatchObject({ status: "DISCLOSED", total_base: "6000", contributors: 3 });
    let all = await releases();
    expect(all.map((r) => [r.totalBase.toString(), r.withdrawnAt !== null, r.policy])).toEqual([
      ["8000", true, "F07-POL-02"],
      ["6000", false, "F07-POL-02"],
    ]);

    // A fork leaves farmer 2's contribution CONTESTED (a dispute): excluded.
    const second = await createSession(prisma, jwt, farmers[2]!.memberId);
    await push(farmers[2]!, { product: p, quantity: "2100", action: "SUPERSEDE", pred: heads[2] });
    await push(second, { product: p, quantity: "2200", action: "SUPERSEDE", pred: heads[2] }, "CONFLICT");
    expect(cellOf(await summary(), p)).toMatchObject({ status: "DISCLOSED", total_base: "4000", contributors: 2 });

    await prisma.member.update({ where: { id: farmers[1]!.memberId }, data: { isActive: false } });
    try {
      expect(cellOf(await summary(), p)).toMatchObject({ status: "DISCLOSED", total_base: "2000", contributors: 1 });
      all = await releases();
      expect(all.filter((r) => r.withdrawnAt === null).map((r) => r.totalBase.toString())).toEqual(["2000"]);
      expect(all).toHaveLength(4);
    } finally {
      await prisma.member.update({ where: { id: farmers[1]!.memberId }, data: { isActive: true } });
    }
    // A cell left without any contribution is withdrawn (SUPPRESSED_REVISION), never shown as zero.
    const q = await product("Sin aportes");
    const only = await push(farmers[0]!, { product: q, quantity: "900" });
    expect(cellOf(await summary(), q)).toMatchObject({ status: "DISCLOSED", total_base: "900" });
    await push(farmers[0]!, { product: q, action: "CANCEL", pred: only });
    expect(cellOf(await summary(), q)).toMatchObject({ status: "SUPPRESSED_REVISION", total_base: null });
  });

  it("test 11: the sealed campaign keeps F07-POL-01 (with its SUPPRESSED_UNDER_THRESHOLD cell) in the summary and in the trends; the old draft keeps its line without a figure", async () => {
    expect((await summary(sealedCampaign)).body).toEqual(sealedBefore.body);
    const trends = await http().get("/api/v1/collective/trends").set(auth(director));
    expect(trends.body.disclosure).toMatchObject({ policy: "F07-POL-02", threshold: null });
    expect(trends.body.campaigns.find((c: any) => c.campaign_ref === sealedCampaign).seal).toMatchObject({ policy: "F07-POL-01", threshold: 3 });
    expect(trends.body.series.some((s: any) => s.points.some((pt: any) => pt.campaign_ref === sealedCampaign && pt.status === "SUPPRESSED_UNDER_THRESHOLD"))).toBe(true);
    const draft = await http().get(`/api/v1/collective/proposals/${oldDraft}`).set(auth(director));
    expect(draft.body.disclosure.policy).toBe("F07-POL-01");
    expect(draft.body.lines.find((l: any) => l.product_ref === suppressedProduct)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD", quantity_base: null });
    // A new draft carries the new policy.
    const fresh = await http().post(`/api/v1/collective/campaigns/${f.campaigns.openA}/proposals`).set(auth(director));
    expect(fresh.status).toBe(201);
    expect(fresh.body.disclosure.policy).toBe("F07-POL-02");
    expect(fresh.body.lines.find((l: any) => l.product_ref === suppressedProduct)).toMatchObject({ status: "DISCLOSED", quantity_base: "4000" });
    expect((await prisma.jointPurchaseProposal.findUniqueOrThrow({ where: { id: fresh.body.proposal_ref } })).disclosurePolicy).toBe("F07-POL-02");
  });

  it("test 11: a seal made with F07-POL-02 records its policy and a NULL threshold", async () => {
    const c = await campaign("Campaña sintética sellada con F07-POL-02");
    const p = await product("Sellado sin umbral");
    await push(farmers[0]!, { campaign: c, product: p, quantity: "500" });
    const sealed = await closeAndSeal(c);
    expect(sealed.body.seal).toMatchObject({ policy: "F07-POL-02", threshold: null });
    expect(await prisma.collectiveSeal.findFirstOrThrow({ where: { campaignId: c } })).toMatchObject({ policy: "F07-POL-02", threshold: null });
    const served = await summary(c);
    expect(served.body.disclosure).toMatchObject({ policy: "F07-POL-02", threshold: null });
    expect(cellOf(served, p)).toMatchObject({ status: "DISCLOSED", total_base: "500", contributors: 1 });
  });

  it("test 11: POLICY_PENDING gives no figures in any channel, also with F07-POL-02", async () => {
    const config = app.get(CollectiveConfig) as { mode: string };
    config.mode = "POLICY_PENDING";
    try {
      const res = await summary();
      expect(res.body).toMatchObject({ disclosure: { mode: "POLICY_PENDING", policy: "F07-POL-02", threshold: null }, coverage: null, cells: [] });
      expect((await summary(sealedCampaign)).body.cells).toEqual([]);
      const trends = await http().get("/api/v1/collective/trends").set(auth(director));
      expect(trends.body.disclosure).toMatchObject({ mode: "POLICY_PENDING", threshold: null });
      expect(trends.body.series).toEqual([]);
      const draft = await http().get(`/api/v1/collective/proposals/${oldDraft}`).set(auth(director));
      expect(draft.body.lines.every((l: any) => l.status === "POLICY_PENDING" && l.quantity_base === null)).toBe(true);
      expect((await http().post(`/api/v1/collective/campaigns/${f.campaigns.openA}/proposals`).set(auth(director))).status).toBe(409);
    } finally {
      config.mode = "PROVISIONAL_SYNTHETIC";
    }
  });

  it("test 13: going back to the default is a change too, traced at the next start", async () => {
    await start(undefined);
    const rows = await activations();
    expect(rows.map((r) => [r.policy, r.previousPolicy])).toEqual([
      ["F07-POL-02", null],
      ["F07-POL-01", "F07-POL-02"],
    ]);
    expect((await summary()).body.disclosure).toMatchObject({ policy: "F07-POL-01", threshold: 3 });
  });
});
