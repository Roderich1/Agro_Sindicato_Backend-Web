import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { getOptionsToken } from "@nestjs/throttler";
import { PrismaClient, UserRole } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { URL } from "node:url";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { configureSyncV1BodyParser } from "../api/rest/sync-v1-body";

/**
 * Disposable PostgreSQL + real Nest application for Sync v1 suites. The given
 * URL must point to a throwaway server: a new empty database is created for
 * each suite and migrated from zero; nothing is truncated or deleted.
 * Every identity, name and value is synthetic.
 */
export const JWT_SECRET = "f05-sync-test-jwt-secret-long-enough";

export async function createIsolatedDatabase(adminUrl: string, prefix: string) {
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const name = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const migration = spawnSync(
    process.execPath,
    [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
      timeout: 120000,
    },
  );
  if (migration.status !== 0)
    throw new Error(`Isolated migration deploy failed: ${migration.stderr}`);
  return url.toString();
}

export async function createSyncV1App(
  databaseUrl: string,
  options: { throttle?: boolean; fingerprintKey?: string | null } = {},
) {
  process.env["DATABASE_URL"] = databaseUrl;
  process.env["NODE_ENV"] = "test";
  process.env["JWT_SECRET"] = JWT_SECRET;
  process.env["JWT_REFRESH_SECRET"] = "f05-sync-test-refresh-secret-long-enough-123";
  if (options.fingerprintKey === null) {
    delete process.env["SYNC_V1_FINGERPRINT_KEY"];
    delete process.env["SYNC_V1_FINGERPRINT_KEY_VERSION"];
  } else {
    process.env["SYNC_V1_FINGERPRINT_KEY"] =
      options.fingerprintKey ?? randomBytes(32).toString("base64");
    process.env["SYNC_V1_FINGERPRINT_KEY_VERSION"] = "1";
  }
  const { AppModule } = await import("@/app.module");
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!options.throttle) {
    // ThrottlerGuard is an APP_GUARD (useClass), so overrideGuard does not
    // replace it; skipping through its options does. `throttle: true` keeps
    // the application's real limit (20 requests per minute).
    builder = builder
      .overrideProvider(getOptionsToken())
      .useValue({ throttlers: [{ ttl: 60000, limit: 20 }], skipIf: () => true });
  }
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  configureSyncV1BodyParser(app);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return { app, prisma: app.get(PrismaService), jwt: new JwtService() };
}

export interface Fixture {
  tenantA: string;
  tenantB: string;
  members: Record<"farmerA" | "farmerA2" | "farmerB" | "directorA" | "adminA", string>;
  campaigns: { openA: string; closedA: string; openB: string };
  products: { liquidA: string; solidA: string; otherUnitA: string; inactiveA: string; liquidB: string };
}

/** Two tenants, farmers, Directiva and Administrador, campaigns and products. */
export async function seedFixture(prisma: PrismaService): Promise<Fixture> {
  const fixture: Fixture = {
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    members: {
      farmerA: randomUUID(),
      farmerA2: randomUUID(),
      farmerB: randomUUID(),
      directorA: randomUUID(),
      adminA: randomUUID(),
    },
    campaigns: { openA: randomUUID(), closedA: randomUUID(), openB: randomUUID() },
    products: {
      liquidA: randomUUID(),
      solidA: randomUUID(),
      otherUnitA: randomUUID(),
      inactiveA: randomUUID(),
      liquidB: randomUUID(),
    },
  };
  await prisma.tenant.createMany({
    data: [
      { id: fixture.tenantA, name: "Sintético A", slug: `f05-a-${fixture.tenantA}` },
      { id: fixture.tenantB, name: "Sintético B", slug: `f05-b-${fixture.tenantB}` },
    ],
  });
  const people: [keyof Fixture["members"], string, UserRole][] = [
    ["farmerA", fixture.tenantA, "AGRICULTOR"],
    ["farmerA2", fixture.tenantA, "AGRICULTOR"],
    ["farmerB", fixture.tenantB, "AGRICULTOR"],
    ["directorA", fixture.tenantA, "DIRECTIVA"],
    ["adminA", fixture.tenantA, "ADMINISTRADOR"],
  ];
  for (const [label, tenantId, role] of people) {
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        name: `Usuario sintético ${label}`,
        email: `${label}-${userId}@example.test`,
        passwordHash: "synthetic-unused-hash",
        role,
        members: { create: { id: fixture.members[label], tenantId, role } },
      },
    });
  }
  await prisma.agriculturalCampaign.createMany({
    data: [
      { id: fixture.campaigns.openA, tenantId: fixture.tenantA, name: "Campaña abierta A", status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z"), estimatedEndDate: new Date("2027-03-01T00:00:00.000Z") },
      { id: fixture.campaigns.closedA, tenantId: fixture.tenantA, name: "Campaña cerrada A", status: "CERRADA", isActive: false, startDate: new Date("2025-09-01T00:00:00.000Z"), closedAt: new Date("2026-03-01T00:00:00.000Z"), notes: "nota interna sintética" },
      { id: fixture.campaigns.openB, tenantId: fixture.tenantB, name: "Campaña abierta B", status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
    ],
  });
  await prisma.product.createMany({
    data: [
      { id: fixture.products.liquidA, tenantId: fixture.tenantA, name: "Herbicida sintético", unit: "L", currentStock: 40, minimumStock: 5, safetyDataSheetUrl: "https://example.test/hds", qrCodeValue: "QR-A-1" },
      { id: fixture.products.solidA, tenantId: fixture.tenantA, name: "Fungicida sintético", unit: "kg" },
      { id: fixture.products.otherUnitA, tenantId: fixture.tenantA, name: "Coadyuvante por unidad", unit: "unidad" },
      { id: fixture.products.inactiveA, tenantId: fixture.tenantA, name: "Producto retirado", unit: "L", isActive: false },
      { id: fixture.products.liquidB, tenantId: fixture.tenantB, name: "Herbicida sintético B", unit: "L" },
    ],
  });
  return fixture;
}

export interface TestSession {
  token: string;
  sessionId: string;
  registrationId: string | null;
  memberId: string;
  tenantId: string;
}

/**
 * Real AuthSession (and ClientRegistration, unless `bind` is false) rows, and
 * an access token with the Auth V2 payload. `exp` overrides the expiry.
 */
export async function createSession(
  prisma: PrismaService,
  jwt: JwtService,
  memberId: string,
  options: { bind?: boolean; exp?: number; registrationId?: string } = {},
): Promise<TestSession> {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    include: { user: true },
  });
  let registrationId = options.registrationId ?? null;
  if (!registrationId && options.bind !== false) {
    registrationId = (
      await prisma.clientRegistration.create({
        data: {
          tenantId: member.tenantId,
          memberId,
          clientIdHash: randomBytes(32).toString("hex"),
        },
      })
    ).id;
  }
  const session = await prisma.authSession.create({
    data: {
      memberId,
      clientRegistrationId: registrationId,
      refreshTransport: "BODY",
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  return {
    token: signFor(jwt, member, session.id, options.exp),
    sessionId: session.id,
    registrationId,
    memberId,
    tenantId: member.tenantId,
  };
}

export function signFor(
  jwt: JwtService,
  member: { id: string; tenantId: string; role: UserRole; userId: string; user: { email: string } },
  sessionId: string,
  exp?: number,
): string {
  const payload = {
    sub: member.userId,
    email: member.user.email,
    tenantId: member.tenantId,
    role: member.role,
    memberId: member.id,
    sessionId,
    ver: 2,
    ...(exp !== undefined ? { exp } : {}),
  };
  return exp !== undefined
    ? jwt.sign(payload, { secret: JWT_SECRET })
    : jwt.sign(payload, { secret: JWT_SECRET, expiresIn: "15m" });
}
