import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { afterAll, beforeAll } from "@jest/globals";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import * as bcrypt from "bcrypt";
import cookieParser = require("cookie-parser");
import { randomUUID } from "node:crypto";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");

const postgresUrl = process.env["F02_FINAL_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

describePostgres("F02-IAM-05 final HTTP/PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const id = {
    tenantA: randomUUID(), tenantB: randomUUID(),
    director: randomUUID(), farmer: randomUUID(), outsider: randomUUID(),
    directorMember: randomUUID(), farmerMember: randomUUID(), outsiderMember: randomUUID(),
    ownPlot: randomUUID(), otherPlot: randomUUID(), foreignPlot: randomUUID(),
  };
  const password = "F02-Final-Password-123!";
  const email = `director-${id.director}@example.test`;

  function bearer(token: string) { return { Authorization: `Bearer ${token}` }; }

  beforeAll(async () => {
    process.env["DATABASE_URL"] = postgresUrl;
    process.env["NODE_ENV"] = "test";
    process.env["JWT_SECRET"] = "f02-final-jwt-secret-long-enough-123";
    process.env["JWT_REFRESH_SECRET"] = "f02-final-refresh-secret-long-enough-123";
    const { AppModule } = await import("@/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.tenant.createMany({ data: [
      { id: id.tenantA, slug: `final-a-${id.tenantA}`, name: "Final A" },
      { id: id.tenantB, slug: `final-b-${id.tenantB}`, name: "Final B" },
    ] });
    await prisma.user.createMany({ data: [
      { id: id.director, tenantId: id.tenantA, name: "Director", email, passwordHash, role: "DIRECTIVA" },
      { id: id.farmer, tenantId: id.tenantA, name: "Farmer", email: `farmer-${id.farmer}@example.test`, passwordHash, role: "AGRICULTOR" },
      { id: id.outsider, tenantId: id.tenantB, name: "Outsider", email: `outside-${id.outsider}@example.test`, passwordHash, role: "AGRICULTOR" },
    ] });
    await prisma.member.createMany({ data: [
      { id: id.directorMember, tenantId: id.tenantA, userId: id.director, role: "DIRECTIVA" },
      { id: id.farmerMember, tenantId: id.tenantA, userId: id.farmer, role: "AGRICULTOR" },
      { id: id.outsiderMember, tenantId: id.tenantB, userId: id.outsider, role: "AGRICULTOR" },
    ] });
    await prisma.plot.createMany({ data: [
      { id: id.ownPlot, tenantId: id.tenantA, ownerUserId: id.director, name: "Own" },
      { id: id.otherPlot, tenantId: id.tenantA, ownerUserId: id.farmer, name: "Other" },
      { id: id.foreignPlot, tenantId: id.tenantB, ownerUserId: id.outsider, name: "Foreign" },
    ] });
  });

  afterAll(async () => { if (app) await app.close(); });

  it("composes V1, Member, ClientRegistration, V2 Session, revocation and isolated second Session", async () => {
    const v1 = await request(app.getHttpServer()).post("/api/v1/auth/login")
      .send({ email, password });
    expect(v1.status).toBe(200);
    expect(v1.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringContaining("refresh_token=")]));
    const v1Access = v1.body.accessToken;
    expect((await request(app.getHttpServer()).get("/api/v1/auth/me").set(bearer(v1Access))).status).toBe(200);
    const v1Cookie = v1.headers["set-cookie"];
    expect((await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", v1Cookie)).status).toBe(200);

    const clientId = randomUUID();
    const registration = await request(app.getHttpServer()).post("/api/v1/auth/clients")
      .set(bearer(v1Access)).send({ clientId });
    expect(registration.status).toBe(201);
    const registrationId = registration.body.registrationId;
    expect(registrationId).toBeTruthy();

    const login = () => request(app.getHttpServer()).post("/api/v1/auth/v2/login")
      .send({ email, password, refreshTransport: "BODY" });
    const sessionA = await login();
    const sessionB = await login();
    expect(sessionA.status).toBe(200);
    expect(sessionB.status).toBe(200);
    expect(sessionA.body.contractVersion).toBe(2);
    const tokenA = sessionA.body.accessToken;
    const tokenB = sessionB.body.accessToken;
    expect((await request(app.getHttpServer()).post("/api/v1/auth/v2/session/client")
      .set(bearer(tokenA)).send({ registrationId })).status).toBe(201);
    expect((await request(app.getHttpServer()).get("/api/v1/auth/v2/me").set(bearer(tokenA))).status).toBe(200);

    await prisma.member.update({ where: { id: id.directorMember }, data: { role: "AGRICULTOR" } });
    try {
      const stale = await request(app.getHttpServer()).post("/api/v1/campaigns")
        .set(bearer(tokenA)).send({ name: "stale", startDate: "2026-01-01" });
      expect(stale.status).toBe(403);
    } finally {
      await prisma.member.update({ where: { id: id.directorMember }, data: { role: "DIRECTIVA" } });
    }

    expect((await request(app.getHttpServer()).post(`/api/v1/auth/clients/${registrationId}/revoke`)
      .set(bearer(tokenB))).status).toBe(201);
    expect((await request(app.getHttpServer()).get("/api/v1/auth/v2/me").set(bearer(tokenA))).status).toBe(401);
    expect((await request(app.getHttpServer()).get("/api/v1/auth/v2/me").set(bearer(tokenB))).status).toBe(200);
    expect((await request(app.getHttpServer()).post("/api/v1/auth/logout")
      .set(bearer(v1Access)).set("Cookie", v1Cookie)).status).toBe(204);
  });

  it("enforces cross-user, cross-tenant and authority-field isolation with a real JWT", async () => {
    const session = await request(app.getHttpServer()).post("/api/v1/auth/v2/login")
      .send({ email: `farmer-${id.farmer}@example.test`, password, refreshTransport: "BODY" });
    expect(session.status).toBe(200);
    const token = session.body.accessToken;
    expect((await request(app.getHttpServer()).patch(`/api/v1/plots/${id.ownPlot}`)
      .set(bearer(token)).send({ name: "cross-user" })).status).toBe(404);
    expect((await request(app.getHttpServer()).patch(`/api/v1/plots/${id.foreignPlot}`)
      .set(bearer(token)).send({ name: "cross-tenant" })).status).toBe(404);
    for (const field of ["tenantId", "ownerUserId", "actorUserId", "role"]) {
      const response = await request(app.getHttpServer()).post("/api/v1/plots")
        .set(bearer(token)).send({ name: `forged-${field}`, [field]: id.tenantB });
      expect(response.status).toBe(400);
    }
  });
});
