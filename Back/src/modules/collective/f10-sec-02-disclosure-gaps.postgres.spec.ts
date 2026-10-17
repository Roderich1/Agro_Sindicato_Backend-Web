import { INestApplication } from "@nestjs/common";
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
 * F10-SEC-02 (#45), cotejo de salidas colectivas: dos caminos por los que la
 * política provisional F07-POL-01 (k = 3, NO aprobada; datos sintéticos)
 * podía revelar lo que una celda suprimida o una revisión oculta.
 */
const postgresUrl = process.env["F10_SEC_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

describePostgres("F10-SEC-02: disclosure gaps in the collective outputs on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let director: TestSession;

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f10_gap");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    director = await createSession(prisma, jwt, f.members.directorA);
  }, 120000);

  afterAll(async () => {
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (s: TestSession) => ({ Authorization: `Bearer ${s.token}` });

  async function farmer(): Promise<TestSession> {
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        tenantId: f.tenantA, name: "Agricultor sintético", email: `f10-gap-${memberId}@example.test`,
        passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function campaign(): Promise<string> {
    const id = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id, tenantId: f.tenantA, name: `Campaña ${id.slice(0, 6)}`, status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
    });
    return id;
  }

  async function product(name: string): Promise<string> {
    return (await prisma.product.create({ data: { tenantId: f.tenantA, name: `${name} ${randomUUID().slice(0, 6)}`, unit: "L" } })).id;
  }

  async function push(s: TestSession, campaignId: string, productId: string, quantity: string, pred: string | null = null) {
    const operationId = randomUUID();
    const res = await http().post("/api/v1/sync/v1/push").set("Content-Type", "application/json").set(auth(s)).send(JSON.stringify({
      contractVersion: 1, operationId, projectionType: "DECLARED_NEED", action: pred ? "SUPERSEDE" : "PUBLISH",
      causal: { predecessorOperationId: pred, reconciliationReference: null },
      payload: { campaign_ref: campaignId, product_ref: productId, base_unit: "ML", quantity_base: quantity },
    }));
    expect([res.status, res.body.outcome]).toEqual([200, "APPLIED"]);
    return operationId;
  }

  const summary = async (campaignId: string) => {
    const res = await http().get(`/api/v1/collective/campaigns/${campaignId}/summary`).set(auth(director));
    expect(res.status).toBe(200);
    return res;
  };

  it("re-keying a product to a canonical product without history does not publish a figure that isolates one change", async () => {
    const c = await campaign();
    const p = await product("Producto p");
    const [f0, f1, f2] = [await farmer(), await farmer(), await farmer()];
    const op0 = await push(f0, c, p, "1000");
    await push(f1, c, p, "2000");
    await push(f2, c, p, "3000");
    const first = await summary(c);
    expect(first.body.cells.find((cell: any) => cell.product_ref === p)).toMatchObject({ status: "DISCLOSED", total_base: "6000" });
    // One Member changes: the policy keeps the earlier figure with pending changes.
    await push(f0, c, p, "1100", op0);
    const revised = await summary(c);
    expect(revised.body.cells.find((cell: any) => cell.product_ref === p)).toMatchObject({ total_base: "6000", pending_changes: true });
    // The Directiva creates an empty product and re-keys p to it.
    const r = await http().post("/api/v1/inventory/products").set(auth(director)).send({ name: `Producto r ${randomUUID().slice(0, 6)}`, unit: "L" });
    expect(r.status).toBe(201);
    const associated = await http().post("/api/v1/collective/product-associations").set(auth(director))
      .send({ productId: p, canonicalProductId: r.body.id, reason: "reasociación sintética", confirmed: true });
    expect([200, 201]).toContain(associated.status);
    const after = await summary(c);
    // 6100 - 6000 would isolate f0's +100: no channel may serve it.
    expect(after.text).not.toContain('"6100"');
    expect(after.body.cells.every((cell: any) => cell.status !== "DISCLOSED" || cell.total_base === "6000")).toBe(true);
  });

  it("coverage does not reveal the exact contributor count of a campaign whose only cells are suppressed", async () => {
    const c = await campaign();
    const x = await product("Producto x");
    await push(await farmer(), c, x, "500");
    await push(await farmer(), c, x, "700");
    const res = await summary(c);
    expect(res.body.cells).toEqual([expect.objectContaining({ product_ref: x, status: "SUPPRESSED_UNDER_THRESHOLD", total_base: null, contributors: null })]);
    const shown = res.body.coverage?.members_with_contribution;
    // An exact count under k here equals the hidden count of the only cell.
    expect({ shown, reveals: typeof shown === "number" && shown < 3 }).toEqual({ shown, reveals: false });
  });
});
