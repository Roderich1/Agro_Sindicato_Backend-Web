import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { LEGACY_ROUTE_CLOSED } from "@/shared/api/legacy-route-closed.guard";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  Fixture,
  seedFixture,
  TestSession,
} from "./sync-v1/test-support/sync-v1-test-app";

/**
 * #81 PHASE 6 (limited): the farmer's legacy private writes on the Central
 * are closed by default and reopened only by the server's operational
 * rollback (LEGACY_PRIVATE_WRITES_ROLLBACK=enabled). Two applications share
 * one PostgreSQL database: `closed` has the default configuration and
 * `rollback` the rollback one. Every record is SYNTHETIC.
 */
const postgresUrl = process.env["F10_SEC_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

const API = "/api/v1";

type Method = "post" | "patch";

interface Res {
  status: number;
  body: any;
}

interface Route {
  name: string;
  method: Method;
  path: () => string;
  body: () => object;
  /** Status of the route before PHASE 6, for the body above. */
  previous: number;
}

describePostgres("#81 PHASE 6: legacy private writes closed, with a server rollback", () => {
  let closed: INestApplication;
  let rollback: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let farmerA: TestSession;
  let farmerA2: TestSession;
  let director: TestSession;
  let admin: TestSession;
  let backupDir: string;
  const users: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f81_phase6");
    // Read once when the application module is first imported (both apps).
    backupDir = mkdtempSync(join(tmpdir(), "f81-phase6-"));
    process.env["BACKUP_STORAGE_DIR"] = backupDir;
    ({ app: closed, prisma, jwt } = await createSyncV1App(databaseUrl));
    ({ app: rollback } = await createSyncV1App(databaseUrl, { legacyPrivateWrites: "rollback" }));
    f = await seedFixture(prisma);
    farmerA = await createSession(prisma, jwt, f.members.farmerA);
    farmerA2 = await createSession(prisma, jwt, f.members.farmerA2);
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    for (const [key, memberId] of Object.entries(f.members)) {
      users[key] = (await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).userId;
    }

    // Farmer A's legacy records, created through the rollback path.
    ids["supplier"] = (await prisma.supplier.create({ data: { tenantId: f.tenantA, name: "Proveedor sintético F81" } })).id;
    const purchase = await call(rollback, "post", "/purchases", farmerA, purchaseBody("L-F81-SEED"));
    expect(purchase.status).toBe(201);
    const purchaseId = purchase.body.purchase?.id ?? purchase.body.id;
    ids["lot"] = (await prisma.inventoryLot.findFirstOrThrow({ where: { purchaseItem: { purchaseId } } })).id;
    ids["payable"] = (await prisma.payableAccount.findFirstOrThrow({ where: { purchaseId } })).id;
    ids["crop"] = (await prisma.crop.create({ data: { tenantId: f.tenantA, name: "Papa sintética F81" } })).id;
    ids["plot"] = (await prisma.plot.create({
      data: { tenantId: f.tenantA, ownerUserId: users["farmerA"], name: "Chaco sintético F81" },
    })).id;
    ids["assignment"] = (await prisma.plotCropAssignment.create({
      data: { tenantId: f.tenantA, campaignId: f.campaigns.openA, plotId: ids["plot"], cropId: ids["crop"], ownerUserId: users["farmerA"] },
    })).id;
    ids["application"] = (await prisma.agrochemicalApplication.create({
      data: {
        tenantId: f.tenantA, campaignId: f.campaigns.openA, ownerUserId: users["farmerA"], plotId: ids["plot"], cropId: ids["crop"],
        plotCropAssignmentId: ids["assignment"], productId: f.products.liquidA, quantity: 1, notes: "Aplicación sintética F81",
      },
    })).id;
    // A second plot, with no crop yet, for the assignment route.
    ids["plotFree"] = (await prisma.plot.create({
      data: { tenantId: f.tenantA, ownerUserId: users["farmerA"], name: "Chaco libre F81" },
    })).id;
  }, 120000);

  afterAll(async () => {
    await closed?.close();
    await rollback?.close();
    if (backupDir) rmSync(backupDir, { recursive: true, force: true });
  });

  function purchaseBody(lotNumber: string) {
    return {
      supplier: { supplierId: ids["supplier"] },
      campaignId: f.campaigns.openA,
      paymentMode: "CREDITO",
      status: "RECIBIDA",
      dueDate: "2026-12-01T00:00:00.000Z",
      items: [{ product: { productId: f.products.liquidA }, quantity: 10, unitCost: 5, lotNumber, expirationDate: "2027-06-01T00:00:00.000Z" }],
    };
  }

  async function call(app: INestApplication, method: Method | "get", path: string, session?: TestSession, body?: object): Promise<Res> {
    let req = request(app.getHttpServer())[method](`${API}${path}`);
    if (session) req = req.set("Authorization", `Bearer ${session.token}`);
    const res = body === undefined ? await req : await req.send(body);
    return { status: res.status, body: res.body };
  }

  /** The 16 legacy private writes, in an order the rollback path accepts. */
  const routes = (): Route[] => [
    { name: "POST /inventory/initial-stock", method: "post", path: () => "/inventory/initial-stock", previous: 201,
      body: () => ({ product: { productId: f.products.liquidA }, quantity: 3 }) },
    { name: "POST /inventory/entries", method: "post", path: () => "/inventory/entries", previous: 201,
      body: () => ({ product: { productId: f.products.liquidA }, quantity: 3, entryReason: "ENTRADA_SIMPLE", notes: "Entrada sintética F81" }) },
    { name: "POST /inventory/exits", method: "post", path: () => "/inventory/exits", previous: 200,
      body: () => ({ productId: f.products.liquidA, quantity: 1, reasonType: "PERDIDA_DERRAME", reason: "Derrame sintético F81" }) },
    { name: "POST /inventory/adjustments", method: "post", path: () => "/inventory/adjustments", previous: 200,
      body: () => ({ productId: f.products.liquidA, direction: "INCREMENTO", reasonType: "AJUSTE", quantity: 1, reason: "Ajuste sintético F81" }) },
    { name: "PATCH /inventory/lots/:id", method: "patch", path: () => `/inventory/lots/${ids["lot"]}`, previous: 200,
      body: () => ({ lotNumber: "L-F81-EDIT" }) },
    { name: "POST /purchases", method: "post", path: () => "/purchases", previous: 201,
      body: () => purchaseBody(`L-F81-${randomUUID().slice(0, 8)}`) },
    { name: "POST /accounts-payable/:id/payments", method: "post", path: () => `/accounts-payable/${ids["payable"]}/payments`, previous: 201,
      body: () => ({ amount: 1, notes: "Abono sintético F81" }) },
    { name: "POST /accounts-payable/:id/pay-total", method: "post", path: () => `/accounts-payable/${ids["payable"]}/pay-total`, previous: 201,
      body: () => ({}) },
    { name: "POST /applications", method: "post", path: () => "/applications", previous: 201,
      body: () => ({ campaignId: f.campaigns.openA, plotId: ids["plot"], productId: f.products.liquidA, quantity: 1 }) },
    { name: "POST /applications/:id/cancel", method: "post", path: () => `/applications/${ids["application"]}/cancel`, previous: 200,
      body: () => ({ reason: "Anulación sintética F81" }) },
    { name: "POST /plots", method: "post", path: () => "/plots", previous: 201,
      body: () => ({ name: `Chaco nuevo F81 ${randomUUID().slice(0, 8)}` }) },
    { name: "PATCH /plots/:id", method: "patch", path: () => `/plots/${ids["plot"]}`, previous: 200,
      body: () => ({ notes: "Nota sintética F81" }) },
    { name: "POST /plot-crop-assignments", method: "post", path: () => "/plot-crop-assignments", previous: 201,
      body: () => ({ campaignId: f.campaigns.openA, plotId: ids["plotFree"], cropId: ids["crop"] }) },
    { name: "PATCH /plot-crop-assignments/:id", method: "patch", path: () => `/plot-crop-assignments/${ids["assignment"]}`, previous: 200,
      body: () => ({ notes: "Nota de cultivo F81" }) },
    { name: "POST /plots/:id/deactivate", method: "post", path: () => `/plots/${ids["plotFree"]}/deactivate`, previous: 200,
      body: () => ({}) },
    { name: "POST /sync/operations", method: "post", path: () => "/sync/operations", previous: 201,
      body: () => ({
        clientId: `f81-${randomUUID()}`,
        operations: [{ clientOperationId: randomUUID(), operation: "INITIAL_STOCK", payload: { product: { productId: f.products.liquidA }, quantity: 1 } }],
      }) },
  ];

  /** Everything a legacy private write could change, row by row. */
  async function effects() {
    const order = { orderBy: { id: "asc" as const } };
    const [counts, rows] = await Promise.all([
      Promise.all([
        prisma.purchase.count(), prisma.purchaseItem.count(), prisma.inventoryLot.count(), prisma.stockMovement.count(),
        prisma.payableAccount.count(), prisma.payment.count(), prisma.agrochemicalApplication.count(), prisma.plot.count(),
        prisma.plotCropAssignment.count(), prisma.syncOperation.count(), prisma.auditLog.count(), prisma.calendarEvent.count(),
        prisma.supplier.count(), prisma.product.count(), prisma.warehouse.count(),
      ]),
      Promise.all([
        prisma.inventoryLot.findMany(order), prisma.payableAccount.findMany(order), prisma.agrochemicalApplication.findMany(order),
        prisma.plot.findMany(order), prisma.plotCropAssignment.findMany(order), prisma.product.findMany(order),
      ]),
    ]);
    return JSON.stringify({ counts, rows });
  }

  describe("default configuration: closed", () => {
    it("every legacy private write answers 403 LEGACY_ROUTE_CLOSED to the farmer, with no effect", async () => {
      for (const route of routes()) {
        const before = await effects();
        const res = await call(closed, route.method, route.path(), farmerA, route.body());
        expect({ route: route.name, status: res.status, message: res.body?.message })
          .toEqual({ route: route.name, status: 403, message: LEGACY_ROUTE_CLOSED });
        expect({ route: route.name, changed: (await effects()) !== before }).toEqual({ route: route.name, changed: false });
      }
    });

    it("keeps the order of the guards: 401 without a session, the role 403 for DIRECTIVA and ADMINISTRADOR", async () => {
      for (const route of routes()) {
        const before = await effects();
        expect({ route: route.name, status: (await call(closed, route.method, route.path(), undefined, route.body())).status })
          .toEqual({ route: route.name, status: 401 });
        for (const [role, session] of [["DIRECTIVA", director], ["ADMINISTRADOR", admin]] as const) {
          const res = await call(closed, route.method, route.path(), session, route.body());
          expect({ route: route.name, role, status: res.status, closedMessage: res.body?.message === LEGACY_ROUTE_CLOSED })
            .toEqual({ route: route.name, role, status: 403, closedMessage: false });
        }
        expect({ route: route.name, changed: (await effects()) !== before }).toEqual({ route: route.name, changed: false });
      }
    });

    it("the reads of the same routes answer as before", async () => {
      for (const path of ["/inventory/lots", "/inventory/stock", "/inventory/movements", "/purchases", "/accounts-payable",
        "/applications", "/plots", "/plot-crop-assignments", "/sync/operations"]) {
        expect({ path, status: (await call(closed, "get", path, farmerA)).status }).toEqual({ path, status: 200 });
      }
      const lots = await call(closed, "get", "/inventory/lots", farmerA);
      expect(JSON.stringify(lots.body)).toContain(ids["lot"]);
      expect((await call(closed, "get", "/purchases", director)).status).toBe(403);
    });

    it("Auth V2, Sync v1, private backups and the authorised central functions keep working", async () => {
      expect((await call(closed, "get", "/auth/v2/me", farmerA)).status).toBe(200);
      expect((await call(closed, "get", "/sync/v1/references", farmerA)).status).toBe(200);
      expect((await call(closed, "get", `/sync/v1/operations/${randomUUID()}`, farmerA)).status).toBe(404);
      expect((await call(closed, "get", "/me/backups", farmerA)).status).toBe(200);
      const product = await call(closed, "post", "/inventory/products", director, { name: `Producto central F81 ${randomUUID().slice(0, 8)}`, unit: "L" });
      expect(product.status).toBe(201);
      expect((await call(closed, "patch", `/inventory/products/${product.body.id}`, admin, { category: "Herbicida" })).status).toBe(200);
      expect((await call(closed, "post", "/suppliers", director, { name: `Proveedor central F81 ${randomUUID().slice(0, 8)}` })).status).toBe(201);
      expect((await call(closed, "post", "/crops", admin, { name: `Cultivo central F81 ${randomUUID().slice(0, 8)}` })).status).toBe(201);
      const campaign = await call(closed, "post", "/campaigns", director, { name: `Campaña planificada F81 ${randomUUID().slice(0, 8)}`, startDate: "2027-04-01" });
      expect(campaign.status).toBe(201);
      expect((await call(closed, "get", `/collective/campaigns/${f.campaigns.openA}/summary`, director)).status).toBe(200);
    });
  });

  describe("server rollback: LEGACY_PRIVATE_WRITES_ROLLBACK=enabled", () => {
    it("another farmer still gets the previous 404 on farmer A's records", async () => {
      const before = await effects();
      expect((await call(rollback, "post", `/accounts-payable/${ids["payable"]}/payments`, farmerA2, { amount: 1 })).status).toBe(404);
      expect((await call(rollback, "patch", `/plots/${ids["plot"]}`, farmerA2, { notes: "intento ajeno" })).status).toBe(404);
      expect((await call(rollback, "patch", `/inventory/lots/${ids["lot"]}`, farmerA2, { lotNumber: "ajeno" })).status).toBe(404);
      expect((await call(rollback, "post", `/applications/${ids["application"]}/cancel`, farmerA2, { reason: "intento ajeno" })).status).toBe(404);
      expect(await effects()).toBe(before);
    });

    it("institutional roles and anonymous requests keep their previous answers", async () => {
      for (const route of routes()) {
        expect({ route: route.name, status: (await call(rollback, route.method, route.path(), undefined, route.body())).status })
          .toEqual({ route: route.name, status: 401 });
        const res = await call(rollback, route.method, route.path(), director, route.body());
        expect({ route: route.name, status: res.status, closedMessage: res.body?.message === LEGACY_ROUTE_CLOSED })
          .toEqual({ route: route.name, status: 403, closedMessage: false });
      }
    });

    it("every legacy private write recovers its previous behaviour for the owner", async () => {
      const answers = [];
      for (const route of routes()) {
        const res = await call(rollback, route.method, route.path(), farmerA, route.body());
        answers.push({ route: route.name, status: res.status, body: res.status === route.previous ? null : res.body });
      }
      expect(answers).toEqual(routes().map((route) => ({ route: route.name, status: route.previous, body: null })));
      const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: ids["lot"] } });
      expect(lot.lotNumber).toBe("L-F81-EDIT");
      const application = await prisma.agrochemicalApplication.findUniqueOrThrow({ where: { id: ids["application"] } });
      expect(application.status).toBe("ANULADA");
    });
  });
});
