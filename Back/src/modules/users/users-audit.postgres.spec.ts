import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomBytes, randomUUID } from "node:crypto";
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
 * D-01 (RF-02, RF-25): account administration and the institutional catalogue
 * leave Bitácora entries with actor, tenant, code, entity and result, in the
 * transaction of the change; never a password, its hash or an e-mail; and one
 * sindicato never sees another's entries.
 */
const postgresUrl = process.env["USERS_AUDIT_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

interface Res {
  status: number;
  body: any;
  text: string;
}

describePostgres("D-01 administrative actions in the Bitácora on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let director: TestSession;
  let admin: TestSession;
  let directorB: TestSession;
  let adminUserId: string;
  let directorUserId: string;

  beforeAll(async () => {
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "d01_audit");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    const userB = await prisma.user.create({
      data: {
        tenantId: f.tenantB,
        name: "Directiva sintética B",
        email: `director-b-${randomUUID()}@example.test`,
        passwordHash: unusablePasswordHash(),
        role: "DIRECTIVA",
        members: { create: { tenantId: f.tenantB, role: "DIRECTIVA" } },
      },
      include: { members: true },
    });
    directorB = await createSession(prisma, jwt, userB.members[0]!.id);
    const members = await prisma.member.findMany({ where: { id: { in: [f.members.adminA, f.members.directorA] } } });
    adminUserId = members.find((row) => row.id === f.members.adminA)!.userId;
    directorUserId = members.find((row) => row.id === f.members.directorA)!.userId;
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const call = (method: "get" | "post" | "patch", path: string, session: TestSession, body?: object): Promise<Res> => {
    const req = http()[method](`/api/v1${path}`).set("Authorization", `Bearer ${session.token}`);
    return body ? req.send(body) : req;
  };

  it("creating, changing the role, deactivating, reactivating and resetting the password of an account", async () => {
    // Random per run: no credential-like value lives in the source.
    const firstPassword = `Sintetica-${randomBytes(9).toString("hex")}`;
    const secondPassword = `Sintetica-${randomBytes(9).toString("hex")}`;
    const email = `cuenta-${randomUUID()}@example.test`;
    const created = await call("post", "/users", admin, { name: "Cuenta sintética D01", email, password: firstPassword, role: "AGRICULTOR" });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await call("patch", `/users/${id}`, admin, { role: "DIRECTIVA" })).status).toBe(200);
    expect((await call("patch", `/users/${id}/deactivate`, admin)).status).toBe(200);
    expect((await call("patch", `/users/${id}`, admin, { isActive: true })).status).toBe(200);
    expect((await call("patch", `/users/${id}/password`, admin, { password: secondPassword })).status).toBe(204);
    // Saving the same role again changes nothing and leaves no entry.
    expect((await call("patch", `/users/${id}`, admin, { role: "DIRECTIVA" })).status).toBe(200);

    const entries = await prisma.auditLog.findMany({ where: { entityName: "User", entityId: id }, orderBy: { createdAt: "asc" } });
    expect(entries.map((row) => [row.action, (row.metadata as any).event, row.actorUserId, row.tenantId, row.ownerUserId])).toEqual([
      ["CREAR", "USER_CREATED", adminUserId, f.tenantA, null],
      ["ACTUALIZAR", "USER_ROLE_CHANGED", adminUserId, f.tenantA, null],
      ["INACTIVAR", "USER_DEACTIVATED", adminUserId, f.tenantA, null],
      ["ACTUALIZAR", "USER_REACTIVATED", adminUserId, f.tenantA, null],
      ["OTRO", "USER_PASSWORD_RESET", adminUserId, f.tenantA, null],
    ]);
    expect(entries[1]).toMatchObject({ before: { role: "AGRICULTOR" }, after: { role: "DIRECTIVA" } });
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id }, select: { passwordHash: true } });
    const written = JSON.stringify(entries);
    for (const secret of [firstPassword, secondPassword, passwordHash, email]) {
      expect(written).not.toContain(secret);
    }

    // The Directiva of the sindicato reads them; another sindicato's does not.
    const own = await call("get", `/audit-logs?entityName=User`, director);
    expect(own.status).toBe(200);
    expect(own.body.filter((row: any) => row.entityId === id)).toHaveLength(5);
    // RNF-05, F10-SEC-02: the actor is named, never by e-mail, for the
    // Directiva nor for the Administración.
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId }, select: { name: true, email: true, role: true } });
    const asAdmin = await call("get", `/audit-logs?entityName=User`, admin);
    expect(asAdmin.status).toBe(200);
    for (const res of [own, asAdmin]) {
      const rows = res.body.filter((row: any) => row.entityId === id);
      expect(rows.map((row: any) => row.actor)).toEqual(Array(5).fill({ id: adminUserId, name: adminUser.name, role: adminUser.role }));
      expect(res.text).not.toContain(adminUser.email);
      expect(res.text).not.toContain(email);
      expect(res.body.every((row: any) => !("email" in (row.actor ?? {})) && !("email" in (row.owner ?? {})))).toBe(true);
    }
    const other = await call("get", "/audit-logs", directorB);
    expect(other.status).toBe(200);
    expect(other.text).not.toContain(id);
    expect(other.body.some((row: any) => row.entityName === "User")).toBe(false);
  });

  it("a refused change leaves no entry", async () => {
    const before = await prisma.auditLog.count({ where: { entityName: "User" } });
    expect((await call("patch", `/users/${adminUserId}/deactivate`, admin)).status).toBe(403);
    expect((await call("patch", `/users/${randomUUID()}`, admin, { role: "DIRECTIVA" })).status).toBe(404);
    expect((await call("patch", `/users/${directorUserId}`, director, { role: "AGRICULTOR" })).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { entityName: "User" } })).toBe(before);
  });

  it("creating, editing and deactivating a catalogue product", async () => {
    const name = `Producto sintético D01 ${randomUUID().slice(0, 8)}`;
    const created = await call("post", "/inventory/products", director, { name, unit: "L" });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await call("patch", `/inventory/products/${id}`, admin, { category: "Herbicida" })).status).toBe(200);
    expect((await call("post", `/inventory/products/${id}/deactivate`, admin)).status).toBe(200);

    const entries = await prisma.auditLog.findMany({ where: { entityName: "Product", entityId: id }, orderBy: { createdAt: "asc" } });
    expect(entries.map((row) => [row.action, (row.metadata as any).event, row.actorUserId, row.tenantId, row.ownerUserId])).toEqual([
      ["CREAR", "PRODUCT_CREATED", directorUserId, f.tenantA, null],
      ["ACTUALIZAR", "PRODUCT_UPDATED", adminUserId, f.tenantA, null],
      ["INACTIVAR", "PRODUCT_DEACTIVATED", adminUserId, f.tenantA, null],
    ]);
    expect(entries[1]).toMatchObject({ before: { category: null }, after: { category: "Herbicida" } });
    expect(JSON.stringify(entries)).not.toContain("currentStock");
    const other = await call("get", "/audit-logs", directorB);
    expect(other.text).not.toContain(id);
  });
});
