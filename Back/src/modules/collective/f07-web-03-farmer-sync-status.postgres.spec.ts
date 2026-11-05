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
 * F07-WEB-03 (#25, 2026-11-05) on PostgreSQL, end to end through
 * POST /sync/v1/push and GET /collective/farmers/sync-status:
 * - the date is the server time of the latest accepted send (APPLIED);
 * - a replay, a rejected attempt, a login or a legacy sync row never set it;
 * - a farmer without accepted sends is "Sin registro de sincronización";
 * - only DIRECTIVA/ADMINISTRADOR of the caller's own tenant; another tenant
 *   never sees these farmers, whatever the request says;
 * - no ids, quantities, products, campaigns or projection types.
 *
 * Synthetic data only, in an isolated database.
 */
const postgresUrl = process.env["F07_WEB_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

const PUSH = "/api/v1/sync/v1/push";
const STATUS = "/api/v1/collective/farmers/sync-status";

interface Res {
  status: number;
  body: any;
  text: string;
  headers: Record<string, string>;
}

describePostgres("F07-WEB-03: linked farmers and their latest accepted send", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let director: TestSession;

  beforeAll(async () => {
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f07_web03");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    director = await createSession(prisma, jwt, f.members.directorA);
    for (const level of ["log", "warn"] as const) jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });
  const status = (session: TestSession, path = STATUS): Promise<Res> => http().get(path).set(auth(session));
  const row = (res: Res, name: string) => (res.body.farmers as any[]).find((r) => r.display_name === name);

  async function person(tenantId: string, name: string, role: "AGRICULTOR" | "DIRECTIVA" = "AGRICULTOR") {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name, email: `f07w03-${userId}@example.test`, passwordHash: unusablePasswordHash(), role,
        members: { create: { id: memberId, tenantId, role } },
      },
    });
    return { userId, memberId };
  }

  function envelope(e: { campaign: string; product: string; quantity?: string; action?: "PUBLISH" | "SUPERSEDE" | "CANCEL"; pred?: string }, operationId = randomUUID()) {
    const action = e.action ?? "PUBLISH";
    return {
      contractVersion: 1,
      operationId,
      projectionType: "DECLARED_NEED",
      action,
      causal: { predecessorOperationId: e.pred ?? null, reconciliationReference: null },
      payload: {
        campaign_ref: e.campaign,
        product_ref: e.product,
        base_unit: "ML",
        ...(action === "CANCEL" ? {} : { quantity_base: e.quantity }),
      },
    };
  }

  async function send(session: TestSession, body: object): Promise<Res> {
    const res = await http().post(PUSH).set("Content-Type", "application/json").set(auth(session)).send(JSON.stringify(body));
    expect(res.status).toBe(200);
    return res;
  }

  it("dates only accepted sends; replays, rejections, logins and legacy rows never set it", async () => {
    const ana = await person(f.tenantA, "Ana Sintética");
    const bruno = await person(f.tenantA, "Bruno Sintético");
    const carla = await person(f.tenantA, "Carla Sintética");
    const dario = await person(f.tenantA, "Darío Sintético");
    const anaS = await createSession(prisma, jwt, ana.memberId);
    const brunoS = await createSession(prisma, jwt, bruno.memberId);
    const carlaS = await createSession(prisma, jwt, carla.memberId);

    // Ana: one accepted send, then its replay (same operationId and body).
    const first = envelope({ campaign: f.campaigns.openA, product: f.products.liquidA, quantity: "10000" });
    const applied = await send(anaS, first);
    expect(applied.body.outcome).toBe("APPLIED");
    let res = await status(director);
    expect(res.status).toBe(200);
    expect(row(res, "Ana Sintética")).toEqual({
      display_name: "Ana Sintética",
      state: "WITH_ACCEPTED_SENDS",
      state_label: "Con envíos aceptados",
      last_accepted_send_at: applied.body.serverAcceptedAt,
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const replay = await send(anaS, first);
    expect(replay.body.outcome).toBe("ALREADY_APPLIED");
    expect(row(await status(director), "Ana Sintética").last_accepted_send_at).toBe(applied.body.serverAcceptedAt);

    // Ana: a later accepted CANCEL is an accepted send too and moves the date.
    await new Promise((resolve) => setTimeout(resolve, 15));
    const cancel = await send(anaS, envelope({ campaign: f.campaigns.openA, product: f.products.liquidA, action: "CANCEL", pred: first.operationId }));
    expect(cancel.body.outcome).toBe("APPLIED");
    expect(Date.parse(cancel.body.serverAcceptedAt)).toBeGreaterThan(Date.parse(applied.body.serverAcceptedAt));
    expect(row(await status(director), "Ana Sintética").last_accepted_send_at).toBe(cancel.body.serverAcceptedAt);

    // Ana: a rejected attempt after that does not move the date.
    const rejectedLater = await send(anaS, envelope({ campaign: f.campaigns.openB, product: f.products.liquidB, quantity: "1000" }));
    expect(rejectedLater.body.outcome).toBe("REJECTED");
    expect(row(await status(director), "Ana Sintética").last_accepted_send_at).toBe(cancel.body.serverAcceptedAt);

    // Bruno: only rejected attempts (foreign references, closed campaign).
    expect((await send(brunoS, envelope({ campaign: f.campaigns.openB, product: f.products.liquidB, quantity: "1000" }))).body.outcome).toBe("REJECTED");
    expect((await send(brunoS, envelope({ campaign: f.campaigns.closedA, product: f.products.liquidA, quantity: "1000" }))).body.outcome).toBe("REJECTED");
    // Carla: logged in, with a session and a device seen just now, never sent.
    await prisma.user.update({ where: { id: carla.userId }, data: { lastLoginAt: new Date() } });
    expect(carlaS.registrationId).not.toBeNull();
    // Darío: only a row of the legacy sync queue marked as applied.
    await prisma.syncOperation.create({
      data: {
        tenantId: f.tenantA, userId: dario.userId, clientId: "legacy-client", entityName: "inventory_lot", entityId: randomUUID(),
        operation: "CREATE", payload: {}, status: "APLICADA", appliedAt: new Date(),
      },
    });

    res = await status(director);
    for (const name of ["Bruno Sintético", "Carla Sintética", "Darío Sintético"]) {
      expect(row(res, name)).toEqual({
        display_name: name,
        state: "NO_SYNC_RECORD",
        state_label: "Sin registro de sincronización",
        last_accepted_send_at: null,
      });
    }
    // The fixture farmers never sent either: listed, never as a zero.
    expect(row(res, "Usuario sintético farmerA").state).toBe("NO_SYNC_RECORD");
    expect(row(res, "Usuario sintético farmerA2").state).toBe("NO_SYNC_RECORD");
  });

  it("returns only names, states and dates of active farmers of the caller's tenant", async () => {
    const eva = await person(f.tenantA, "Eva Sintética");
    await send(await createSession(prisma, jwt, eva.memberId), envelope({ campaign: f.campaigns.openA, product: f.products.liquidA, quantity: "7777000" }));
    const inactiveMember = await person(f.tenantA, "Fidel Baja Sintética");
    await prisma.member.update({ where: { id: inactiveMember.memberId }, data: { isActive: false } });
    const inactiveUser = await person(f.tenantA, "Gina Usuario Inactivo");
    await prisma.user.update({ where: { id: inactiveUser.userId }, data: { isActive: false } });

    const res = await status(director);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body).sort()).toEqual(["basis", "contractVersion", "date_label", "farmers", "generated_at"]);
    expect(res.body).toMatchObject({ contractVersion: 1, basis: "SYNC_V1_ACCEPTED_SEND", date_label: "Último envío aceptado" });
    for (const r of res.body.farmers) {
      expect(Object.keys(r).sort()).toEqual(["display_name", "last_accepted_send_at", "state", "state_label"]);
    }
    const names: string[] = res.body.farmers.map((r: any) => r.display_name);
    // Sorted by name, never by date.
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })));
    // Directiva, Administrador, inactive Member or User, and other tenants are not listed.
    for (const absent of ["Usuario sintético directorA", "Usuario sintético adminA", "Fidel Baja Sintética", "Gina Usuario Inactivo", "Usuario sintético farmerB"]) {
      expect(names).not.toContain(absent);
    }
    // Nothing individual beyond the name and the date.
    for (const leak of ["7777000", eva.memberId, eva.userId, f.products.liquidA, "Herbicida", f.campaigns.openA, "DECLARED_NEED", "CONSUMPTION_TOTAL", "@example.test"]) {
      expect(res.text).not.toContain(leak);
    }
  });

  it("allows DIRECTIVA and ADMINISTRADOR, rejects farmers and missing credentials", async () => {
    expect((await status(await createSession(prisma, jwt, f.members.adminA))).status).toBe(200);
    expect((await status(await createSession(prisma, jwt, f.members.farmerA))).status).toBe(403);
    expect((await http().get(STATUS)).status).toBe(401);
    expect((await http().get(STATUS).set({ Authorization: "Bearer not-a-token" })).status).toBe(401);
  });

  it("never shows another tenant's farmers, whatever the request says", async () => {
    const directorB = await createSession(prisma, jwt, (await person(f.tenantB, "Directiva B Sintética", "DIRECTIVA")).memberId);
    const farmerB = await createSession(prisma, jwt, f.members.farmerB);
    const acceptedB = await send(farmerB, envelope({ campaign: f.campaigns.openB, product: f.products.liquidB, quantity: "2000" }));
    expect(acceptedB.body.outcome).toBe("APPLIED");

    for (const path of [STATUS, `${STATUS}?tenantId=${f.tenantA}`, `${STATUS}?tenant_id=${f.tenantA}`]) {
      const res = await http().get(path).set(auth(directorB)).set("X-Tenant-Id", f.tenantA);
      expect(res.status).toBe(200);
      expect(res.body.farmers).toEqual([
        {
          display_name: "Usuario sintético farmerB",
          state: "WITH_ACCEPTED_SENDS",
          state_label: "Con envíos aceptados",
          last_accepted_send_at: acceptedB.body.serverAcceptedAt,
        },
      ]);
    }
    // And tenant A's Directiva does not see tenant B's farmer or its send.
    const resA = await status(director);
    expect((resA.body.farmers as any[]).map((r) => r.display_name)).not.toContain("Usuario sintético farmerB");
    expect(resA.text).not.toContain(acceptedB.body.serverAcceptedAt);
  });

  it("with no farmers linked, returns an empty list, not a row of zeros", async () => {
    const tenantC = randomUUID();
    await prisma.tenant.create({ data: { id: tenantC, name: "Sintético C", slug: `f07w03-c-${tenantC}` } });
    const directorC = await createSession(prisma, jwt, (await person(tenantC, "Directiva C Sintética", "DIRECTIVA")).memberId);
    const res = await status(directorC);
    expect(res.status).toBe(200);
    expect(res.body.farmers).toEqual([]);
  });
});
