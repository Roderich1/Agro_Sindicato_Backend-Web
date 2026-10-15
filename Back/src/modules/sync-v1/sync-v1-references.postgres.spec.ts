import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import * as bcrypt from "bcrypt";
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
} from "./test-support/sync-v1-test-app";

/**
 * F05-SYNC-07 (#106): central references for explicit Mobile binding, plus
 * an end-to-end check of the real Auth V2 login path and the real rate limit
 * (matrix C29). Opt-in: F05_SYNC_07_PG_TEST_URL (disposable server).
 */
const postgresUrl = process.env["F05_SYNC_07_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const REFS = "/api/v1/sync/v1/references";

describePostgres("F05-SYNC-07 references and real Auth V2 path on PostgreSQL", () => {
  let databaseUrl: string;
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let farmerA: TestSession;
  let farmerB: TestSession;

  beforeAll(async () => {
    databaseUrl = await createIsolatedDatabase(postgresUrl!, "f05_sync_07");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    farmerA = await createSession(prisma, jwt, f.members.farmerA);
    farmerB = await createSession(prisma, jwt, f.members.farmerB);
  }, 180000);

  afterAll(async () => {
    await app?.close();
  });

  const refs = (session: { token: string }, query = "") =>
    request(app.getHttpServer())
      .get(`${REFS}${query}`)
      .set("Authorization", `Bearer ${session.token}`);

  it("returns only the effective tenant's campaigns and products, with exactly the whitelist", async () => {
    const response = await refs(farmerA);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(response.body).sort()).toEqual(["campaigns", "contractVersion", "products"]);
    const campaignRefs = response.body.campaigns.map((c: { campaign_ref: string }) => c.campaign_ref).sort();
    expect(campaignRefs).toEqual([f.campaigns.closedA, f.campaigns.openA].sort());
    const productRefs = response.body.products.map((p: { product_ref: string }) => p.product_ref).sort();
    expect(productRefs).toEqual(
      [f.products.liquidA, f.products.solidA, f.products.otherUnitA, f.products.inactiveA].sort(),
    );
    for (const campaign of response.body.campaigns)
      expect(Object.keys(campaign).sort()).toEqual(
        ["accepts_contributions", "campaign_ref", "end_date", "name", "start_date", "status"],
      );
    for (const product of response.body.products)
      expect(Object.keys(product).sort()).toEqual(
        ["base_unit", "is_active", "linkable", "name", "product_ref", "unit"],
      );
    const text = JSON.stringify(response.body);
    for (const forbidden of [
      "currentStock", "minimumStock", "safetyDataSheetUrl", "safetyInstructions", "qrCodeValue",
      "notes", "createdById", "closedById", "tenantId", "QR-A-1", "nota interna", "example.test/hds",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("declares which campaigns admit contributions and which products are linkable", async () => {
    const body = (await refs(farmerA)).body;
    const campaign = (id: string) => body.campaigns.find((c: { campaign_ref: string }) => c.campaign_ref === id);
    expect(campaign(f.campaigns.openA)).toEqual(expect.objectContaining({
      status: "ABIERTA", accepts_contributions: true,
      start_date: "2026-09-01T00:00:00.000Z", end_date: "2027-03-01T00:00:00.000Z",
    }));
    expect(campaign(f.campaigns.closedA)).toEqual(expect.objectContaining({
      status: "CERRADA", accepts_contributions: false, end_date: "2026-03-01T00:00:00.000Z",
    }));
    const product = (id: string) => body.products.find((p: { product_ref: string }) => p.product_ref === id);
    expect(product(f.products.liquidA)).toEqual(expect.objectContaining({ unit: "L", base_unit: "ML", linkable: true, is_active: true }));
    expect(product(f.products.solidA)).toEqual(expect.objectContaining({ unit: "kg", base_unit: "G", linkable: true }));
    // Not L/KG: no base unit, not linkable, no conversion or density.
    expect(product(f.products.otherUnitA)).toEqual(expect.objectContaining({ unit: "unidad", base_unit: null, linkable: false }));
    expect(product(f.products.inactiveA)).toEqual(expect.objectContaining({ is_active: false }));
  });

  it("isolates tenants: a tenantId in query, header or body never widens the scope", async () => {
    const b = await request(app.getHttpServer())
      .get(`${REFS}?tenantId=${f.tenantA}`)
      .set("Authorization", `Bearer ${farmerB.token}`)
      .set("X-Tenant-Id", f.tenantA)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ tenantId: f.tenantA }));
    expect(b.status).toBe(200);
    expect(b.body.campaigns.map((c: { campaign_ref: string }) => c.campaign_ref)).toEqual([f.campaigns.openB]);
    expect(b.body.products.map((p: { product_ref: string }) => p.product_ref)).toEqual([f.products.liquidB]);
  });

  it("gives identical references for two reads of an unchanged catalogue and writes nothing", async () => {
    const before = await Promise.all([
      prisma.agriculturalCampaign.findMany({ orderBy: { id: "asc" } }),
      prisma.product.findMany({ orderBy: { id: "asc" } }),
      prisma.syncV1OperationJournal.count(),
      prisma.syncV1Contribution.count(),
    ]);
    const first = (await refs(farmerA)).body;
    const second = (await refs(farmerA)).body;
    expect(second).toEqual(first);
    const after = await Promise.all([
      prisma.agriculturalCampaign.findMany({ orderBy: { id: "asc" } }),
      prisma.product.findMany({ orderBy: { id: "asc" } }),
      prisma.syncV1OperationJournal.count(),
      prisma.syncV1Contribution.count(),
    ]);
    expect(after).toEqual(before);
  });

  it("401 without a valid credential; 403 for Directiva, Administrador, inactive or revoked context", async () => {
    const missing = await request(app.getHttpServer()).get(REFS);
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ contractVersion: 1, operationId: null, errorCode: "AUTH_REQUIRED", disposition: "KEEP_FOR_RETRY" });
    const director = await createSession(prisma, jwt, f.members.directorA);
    const admin = await createSession(prisma, jwt, f.members.adminA);
    const revoked = await createSession(prisma, jwt, f.members.farmerA2);
    await prisma.clientRegistration.update({ where: { id: revoked.registrationId! }, data: { status: "REVOKED", revokedAt: new Date() } });
    for (const session of [director, admin, revoked]) {
      const response = await refs(session);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ contractVersion: 1, operationId: null, errorCode: "AUTH_CONTEXT_FORBIDDEN", disposition: "KEEP_FOR_RECONCILIATION" });
    }
  });

  it("end to end with the real login path: V1 login, client registration, V2 login, binding, refs, push and refresh", async () => {
    const password = "F05-Sintetico-Password-123!";
    const userId = randomUUID();
    const email = `e2e-${userId}@example.test`;
    await prisma.user.create({
      data: {
        id: userId, tenantId: f.tenantA, name: "Agricultor e2e sintético", email,
        passwordHash: await bcrypt.hash(password, 4), role: "AGRICULTOR",
        members: { create: { tenantId: f.tenantA, role: "AGRICULTOR" } },
      },
    });
    const server = app.getHttpServer();
    const v1 = await request(server).post("/api/v1/auth/login").send({ email, password });
    expect(v1.status).toBe(200);
    const registration = await request(server).post("/api/v1/auth/clients")
      .set("Authorization", `Bearer ${v1.body.accessToken}`).send({ clientId: randomUUID() });
    expect(registration.status).toBe(201);
    const v2 = await request(server).post("/api/v1/auth/v2/login").send({ email, password, refreshTransport: "BODY" });
    expect(v2.status).toBe(200);
    const token = v2.body.accessToken as string;
    // Before binding, the session has no ClientRegistration: Sync v1 refuses it.
    expect((await refs({ token })).status).toBe(403);
    expect((await request(server).post("/api/v1/auth/v2/session/client")
      .set("Authorization", `Bearer ${token}`).send({ registrationId: registration.body.registrationId })).status).toBe(201);
    const references = await refs({ token });
    expect(references.status).toBe(200);
    const campaign = references.body.campaigns.find((c: { accepts_contributions: boolean }) => c.accepts_contributions);
    const product = references.body.products.find((p: { base_unit: string | null }) => p.base_unit === "ML");
    const operationId = randomUUID();
    const body = JSON.stringify({
      contractVersion: 1, operationId, projectionType: "DECLARED_NEED", action: "PUBLISH",
      causal: { predecessorOperationId: null, reconciliationReference: null },
      payload: { campaign_ref: campaign.campaign_ref, product_ref: product.product_ref, base_unit: "ML", quantity_base: "2500" },
    });
    const push = await request(server).post("/api/v1/sync/v1/push")
      .set("Authorization", `Bearer ${token}`).set("Content-Type", "application/json").send(body);
    expect(push.status).toBe(200);
    expect(push.body).toEqual(expect.objectContaining({ operationId, outcome: "APPLIED", code: "OK" }));

    // C24 with the real refresh: the rotated access token keeps the same
    // session and binding, and the same intention is not applied twice.
    const refreshed = await request(server).post("/api/v1/auth/v2/refresh").send({ refreshToken: v2.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(v2.body.refreshToken);
    const replay = await request(server).post("/api/v1/sync/v1/push")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`).set("Content-Type", "application/json")
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(expect.objectContaining({ operationId, outcome: "ALREADY_APPLIED", code: "OK", serverAcceptedAt: push.body.serverAcceptedAt }));
    expect(await prisma.syncV1OperationJournal.count({ where: { operationId } })).toBe(1);
  });

  describe("C29 real rate limit", () => {
    let throttled: INestApplication;

    beforeAll(async () => {
      ({ app: throttled } = await createSyncV1App(databaseUrl, { throttle: true }));
    }, 120000);

    afterAll(async () => {
      await throttled?.close();
    });

    it("429 RATE_LIMITED with Retry-After once the limit is exceeded", async () => {
      let limited: { status: number; body: unknown; headers: Record<string, string> } | null = null;
      for (let i = 0; i < 25 && !limited; i++) {
        const response = await request(throttled.getHttpServer())
          .get(REFS).set("Authorization", `Bearer ${farmerA.token}`);
        if (response.status === 429) limited = response;
        else expect(response.status).toBe(200);
      }
      expect(limited).not.toBeNull();
      expect(limited!.body).toEqual({ contractVersion: 1, operationId: null, errorCode: "RATE_LIMITED", disposition: "KEEP_FOR_RETRY" });
      expect(Number(limited!.headers["retry-after"])).toBeGreaterThan(0);
    });
  });
});
