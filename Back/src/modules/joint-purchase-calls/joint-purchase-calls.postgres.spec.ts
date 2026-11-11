import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, afterEach, beforeAll } from "@jest/globals";
import { UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Server } from "node:net";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  createIsolatedDatabase,
  createSession,
  Fixture,
  seedFixture,
  TestSession,
  unusablePasswordHash,
} from "@/modules/sync-v1/test-support/sync-v1-test-app";
import { JointPurchaseAutoCloseWorker } from "./application/auto-close.worker";
import { AdjustableClock, createE2App } from "./test-support/e2-test-app";

/**
 * E2 (etapa 2), contract §7: joint purchase calls and identified
 * participation against a real PostgreSQL and the real Nest application. The
 * given URL must point to a throwaway server: a new database is created and
 * migrated from zero. Every identity, name and value is synthetic. Time moves
 * through the injected server clock, never the system clock.
 */
const postgresUrl = process.env["E2_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const INST = "/api/v1/joint-purchase-calls";
const ME = "/api/v1/me/joint-purchase-calls";
const HOUR = 3600 * 1000;
const CONSENT = { version: "CONV-1", accepted_at: "2026-11-11T18:20:00.000Z" };

interface Res {
  status: number;
  body: any;
  headers: Record<string, string>;
}

describePostgres("E2 joint purchase calls on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let clock: AdjustableClock;
  let worker: JointPurchaseAutoCloseWorker;
  const jwt = new JwtService();
  let f: Fixture;
  let farmerA: TestSession;
  let farmerA2: TestSession;
  let farmerA3: TestSession;
  let farmerB: TestSession;
  let director: TestSession;
  let director2: TestSession;
  let admin: TestSession;
  let directorB: TestSession;
  const userOf: Record<string, string> = {};
  let campaignA2: string;
  let legacyBefore: Record<string, number>;

  async function addPerson(label: string, tenantId: string, role: UserRole) {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        name: `Usuario sintético ${label}`,
        email: `${label}-${userId}@example.test`,
        passwordHash: unusablePasswordHash(),
        role,
        members: { create: { id: memberId, tenantId, role } },
      },
    });
    return memberId;
  }

  const legacyCounts = async () => ({
    purchase: await prisma.purchase.count(),
    purchaseParticipant: await prisma.purchaseParticipant.count(),
    payableAccount: await prisma.payableAccount.count(),
    payment: await prisma.payment.count(),
    stockMovement: await prisma.stockMovement.count(),
    inventoryLot: await prisma.inventoryLot.count(),
    syncV1Contribution: await prisma.syncV1Contribution.count(),
    syncV1OperationJournal: await prisma.syncV1OperationJournal.count(),
    demandForecast: await prisma.demandForecast.count(),
    collectiveRelease: await prisma.collectiveRelease.count(),
  });

  beforeAll(async () => {
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "e2_calls");
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    ({ app, prisma, clock, worker } = await createE2App(databaseUrl));
    const server = app.getHttpServer() as Server;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    f = await seedFixture(prisma);
    const farmerA3Member = await addPerson("farmerA3", f.tenantA, "AGRICULTOR");
    const director2Member = await addPerson("directorA2", f.tenantA, "DIRECTIVA");
    const directorBMember = await addPerson("directorB", f.tenantB, "DIRECTIVA");
    farmerA = await createSession(prisma, jwt, f.members.farmerA);
    farmerA2 = await createSession(prisma, jwt, f.members.farmerA2);
    farmerA3 = await createSession(prisma, jwt, farmerA3Member);
    farmerB = await createSession(prisma, jwt, f.members.farmerB);
    director = await createSession(prisma, jwt, f.members.directorA);
    director2 = await createSession(prisma, jwt, director2Member);
    admin = await createSession(prisma, jwt, f.members.adminA);
    directorB = await createSession(prisma, jwt, directorBMember);
    for (const member of await prisma.member.findMany({ select: { id: true, userId: true } })) {
      userOf[member.id] = member.userId;
    }
    campaignA2 = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id: campaignA2, tenantId: f.tenantA, name: "Campaña planificada A2", status: "PLANIFICADA", startDate: new Date("2027-01-01T00:00:00.000Z") },
    });
    legacyBefore = await legacyCounts();
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  }, 240000);

  afterEach(() => clock?.reset());

  afterAll(async () => {
    jest.restoreAllMocks();
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => `Bearer ${session.token}`;
  const userIdOf = (session: TestSession) => userOf[session.memberId];

  async function newProduct(unit = "L", tenantId = f.tenantA) {
    const id = randomUUID();
    await prisma.product.create({ data: { id, tenantId, name: `Producto sintético ${id}`, unit } });
    return id;
  }

  const get = (session: TestSession, path: string): Promise<Res> => http().get(path).set("Authorization", auth(session));
  const post = (session: TestSession, path: string, body: object = {}): Promise<Res> =>
    http().post(path).set("Authorization", auth(session)).send(body);
  const patch = (session: TestSession, path: string, body: object): Promise<Res> =>
    http().patch(path).set("Authorization", auth(session)).send(body);
  const put = (session: TestSession, path: string, body: object): Promise<Res> =>
    http().put(path).set("Authorization", auth(session)).send(body);

  async function createDraft(
    products: string[],
    options: { campaignId?: string; responsible?: TestSession; deadlineInMs?: number; proposalId?: string; by?: TestSession } = {},
  ): Promise<Res> {
    return post(options.by ?? director, INST, {
      campaign_id: options.campaignId ?? f.campaigns.openA,
      name: "Compra conjunta sintética",
      deadline_at: new Date(clock.now().getTime() + (options.deadlineInMs ?? 7 * 24 * HOUR)).toISOString(),
      responsible_user_id: userIdOf(options.responsible ?? director2),
      products: products.map((product_ref) => ({ product_ref })),
      ...(options.proposalId ? { source_proposal_id: options.proposalId } : {}),
    });
  }

  async function openCall(products: string[], options: Parameters<typeof createDraft>[1] = {}): Promise<string> {
    const draft = await createDraft(products, options);
    expect(draft.status).toBe(201);
    const opened = await post(options.by ?? director, `${INST}/${draft.body.call_id}/open`, { confirmed: true });
    expect(opened.status).toBe(200);
    return draft.body.call_id;
  }

  function confirm(session: TestSession, callId: string, lines: [string, string][], sequence: number, operationId = randomUUID(), consent: object | null = CONSENT) {
    return put(session, `${ME}/${callId}/participation`, {
      operation_id: operationId,
      sequence,
      ...(consent ? { consent } : {}),
      lines: lines.map(([product_ref, quantity_base]) => ({ product_ref, quantity_base })),
    });
  }

  const withdraw = (session: TestSession, callId: string, sequence: number, operationId = randomUUID()) =>
    post(session, `${ME}/${callId}/participation/withdraw`, { operation_id: operationId, sequence });

  describe("transitions and immutability", () => {
    it("creates a draft, refuses edits after opening, and keeps final states final", async () => {
      const p = await newProduct();
      const draft = await createDraft([p]);
      expect(draft.status).toBe(201);
      expect(draft.headers["cache-control"]).toBe("no-store");
      expect(draft.body).toMatchObject({ status: "DRAFT", participant_count: 0, totals_source: "NONE", can_view_participants: false });
      expect(draft.body.history.map((e: any) => e.kind)).toEqual(["CREATED", "RESPONSIBLE_ASSIGNED"]);
      const id = draft.body.call_id;

      const renamed = await patch(director, `${INST}/${id}`, { name: "Compra conjunta renombrada" });
      expect(renamed.status).toBe(200);
      expect(renamed.body.name).toBe("Compra conjunta renombrada");

      expect((await post(director, `${INST}/${id}/close`, { confirmed: true })).body).toEqual({
        errorCode: "INVALID_TRANSITION",
        status: "DRAFT",
      });
      expect((await post(director, `${INST}/${id}/open`, {})).body).toEqual({ errorCode: "CONFIRMATION_REQUIRED" });
      const opened = await post(director, `${INST}/${id}/open`, { confirmed: true });
      expect(opened.status).toBe(200);
      expect(opened.body.status).toBe("OPEN");
      expect(opened.body.opened_at).not.toBeNull();

      const again = await post(director, `${INST}/${id}/open`, { confirmed: true });
      expect(again.status).toBe(409);
      expect(again.body).toEqual({ errorCode: "INVALID_TRANSITION", status: "OPEN" });
      const edit = await patch(director, `${INST}/${id}`, { name: "Otro nombre" });
      expect(edit.status).toBe(409);
      expect(edit.body).toEqual({ errorCode: "CALL_NOT_EDITABLE", status: "OPEN" });

      // The database refuses the same changes behind the application's back.
      await expect(prisma.jointPurchaseCall.update({ where: { id }, data: { name: "x" } })).rejects.toThrow();
      await expect(
        prisma.jointPurchaseCall.update({ where: { id }, data: { deadlineAt: new Date(Date.now() + 99 * HOUR) } }),
      ).rejects.toThrow();
      await expect(prisma.jointPurchaseCallProduct.deleteMany({ where: { callId: id } })).rejects.toThrow();
      await expect(prisma.jointPurchaseCall.update({ where: { id }, data: { status: "DRAFT", openedAt: null, openedByUserId: null } })).rejects.toThrow();
      const event = await prisma.jointPurchaseCallEvent.findFirstOrThrow({ where: { callId: id } });
      await expect(prisma.jointPurchaseCallEvent.update({ where: { id: event.id }, data: { detail: "x" } })).rejects.toThrow();
      await expect(prisma.jointPurchaseCallEvent.delete({ where: { id: event.id } })).rejects.toThrow();

      const closed = await post(director, `${INST}/${id}/close`, { confirmed: true });
      expect(closed.status).toBe(200);
      expect((await post(director, `${INST}/${id}/cancel`, { confirmed: true, reason: "Motivo sintético" })).body).toEqual({
        errorCode: "INVALID_TRANSITION",
        status: "CLOSED",
      });
      const line = await prisma.jointPurchaseCallClosingLine.findFirstOrThrow({ where: { callId: id } });
      await expect(
        prisma.jointPurchaseCallClosingLine.update({
          where: { callId_productId: { callId: id, productId: line.productId } },
          data: { totalQuantityBase: 1n },
        }),
      ).rejects.toThrow();
      await expect(prisma.jointPurchaseCallClosing.delete({ where: { callId: id } })).rejects.toThrow();
    });

    it("validates products, responsible, campaign and deadline", async () => {
      const ok = await newProduct();
      const inactive = await newProduct();
      await prisma.product.update({ where: { id: inactive }, data: { isActive: false } });
      const unit = await newProduct("unidad");
      const alias = await newProduct();
      await prisma.productCanonicalAssociation.create({
        data: { tenantId: f.tenantA, productId: alias, canonicalProductId: ok, actorUserId: userIdOf(director), reason: "Sintético" },
      });
      const foreign = await newProduct("L", f.tenantB);
      const code = async (products: string[], options: Parameters<typeof createDraft>[1] = {}) => {
        const res = await createDraft(products, options);
        return `${res.status} ${res.body.errorCode ?? ""}`.trim();
      };
      expect(await code([inactive])).toBe("422 PRODUCT_INACTIVE");
      expect(await code([unit])).toBe("422 PRODUCT_UNIT_UNSUPPORTED");
      expect(await code([alias])).toBe("422 PRODUCT_NOT_CANONICAL");
      expect(await code([foreign])).toBe("404 PRODUCT_NOT_FOUND");
      expect(await code([ok, ok])).toBe("422 PRODUCT_DUPLICATED");
      expect(await code([ok], { responsible: farmerA })).toBe("422 RESPONSIBLE_NOT_ELIGIBLE");
      expect(await code([ok], { responsible: directorB })).toBe("422 RESPONSIBLE_NOT_ELIGIBLE");
      expect(await code([ok], { campaignId: f.campaigns.closedA })).toBe("422 CAMPAIGN_NOT_ELIGIBLE");
      expect(await code([ok], { campaignId: f.campaigns.openB })).toBe("404 CAMPAIGN_NOT_FOUND");
      expect(await code([ok], { deadlineInMs: -HOUR })).toBe("422 DEADLINE_IN_PAST");
      expect(await code([ok], { responsible: director })).toBe("201");

      // A deadline that passes while the call is a draft is refused at opening.
      const draft = await createDraft([ok], { deadlineInMs: HOUR });
      clock.advance(2 * HOUR);
      const late = await post(director, `${INST}/${draft.body.call_id}/open`, { confirmed: true });
      expect(late.status).toBe(422);
      expect(late.body).toEqual({ errorCode: "DEADLINE_IN_PAST" });
    });

    it("lists eligible responsibles: active Directiva and Administración of the tenant only", async () => {
      const res = await get(director, `${INST}/eligible-responsibles`);
      expect(res.status).toBe(200);
      const refs = res.body.users.map((u: any) => u.user_ref).sort();
      expect(refs).toEqual([userIdOf(director), userIdOf(director2), userIdOf(admin)].sort());
      expect(res.body.users.every((u: any) => ["DIRECTIVA", "ADMINISTRADOR"].includes(u.role))).toBe(true);
    });
  });

  describe("open products are unique per campaign (E2-D3)", () => {
    it("lets exactly one of two concurrent openings win in the same campaign", async () => {
      const shared = await newProduct();
      const one = await createDraft([shared]);
      const two = await createDraft([shared, await newProduct()]);
      const results = await Promise.all([
        post(director, `${INST}/${one.body.call_id}/open`, { confirmed: true }),
        post(admin, `${INST}/${two.body.call_id}/open`, { confirmed: true }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body).toEqual({ errorCode: "PRODUCT_IN_OPEN_CALL" });
      expect(
        await prisma.jointPurchaseCallProduct.count({ where: { productId: shared, openCampaignId: { not: null } } }),
      ).toBe(1);
      // Cancelling the winner releases the product for the other call.
      const winner = results[0].status === 200 ? one : two;
      const loser = results[0].status === 200 ? two : one;
      expect((await post(director, `${INST}/${winner.body.call_id}/cancel`, { confirmed: true, reason: "Sintético" })).status).toBe(200);
      expect((await post(director, `${INST}/${loser.body.call_id}/open`, { confirmed: true })).status).toBe(200);
    });

    it("allows the same product open in different campaigns", async () => {
      const shared = await newProduct();
      const one = await createDraft([shared]);
      const two = await createDraft([shared], { campaignId: campaignA2 });
      const results = await Promise.all([
        post(director, `${INST}/${one.body.call_id}/open`, { confirmed: true }),
        post(director, `${INST}/${two.body.call_id}/open`, { confirmed: true }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
    });
  });

  describe("authorization", () => {
    it("refuses farmers on institutional routes, other tenants and institutional users on farmer routes", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      expect((await get(farmerA, INST)).status).toBe(403);
      expect((await get(farmerA, INST)).body).toEqual({ errorCode: "AUTH_CONTEXT_FORBIDDEN" });
      expect((await createDraft([p], { by: farmerA })).status).toBe(403);
      expect((await get(farmerA, `${INST}/${id}/participants`)).status).toBe(403);
      const foreign = await get(directorB, `${INST}/${id}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ errorCode: "CALL_NOT_FOUND" });
      expect((await get(directorB, `${INST}/${id}/participants`)).status).toBe(404);
      expect((await post(directorB, `${INST}/${id}/close`, { confirmed: true })).status).toBe(404);
      expect((await get(directorB, INST)).body.calls).toEqual([]);
      const farmerOther = await confirm(farmerB, id, [[p, "10"]], 1);
      expect(farmerOther.status).toBe(404);
      expect(farmerOther.body).toEqual({ errorCode: "CALL_NOT_FOUND" });
      expect((await get(director, ME)).status).toBe(403);
      expect((await get(farmerB, ME)).body.calls.some((c: any) => c.call_id === id)).toBe(false);
      expect((await get(director, `${INST}/not-a-uuid`)).status).toBe(404);
    });

    it("shows identified participants only to the responsible, whatever the role", async () => {
      const p1 = await newProduct();
      const p2 = await newProduct("kg");
      const id = await openCall([p1, p2]);
      expect((await confirm(farmerA, id, [[p1, "1500"], [p2, "300"]], 1)).status).toBe(200);
      expect((await confirm(farmerA2, id, [[p1, "500"]], 1)).status).toBe(200);

      for (const other of [director, admin]) {
        const denied = await get(other, `${INST}/${id}/participants`);
        expect(denied.status).toBe(403);
        expect(denied.body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
        const detail = await get(other, `${INST}/${id}`);
        expect(detail.body.can_view_participants).toBe(false);
        expect(detail.body.participant_count).toBe(2);
        expect(detail.body.products.map((p: any) => p.totals)).toEqual([
          { participant_count: 2, total_quantity_base: null, visibility: "RESPONSIBLE_ONLY" },
          { participant_count: 1, total_quantity_base: null, visibility: "RESPONSIBLE_ONLY" },
        ]);
        const text = JSON.stringify(detail.body);
        expect(text).not.toContain("farmerA");
        expect(text).not.toContain("1500");
      }

      const allowed = await get(director2, `${INST}/${id}/participants`);
      expect(allowed.status).toBe(200);
      expect(allowed.body).toMatchObject({ provisional: true, notice: "Lista provisional: puede cambiar hasta el cierre", participant_count: 2 });
      const names = allowed.body.participants.map((p: any) => p.name).sort();
      expect(names).toEqual(["Usuario sintético farmerA", "Usuario sintético farmerA2"]);
      const responsibleDetail = await get(director2, `${INST}/${id}`);
      expect(responsibleDetail.body.can_view_participants).toBe(true);
      expect(responsibleDetail.body.is_responsible).toBe(true);
      expect(responsibleDetail.body.products[0].totals).toEqual({ participant_count: 2, total_quantity_base: "2000", visibility: "VISIBLE" });

      // Closing: totals and counts for everyone (E2-D7); per-person detail only for the responsible.
      const closed = await post(director, `${INST}/${id}/close`, { confirmed: true });
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({ status: "CLOSED", mode: "MANUAL", participant_count: 2, can_view_participants: false, participants: null });
      expect(closed.body.lines.map((l: any) => [l.participant_count, l.total_quantity_base])).toEqual([[2, null], [1, null]]);
      const adminClosing = await get(admin, `${INST}/${id}/closing`);
      expect(adminClosing.body.participants).toBeNull();
      const responsibleClosing = await get(director2, `${INST}/${id}/closing`);
      expect(responsibleClosing.body.can_view_participants).toBe(true);
      expect(responsibleClosing.body.lines.map((l: any) => l.total_quantity_base)).toEqual(["2000", "300"]);
      expect(responsibleClosing.body.participants).toHaveLength(2);
      // An ADMINISTRADOR who is the responsible sees them through the permission, not the role.
      const adminCall = await openCall([await newProduct()], { responsible: admin });
      expect((await get(admin, `${INST}/${adminCall}/participants`)).status).toBe(200);
      expect((await get(director2, `${INST}/${adminCall}/participants`)).status).toBe(403);
    });
  });

  describe("farmer participation", () => {
    it("requires the current consent and records it", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      const without = await confirm(farmerA, id, [[p, "100"]], 1, randomUUID(), null);
      expect(without.status).toBe(409);
      expect(without.body).toEqual({ errorCode: "CONSENT_REQUIRED" });
      const outdated = await confirm(farmerA, id, [[p, "100"]], 2, randomUUID(), { version: "CONV-0", accepted_at: CONSENT.accepted_at });
      expect(outdated.body).toEqual({ errorCode: "CONSENT_REQUIRED" });
      expect(await prisma.jointPurchaseParticipation.count({ where: { callId: id } })).toBe(0);
      const ok = await confirm(farmerA, id, [[p, "100"]], 3);
      expect(ok.status).toBe(200);
      expect(ok.headers["cache-control"]).toBe("no-store");
      expect(ok.body.participation.consent.version).toBe("CONV-1");
      expect(ok.body.participation.consent.accepted_at).toBe(CONSENT.accepted_at);
      const row = await prisma.jointPurchaseParticipation.findFirstOrThrow({ where: { callId: id } });
      expect(row.consentVersion).toBe("CONV-1");
      expect(row.consentAcceptedAt.toISOString()).toBe(CONSENT.accepted_at);
      expect(Math.abs(row.consentReceivedAt.getTime() - Date.now())).toBeLessThan(60_000);
      expect((await confirm(farmerA, id, [[await newProduct(), "1"]], 4)).body).toEqual({ errorCode: "PRODUCT_NOT_IN_CALL" });
      expect((await confirm(farmerA, id, [[p, "0"]], 5)).body).toEqual({ errorCode: "QUANTITY_INVALID" });
      expect((await confirm(farmerA, id, [[p, "1.5"]], 6)).status).toBe(422);
      const extra = await put(farmerA, `${ME}/${id}/participation`, { operation_id: randomUUID(), sequence: 7, lines: [], debt: true });
      expect(extra.status).toBe(400);
      expect(extra.body).toEqual({ errorCode: "PAYLOAD_INVALID" });
      const malformed = await http()
        .put(`${ME}/${id}/participation`)
        .set("Authorization", auth(farmerA))
        .set("Content-Type", "application/json")
        .send('{"operation_id": "x", "lines": [');
      expect(malformed.status).toBe(400);
      expect(malformed.body).toEqual({ errorCode: "PAYLOAD_INVALID" });
    });

    it("is idempotent by operation_id and ordered by sequence", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      const op = randomUUID();
      const first = await confirm(farmerA, id, [[p, "250"]], 1, op);
      const again = await confirm(farmerA, id, [[p, "250"]], 1, op);
      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      // Double tap: both answers equal, one effect.
      const tap = randomUUID();
      const taps = await Promise.all([confirm(farmerA, id, [[p, "260"]], 2, tap), confirm(farmerA, id, [[p, "260"]], 2, tap)]);
      expect(taps.map((r) => r.status)).toEqual([200, 200]);
      expect(taps[0].body).toEqual(taps[1].body);
      expect(await prisma.jointPurchaseParticipationOperation.count({ where: { callId: id } })).toBe(2);
      expect(await prisma.jointPurchaseParticipation.count({ where: { callId: id } })).toBe(1);

      const reused = await confirm(farmerA, id, [[p, "999"]], 1, op);
      expect(reused.status).toBe(409);
      expect(reused.body).toEqual({ errorCode: "OPERATION_ID_REUSED" });

      expect((await confirm(farmerA, id, [[p, "300"]], 3)).status).toBe(200);
      const stale = await confirm(farmerA, id, [[p, "200"]], 2);
      expect(stale.status).toBe(409);
      expect(stale.body.errorCode).toBe("STALE_SEQUENCE");
      expect(stale.body.participation).toMatchObject({ status: "ACTIVE", last_sequence: 3, lines: [{ product_ref: p, quantity_base: "300" }] });
      const line = await prisma.jointPurchaseParticipationLine.findFirstOrThrow({ where: { participation: { callId: id } } });
      expect(line.quantityBase).toBe(300n);
      // The retry of an accepted operation keeps its answer even after later ones.
      expect((await confirm(farmerA, id, [[p, "250"]], 1, op)).body).toEqual(first.body);
    });

    it("modifies and withdraws while open; withdraw is idempotent", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      expect((await confirm(farmerA, id, [[p, "100"]], 1)).status).toBe(200);
      const changed = await confirm(farmerA, id, [[p, "200"]], 2);
      expect(changed.body.participation.lines).toEqual([{ product_ref: p, base_unit: "ML", quantity_base: "200" }]);
      const op = randomUUID();
      const out = await withdraw(farmerA, id, 3, op);
      expect(out.status).toBe(200);
      expect(out.body).toMatchObject({ outcome: "ACCEPTED", participation: { status: "WITHDRAWN", lines: [], last_sequence: 3 } });
      expect((await withdraw(farmerA, id, 3, op)).body).toEqual(out.body);
      expect((await get(director, `${INST}/${id}`)).body.participant_count).toBe(0);
      const back = await confirm(farmerA, id, [[p, "50"]], 4);
      expect(back.body.participation.status).toBe("ACTIVE");
      // Withdrawing without a participation is accepted and orders later operations.
      const none = await withdraw(farmerA2, id, 5);
      expect(none.body).toEqual({ outcome: "ACCEPTED", participation: null });
      expect((await confirm(farmerA2, id, [[p, "1"]], 4)).body.errorCode).toBe("STALE_SEQUENCE");
    });

    it("lists open calls and own participation only", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      const draft = await createDraft([await newProduct()]);
      await confirm(farmerA, id, [[p, "70"]], 1);
      const mine = await get(farmerA, ME);
      expect(mine.status).toBe(200);
      expect(mine.body.consent.version).toBe("CONV-1");
      const item = mine.body.calls.find((c: any) => c.call_id === id);
      expect(item).toMatchObject({
        status: "OPEN",
        accepts_operations: true,
        responsible: { name: "Usuario sintético directorA2" },
        products: [{ product_ref: p, unit: "L", base_unit: "ML" }],
        participation: { status: "ACTIVE", lines: [{ product_ref: p, quantity_base: "70" }] },
        closing: null,
      });
      expect(mine.body.calls.some((c: any) => c.call_id === draft.body.call_id)).toBe(false);
      const theirs = await get(farmerA2, ME);
      const other = theirs.body.calls.find((c: any) => c.call_id === id);
      expect(other.participation).toBeNull();
      expect(JSON.stringify(theirs.body)).not.toContain('"70"');
    });
  });

  describe("deadline, closing and cancellation", () => {
    it("refuses operations after the deadline and the automatic close cuts at the deadline", async () => {
      const p = await newProduct();
      const id = await openCall([p], { deadlineInMs: HOUR });
      const op = randomUUID();
      const accepted = await confirm(farmerA, id, [[p, "400"]], 1, op);
      expect(accepted.status).toBe(200);
      clock.advance(2 * HOUR);
      const late = await confirm(farmerA2, id, [[p, "900"]], 1);
      expect(late.status).toBe(409);
      expect(late.body).toEqual({ errorCode: "CALL_NOT_OPEN", reason: "DEADLINE_PASSED" });
      expect((await get(farmerA, ME)).body.calls.find((c: any) => c.call_id === id).accepts_operations).toBe(false);
      const detail = await get(director, `${INST}/${id}`);
      expect(detail.body.status).toBe("OPEN");

      const closedIds = await worker.runOnce();
      expect(closedIds).toContain(id);
      const closing = await get(director2, `${INST}/${id}/closing`);
      expect(closing.body).toMatchObject({ mode: "AUTOMATIC", closed_by: null, participant_count: 1, cutoff_at: detail.body.deadline_at });
      expect(closing.body.lines[0].total_quantity_base).toBe("400");
      // The accepted operation's retry still gets its answer; a new one is CLOSED.
      expect((await confirm(farmerA, id, [[p, "400"]], 1, op)).body).toEqual(accepted.body);
      expect((await confirm(farmerA, id, [[p, "1"]], 2)).body).toEqual({ errorCode: "CALL_NOT_OPEN", reason: "CLOSED" });
      expect(await worker.runOnce()).not.toContain(id);
      const own = (await get(farmerA, ME)).body.calls.find((c: any) => c.call_id === id);
      expect(own.closing).toMatchObject({ included: true, lines: [{ product_ref: p, quantity_base: "400" }] });
    });

    it("never accepts a confirmation that the concurrent close leaves out", async () => {
      for (let round = 0; round < 4; round++) {
        const p = await newProduct();
        const id = await openCall([p]);
        await confirm(farmerA, id, [[p, "10"]], 1);
        const [closeRes, confirmRes] = await Promise.all([
          post(director, `${INST}/${id}/close`, { confirmed: true }),
          confirm(farmerA2, id, [[p, "20"]], 1),
        ]);
        expect(closeRes.status).toBe(200);
        const members = (await prisma.jointPurchaseCallClosingParticipant.findMany({ where: { callId: id } })).map((r) => r.memberId);
        if (confirmRes.status === 200) {
          expect(members).toContain(f.members.farmerA2);
        } else {
          expect(confirmRes.body).toEqual({ errorCode: "CALL_NOT_OPEN", reason: "CLOSED" });
          expect(members).not.toContain(f.members.farmerA2);
        }
      }
    });

    it("closes idempotently and counts a person once across products", async () => {
      const p1 = await newProduct();
      const p2 = await newProduct("KG");
      const id = await openCall([p1, p2]);
      await confirm(farmerA, id, [[p1, "100"], [p2, "5"]], 1);
      await confirm(farmerA2, id, [[p1, "200"]], 1);
      await confirm(farmerA3, id, [[p1, "300"], [p2, "7"]], 1);
      const first = await post(director, `${INST}/${id}/close`, { confirmed: true });
      const second = await post(admin, `${INST}/${id}/close`, { confirmed: true });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.closed_at).toBe(first.body.closed_at);
      expect(second.body.lines).toEqual(first.body.lines);
      expect(first.body.participant_count).toBe(3);
      // p1 reaches the threshold (3 persons): its total is visible to the Directiva; p2 (2) is not.
      expect(first.body.lines.map((l: any) => [l.participant_count, l.total_quantity_base, l.visibility])).toEqual([
        [3, "600", "VISIBLE"],
        [2, null, "UNDER_THRESHOLD"],
      ]);
      expect(await prisma.jointPurchaseCallClosing.count({ where: { callId: id } })).toBe(1);
      expect(await prisma.jointPurchaseCallEvent.count({ where: { callId: id, kind: "CLOSED" } })).toBe(1);
      const audit = await prisma.auditLog.findMany({ where: { entityId: id } });
      expect(audit.every((a) => a.ownerUserId === null)).toBe(true);
      expect(JSON.stringify(audit)).not.toMatch(/farmerA|"600"|"100"/);
      expect((await get(director, `${INST}?status=CLOSED`)).body.calls.find((c: any) => c.call_id === id).participant_count).toBe(3);
    });

    it("cancels with participations: kept, without closing, products released", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      await confirm(farmerA, id, [[p, "80"]], 1);
      expect((await post(director, `${INST}/${id}/cancel`, { confirmed: true })).body).toEqual({ errorCode: "REASON_REQUIRED" });
      const cancelled = await post(director, `${INST}/${id}/cancel`, { confirmed: true, reason: "Proveedor sintético sin stock" });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body).toMatchObject({ status: "CANCELLED", cancel_reason: "Proveedor sintético sin stock" });
      expect((await post(director, `${INST}/${id}/cancel`, { confirmed: true, reason: "Otra vez" })).status).toBe(200);
      expect(await prisma.jointPurchaseParticipation.count({ where: { callId: id, status: "ACTIVE" } })).toBe(1);
      expect(await prisma.jointPurchaseCallClosing.count({ where: { callId: id } })).toBe(0);
      expect((await get(director, `${INST}/${id}/closing`)).body).toEqual({ errorCode: "CALL_NOT_CLOSED", status: "CANCELLED" });
      expect((await confirm(farmerA, id, [[p, "1"]], 2)).body).toEqual({ errorCode: "CALL_NOT_OPEN", reason: "CANCELLED" });
      const listed = (await get(farmerA, ME)).body.calls.find((c: any) => c.call_id === id);
      expect(listed).toMatchObject({ status: "CANCELLED", closing: null, participation: { status: "ACTIVE" } });
      expect(await openCall([p])).toBeTruthy();
    });
  });

  describe("reference from a draft proposal (E2-D14)", () => {
    it("shows the disclosed figure while its release is not withdrawn, else «sin cifra»", async () => {
      const p = await newProduct();
      const release = await prisma.collectiveRelease.create({
        data: {
          tenantId: f.tenantA,
          campaignId: f.campaigns.openA,
          canonicalProductId: p,
          projectionType: "DECLARED_NEED",
          baseUnit: "ML",
          totalBase: 12345n,
          contributorCount: 3,
        },
      });
      const proposal = await prisma.jointPurchaseProposal.create({
        data: {
          tenantId: f.tenantA,
          campaignId: f.campaigns.openA,
          inputsFingerprint: "a".repeat(64),
          linkedMembers: 3,
          membersWithContribution: 3,
          generatedByUserId: userIdOf(director),
          lines: { create: [{ position: 0, canonicalProductId: p, baseUnit: "ML", status: "DISCLOSED", releaseId: release.id }] },
        },
      });
      const other = await newProduct();
      const draft = await createDraft([p, other], { proposalId: proposal.id });
      expect(draft.status).toBe(201);
      expect(draft.body.source_proposal_ref).toBe(proposal.id);
      expect(draft.body.products[0].reference).toMatchObject({ status: "DISCLOSED", quantity_base: "12345", position: 0 });
      expect(draft.body.products[1].reference).toBeNull();
      await prisma.collectiveRelease.update({ where: { id: release.id }, data: { withdrawnAt: new Date() } });
      const after = await get(director, `${INST}/${draft.body.call_id}`);
      expect(after.body.products[0].reference).toMatchObject({ status: "NO_FIGURE", label: "Sin cifra", quantity_base: null });
      const wrongCampaign = await createDraft([p], { proposalId: proposal.id, campaignId: campaignA2 });
      expect(wrongCampaign.body).toEqual({ errorCode: "PROPOSAL_CAMPAIGN_MISMATCH" });
    });
  });

  describe("no effects outside E2", () => {
    it("leaves purchases, debts, payments, stock, Sync v1 and forecasts untouched", async () => {
      expect(await legacyCounts()).toEqual({ ...legacyBefore, collectiveRelease: legacyBefore.collectiveRelease + 1 });
      const stocked = await prisma.product.findUniqueOrThrow({ where: { id: f.products.liquidA } });
      expect(stocked.currentStock.toString()).toBe("40");
    });
  });
});
