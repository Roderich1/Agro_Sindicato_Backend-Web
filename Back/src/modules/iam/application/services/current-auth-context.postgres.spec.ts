import { ValidationPipe } from "@nestjs/common";
import { beforeAll, afterAll } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ThrottlerGuard } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomUUID, createHash } from "node:crypto";
import cookieParser = require("cookie-parser");
// @ts-expect-error supertest is a runtime-only test dependency in the baseline.
import request = require("supertest");
import { INestApplication } from "@nestjs/common";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CurrentAuthContextResolver } from "./current-auth-context.resolver";
import { AuthV2Service } from "./auth-v2.service";
import { RefreshTransportDto } from "../dtos/auth-v2.dto";
import { LoginUseCase } from "../use-cases/login.use-case";
import { RefreshSessionUseCase } from "../use-cases/refresh-session.use-case";
import { GetMeUseCase } from "../use-cases/get-me.use-case";

const postgresUrl = process.env["F02_D_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

describePostgres("F02-IAM-04 current authorization context — PostgreSQL 16 + HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let resolver: CurrentAuthContextResolver;
  const ids = {
    tenantA: randomUUID(), tenantB: randomUUID(),
    a1: randomUUID(), a2: randomUUID(), director: randomUUID(), admin: randomUUID(), b1: randomUUID(),
    ma1: randomUUID(), ma2: randomUUID(), md: randomUUID(), madmin: randomUUID(), mb1: randomUUID(),
    campaignA: randomUUID(), campaignB: randomUUID(), cropA: randomUUID(), cropB: randomUUID(),
    productA: randomUUID(), productB: randomUUID(), plotA1: randomUUID(), plotA2: randomUUID(), plotB1: randomUUID(),
  };
  const password = "F02-Strong-Password-123!";
  const secret = "f02-d-test-jwt-secret-long-enough";

  async function v2(email: string) {
    const result = await app.get(AuthV2Service).login({ email, password, refreshTransport: RefreshTransportDto.BODY });
    return result.accessToken;
  }

  function v1(userId: string, tenantId: string, role: UserRole) {
    return jwt.sign({ sub: userId, email: "stale@example.test", tenantId, role });
  }

  function bearer(token: string) { return { Authorization: `Bearer ${token}` }; }

  beforeAll(async () => {
    process.env["DATABASE_URL"] = postgresUrl;
    process.env["NODE_ENV"] = "test";
    process.env["JWT_SECRET"] = secret;
    process.env["JWT_REFRESH_SECRET"] = "f02-d-test-refresh-secret-long-enough-123";
    const { AppModule } = await import("@/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    resolver = app.get(CurrentAuthContextResolver);
    const hash = await bcrypt.hash(password, 4);
    await prisma.tenant.createMany({ data: [
      { id: ids.tenantA, slug: `f02d-a-${ids.tenantA}`, name: "F02D A" },
      { id: ids.tenantB, slug: `f02d-b-${ids.tenantB}`, name: "F02D B" },
    ] });
    await prisma.user.createMany({ data: [
      { id: ids.a1, tenantId: ids.tenantA, name: "A1", email: `a1-${ids.a1}@example.test`, passwordHash: hash, role: "AGRICULTOR" },
      { id: ids.a2, tenantId: ids.tenantA, name: "A2", email: `a2-${ids.a2}@example.test`, passwordHash: hash, role: "AGRICULTOR" },
      { id: ids.director, tenantId: ids.tenantA, name: "Director", email: `d-${ids.director}@example.test`, passwordHash: hash, role: "DIRECTIVA" },
      { id: ids.admin, tenantId: ids.tenantA, name: "Admin", email: `m-${ids.admin}@example.test`, passwordHash: hash, role: "ADMINISTRADOR" },
      { id: ids.b1, tenantId: ids.tenantB, name: "B1", email: `b1-${ids.b1}@example.test`, passwordHash: hash, role: "AGRICULTOR" },
    ] });
    await prisma.member.createMany({ data: [
      { id: ids.ma1, tenantId: ids.tenantA, userId: ids.a1, role: "AGRICULTOR" },
      { id: ids.ma2, tenantId: ids.tenantA, userId: ids.a2, role: "AGRICULTOR" },
      { id: ids.md, tenantId: ids.tenantA, userId: ids.director, role: "DIRECTIVA" },
      { id: ids.madmin, tenantId: ids.tenantA, userId: ids.admin, role: "ADMINISTRADOR" },
      { id: ids.mb1, tenantId: ids.tenantB, userId: ids.b1, role: "AGRICULTOR" },
    ] });
    await prisma.agriculturalCampaign.createMany({ data: [
      { id: ids.campaignA, tenantId: ids.tenantA, name: "A campaign", startDate: new Date("2026-01-01"), status: "ABIERTA", isActive: true },
      { id: ids.campaignB, tenantId: ids.tenantB, name: "B campaign", startDate: new Date("2026-01-01"), status: "ABIERTA", isActive: true },
    ] });
    await prisma.crop.createMany({ data: [
      { id: ids.cropA, tenantId: ids.tenantA, name: "Crop A" },
      { id: ids.cropB, tenantId: ids.tenantB, name: "Crop B" },
    ] });
    await prisma.product.createMany({ data: [
      { id: ids.productA, tenantId: ids.tenantA, name: "Product A", unit: "L" },
      { id: ids.productB, tenantId: ids.tenantB, name: "Product B", unit: "L" },
    ] });
    await prisma.supplier.createMany({ data: [
      { id: randomUUID(), tenantId: ids.tenantA, name: "Supplier A" },
      { id: randomUUID(), tenantId: ids.tenantB, name: "Supplier B" },
    ] });
    await prisma.plot.createMany({ data: [
      { id: ids.plotA1, tenantId: ids.tenantA, ownerUserId: ids.a1, name: "A1 plot" },
      { id: ids.plotA2, tenantId: ids.tenantA, ownerUserId: ids.a2, name: "A2 plot" },
      { id: ids.plotB1, tenantId: ids.tenantB, ownerUserId: ids.b1, name: "B1 plot" },
    ] });
  });

  afterAll(async () => { if (app) await app.close(); });

  it("resolves V1 with current Member role and rejects a real tenant mismatch", async () => {
    const token = v1(ids.director, ids.tenantA, "AGRICULTOR");
    expect((await resolver.resolve(jwt.verify(token))).role).toBe("DIRECTIVA");
    await prisma.user.update({ where: { id: ids.director }, data: { tenantId: ids.tenantB } });
    try { expect((await request(app.getHttpServer()).get("/api/v1/campaigns").set(bearer(token))).status).toBe(401); }
    finally { await prisma.user.update({ where: { id: ids.director }, data: { tenantId: ids.tenantA } }); }
  });

  it("blocks stale V2 DIRECTIVA after downgrade and allows current promotion", async () => {
    const token = await v2(`d-${ids.director}@example.test`);
    await prisma.member.update({ where: { id: ids.md }, data: { role: "AGRICULTOR" } });
    try {
      expect((await request(app.getHttpServer()).post("/api/v1/campaigns").set(bearer(token)).send({ name: "blocked", startDate: "2026-01-01" })).status).toBe(403);
    } finally { await prisma.member.update({ where: { id: ids.md }, data: { role: "DIRECTIVA" } }); }
    const farmerToken = await v2(`a1-${ids.a1}@example.test`);
    await prisma.member.update({ where: { id: ids.ma1 }, data: { role: "DIRECTIVA" } });
    try {
      expect((await request(app.getHttpServer()).post("/api/v1/campaigns").set(bearer(farmerToken)).send({ name: `promoted-${randomUUID()}`, startDate: "2026-01-01" })).status).toBe(201);
    } finally { await prisma.member.update({ where: { id: ids.ma1 }, data: { role: "AGRICULTOR" } }); }
  });

  it("uses Member.role for a V1 token issued before a role change", async () => {
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: `d-${ids.director}@example.test`, password });
    expect(login.status).toBe(200);
    await prisma.member.update({ where: { id: ids.md }, data: { role: "AGRICULTOR" } });
    try { expect((await request(app.getHttpServer()).post("/api/v1/campaigns").set(bearer(login.body.accessToken)).send({ name: "blocked-v1", startDate: "2026-01-01" })).status).toBe(403); }
    finally { await prisma.member.update({ where: { id: ids.md }, data: { role: "DIRECTIVA" } }); }
  });

  it("returns current Member.role in V1 login, refresh and me without changing V1 shape", async () => {
    const login = await app.get(LoginUseCase).execute({ email: `a1-${ids.a1}@example.test`, password });
    expect(login.user.role).toBe("AGRICULTOR");
    expect(jwt.verify<{ ver?: number }>(login.accessToken).ver).toBeUndefined();
    await prisma.member.update({ where: { id: ids.ma1 }, data: { role: "DIRECTIVA" } });
    try {
      const refreshed = await app.get(RefreshSessionUseCase).execute(login.rawRefreshToken);
      expect(refreshed.user.role).toBe("DIRECTIVA");
      expect(jwt.verify<{ role: string; ver?: number }>(refreshed.accessToken)).toMatchObject({ role: "DIRECTIVA" });
      expect(jwt.verify<{ ver?: number }>(refreshed.accessToken).ver).toBeUndefined();
      expect((await app.get(GetMeUseCase).execute(ids.a1)).role).toBe("DIRECTIVA");
      expect((await request(app.getHttpServer()).get("/api/v1/auth/me").set(bearer(login.accessToken))).body.role).toBe("DIRECTIVA");
    } finally { await prisma.member.update({ where: { id: ids.ma1 }, data: { role: "AGRICULTOR" } }); }
  });

  it.each(["user", "member", "tenant"] as const)("rejects inactive %s on next protected request", async (kind) => {
    const token = await v2(`a1-${ids.a1}@example.test`);
    const target = kind === "user" ? prisma.user : kind === "member" ? prisma.member : prisma.tenant;
    const id = kind === "user" ? ids.a1 : kind === "member" ? ids.ma1 : ids.tenantA;
    await (target as typeof prisma.user).update({ where: { id }, data: { isActive: false } });
    try { expect((await request(app.getHttpServer()).get("/api/v1/campaigns").set(bearer(token))).status).toBe(401); }
    finally { await (target as typeof prisma.user).update({ where: { id }, data: { isActive: true } }); }
  });

  it.each(["REVOKED", "COMPROMISED"] as const)("rejects %s V2 Session globally", async (status) => {
    const token = await v2(`a1-${ids.a1}@example.test`);
    const claims = jwt.verify<{ sessionId: string }>(token);
    await prisma.authSession.update({ where: { id: claims.sessionId }, data: { status } });
    expect((await request(app.getHttpServer()).get("/api/v1/inventory/products").set(bearer(token))).status).toBe(401);
  });

  it("rejects a revoked bound ClientRegistration on any protected endpoint", async () => {
    const token = await v2(`a1-${ids.a1}@example.test`);
    const registrationId = randomUUID();
    await prisma.clientRegistration.create({ data: { id: registrationId, tenantId: ids.tenantA, memberId: ids.ma1, clientIdHash: createHash("sha256").update(registrationId).digest("hex") } });
    expect((await request(app.getHttpServer()).post("/api/v1/auth/v2/session/client").set(bearer(token)).send({ registrationId })).status).toBe(201);
    await prisma.clientRegistration.update({ where: { id: registrationId }, data: { status: "REVOKED", revokedAt: new Date() } });
    expect((await request(app.getHttpServer()).get("/api/v1/campaigns").set(bearer(token))).status).toBe(401);
  });

  it("hides foreign tenant IDs and another farmer's private Plot", async () => {
    const director = await v2(`d-${ids.director}@example.test`);
    const farmer = await v2(`a1-${ids.a1}@example.test`);
    expect((await request(app.getHttpServer()).patch(`/api/v1/campaigns/${ids.campaignB}`).set(bearer(director)).send({ name: "foreign" })).status).toBe(404);
    expect((await request(app.getHttpServer()).patch(`/api/v1/crops/${ids.cropB}`).set(bearer(director)).send({ name: "foreign" })).status).toBe(404);
    expect((await request(app.getHttpServer()).patch(`/api/v1/inventory/products/${ids.productB}`).set(bearer(director)).send({ name: "foreign" })).status).toBe(404);
    const own = await request(app.getHttpServer()).get(`/api/v1/plots?ownerUserId=${ids.a2}`).set(bearer(farmer));
    expect(own.status).toBe(200);
    expect(own.body.map((plot: { id: string }) => plot.id)).toContain(ids.plotA1);
    expect(own.body.map((plot: { id: string }) => plot.id)).not.toContain(ids.plotA2);
    expect((await request(app.getHttpServer()).patch(`/api/v1/plots/${ids.plotA2}`).set(bearer(farmer)).send({ name: "hijack" })).status).toBe(404);
    expect((await request(app.getHttpServer()).patch(`/api/v1/plots/${ids.plotB1}`).set(bearer(farmer)).send({ name: "hijack" })).status).toBe(404);
  });

  it("rejects forged authority fields and non-manager catalog mutations", async () => {
    const director = await v2(`d-${ids.director}@example.test`);
    const farmer = await v2(`a1-${ids.a1}@example.test`);
    for (const field of ["tenantId", "actorUserId", "ownerUserId", "role"]) {
      expect((await request(app.getHttpServer()).post("/api/v1/campaigns").set(bearer(director)).send({ name: "forged", startDate: "2026-01-01", [field]: randomUUID() })).status).toBe(400);
    }
    expect((await request(app.getHttpServer()).post("/api/v1/inventory/products").set(bearer(farmer)).send({ name: "forged", unit: "L" })).status).toBe(403);
    expect((await request(app.getHttpServer()).post("/api/v1/suppliers").set(bearer(farmer)).send({ name: "forged" })).status).toBe(403);
    expect((await request(app.getHttpServer()).post("/api/v1/sync/operations").set(bearer(director)).send({})).status).toBe(403);
  });

  it("rejects foreign related Plot, Crop, Campaign and Product IDs", async () => {
    const farmer = await v2(`a1-${ids.a1}@example.test`);
    const base = { campaignId: ids.campaignA, plotId: ids.plotA1, cropId: ids.cropA };
    for (const input of [
      { ...base, plotId: ids.plotA2 },
      { ...base, plotId: ids.plotB1 },
      { ...base, cropId: ids.cropB },
      { ...base, campaignId: ids.campaignB },
    ]) {
      expect((await request(app.getHttpServer()).post("/api/v1/plot-crop-assignments").set(bearer(farmer)).send(input)).status).toBe(404);
    }
    expect((await request(app.getHttpServer()).post("/api/v1/plot-crop-assignments").set(bearer(farmer)).send(base)).status).toBe(201);
    expect((await request(app.getHttpServer()).post("/api/v1/applications").set(bearer(farmer)).send({ campaignId: ids.campaignA, plotId: ids.plotA1, productId: ids.productB, quantity: 1 })).status).toBe(404);
    expect((await request(app.getHttpServer()).post("/api/v1/applications").set(bearer(farmer)).send({ campaignId: ids.campaignA, plotId: ids.plotA2, productId: ids.productA, quantity: 1 })).status).toBe(404);
  });

  it("hides another user's lot and Sync operations with real rows", async () => {
    const farmer = await v2(`a1-${ids.a1}@example.test`);
    const director = await v2(`d-${ids.director}@example.test`);
    const foreignLot = await prisma.inventoryLot.create({ data: {
      tenantId: ids.tenantA, ownerUserId: ids.a2, campaignId: ids.campaignA,
      productId: ids.productA, initialQuantity: 5, currentQuantity: 5,
    } });
    expect((await request(app.getHttpServer()).post("/api/v1/applications").set(bearer(farmer)).send({ campaignId: ids.campaignA, plotId: ids.plotA1, productId: ids.productA, inventoryLotId: foreignLot.id, quantity: 1 })).status).toBe(404);
    await prisma.syncOperation.createMany({ data: [
      { tenantId: ids.tenantA, userId: ids.a1, clientId: `a1-${randomUUID()}`, entityName: "test", operation: "TEST", payload: {} },
      { tenantId: ids.tenantA, userId: ids.a2, clientId: `a2-${randomUUID()}`, entityName: "test", operation: "TEST", payload: {} },
      { tenantId: ids.tenantB, userId: ids.b1, clientId: `b1-${randomUUID()}`, entityName: "test", operation: "TEST", payload: {} },
    ] });
    const own = await request(app.getHttpServer()).get("/api/v1/sync/operations").set(bearer(farmer));
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0].clientId).toMatch(/^a1-/);
    const directorSync = await request(app.getHttpServer()).get("/api/v1/sync/operations").set(bearer(director));
    expect(directorSync.status).toBe(403);
  });

  it("rejects foreign-user allocations and foreign supplier/product/warehouse references", async () => {
    const director = await v2(`d-${ids.director}@example.test`);
    const supplierA = await prisma.supplier.findFirstOrThrow({ where: { tenantId: ids.tenantA } });
    const supplierB = await prisma.supplier.findFirstOrThrow({ where: { tenantId: ids.tenantB } });
    const warehouseB = await prisma.warehouse.create({ data: { tenantId: ids.tenantB, name: "Warehouse B" } });
    const base = {
      campaignId: ids.campaignA,
      paymentMode: "CONTADO",
      supplier: { supplierId: supplierA.id },
      items: [{ product: { productId: ids.productA }, quantity: 1, unitCost: 1, allocations: [{ userId: ids.a1, quantity: 1 }] }],
    };
    const endpoint = "/api/v1/purchases/joint";
    expect((await request(app.getHttpServer()).post(endpoint).set(bearer(director)).send({ ...base, items: [{ ...base.items[0], allocations: [{ userId: ids.b1, quantity: 1 }] }] })).status).toBe(400);
    expect((await request(app.getHttpServer()).post(endpoint).set(bearer(director)).send({ ...base, supplier: { supplierId: supplierB.id } })).status).toBe(404);
    expect((await request(app.getHttpServer()).post(endpoint).set(bearer(director)).send({ ...base, items: [{ ...base.items[0], product: { productId: ids.productB } }] })).status).toBe(404);
    expect((await request(app.getHttpServer()).post(endpoint).set(bearer(director)).send({ ...base, warehouseId: warehouseB.id })).status).toBe(404);
  });

  it("enforces private application, purchase, payable, report and audit ownership", async () => {
    const farmer = await v2(`a1-${ids.a1}@example.test`);
    const supplier = await prisma.supplier.findFirstOrThrow({ where: { tenantId: ids.tenantA } });
    const purchaseA1 = await prisma.purchase.create({ data: { tenantId: ids.tenantA, supplierId: supplier.id, createdById: ids.a1 } });
    const purchaseA2 = await prisma.purchase.create({ data: { tenantId: ids.tenantA, supplierId: supplier.id, createdById: ids.a2 } });
    const appA2 = await prisma.agrochemicalApplication.create({ data: {
      tenantId: ids.tenantA, campaignId: ids.campaignA, ownerUserId: ids.a2,
      plotId: ids.plotA2, cropId: ids.cropA, productId: ids.productA, quantity: 1,
    } });
    const payableA1 = await prisma.payableAccount.create({ data: {
      tenantId: ids.tenantA, purchaseId: purchaseA1.id, responsibleUserId: ids.a1,
      dueDate: new Date("2026-12-01"), totalAmount: 1,
    } });
    const payableA2 = await prisma.payableAccount.create({ data: {
      tenantId: ids.tenantA, purchaseId: purchaseA2.id, responsibleUserId: ids.a2,
      dueDate: new Date("2026-12-01"), totalAmount: 1,
    } });
    await prisma.inventoryLot.createMany({ data: [
      { tenantId: ids.tenantA, ownerUserId: ids.a1, productId: ids.productA, initialQuantity: 1, currentQuantity: 1 },
      { tenantId: ids.tenantA, ownerUserId: ids.a2, productId: ids.productA, initialQuantity: 1, currentQuantity: 1 },
    ] });
    const auditA1 = await prisma.auditLog.create({ data: { tenantId: ids.tenantA, actorUserId: ids.a1, ownerUserId: ids.a1, action: "CREAR", entityName: "Test" } });
    const auditA2 = await prisma.auditLog.create({ data: { tenantId: ids.tenantA, actorUserId: ids.a2, ownerUserId: ids.a2, action: "CREAR", entityName: "Test" } });

    expect((await request(app.getHttpServer()).get(`/api/v1/purchases/${purchaseA2.id}`).set(bearer(farmer))).status).toBe(404);
    expect((await request(app.getHttpServer()).get(`/api/v1/applications/${appA2.id}`).set(bearer(farmer))).status).toBe(404);
    const apps = await request(app.getHttpServer()).get(`/api/v1/applications?ownerUserId=${ids.a2}`).set(bearer(farmer));
    expect(apps.status).toBe(200);
    expect(JSON.stringify(apps.body)).not.toContain(appA2.id);
    const payables = await request(app.getHttpServer()).get(`/api/v1/accounts-payable?ownerUserId=${ids.a2}`).set(bearer(farmer));
    expect(payables.status).toBe(200);
    expect(JSON.stringify(payables.body)).toContain(payableA1.id);
    expect(JSON.stringify(payables.body)).not.toContain(payableA2.id);
    const report = await request(app.getHttpServer()).get(`/api/v1/reports/inventory/current?ownerUserId=${ids.a2}`).set(bearer(farmer));
    expect(report.status).toBe(200);
    expect(report.body.rows.every((row: { owner: { id: string } }) => row.owner.id === ids.a1)).toBe(true);
    const audit = await request(app.getHttpServer()).get(`/api/v1/audit-logs?ownerUserId=${ids.a2}&actorUserId=${ids.a2}`).set(bearer(farmer));
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).toContain(auditA1.id);
    expect(JSON.stringify(audit.body)).not.toContain(auditA2.id);
  });

  it("keeps foreign users and CalendarEvent IDs invisible", async () => {
    const admin = await v2(`m-${ids.admin}@example.test`);
    const farmer = await v2(`a1-${ids.a1}@example.test`);
    expect((await request(app.getHttpServer()).get(`/api/v1/users/${ids.b1}`).set(bearer(admin))).status).toBe(404);
    const event = await prisma.calendarEvent.create({ data: {
      tenantId: ids.tenantA, ownerUserId: ids.a2, type: "PAGO_PROXIMO",
      title: "Legacy event", eventDate: new Date("2026-12-01"),
    } });
    expect((await request(app.getHttpServer()).post(`/api/v1/calendar/events/${event.id}/complete`).set(bearer(farmer))).status).toBe(404);
  });
});
