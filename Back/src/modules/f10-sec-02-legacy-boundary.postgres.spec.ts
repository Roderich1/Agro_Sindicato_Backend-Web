import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CreateJointPurchaseUseCase } from "@/modules/procurement/application/use-cases/create-joint-purchase.use-case";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  Fixture,
  seedFixture,
  TestSession,
} from "./sync-v1/test-support/sync-v1-test-app";

/**
 * F10-SEC-02 (#45/#81): the boundary between the farmer's private operation
 * (Mobile, legacy central routes) and the institutional collective view
 * (Web, DIRECTIVA/ADMINISTRADOR, ADR-003), through the real API on
 * PostgreSQL. Every private record below is SYNTHETIC legacy data; the tests
 * check that no institutional role reads or changes it for being one, that a
 * farmer does not read another farmer's records, and that the institutional
 * functions the president legitimately keeps still work.
 */
const postgresUrl = process.env["F10_SEC_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

const API = "/api/v1";
const PLOT_LOCATION = "MARCA-UBICACION-PRIVADA-F10";
const APPLICATION_NOTE = "MARCA-NOTA-APLICACION-F10";
const AUDIT_PRIVATE = "MARCA-AUDITORIA-PRIVADA-F10";
const EVENT_PRIVATE = "MARCA-EVENTO-PRIVADO-F10";
const PURCHASE_NOTE = "MARCA-COMPRA-PRIVADA-F10";

type Method = "get" | "post" | "patch";

interface Res {
  status: number;
  body: any;
  text: string;
}

describePostgres("F10-SEC-02 legacy routes: private/collective boundary on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let farmerA: TestSession;
  let farmerA2: TestSession;
  let farmerB: TestSession;
  let director: TestSession;
  let admin: TestSession;
  let otherTenantDirector: TestSession;
  const users: Record<string, { id: string; email: string; name: string }> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f10_sec");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    farmerA = await createSession(prisma, jwt, f.members.farmerA);
    farmerA2 = await createSession(prisma, jwt, f.members.farmerA2);
    farmerB = await createSession(prisma, jwt, f.members.farmerB);
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    const otherMember = randomUUID();
    await prisma.user.create({
      data: {
        tenantId: f.tenantB, name: "Directiva sintética B", email: `f10-dir-b-${otherMember}@example.test`,
        passwordHash: "x", role: "DIRECTIVA", members: { create: { id: otherMember, tenantId: f.tenantB, role: "DIRECTIVA" } },
      },
    });
    otherTenantDirector = await createSession(prisma, jwt, otherMember);
    for (const [key, memberId] of Object.entries(f.members)) {
      const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId }, include: { user: true } });
      users[key] = { id: member.user.id, email: member.user.email, name: member.user.name };
    }

    ids["supplier"] = (await prisma.supplier.create({ data: { tenantId: f.tenantA, name: "Proveedor sintético F10" } })).id;
    // Farmer A's individual legacy purchase on credit: lot, movement, payable.
    const purchase = await call("post", "/purchases", farmerA, {
      supplier: { supplierId: ids["supplier"] },
      campaignId: f.campaigns.openA,
      paymentMode: "CREDITO",
      status: "RECIBIDA",
      dueDate: "2026-12-01T00:00:00.000Z",
      notes: PURCHASE_NOTE,
      items: [{ product: { productId: f.products.liquidA }, quantity: 10, unitCost: 5, lotNumber: "L-F10-A", expirationDate: "2027-06-01T00:00:00.000Z" }],
    });
    expect({ status: purchase.status, body: purchase.status === 201 ? null : purchase.body }).toEqual({ status: 201, body: null });
    ids["purchaseA"] = purchase.body.purchase?.id ?? purchase.body.id;
    expect(ids["purchaseA"]).toBeTruthy();

    // A legacy joint purchase (created before this review, here through the
    // use case, not the closed route) with farmers A and A2 as participants.
    const joint = await app.get(CreateJointPurchaseUseCase).execute(f.tenantA, users["directorA"].id, jointPurchaseBody());
    ids["jointPurchase"] = (joint as any).purchase?.id ?? (joint as any).id;
    const jointPayableA = await prisma.payableAccount.findFirstOrThrow({
      where: { purchaseId: ids["jointPurchase"], responsibleUserId: users["farmerA"].id },
    });
    ids["jointPayableA"] = jointPayableA.id;

    // Private plot, assignment, application, calendar event and audit entry.
    const crop = await prisma.crop.create({ data: { tenantId: f.tenantA, name: "Papa sintética F10" } });
    const plot = await prisma.plot.create({
      data: { tenantId: f.tenantA, ownerUserId: users["farmerA"].id, name: "Chaco sintético", location: PLOT_LOCATION, notes: PLOT_LOCATION },
    });
    ids["plot"] = plot.id;
    const assignment = await prisma.plotCropAssignment.create({
      data: { tenantId: f.tenantA, campaignId: f.campaigns.openA, plotId: plot.id, cropId: crop.id, ownerUserId: users["farmerA"].id },
    });
    const application = await prisma.agrochemicalApplication.create({
      data: {
        tenantId: f.tenantA, campaignId: f.campaigns.openA, ownerUserId: users["farmerA"].id, plotId: plot.id, cropId: crop.id,
        plotCropAssignmentId: assignment.id, productId: f.products.liquidA, quantity: 2, notes: APPLICATION_NOTE,
      },
    });
    ids["application"] = application.id;
    const event = await prisma.calendarEvent.create({
      data: {
        tenantId: f.tenantA, campaignId: f.campaigns.openA, ownerUserId: users["farmerA"].id, type: "APLICACION",
        title: EVENT_PRIVATE, eventDate: new Date("2026-11-15T00:00:00.000Z"), isAutoGenerated: false,
      },
    });
    ids["eventA"] = event.id;
    const institutionalEvent = await prisma.calendarEvent.create({
      data: {
        tenantId: f.tenantA, campaignId: f.campaigns.openA, type: "CIERRE_CAMPANA",
        title: "Cierre de campaña sintético", eventDate: new Date("2027-03-01T00:00:00.000Z"), isAutoGenerated: false,
      },
    });
    ids["eventInstitutional"] = institutionalEvent.id;
    await prisma.auditLog.create({
      data: {
        tenantId: f.tenantA, campaignId: f.campaigns.openA, actorUserId: users["farmerA"].id, ownerUserId: users["farmerA"].id,
        action: "CREAR", entityName: "AgrochemicalApplication", entityId: application.id, summary: AUDIT_PRIVATE,
        after: { notes: AUDIT_PRIVATE },
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: f.tenantA, campaignId: f.campaigns.openA, actorUserId: users["directorA"].id,
        action: "ABRIR_CAMPANA", entityName: "AgriculturalCampaign", entityId: f.campaigns.openA, summary: "Campaña abierta (sintético)",
      },
    });
  }, 120000);

  afterAll(async () => {
    await app?.close();
  });

  function jointPurchaseBody() {
    return {
      supplier: { supplierId: ids["supplier"] },
      campaignId: f.campaigns.openA,
      paymentMode: "CREDITO" as const,
      status: "RECIBIDA" as const,
      dueDate: "2026-12-15T00:00:00.000Z",
      items: [{
        product: { productId: f.products.liquidA },
        quantity: 8,
        unitCost: 3,
        allocations: [{ userId: users["farmerA"].id, quantity: 5 }, { userId: users["farmerA2"].id, quantity: 3 }],
      }],
    };
  }

  async function call(method: Method, path: string, session?: TestSession, body?: unknown): Promise<Res> {
    let req = request(app.getHttpServer())[method](`${API}${path}`);
    if (session) req = req.set("Authorization", `Bearer ${session.token}`);
    const res = body === undefined ? await req : await req.send(body as object);
    return { status: res.status, body: res.body, text: res.text ?? JSON.stringify(res.body) };
  }

  const institutional = () => [["DIRECTIVA", director], ["ADMINISTRADOR", admin]] as const;

  /** Every private trace of farmer A that must not reach someone else. */
  function privateTraces(): string[] {
    return [PLOT_LOCATION, APPLICATION_NOTE, AUDIT_PRIVATE, EVENT_PRIVATE, PURCHASE_NOTE, users["farmerA"].email, users["farmerA"].id];
  }

  function expectNoPrivateTrace(res: Res, context: string) {
    for (const trace of privateTraces()) {
      expect({ context, leaked: res.text.includes(trace) ? trace : null }).toEqual({ context, leaked: null });
    }
  }

  async function effects() {
    const [purchases, lots, movements, payables, payments, events, participants] = await Promise.all([
      prisma.purchase.count(),
      prisma.inventoryLot.count(),
      prisma.stockMovement.count(),
      prisma.payableAccount.count(),
      prisma.payment.count(),
      prisma.calendarEvent.count(),
      prisma.purchaseParticipant.count(),
    ]);
    return { purchases, lots, movements, payables, payments, events, participants };
  }

  describe("catalog with central stock (#45 finding 1)", () => {
    it("GET /inventory/products serves the shared catalog without the central stock of private lots", async () => {
      for (const session of [farmerA, farmerA2, director, admin]) {
        const res = await call("get", "/inventory/products", session);
        expect(res.status).toBe(200);
        const product = res.body.find((p: any) => p.id === f.products.liquidA);
        expect(product).toMatchObject({ name: "Herbicida sintético", unit: "L" });
        expect(product).not.toHaveProperty("currentStock");
      }
    });

    it("keeps the institutional catalog management (shared catalog, not private data)", async () => {
      const created = await call("post", "/inventory/products", director, { name: "Producto catálogo F10", unit: "L" });
      expect(created.status).toBe(201);
      expect(created.body).not.toHaveProperty("currentStock");
      const updated = await call("patch", `/inventory/products/${created.body.id}`, admin, { category: "Herbicida" });
      expect(updated.status).toBe(200);
      const settings = await call("patch", `/inventory/products/${created.body.id}/settings`, admin, { minimumStock: 2 });
      expect(settings.status).toBe(200);
      expect((await call("post", "/inventory/products", farmerA, { name: "Intento agricultor", unit: "L" })).status).toBe(403);
    });

    it("does not show another tenant's catalog", async () => {
      const res = await call("get", "/inventory/products", otherTenantDirector);
      expect(res.status).toBe(200);
      expect(res.body.some((p: any) => p.id === f.products.liquidA)).toBe(false);
    });
  });

  describe("/directiva legacy flows (#45 finding 2)", () => {
    it("GET /inventory/global-stock is closed: no institutional role reads farmers' lots", async () => {
      for (const [, session] of institutional()) {
        const res = await call("get", "/inventory/global-stock", session);
        expect(res.status).toBe(403);
        expectNoPrivateTrace(res, "global-stock");
      }
      expect((await call("get", "/inventory/global-stock", farmerA)).status).toBe(403);
      expect((await call("get", "/inventory/global-stock")).status).toBe(401);
    });

    it("POST /purchases/joint is closed and creates no purchase, lot, movement, debt, payment or event", async () => {
      for (const [, session] of institutional()) {
        const before = await effects();
        const res = await call("post", "/purchases/joint", session, jointPurchaseBody());
        expect(res.status).toBe(403);
        expect(await effects()).toEqual(before);
      }
      expect((await call("post", "/purchases/joint", farmerA, jointPurchaseBody())).status).toBe(403);
      expect((await call("post", "/purchases/joint", undefined, jointPurchaseBody())).status).toBe(401);
    });

    it("no institutional role reads farmers' debts or pays them", async () => {
      for (const [role, session] of institutional()) {
        const list = await call("get", "/accounts-payable", session);
        expect({ role, status: list.status }).toEqual({ role, status: 403 });
        expectNoPrivateTrace(list, `payables ${role}`);
        const before = await effects();
        const payable = await prisma.payableAccount.findUniqueOrThrow({ where: { id: ids["jointPayableA"] } });
        const payment = await call("post", `/accounts-payable/${ids["jointPayableA"]}/payments`, session, { amount: 1, notes: "intento institucional" });
        const total = await call("post", `/accounts-payable/${ids["jointPayableA"]}/pay-total`, session, {});
        expect({ role, payment: payment.status, total: total.status }).toEqual({ role, payment: 403, total: 403 });
        expect(await effects()).toEqual(before);
        expect(await prisma.payableAccount.findUniqueOrThrow({ where: { id: ids["jointPayableA"] } })).toEqual(payable);
      }
    });

    it("another farmer of the same joint purchase cannot pay farmer A's debt", async () => {
      const before = await effects();
      const res = await call("post", `/accounts-payable/${ids["jointPayableA"]}/payments`, farmerA2, { amount: 1 });
      expect(res.status).toBe(404);
      expect(await effects()).toEqual(before);
    });

    it("another tenant's directiva cannot reach the payable", async () => {
      const res = await call("post", `/accounts-payable/${ids["jointPayableA"]}/payments`, otherTenantDirector, { amount: 1 });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe("individual purchases (#45 finding 3, inventory/purchases/sync)", () => {
    it("no institutional role lists or opens farmers' purchases", async () => {
      for (const [role, session] of institutional()) {
        const list = await call("get", "/purchases", session);
        const one = await call("get", `/purchases/${ids["purchaseA"]}`, session);
        expect({ role, list: list.status, one: one.status }).toEqual({ role, list: 403, one: 403 });
        expectNoPrivateTrace(list, `purchases ${role}`);
        expectNoPrivateTrace(one, `purchase ${role}`);
      }
      expect((await call("get", "/purchases")).status).toBe(401);
    });

    it("a participant in a legacy joint purchase sees only their own part", async () => {
      const list = await call("get", "/purchases", farmerA2);
      expect(list.status).toBe(200);
      const joint = list.body.find((p: any) => p.id === ids["jointPurchase"]);
      expect(joint).toBeTruthy();
      expect(joint.participants.map((p: any) => p.user.id)).toEqual([users["farmerA2"].id]);
      expect(joint.payables.map((p: any) => p.responsibleUser.id)).toEqual([users["farmerA2"].id]);
      expectNoPrivateTrace(list, "participant list");
      const one = await call("get", `/purchases/${ids["jointPurchase"]}`, farmerA2);
      expect(one.status).toBe(200);
      expectNoPrivateTrace(one, "participant detail");
      // Farmer A's own purchase is not visible to farmer A2.
      expect((await call("get", `/purchases/${ids["purchaseA"]}`, farmerA2)).status).toBe(404);
    });

    it("the owner keeps reading their own legacy records (no destructive retirement)", async () => {
      const purchases = await call("get", "/purchases", farmerA);
      expect(purchases.status).toBe(200);
      expect(purchases.text).toContain(PURCHASE_NOTE);
      expect((await call("get", "/accounts-payable", farmerA)).status).toBe(200);
      expect((await call("get", "/inventory/stock", farmerA)).status).toBe(200);
      expect((await call("get", "/plots", farmerA)).text).toContain(PLOT_LOCATION);
      expect((await call("get", "/applications", farmerA)).text).toContain(APPLICATION_NOTE);
      expect((await call("get", "/reports/inventory/current", farmerA)).status).toBe(200);
    });

    it("institutional roles do not operate a private inventory from the Web", async () => {
      for (const [role, session] of institutional()) {
        const before = await effects();
        const initial = await call("post", "/inventory/initial-stock", session, { product: { productId: f.products.liquidA }, quantity: 3 });
        const entry = await call("post", "/inventory/entries", session, { product: { productId: f.products.liquidA }, quantity: 3, entryReason: "ENTRADA_SIMPLE" });
        expect({ role, initial: initial.status, entry: entry.status }).toEqual({ role, initial: 403, entry: 403 });
        expect(await effects()).toEqual(before);
        for (const path of ["/inventory/lots", "/inventory/stock", "/inventory/alerts", "/inventory/movements"]) {
          expect({ role, path, status: (await call("get", path, session)).status }).toEqual({ role, path, status: 403 });
        }
      }
    });

    it("legacy sync stays farmer-only (institutional 403, no session 401)", async () => {
      for (const [, session] of institutional()) {
        expect((await call("get", "/sync/operations", session)).status).toBe(403);
        expect((await call("post", "/sync/operations", session, { clientId: "web", operations: [] })).status).toBe(403);
      }
      expect((await call("get", "/sync/operations")).status).toBe(401);
    });
  });

  describe("other legacy endpoints identified in ADR-003 (applications, reports, audit, calendar, plots)", () => {
    it("no institutional role reads farmers' applications or plots", async () => {
      for (const [role, session] of institutional()) {
        for (const path of ["/applications", `/applications/${ids["application"]}`, "/plots", "/plot-crop-assignments", `/plots?ownerUserId=${users["farmerA"].id}`]) {
          const res = await call("get", path, session);
          expect({ role, path, status: res.status }).toEqual({ role, path, status: 403 });
          expectNoPrivateTrace(res, `${role} ${path}`);
        }
      }
      // A farmer does not read another farmer's plot.
      const other = await call("get", `/plots?ownerUserId=${users["farmerA"].id}`, farmerA2);
      expect(other.status).toBe(200);
      expectNoPrivateTrace(other, "farmer A2 plots");
    });

    it("keeps the shared crop catalog for institutional roles", async () => {
      expect((await call("get", "/crops", director)).status).toBe(200);
      expect((await call("post", "/crops", admin, { name: "Haba sintética F10" })).status).toBe(201);
    });

    it("no institutional role reads the legacy per-farmer reports", async () => {
      const paths = [
        "/reports/inventory/current", "/reports/inventory/by-campaign", "/reports/inventory/by-farmer",
        "/reports/purchases/by-campaign", "/reports/purchases/joint", "/reports/applications/by-plot-crop",
        "/reports/consumption/by-product", "/reports/consumption/by-crop", "/reports/products/expired",
        "/reports/payables", "/reports/audit-log",
      ];
      for (const [role, session] of institutional()) {
        for (const path of paths) {
          const res = await call("get", path, session);
          expect({ role, path, status: res.status }).toEqual({ role, path, status: 403 });
          expectNoPrivateTrace(res, `${role} ${path}`);
        }
      }
      const joint = await call("get", "/reports/purchases/joint", farmerA2);
      expect(joint.status).toBe(200);
      expectNoPrivateTrace(joint, "farmer A2 joint report");
    });

    it("the institutional audit view has no farmer's private entries; the institutional ones remain", async () => {
      for (const [role, session] of institutional()) {
        for (const path of ["/audit-logs", `/audit-logs?ownerUserId=${users["farmerA"].id}`, `/audit-logs?actorUserId=${users["farmerA"].id}`]) {
          const res = await call("get", path, session);
          expect({ role, path, status: res.status }).toEqual({ role, path, status: 200 });
          expectNoPrivateTrace(res, `${role} ${path}`);
        }
        const all = await call("get", "/audit-logs", session);
        expect(all.body.some((log: any) => log.entityName === "AgriculturalCampaign")).toBe(true);
      }
      expect((await call("get", "/audit-logs", farmerA)).text).toContain(AUDIT_PRIVATE);
      expectNoPrivateTrace(await call("get", "/audit-logs", farmerA2), "farmer A2 audit");
    });

    it("the institutional calendar shows and changes only institutional events, and derives none from private stock", async () => {
      const derivedBefore = await prisma.calendarEvent.count({ where: { ownerUserId: { not: null } } });
      for (const [role, session] of institutional()) {
        for (const path of ["/calendar/events", `/calendar/events?ownerUserId=${users["farmerA"].id}`]) {
          const res = await call("get", path, session);
          expect({ role, path, status: res.status }).toEqual({ role, path, status: 200 });
          expectNoPrivateTrace(res, `${role} ${path}`);
          expect(res.body.every((event: any) => event.ownerUserId === null)).toBe(true);
        }
        const complete = await call("post", `/calendar/events/${ids["eventA"]}/complete`, session);
        const cancel = await call("post", `/calendar/events/${ids["eventA"]}/cancel`, session);
        expect({ role, complete: complete.status, cancel: cancel.status }).toEqual({ role, complete: 404, cancel: 404 });
      }
      expect((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ids["eventA"] } })).status).toBe("PENDIENTE");
      expect(await prisma.calendarEvent.count({ where: { ownerUserId: { not: null } } })).toBe(derivedBefore);
      const institutionalEvent = await call("post", `/calendar/events/${ids["eventInstitutional"]}/complete`, director);
      expect(institutionalEvent.status).toBe(200);
      expect(institutionalEvent.body.status).toBe("COMPLETADO");
    });
  });

  describe("legitimate institutional functions are kept (ADR-003)", () => {
    it("campaigns, users and the collective F07 routes still answer DIRECTIVA and ADMINISTRADOR", async () => {
      for (const [, session] of institutional()) {
        expect((await call("get", "/campaigns", session)).status).toBe(200);
        expect((await call("get", "/users", session)).status).toBe(200);
        expect((await call("get", "/collective/product-associations", session)).status).toBe(200);
        expect((await call("get", "/collective/product-associations/catalog", session)).status).toBe(200);
        expect([200, 409]).toContain((await call("get", `/collective/campaigns/${f.campaigns.openA}/summary`, session)).status);
      }
      const campaign = await call("post", "/campaigns", admin, { name: "Campaña institucional F10", startDate: "2027-09-01T00:00:00.000Z" });
      expect(campaign.status).toBe(201);
      expect((await call("get", "/campaigns", farmerA)).status).toBe(200);
      expect((await call("get", "/users", farmerA)).status).toBe(403);
    });

    it("the joint purchase proposal has no execution route", async () => {
      const before = await effects();
      const proposalId = randomUUID();
      for (const suffix of ["execute", "approve", "purchase", "confirm"]) {
        for (const [, session] of institutional()) {
          const res = await call("post", `/collective/proposals/${proposalId}/${suffix}`, session, {});
          expect(res.status).toBe(404);
        }
      }
      expect(await effects()).toEqual(before);
    });
  });
});
