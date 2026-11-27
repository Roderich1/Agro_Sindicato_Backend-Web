import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import type { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  seedFixture,
  TestSession,
} from "../sync-v1/test-support/sync-v1-test-app";

const postgresUrl = process.env["F07_SEAL_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });

describePostgres("Approved campaign close on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Awaited<ReturnType<typeof seedFixture>>;
  let director: ReturnType<typeof auth>;
  let admin: ReturnType<typeof auth>;
  let farmer: ReturnType<typeof auth>;
  let second: ReturnType<typeof auth>;
  let outsider: ReturnType<typeof auth>;

  beforeAll(async () => {
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "approved_close");
    const context = await createSyncV1App(databaseUrl);
    app = context.app;
    prisma = context.prisma;
    fixture = await seedFixture(prisma);
    director = auth(await createSession(prisma, context.jwt, fixture.members.directorA));
    admin = auth(await createSession(prisma, context.jwt, fixture.members.adminA));
    farmer = auth(await createSession(prisma, context.jwt, fixture.members.farmerA));
    second = auth(await createSession(prisma, context.jwt, fixture.members.farmerA2));
    outsider = auth(await createSession(prisma, context.jwt, fixture.members.farmerB));
  }, 120000);

  afterAll(async () => {
    await app?.close();
  });

  it("publishes zero, orders the close with a real push and preserves a subsequent withdrawal", async () => {
    const campaign = await prisma.agriculturalCampaign.create({
      data: {
        id: randomUUID(), tenantId: fixture.tenantA, name: "Campaign approval test",
        status: "ABIERTA", isActive: true, startDate: new Date("2025-09-01T00:00:00Z"),
      },
    });
    const product = await prisma.product.create({
      data: { tenantId: fixture.tenantA, name: "Synthetic close product", unit: "L" },
    });
    const http = () => request(app.getHttpServer());
    const close = (session: typeof admin) => http().post(`/api/v1/campaigns/${campaign.id}/close`).set(session).send({});
    const summary = () => http().get(`/api/v1/collective/campaigns/${campaign.id}/summary`).set(director);
    const push = (
      session: typeof farmer, action: "PUBLISH" | "SUPERSEDE" | "CANCEL",
      operationId: string, predecessorOperationId: string | null, quantity?: string,
    ) => http().post("/api/v1/sync/v1/push").set(session).send({
      contractVersion: 1, operationId, action, projectionType: "CONSUMPTION_TOTAL",
      causal: { predecessorOperationId, reconciliationReference: null },
      payload: {
        campaign_ref: campaign.id, product_ref: product.id, base_unit: "ML",
        ...(quantity === undefined ? {} : { quantity_base: quantity }),
      },
    });

    const before = await summary().expect(200);
    expect(before.body.cells).toEqual([]);
    const zeroOperation = randomUUID();
    expect((await push(farmer, "PUBLISH", zeroOperation, null, "0").expect(200)).body.outcome).toBe("APPLIED");
    const zero = await summary().expect(200);
    expect(zero.body.disclosure).toEqual({ mode: "APPROVED", policy: "F07-POL-02", approved: true, threshold: null });
    expect(zero.body.cells).toEqual([expect.objectContaining({ total_base: "0", contributors: 1 })]);
    const preview = await http().get(`/api/v1/collective/campaigns/${campaign.id}/close-preview`).set(admin).expect(200);
    expect(preview.body).toMatchObject({ recoverable_cells: 1, coverage: { members_with_contribution: 1 } });
    await close(outsider).expect(403);

    const [write, first, repeated] = await Promise.all([
      push(second, "PUBLISH", randomUUID(), null, "999").expect(200),
      close(admin).expect(200),
      close(director).expect(200),
    ]);
    expect(first.body).toMatchObject({ status: "CERRADA", isActive: false });
    expect(repeated.body.closedAt).toBe(first.body.closedAt);
    const after = await summary().expect(200);
    expect(after.body.seal.version).toBe(1);
    expect(await prisma.collectiveSeal.count({ where: { campaignId: campaign.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { campaignId: campaign.id, action: "CERRAR_CAMPANA" } })).toBe(1);
    expect(await prisma.calendarEvent.count({ where: { campaignId: campaign.id, type: "CIERRE_CAMPANA" } })).toBe(1);
    if (write.body.outcome === "APPLIED") {
      expect(after.body.cells[0]).toMatchObject({ total_base: "999", contributors: 2 });
    } else {
      expect(write.body).toMatchObject({ outcome: "REJECTED", code: "CAMPAIGN_SEALED" });
      expect(after.body.cells[0]).toMatchObject({ total_base: "0", contributors: 1 });
    }
    const correction = await push(farmer, "SUPERSEDE", randomUUID(), zeroOperation, "41").expect(200);
    expect(correction.body).toMatchObject({ outcome: "REJECTED", code: "CAMPAIGN_SEALED" });
    const withdrawal = await push(farmer, "CANCEL", randomUUID(), zeroOperation).expect(200);
    expect(withdrawal.body.outcome).toBe("APPLIED");
    const withdrawn = await summary().expect(200);
    expect(withdrawn.body.cells[0]).toMatchObject({ status: "WITHDRAWN_AFTER_SEAL", total_base: null });
  }, 30000);

  it("rolls back the campaign, event and audit when PostgreSQL refuses the historical write", async () => {
    const campaign = await prisma.agriculturalCampaign.create({
      data: {
        id: randomUUID(), tenantId: fixture.tenantA, name: "Campaign rollback test",
        status: "ABIERTA", isActive: true, startDate: new Date("2025-09-01T00:00:00Z"),
      },
    });
    const endpoint = `/api/v1/campaigns/${campaign.id}/close`;
    await prisma.$executeRaw`
      CREATE FUNCTION test_history_unavailable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'synthetic historical write failure';
      END;
      $$
    `;
    await prisma.$executeRaw`
      CREATE TRIGGER test_history_unavailable BEFORE INSERT ON "CollectiveSeal"
      FOR EACH ROW EXECUTE FUNCTION test_history_unavailable()
    `;
    try {
      await request(app.getHttpServer()).post(endpoint).set(admin).send({}).expect(500);
      const current = await prisma.agriculturalCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
      expect(current).toMatchObject({ status: "ABIERTA", isActive: true, closedAt: null });
      expect(await prisma.auditLog.count({ where: { campaignId: campaign.id, action: "CERRAR_CAMPANA" } })).toBe(0);
      expect(await prisma.calendarEvent.count({ where: { campaignId: campaign.id, type: "CIERRE_CAMPANA" } })).toBe(0);
      expect(await prisma.collectiveSeal.count({ where: { campaignId: campaign.id } })).toBe(0);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER test_history_unavailable ON "CollectiveSeal"`;
      await prisma.$executeRaw`DROP FUNCTION test_history_unavailable()`;
    }
    await request(app.getHttpServer()).post(endpoint).set(admin).send({}).expect(200);
    expect(await prisma.collectiveSeal.count({ where: { campaignId: campaign.id } })).toBe(1);
  }, 30000);

  it("lets both roles manage an unrelated call while identified details depend on current consent", async () => {
    const campaign = await prisma.agriculturalCampaign.create({
      data: {
        id: randomUUID(), tenantId: fixture.tenantA, name: "Campaign calls test",
        status: "ABIERTA", isActive: true, startDate: new Date("2025-09-01T00:00:00Z"),
      },
    });
    const product = await prisma.product.create({
      data: { tenantId: fixture.tenantA, name: "Synthetic call product", unit: "L" },
    });
    const http = () => request(app.getHttpServer());
    const calls = "/api/v1/joint-purchase-calls";
    const deadline = new Date(Date.now() + 86400000).toISOString();
    const draft = await http().post(calls).set(director).send({
      campaign_id: campaign.id, name: "Synthetic role test", deadline_at: deadline,
      products: [{ product_ref: product.id }],
    }).expect(201);
    const actorId = draft.body.created_by.user_ref;
    const call = `${calls}/${draft.body.call_id}`;
    expect(draft.body).toMatchObject({ can_manage: true, can_view_participants: false });
    await prisma.user.update({ where: { id: actorId }, data: { isActive: false } });
    try {
      await http().patch(call).set(director).send({ name: "Disabled attempt" }).expect(401);
      await http().patch(call).set(admin).send({ name: "Managed by Administration" }).expect(200);
      await http().post(`${call}/open`).set(admin).send({ confirmed: true }).expect(200);
      await http().patch(call).set(admin).send({ name: "State remains protected" }).expect(409);
    } finally {
      await prisma.user.update({ where: { id: actorId }, data: { isActive: true } });
    }
    const myCall = `/api/v1/me/joint-purchase-calls/${draft.body.call_id}`;
    await http().put(`${myCall}/participation`).set({ ...farmer, "x-joint-purchase-contract": "4" }).send({
      operation_id: randomUUID(), sequence: 1,
      consent: { version: "CONV-4", accepted_at: new Date().toISOString() },
      lines: [{ product_ref: product.id, quantity_base: "1234" }],
    }).expect(200);
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: fixture.members.farmerA }, select: { user: { select: { name: true } } },
    });
    const name = member.user.name;
    await http().get(`${call}/participants`).set(director).expect(403);
    const identified = await http().get(`${call}/participants`).set(admin).expect(200);
    expect(JSON.stringify(identified.body)).toContain(name);
    const closed = await http().post(`${call}/close`).set(director).send({ confirmed: true }).expect(200);
    expect(closed.body).toMatchObject({ can_view_participants: false, participants: null });
    expect(JSON.stringify(closed.body)).not.toContain(name);
    const closing = await http().get(`${call}/closing`).set(admin).expect(200);
    expect(JSON.stringify(closing.body.participants)).toContain(name);
  }, 30000);
});
