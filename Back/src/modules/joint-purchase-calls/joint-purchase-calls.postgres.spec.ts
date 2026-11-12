import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, afterEach, beforeAll } from "@jest/globals";
import { UserRole } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
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
    userOf[memberId] = userId;
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
  /** N7: the phone that reads contract 2 (§10.6) says so; without the header the answer keeps the contract 1 shape. */
  const get2 = (session: TestSession, path: string): Promise<Res> =>
    http().get(path).set("Authorization", auth(session)).set("X-Joint-Purchase-Contract", "2");
  const put2 = (session: TestSession, path: string, body: object): Promise<Res> =>
    http().put(path).set("Authorization", auth(session)).set("X-Joint-Purchase-Contract", "2").send(body);

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

  /**
   * E2-P3 (§10.2): opening needs the responsible or MANAGE, so the call is
   * opened by its responsible (director2 by default) unless `openBy` says
   * otherwise. Before §10.2 the creator (any Directiva) opened it.
   */
  async function openCall(
    products: string[],
    options: Parameters<typeof createDraft>[1] & { openBy?: TestSession } = {},
  ): Promise<string> {
    const draft = await createDraft(products, options);
    expect(draft.status).toBe(201);
    const opened = await post(options.openBy ?? options.responsible ?? director2, `${INST}/${draft.body.call_id}/open`, { confirmed: true });
    expect(opened.status).toBe(200);
    return draft.body.call_id;
  }

  /** §10.2: the responsible grants a permission to another institutional user. */
  async function grantAccess(callId: string, to: TestSession, grant: "PARTICIPANTS" | "MANAGE", by: TestSession = director2) {
    const res = await post(by, `${INST}/${callId}/collaborators`, { user_ref: userIdOf(to), grant, confirmed: true });
    expect(res.status).toBe(200);
    return res;
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

  /** §10.6 (P-C): a consent decision of its own, with its own order. */
  const decide = (
    session: TestSession,
    callId: string,
    scope: "COLLABORATORS" | "RESPONSIBLE_ONLY",
    sequence: number,
    operationId = randomUUID(),
    version = "CONV-3",
    decidedAt = "2026-11-12T10:00:00.000Z",
  ) =>
    post(session, `${ME}/${callId}/participation/consent`, {
      operation_id: operationId,
      sequence,
      scope,
      consent: { version, decided_at: decidedAt },
    });

  describe("transitions and immutability", () => {
    it("creates a draft, refuses edits after opening, and keeps final states final", async () => {
      const p = await newProduct();
      const draft = await createDraft([p]);
      expect(draft.status).toBe(201);
      expect(draft.headers["cache-control"]).toBe("no-store");
      expect(draft.body).toMatchObject({ status: "DRAFT", participant_count: 0, totals_source: "NONE", can_view_participants: false });
      expect(draft.body.history.map((e: any) => e.kind)).toEqual(["CREATED", "RESPONSIBLE_ASSIGNED"]);
      const id = draft.body.call_id;

      // E2-P3: the creator (director) is not the responsible (director2) and holds no MANAGE.
      expect((await patch(director, `${INST}/${id}`, { name: "Sin permiso" })).body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      const renamed = await patch(director2, `${INST}/${id}`, { name: "Compra conjunta renombrada" });
      expect(renamed.status).toBe(200);
      expect(renamed.body.name).toBe("Compra conjunta renombrada");

      expect((await post(director2, `${INST}/${id}/close`, { confirmed: true })).body).toEqual({
        errorCode: "INVALID_TRANSITION",
        status: "DRAFT",
      });
      expect((await post(director2, `${INST}/${id}/open`, {})).body).toEqual({ errorCode: "CONFIRMATION_REQUIRED" });
      const opened = await post(director2, `${INST}/${id}/open`, { confirmed: true });
      expect(opened.status).toBe(200);
      expect(opened.body.status).toBe("OPEN");
      expect(opened.body.opened_at).not.toBeNull();

      const again = await post(director2, `${INST}/${id}/open`, { confirmed: true });
      expect(again.status).toBe(409);
      expect(again.body).toEqual({ errorCode: "INVALID_TRANSITION", status: "OPEN" });
      const edit = await patch(director2, `${INST}/${id}`, { name: "Otro nombre" });
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

      const closed = await post(director2, `${INST}/${id}/close`, { confirmed: true });
      expect(closed.status).toBe(200);
      expect((await post(director2, `${INST}/${id}/cancel`, { confirmed: true, reason: "Motivo sintético" })).body).toEqual({
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
      const late = await post(director2, `${INST}/${draft.body.call_id}/open`, { confirmed: true });
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
      // E2-P3: each call is opened by its own responsible (two different users, as before).
      const one = await createDraft([shared]);
      const two = await createDraft([shared, await newProduct()], { responsible: admin });
      const results = await Promise.all([
        post(director2, `${INST}/${one.body.call_id}/open`, { confirmed: true }),
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
      const responsibleOf = (draft: Res) => (draft === one ? director2 : admin);
      expect((await post(responsibleOf(winner), `${INST}/${winner.body.call_id}/cancel`, { confirmed: true, reason: "Sintético" })).status).toBe(200);
      expect((await post(responsibleOf(loser), `${INST}/${loser.body.call_id}/open`, { confirmed: true })).status).toBe(200);
    });

    it("N1: drafts in PLANIFICADA or ABIERTA, opening only in ABIERTA; the same product open in different campaigns", async () => {
      const shared = await newProduct();
      const one = await createDraft([shared]);
      const two = await createDraft([shared], { campaignId: campaignA2 });
      expect(two.status).toBe(201);
      // A PLANIFICADA campaign takes and edits drafts, but nothing is opened in it.
      expect((await patch(director2, `${INST}/${two.body.call_id}`, { name: "Borrador en campaña planificada" })).status).toBe(200);
      expect((await post(director2, `${INST}/${two.body.call_id}/open`, { confirmed: true })).body).toEqual({ errorCode: "CAMPAIGN_NOT_ELIGIBLE" });
      await prisma.agriculturalCampaign.update({ where: { id: campaignA2 }, data: { status: "ABIERTA" } });
      try {
        const results = await Promise.all([
          post(director2, `${INST}/${one.body.call_id}/open`, { confirmed: true }),
          post(director2, `${INST}/${two.body.call_id}/open`, { confirmed: true }),
        ]);
        expect(results.map((r) => r.status)).toEqual([200, 200]);
      } finally {
        await prisma.agriculturalCampaign.update({ where: { id: campaignA2 }, data: { status: "PLANIFICADA" } });
      }
    });

    it("N1: a campaign that changes state never cancels a call nor blocks closing or cancelling it", async () => {
      const campaign = randomUUID();
      await prisma.agriculturalCampaign.create({
        data: { id: campaign, tenantId: f.tenantA, name: "Campaña sintética N1", status: "ABIERTA", startDate: new Date("2026-10-01T00:00:00.000Z") },
      });
      const draft = await createDraft([await newProduct()], { campaignId: campaign });
      const open = await openCall([await newProduct()], { campaignId: campaign });
      await prisma.agriculturalCampaign.update({ where: { id: campaign }, data: { status: "CERRADA" } });
      // Nothing changed by itself.
      expect((await get(director2, `${INST}/${open}`)).body.status).toBe("OPEN");
      expect((await get(director2, `${INST}/${draft.body.call_id}`)).body.status).toBe("DRAFT");
      // A draft is no longer edited nor opened there, but it can be cancelled; the open call can be closed.
      expect((await patch(director2, `${INST}/${draft.body.call_id}`, { name: "Otro" })).body).toEqual({ errorCode: "CAMPAIGN_NOT_ELIGIBLE" });
      expect((await post(director2, `${INST}/${draft.body.call_id}/open`, { confirmed: true })).body).toEqual({ errorCode: "CAMPAIGN_NOT_ELIGIBLE" });
      expect((await post(director2, `${INST}/${draft.body.call_id}/cancel`, { confirmed: true, reason: "Campaña cerrada (sintético)" })).status).toBe(200);
      expect((await post(director2, `${INST}/${open}/close`, { confirmed: true })).status).toBe(200);
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
      // E2-P3: closing by hand needs MANAGE; the responsible grants it to director, who closes and
      // still sees what anyone without PARTICIPANTS sees (MANAGE never shows participants).
      expect((await post(director, `${INST}/${id}/close`, { confirmed: true })).body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      await grantAccess(id, director, "MANAGE");
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
      const mine = await get2(farmerA, ME);
      expect(mine.status).toBe(200);
      // Contract 2 (§10.6): CONV-3 is the published version (CONV-1 and CONV-2 are still accepted).
      expect(mine.body).toMatchObject({ contractVersion: 2, consent: { version: "CONV-3" }, history: { older_count: 0 } });
      const item = mine.body.calls.find((c: any) => c.call_id === id);
      expect(item.participation.consent_scope).toMatchObject({ scope: "RESPONSIBLE_ONLY", version: "CONV-1", sequence: 0 });

      // N7: without the header, exactly the keys and the CONV-1 text the published versions accept.
      const legacy = await get(farmerA, ME);
      expect(Object.keys(legacy.body).sort()).toEqual(["calls", "consent", "contractVersion", "server_time"]);
      expect(legacy.body.contractVersion).toBe(1);
      expect(legacy.body.consent).toEqual({
        version: "CONV-1",
        text: "El responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas para coordinar la compra y la entrega. Esta confirmación no genera una deuda.",
      });
      const legacyItem = legacy.body.calls.find((c: any) => c.call_id === id);
      expect(Object.keys(legacyItem.participation).sort()).toEqual(["accepted_at", "consent", "last_operation_id", "last_sequence", "lines", "status"]);
      expect(Object.keys(legacyItem.participation.consent).sort()).toEqual(["accepted_at", "received_at", "version"]);
      // Same data otherwise.
      expect({ ...legacyItem, participation: null, server_time: null }).toEqual({ ...item, participation: null, server_time: null });
      // An accepted operation answers in the shape of the phone's contract.
      const legacyAnswer = await confirm(farmerA, id, [[p, "70"]], 2);
      expect(Object.keys(legacyAnswer.body.participation).sort()).toEqual(["accepted_at", "consent", "last_operation_id", "last_sequence", "lines", "status"]);
      const stale = await confirm(farmerA, id, [[p, "71"]], 1);
      expect(stale.body.errorCode).toBe("STALE_SEQUENCE");
      expect(stale.body.participation.consent_scope).toBeUndefined();
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
          post(director2, `${INST}/${id}/close`, { confirmed: true }),
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
      // E2-P3: director and admin close with MANAGE granted by the responsible; their view of the
      // closing is still that of anyone without PARTICIPANTS (threshold k), as before.
      await grantAccess(id, director, "MANAGE");
      await grantAccess(id, admin, "MANAGE");
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
      // E2-P3: cancelled by its responsible (director2); director has no MANAGE.
      expect((await post(director, `${INST}/${id}/cancel`, { confirmed: true, reason: "Sin permiso" })).body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      expect((await post(director2, `${INST}/${id}/cancel`, { confirmed: true })).body).toEqual({ errorCode: "REASON_REQUIRED" });
      const cancelled = await post(director2, `${INST}/${id}/cancel`, { confirmed: true, reason: "Proveedor sintético sin stock" });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body).toMatchObject({ status: "CANCELLED", cancel_reason: "Proveedor sintético sin stock" });
      expect((await post(director2, `${INST}/${id}/cancel`, { confirmed: true, reason: "Otra vez" })).status).toBe(200);
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

  describe("E2-P2 history of the farmer (§10.1)", () => {
    it("serves recent finished calls by default, counts the older ones and pages them with an opaque cursor", async () => {
      // A farmer of their own, so that earlier tests' calls do not enter the counts.
      const farmerH = await createSession(prisma, jwt, await addPerson("farmerH", f.tenantA, "AGRICULTOR"));
      const p = await newProduct();
      const older1 = await openCall([p]);
      expect((await confirm(farmerH, older1, [[p, "11"]], 1)).status).toBe(200);
      expect((await post(director2, `${INST}/${older1}/close`, { confirmed: true })).status).toBe(200);
      clock.advance(HOUR);
      const older2 = await openCall([await newProduct()]);
      const older2Product = (await get(director2, `${INST}/${older2}`)).body.products[0].product_ref;
      expect((await confirm(farmerH, older2, [[older2Product, "12"]], 1)).status).toBe(200);
      expect((await post(director2, `${INST}/${older2}/cancel`, { confirmed: true, reason: "Sintético" })).status).toBe(200);
      clock.advance(HOUR);
      // Finished without farmerH: never in their history; another farmer's quantity never shows.
      const foreign = await openCall([await newProduct()]);
      const foreignProduct = (await get(director2, `${INST}/${foreign}`)).body.products[0].product_ref;
      expect((await confirm(farmerA2, foreign, [[foreignProduct, "9876543"]], 1)).status).toBe(200);
      expect((await post(director2, `${INST}/${foreign}/close`, { confirmed: true })).status).toBe(200);

      clock.advance(181 * 24 * HOUR);
      const recentProduct = await newProduct();
      const recent = await openCall([recentProduct]);
      expect((await confirm(farmerH, recent, [[recentProduct, "13"]], 1)).status).toBe(200);
      expect((await post(director2, `${INST}/${recent}/close`, { confirmed: true })).status).toBe(200);

      const callsBefore = await prisma.jointPurchaseCall.count();
      const participationsBefore = await prisma.jointPurchaseParticipation.count();
      const view = await get2(farmerH, ME);
      expect(view.status).toBe(200);
      expect(view.body.history).toEqual({ older_count: 2 });
      const ids = view.body.calls.map((c: any) => c.call_id);
      expect(ids).toContain(recent);
      expect(ids).not.toContain(older1);
      expect(ids).not.toContain(older2);

      const page1 = await get2(farmerH, `${ME}/history?limit=1`);
      expect(page1.status).toBe(200);
      expect(page1.headers["cache-control"]).toBe("no-store");
      expect(page1.body.calls.map((c: any) => c.call_id)).toEqual([older2]);
      expect(page1.body.calls[0]).toMatchObject({ status: "CANCELLED", participation: { status: "ACTIVE", lines: [{ quantity_base: "12" }] }, closing: null });
      expect(page1.body.next_cursor).toEqual(expect.any(String));
      const page2 = await get2(farmerH, `${ME}/history?limit=1&before=${page1.body.next_cursor}`);
      expect(page2.body.calls.map((c: any) => c.call_id)).toEqual([older1]);
      expect(page2.body.calls[0]).toMatchObject({ status: "CLOSED", closing: { included: true, lines: [{ product_ref: p, quantity_base: "11" }] } });
      // The last page says so.
      expect(page2.body.next_cursor).toBeNull();
      const whole = await get2(farmerH, `${ME}/history`);
      expect(whole.body.calls.map((c: any) => c.call_id)).toEqual([older2, older1]);
      expect(whole.body.next_cursor).toBeNull();
      expect(whole.body.calls.every((c: any) => c.status !== "OPEN")).toBe(true);
      expect(JSON.stringify(whole.body)).not.toMatch(/9876543/);
      expect(JSON.stringify(whole.body)).not.toContain(foreign);

      for (const bad of ["no-es-un-cursor", Buffer.from(JSON.stringify(["E2H1", "x", "y"])).toString("base64url"), "%00"]) {
        const res = await get2(farmerH, `${ME}/history?before=${bad}`);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ errorCode: "PAYLOAD_INVALID" });
      }
      for (const limit of ["0", "51", "x"]) expect((await get2(farmerH, `${ME}/history?limit=${limit}`)).body).toEqual({ errorCode: "PAYLOAD_INVALID" });
      expect((await get(director, `${ME}/history`)).status).toBe(403);
      // Another farmer with nothing older: no data of farmerH.
      const otherHistory = await get(farmerA3, `${ME}/history`);
      expect(otherHistory.body.calls.some((c: any) => [older1, older2].includes(c.call_id))).toBe(false);
      // Reading deletes nothing.
      expect(await prisma.jointPurchaseCall.count()).toBe(callsBefore);
      expect(await prisma.jointPurchaseParticipation.count()).toBe(participationsBefore);
    });
  });

  describe("E2-P3 collaborators (§10.2)", () => {
    it("only the responsible grants, to another eligible user of the tenant; idempotent; recorded in three places without farmer data", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      await confirm(farmerA, id, [[p, "7654321"]], 1);
      const inactiveMember = await addPerson("directorInactivo", f.tenantA, "DIRECTIVA");
      await prisma.member.update({ where: { id: inactiveMember }, data: { isActive: false } });
      const grantBody = (to: string, grant = "PARTICIPANTS") => ({ user_ref: to, grant, confirmed: true });

      const notResponsible = await post(director, `${INST}/${id}/collaborators`, grantBody(userIdOf(admin)));
      expect(notResponsible.status).toBe(403);
      expect(notResponsible.body).toEqual({ errorCode: "COLLABORATORS_FORBIDDEN" });
      // Nobody grants to themselves: the responsible to themselves, nor a collaborator.
      for (const to of [userIdOf(director2), userOf[inactiveMember]!, userIdOf(directorB), userIdOf(farmerA), randomUUID()]) {
        const res = await post(director2, `${INST}/${id}/collaborators`, grantBody(to));
        expect(res.status).toBe(422);
        expect(res.body).toEqual({ errorCode: "COLLABORATOR_NOT_ELIGIBLE" });
      }
      expect((await post(director2, `${INST}/${id}/collaborators`, { user_ref: userIdOf(director), grant: "ALL", confirmed: true })).body).toEqual({
        errorCode: "PAYLOAD_INVALID",
      });
      expect((await post(director2, `${INST}/${id}/collaborators`, { user_ref: userIdOf(director), grant: "MANAGE" })).body).toEqual({
        errorCode: "CONFIRMATION_REQUIRED",
      });
      expect(await prisma.jointPurchaseCallAccessEvent.count({ where: { callId: id } })).toBe(0);

      const granted = await grantAccess(id, director, "PARTICIPANTS");
      expect(granted.body).toMatchObject({
        can_grant: true,
        collaborators: [{ user_ref: userIdOf(director), name: "Usuario sintético directorA", role: "DIRECTIVA", grants: [{ grant: "PARTICIPANTS", granted_by: { user_ref: userIdOf(director2) } }] }],
        history: [{ action: "GRANTED", grant: "PARTICIPANTS", user: { user_ref: userIdOf(director) }, actor: { user_ref: userIdOf(director2) } }],
      });
      // A collaborator cannot grant (no chains), not even with MANAGE.
      await grantAccess(id, director, "MANAGE");
      expect((await post(director, `${INST}/${id}/collaborators`, grantBody(userIdOf(admin)))).body).toEqual({ errorCode: "COLLABORATORS_FORBIDDEN" });
      // Granting again: 200, no new event.
      const events = await prisma.jointPurchaseCallAccessEvent.count({ where: { callId: id } });
      await grantAccess(id, director, "PARTICIPANTS");
      expect(await prisma.jointPurchaseCallAccessEvent.count({ where: { callId: id } })).toBe(events);
      // Revoking what does not exist: 200, no new event.
      expect((await post(director2, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(admin), grant: "PARTICIPANTS" })).status).toBe(200);
      expect(await prisma.jointPurchaseCallAccessEvent.count({ where: { callId: id } })).toBe(events);
      // The responsible's own permission is not a collaborator grant.
      expect((await post(director2, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(director2), grant: "PARTICIPANTS" })).body).toEqual({
        errorCode: "COLLABORATOR_NOT_ELIGIBLE",
      });
      // Someone else's grant cannot be revoked by a non-responsible; the collaborator renounces their own.
      expect((await post(admin, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(director), grant: "MANAGE" })).body).toEqual({
        errorCode: "COLLABORATORS_FORBIDDEN",
      });
      const renounced = await post(director, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(director), grant: "MANAGE" });
      expect(renounced.status).toBe(200);
      expect(renounced.body.collaborators[0].grants.map((g: any) => g.grant)).toEqual(["PARTICIPANTS"]);

      // Anyone of the Directiva/Administración sees the collaborators; another tenant does not.
      const listed = await get(admin, `${INST}/${id}/collaborators`);
      expect(listed.status).toBe(200);
      expect(listed.body.can_grant).toBe(false);
      expect(listed.body.history.map((h: any) => [h.action, h.grant])).toEqual([["GRANTED", "PARTICIPANTS"], ["GRANTED", "MANAGE"], ["REVOKED", "MANAGE"]]);
      expect((await get(directorB, `${INST}/${id}/collaborators`)).status).toBe(404);
      expect((await get(farmerA, `${INST}/${id}/collaborators`)).status).toBe(403);

      const detail = await get(director, `${INST}/${id}`);
      expect(detail.body).toMatchObject({ can_view_participants: true, can_manage: false, my_grants: ["PARTICIPANTS"], collaborator_count: 1 });
      expect(detail.body.history.filter((e: any) => e.kind.startsWith("ACCESS_")).map((e: any) => e.kind)).toEqual(["ACCESS_GRANTED", "ACCESS_GRANTED", "ACCESS_REVOKED"]);
      expect(detail.body.history.find((e: any) => e.kind === "ACCESS_REVOKED").detail).toBe(
        "Usuario sintético directorA renunció al permiso «Administrar la convocatoria».",
      );
      const responsibleDetail = await get(director2, `${INST}/${id}`);
      expect(responsibleDetail.body).toMatchObject({ can_manage: true, my_grants: ["MANAGE", "PARTICIPANTS"], is_responsible: true });
      const accessEvents = await prisma.jointPurchaseCallAccessEvent.findMany({ where: { callId: id } });
      expect(accessEvents).toHaveLength(3);
      const audit = await prisma.auditLog.findMany({ where: { entityId: id } });
      expect(audit.filter((a) => /Permiso|Renuncia/.test(a.summary ?? ""))).toHaveLength(3);
      expect(audit.every((a) => a.ownerUserId === null)).toBe(true);
      const recorded = JSON.stringify({ audit, accessEvents, history: detail.body.history });
      expect(recorded).not.toMatch(/farmerA|7654321/);

      // The database keeps the record: no change, no deletion; the responsible's row is not revoked.
      await expect(prisma.jointPurchaseCallAccessEvent.update({ where: { id: accessEvents[0]!.id }, data: { grant: "MANAGE" } })).rejects.toThrow();
      await expect(prisma.jointPurchaseCallAccessEvent.delete({ where: { id: accessEvents[0]!.id } })).rejects.toThrow();
      await expect(
        prisma.jointPurchaseCallAccess.delete({ where: { callId_userId_grant: { callId: id, userId: userIdOf(director2), grant: "PARTICIPANTS" } } }),
      ).rejects.toThrow();
      await expect(
        prisma.jointPurchaseCallAccess.create({ data: { callId: id, userId: userIdOf(admin), grant: "PARTICIPANTS", grantedByUserId: userIdOf(admin) } }),
      ).rejects.toThrow();

      // Never after a cancellation; revoking stays possible in any state.
      const cancelledDraft = (await createDraft([await newProduct()])).body.call_id;
      await grantAccess(cancelledDraft, admin, "MANAGE");
      expect((await post(director2, `${INST}/${cancelledDraft}/cancel`, { confirmed: true, reason: "Sintético" })).status).toBe(200);
      expect((await post(director2, `${INST}/${cancelledDraft}/collaborators`, grantBody(userIdOf(director)))).body).toEqual({
        errorCode: "INVALID_TRANSITION",
        status: "CANCELLED",
      });
      const revokedInCancelled = await post(director2, `${INST}/${cancelledDraft}/collaborators/revoke`, { user_ref: userIdOf(admin), grant: "MANAGE" });
      expect(revokedInCancelled.status).toBe(200);
      expect(revokedInCancelled.body.collaborators).toEqual([]);
    });

    it("requires MANAGE to edit, open, cancel and close; nobody gets it by role when the responsible becomes ineligible (N2 rejected, m6)", async () => {
      const p = await newProduct();
      const draft = await createDraft([p]);
      const id = draft.body.call_id;
      expect(draft.body).toMatchObject({ can_manage: false, my_grants: [], collaborator_count: 0, responsible: { eligible: true } });
      for (const res of [
        await patch(admin, `${INST}/${id}`, { name: "Sin permiso" }),
        await post(admin, `${INST}/${id}/open`, { confirmed: true }),
        await post(admin, `${INST}/${id}/cancel`, { confirmed: true, reason: "Sin permiso" }),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      }
      // Granted in DRAFT, MANAGE lets the collaborator edit and open, and never shows participants.
      await grantAccess(id, admin, "MANAGE");
      expect((await patch(admin, `${INST}/${id}`, { name: "Editada con MANAGE" })).status).toBe(200);
      const opened = await post(admin, `${INST}/${id}/open`, { confirmed: true });
      expect(opened.status).toBe(200);
      expect(opened.body).toMatchObject({ can_manage: true, can_view_participants: false, my_grants: ["MANAGE"] });
      expect((await get(admin, `${INST}/${id}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
      // The responsible's permission is created at opening, whoever opens.
      expect((await get(director2, `${INST}/${id}/participants`)).status).toBe(200);

      // N2 rejected (2026-11-12): an ineligible responsible gives nobody cancel or close by role.
      const director3Member = await addPerson("directorA3", f.tenantA, "DIRECTIVA");
      const director3 = await createSession(prisma, jwt, director3Member);
      const q = await newProduct();
      const orphan = await openCall([q], { responsible: director3, deadlineInMs: 2 * HOUR });
      await confirm(farmerA, orphan, [[q, "55"]], 1);
      // m6: what she granted works while she is eligible...
      await grantAccess(orphan, admin, "MANAGE", director3);
      await grantAccess(orphan, director, "PARTICIPANTS", director3);
      expect((await get(director, `${INST}/${orphan}/participants`)).status).toBe(200);
      expect((await get(admin, `${INST}/${orphan}`)).body).toMatchObject({ can_manage: true, delegations_suspended: false });
      await prisma.member.update({ where: { id: director3Member }, data: { isActive: false } });
      // ...and is suspended (not deleted) while she is not.
      const orphanDetail = await get(admin, `${INST}/${orphan}`);
      expect(orphanDetail.body).toMatchObject({
        responsible: { eligible: false },
        can_manage: false,
        can_cancel_or_close: false,
        delegations_suspended: true,
        my_grants: [],
      });
      for (const res of [
        await post(admin, `${INST}/${orphan}/close`, { confirmed: true }),
        await post(director, `${INST}/${orphan}/close`, { confirmed: true }),
        await post(director2, `${INST}/${orphan}/cancel`, { confirmed: true, reason: "Responsable inactiva" }),
      ]) {
        expect(res.body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      }
      expect((await get(director, `${INST}/${orphan}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
      expect(await prisma.jointPurchaseCallAccess.count({ where: { callId: orphan, grantedByUserId: { not: null } } })).toBe(2);
      // The same for a draft: nobody cancels it by role.
      await prisma.member.update({ where: { id: director3Member }, data: { isActive: true } });
      const draft3 = await createDraft([await newProduct()], { responsible: director3 });
      await prisma.member.update({ where: { id: director3Member }, data: { isActive: false } });
      expect((await patch(admin, `${INST}/${draft3.body.call_id}`, { name: "Sin permiso" })).body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      expect((await post(admin, `${INST}/${draft3.body.call_id}/cancel`, { confirmed: true, reason: "Responsable inactiva" })).body).toEqual({
        errorCode: "MANAGE_FORBIDDEN",
      });
      // The automatic closing at the deadline is kept.
      clock.advance(3 * HOUR);
      expect(await worker.runOnce()).toContain(orphan);
      expect((await get(director2, `${INST}/${orphan}`)).body.status).toBe("CLOSED");
      // Eligible again: the delegations are in force again.
      await prisma.member.update({ where: { id: director3Member }, data: { isActive: true } });
      expect((await get(director, `${INST}/${orphan}/participants`)).status).toBe(200);
    });

    it("CONV-1 only for the responsible, CONV-2 also for collaborators; hidden participations withhold totals, open and closed", async () => {
      const CONV2 = { version: "CONV-2", accepted_at: "2026-11-11T20:00:00.000Z" };
      const p1 = await newProduct();
      const p2 = await newProduct();
      const id = await openCall([p1, p2]);
      expect((await confirm(farmerA, id, [[p1, "100"]], 1)).body.participation.consent.version).toBe("CONV-1");
      expect((await confirm(farmerA2, id, [[p1, "200"], [p2, "20"]], 1, randomUUID(), CONV2)).body.participation.consent.version).toBe("CONV-2");
      expect((await confirm(farmerA3, id, [[p1, "300"], [p2, "30"]], 1, randomUUID(), CONV2)).status).toBe(200);
      await grantAccess(id, director, "PARTICIPANTS");

      const responsibleList = await get(director2, `${INST}/${id}/participants`);
      expect(responsibleList.body).toMatchObject({ participant_count: 3, hidden_participant_count: 0, hidden_notice: null });
      expect(responsibleList.body.participants).toHaveLength(3);
      const collaboratorList = await get(director, `${INST}/${id}/participants`);
      expect(collaboratorList.status).toBe(200);
      expect(collaboratorList.body).toMatchObject({
        participant_count: 3,
        hidden_participant_count: 1,
        hidden_notice: "1 participación autorizada sólo para la persona responsable: sólo la ve ella.",
      });
      expect(collaboratorList.body.participants.map((x: any) => x.name).sort()).toEqual(["Usuario sintético farmerA2", "Usuario sintético farmerA3"]);
      expect(JSON.stringify(collaboratorList.body)).not.toMatch(/Usuario sintético farmerA"|"100"/);

      // Open: the collaborator gets p2 (no hidden participation) but not p1; the rest gets no live total.
      const totals = async (session: TestSession) => (await get(session, `${INST}/${id}`)).body.products.map((x: any) => [x.totals.total_quantity_base, x.totals.visibility]);
      expect(await totals(director2)).toEqual([["600", "VISIBLE"], ["50", "VISIBLE"]]);
      expect(await totals(director)).toEqual([[null, "RESPONSIBLE_ONLY"], ["50", "VISIBLE"]]);
      expect(await totals(admin)).toEqual([[null, "RESPONSIBLE_ONLY"], [null, "RESPONSIBLE_ONLY"]]);

      // Revocation during OPEN applies from the next request.
      await grantAccess(id, admin, "PARTICIPANTS");
      expect((await get(admin, `${INST}/${id}/participants`)).status).toBe(200);
      expect((await post(director2, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(admin), grant: "PARTICIPANTS" })).status).toBe(200);
      const after = await get(admin, `${INST}/${id}/participants`);
      expect(after.status).toBe(403);
      expect(after.body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
      expect((await get(admin, `${INST}/${id}`)).body.can_view_participants).toBe(false);

      expect((await post(director2, `${INST}/${id}/close`, { confirmed: true })).status).toBe(200);
      const closingOf = async (session: TestSession) => (await get(session, `${INST}/${id}/closing`)).body;
      const lines = (body: any) => body.lines.map((l: any) => [l.participant_count, l.total_quantity_base, l.visibility]);
      const responsibleClosing = await closingOf(director2);
      expect(lines(responsibleClosing)).toEqual([[3, "600", "VISIBLE"], [2, "50", "VISIBLE"]]);
      expect(responsibleClosing.participants).toHaveLength(3);
      const collaboratorClosing = await closingOf(director);
      expect(lines(collaboratorClosing)).toEqual([[3, null, "RESPONSIBLE_ONLY"], [2, "50", "VISIBLE"]]);
      expect(collaboratorClosing.participants.map((x: any) => x.name).sort()).toEqual(["Usuario sintético farmerA2", "Usuario sintético farmerA3"]);
      expect(collaboratorClosing.hidden_participant_count).toBe(1);
      // Someone who never held PARTICIPANTS: the threshold of the closing.
      const thirdParty = await addPerson("directorA4", f.tenantA, "DIRECTIVA");
      const directorA4 = await createSession(prisma, jwt, thirdParty);
      expect(lines(await closingOf(directorA4))).toEqual([[3, "600", "VISIBLE"], [2, null, "UNDER_THRESHOLD"]]);
      // Admin held PARTICIPANTS while open (revoked since): no total for p1, which has a CONV-1 participation.
      expect(lines(await closingOf(admin))).toEqual([[3, null, "RESPONSIBLE_ONLY"], [2, null, "UNDER_THRESHOLD"]]);
      expect((await get(admin, `${INST}/${id}`)).body.products.map((x: any) => x.totals.visibility)).toEqual(["RESPONSIBLE_ONLY", "UNDER_THRESHOLD"]);

      // Revoking after the close: 403 at the next request and the "after a revocation" rule.
      expect((await post(director2, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(director), grant: "PARTICIPANTS" })).status).toBe(200);
      expect((await get(director, `${INST}/${id}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
      const revokedClosing = await closingOf(director);
      expect(revokedClosing).toMatchObject({ can_view_participants: false, participants: null, hidden_participant_count: 0 });
      expect(lines(revokedClosing)).toEqual([[3, null, "RESPONSIBLE_ONLY"], [2, null, "UNDER_THRESHOLD"]]);
      // Granting is still possible in CLOSED.
      await grantAccess(id, directorA4, "PARTICIPANTS");
      expect(lines(await closingOf(directorA4))).toEqual([[3, null, "RESPONSIBLE_ONLY"], [2, "50", "VISIBLE"]]);
    });

    it("P-C (§10.6): quantities, old or new, never widen nor reduce the consent; widening and reducing are decisions of their own, in their own order", async () => {
      const CONV3 = { version: "CONV-3", accepted_at: "2026-11-12T09:00:00.000Z" };
      const p1 = await newProduct();
      const id = await openCall([p1], { deadlineInMs: 4 * HOUR });
      const names = async () => ((await get(director, `${INST}/${id}/participants`)).body.participants as any[]).map((x) => x.name);
      const stored = () =>
        prisma.jointPurchaseParticipation.findFirstOrThrow({
          where: { callId: id, member: { user: { name: "Usuario sintético farmerA" } } },
          include: { lines: true },
        });
      const decisions = async () =>
        (await prisma.jointPurchaseConsentDecision.findMany({ where: { callId: id }, orderBy: [{ sequence: "asc" }, { receivedAt: "asc" }] })).map(
          (d) => [d.source, d.scope, d.consentVersion, d.sequence],
        );

      // Without a participation there is nothing to decide on: the phone keeps the decision pending.
      expect((await decide(farmerA, id, "COLLABORATORS", 1)).body).toEqual({ errorCode: "PARTICIPATION_REQUIRED" });

      // First confirmation with CONV-3: only the responsible.
      const first = await put2(farmerA, `${ME}/${id}/participation`, {
        operation_id: randomUUID(),
        sequence: 1,
        consent: CONV3,
        lines: [{ product_ref: p1, quantity_base: "100" }],
      });
      expect(first.body.participation.consent_scope).toMatchObject({ scope: "RESPONSIBLE_ONLY", version: "CONV-3", sequence: 0 });
      await grantAccess(id, director, "PARTICIPANTS");
      expect(await names()).toEqual([]);

      // A modification carrying CONV-2 (the build of 2026-11-11 did that) does not widen anything.
      const modified = await confirm(farmerA, id, [[p1, "150"]], 2, randomUUID(), { version: "CONV-2", accepted_at: "2026-11-12T09:10:00.000Z" });
      expect(modified.status).toBe(200);
      expect((await stored()).consentScope).toBe("RESPONSIBLE_ONLY");
      expect((await stored()).consentVersion).toBe("CONV-3");
      expect(await names()).toEqual([]);

      // Widening needs the current text...
      expect((await decide(farmerA, id, "COLLABORATORS", 1, randomUUID(), "CONV-2")).body).toEqual({ errorCode: "CONSENT_REQUIRED" });
      // ...and is a decision of its own: quantities untouched.
      const widenOp = randomUUID();
      const widened = await decide(farmerA, id, "COLLABORATORS", 1, widenOp);
      expect(widened.status).toBe(200);
      expect(widened.body.participation).toMatchObject({
        lines: [{ product_ref: p1, quantity_base: "150" }],
        last_sequence: 2,
        consent: { version: "CONV-3" },
        consent_scope: { scope: "COLLABORATORS", version: "CONV-3", sequence: 1, decided_at: "2026-11-12T10:00:00.000Z" },
      });
      expect(await names()).toEqual(["Usuario sintético farmerA"]);

      // An old phone sends new quantities with CONV-1: the widening stays.
      expect((await confirm(farmerA, id, [[p1, "160"]], 3)).status).toBe(200);
      expect((await stored()).consentScope).toBe("COLLABORATORS");
      expect(await names()).toEqual(["Usuario sintético farmerA"]);

      // The reduction is respected (any known text) and takes effect from the next reading.
      const reduced = await decide(farmerA, id, "RESPONSIBLE_ONLY", 2, randomUUID(), "CONV-1", "2026-11-12T10:05:00.000Z");
      expect(reduced.body.participation.consent_scope).toMatchObject({ scope: "RESPONSIBLE_ONLY", sequence: 2 });
      expect(await names()).toEqual([]);

      // A late retry of the widening gets its stored answer and changes nothing.
      const retry = await decide(farmerA, id, "COLLABORATORS", 1, widenOp);
      expect(retry.body).toEqual(widened.body);
      expect((await stored()).consentScope).toBe("RESPONSIBLE_ONLY");
      // A decision that arrives out of order (not above the last accepted one) never reverts the later one.
      const outOfOrder = await decide(farmerA, id, "COLLABORATORS", 2);
      expect(outOfOrder.status).toBe(409);
      expect(outOfOrder.body.errorCode).toBe("STALE_SEQUENCE");
      expect(outOfOrder.body.participation.consent_scope.scope).toBe("RESPONSIBLE_ONLY");
      expect(await names()).toEqual([]);
      // The same operation_id with another body is refused.
      expect((await decide(farmerA, id, "RESPONSIBLE_ONLY", 1, widenOp)).body).toEqual({ errorCode: "OPERATION_ID_REUSED" });

      // Each decision is recorded once, in order, in an insert-only register; quantities kept their own order.
      expect(await decisions()).toEqual([
        ["INITIAL", "RESPONSIBLE_ONLY", "CONV-3", 0],
        ["DECISION", "COLLABORATORS", "CONV-3", 1],
        ["DECISION", "RESPONSIBLE_ONLY", "CONV-1", 2],
      ]);
      expect((await stored()).lastSequence).toBe(3);
      expect((await stored()).lines.map((l) => l.quantityBase)).toEqual([160n]);
      const row = await prisma.jointPurchaseConsentDecision.findFirstOrThrow({ where: { callId: id } });
      await expect(prisma.jointPurchaseConsentDecision.update({ where: { id: row.id }, data: { scope: "COLLABORATORS" } })).rejects.toThrow();
      await expect(prisma.jointPurchaseConsentDecision.delete({ where: { id: row.id } })).rejects.toThrow();

      // After the deadline: quantities are refused, decisions are not (a reduction is always respected).
      clock.advance(5 * HOUR);
      expect((await confirm(farmerA, id, [[p1, "170"]], 4)).body).toEqual({ errorCode: "CALL_NOT_OPEN", reason: "DEADLINE_PASSED" });
      expect((await decide(farmerA, id, "COLLABORATORS", 3)).status).toBe(200);
      await worker.runOnce();
      expect(((await get(director, `${INST}/${id}/closing`)).body.participants as any[]).map((x) => x.name)).toEqual(["Usuario sintético farmerA"]);
      expect((await decide(farmerA, id, "RESPONSIBLE_ONLY", 4)).status).toBe(200);
      expect((await get(director, `${INST}/${id}/closing`)).body.participants).toEqual([]);
      // The responsible always sees it.
      expect(((await get(director2, `${INST}/${id}/closing`)).body.participants as any[]).map((x) => x.name)).toEqual(["Usuario sintético farmerA"]);
    });

    it("P-C: on a cancelled call a reduction is accepted and a widening is not", async () => {
      const p1 = await newProduct();
      const id = await openCall([p1]);
      await confirm(farmerA2, id, [[p1, "40"]], 1);
      expect((await post(director2, `${INST}/${id}/cancel`, { confirmed: true, reason: "Motivo sintético" })).status).toBe(200);
      expect((await decide(farmerA2, id, "COLLABORATORS", 1)).body).toEqual({ errorCode: "WIDENING_NOT_ALLOWED", status: "CANCELLED" });
      expect((await decide(farmerA2, id, "RESPONSIBLE_ONLY", 2)).status).toBe(200);
      // Another tenant's farmer does not reach it.
      expect((await decide(farmerB, id, "RESPONSIBLE_ONLY", 1)).status).toBe(404);
    });
  });

  describe("E3-P2 immutable origin of a call", () => {
    const SELECTION = (proposalId: string) => `/api/v1/collective/proposals/${proposalId}/selection`;

    /** A draft proposal whose lines carry no figure (no release is created). */
    async function proposalOf(products: string[]) {
      return prisma.jointPurchaseProposal.create({
        data: {
          tenantId: f.tenantA,
          campaignId: f.campaigns.openA,
          inputsFingerprint: randomBytes(32).toString("hex"),
          linkedMembers: 3,
          membersWithContribution: 0,
          generatedByUserId: userIdOf(director),
          lines: {
            create: products.map((canonicalProductId, position) => ({
              position,
              canonicalProductId,
              baseUnit: "ML" as const,
              status: "SUPPRESSED_UNDER_THRESHOLD" as const,
            })),
          },
        },
      });
    }

    it("records a PROPOSAL origin with fingerprint, selection revision and match; later edits, selections and drafts leave it as it was", async () => {
      const [p1, p2, p3, outside] = [await newProduct(), await newProduct(), await newProduct(), await newProduct()];
      const proposal = await proposalOf([p1, p2, p3]);

      // No selection saved yet: revision and match are null, not invented.
      const before = await createDraft([p1, outside], { proposalId: proposal.id });
      expect(before.status).toBe(201);
      expect(before.body.origin).toEqual({
        kind: "PROPOSAL",
        proposal_ref: proposal.id,
        proposal_generated_at: proposal.generatedAt.toISOString(),
        proposal_fingerprint: proposal.inputsFingerprint,
        selection_revision: null,
        selection_matched: null,
        recorded_at: expect.any(String),
        recorded_by: { user_ref: userIdOf(director), name: expect.any(String) },
        products: [
          { position: 0, product_ref: p1, product_name: `Producto sintético ${p1}`, base_unit: "ML", proposal_position: 0 },
          { position: 1, product_ref: outside, product_name: `Producto sintético ${outside}`, base_unit: "ML", proposal_position: null },
        ],
      });
      expect(before.body.origin_differs_from_current).toBe(false);
      expect(before.body.participant_count).toBe(0);
      expect(await prisma.jointPurchaseParticipation.count({ where: { callId: before.body.call_id } })).toBe(0);

      const saved = await put(director, SELECTION(proposal.id), { expected_revision: 0, product_refs: [p1, p2] });
      expect(saved.status).toBe(200);
      expect(saved.body.revision).toBe(1);

      // Same products as the saved selection, in another order: matched.
      const matched = await createDraft([p2, p1], { proposalId: proposal.id });
      expect(matched.body.origin).toMatchObject({ kind: "PROPOSAL", selection_revision: 1, selection_matched: true });
      expect(matched.body.origin.products.map((p: any) => [p.product_ref, p.proposal_position])).toEqual([
        [p2, 1],
        [p1, 0],
      ]);
      const unmatched = await createDraft([p1], { proposalId: proposal.id });
      expect(unmatched.body.origin).toMatchObject({ kind: "PROPOSAL", selection_revision: 1, selection_matched: false });

      // A selection saved afterwards does not move the recorded revision.
      expect((await put(director, SELECTION(proposal.id), { expected_revision: 1, product_refs: [p3] })).body.revision).toBe(2);
      const id = matched.body.call_id;
      const recorded = matched.body.origin;
      expect((await get(director, `${INST}/${id}`)).body.origin).toEqual(recorded);

      // Editing the products in DRAFT changes the call, never its origin.
      const edited = await patch(director2, `${INST}/${id}`, { products: [{ product_ref: p3 }] });
      expect(edited.status).toBe(200);
      expect(edited.body.products.map((p: any) => p.product_ref)).toEqual([p3]);
      expect(edited.body.origin).toEqual(recorded);
      expect(edited.body.origin_differs_from_current).toBe(true);

      // A draft proposal generated later, even taken as the call's source, leaves the origin alone.
      const later = await proposalOf([p3]);
      const moved = await patch(director2, `${INST}/${id}`, { source_proposal_id: later.id });
      expect(moved.status).toBe(200);
      expect(moved.body.source_proposal_ref).toBe(later.id);
      expect(moved.body.products[0].reference).toMatchObject({ proposal_ref: later.id, position: 0 });
      expect(moved.body.origin).toEqual(recorded);

      // Reordering back to the origin's products is not a difference.
      const back = await patch(director2, `${INST}/${id}`, { products: [{ product_ref: p1 }, { product_ref: p2 }] });
      expect(back.body.origin_differs_from_current).toBe(false);
      expect(back.body.origin).toEqual(recorded);

      // The database refuses changing or deleting the origin behind the application's back.
      await expect(prisma.jointPurchaseCallOrigin.update({ where: { callId: id }, data: { selectionMatched: false } })).rejects.toThrow();
      await expect(prisma.jointPurchaseCallOrigin.delete({ where: { callId: id } })).rejects.toThrow();
      await expect(
        prisma.jointPurchaseCallOriginProduct.update({
          where: { callId_position: { callId: id, position: 0 } },
          data: { proposalPosition: 2, productId: p3 },
        }),
      ).rejects.toThrow();
      await expect(prisma.jointPurchaseCallOriginProduct.deleteMany({ where: { callId: id } })).rejects.toThrow();
      // Nor adding a product to the origin later, in another transaction (same rule as F12 results).
      await expect(
        prisma.jointPurchaseCallOriginProduct.create({
          data: { callId: id, position: 2, productId: p3, baseUnit: "ML", proposalId: null, proposalPosition: null },
        }),
      ).rejects.toThrow(/el origen no admite productos posteriores/);
      const stored = await prisma.jointPurchaseCallOrigin.findUniqueOrThrow({ where: { callId: id }, include: { products: true } });
      expect(stored).toMatchObject({ kind: "PROPOSAL", proposalId: proposal.id, selectionRevision: 1, selectionMatched: true });
      expect(stored.products).toHaveLength(2);

      // Another tenant cannot see it.
      expect((await get(directorB, `${INST}/${id}`)).status).toBe(404);
    });

    it("records a CATALOG origin without references; absent before the migration, never reconstructed", async () => {
      const p = await newProduct();
      const draft = await createDraft([p]);
      expect(draft.status).toBe(201);
      expect(draft.body.origin).toEqual({
        kind: "CATALOG",
        proposal_ref: null,
        proposal_generated_at: null,
        proposal_fingerprint: null,
        selection_revision: null,
        selection_matched: null,
        recorded_at: expect.any(String),
        recorded_by: { user_ref: userIdOf(director), name: expect.any(String) },
        products: [{ position: 0, product_ref: p, product_name: `Producto sintético ${p}`, base_unit: "ML", proposal_position: null }],
      });
      const id = draft.body.call_id;
      const foreign = await get(directorB, `${INST}/${id}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ errorCode: "CALL_NOT_FOUND" });

      // Nothing of the origin reaches the farmer's view.
      expect((await post(director2, `${INST}/${id}/open`, { confirmed: true })).status).toBe(200);
      const farmerView = await get(farmerA, ME);
      expect(farmerView.body.calls.some((c: any) => c.call_id === id)).toBe(true);
      expect(JSON.stringify(farmerView.body)).not.toMatch(/origin|selection_|fingerprint/);

      // A call written without an origin (as before the migration) serves null.
      const legacy = await prisma.jointPurchaseCall.create({
        data: {
          tenantId: f.tenantA,
          campaignId: f.campaigns.openA,
          name: "Convocatoria anterior sintética",
          deadlineAt: new Date(clock.now().getTime() + 7 * 24 * HOUR),
          responsibleUserId: userIdOf(director2),
          createdByUserId: userIdOf(director),
          products: { create: [{ position: 0, tenantId: f.tenantA, productId: p, baseUnit: "ML" }] },
        },
      });
      const old = await get(director, `${INST}/${legacy.id}`);
      expect(old.status).toBe(200);
      expect(old.body.origin).toBeNull();
      expect(old.body.origin_differs_from_current).toBe(false);

      // The database keeps the origin coherent: CATALOG carries no reference,
      // PROPOSAL needs its draft, another tenant is refused, and a call has
      // one origin only.
      const base = { callId: legacy.id, recordedAt: new Date(), recordedByUserId: userIdOf(director) };
      await expect(
        prisma.jointPurchaseCallOrigin.create({ data: { ...base, tenantId: f.tenantA, kind: "CATALOG", proposalFingerprint: "c".repeat(64) } }),
      ).rejects.toThrow();
      await expect(prisma.jointPurchaseCallOrigin.create({ data: { ...base, tenantId: f.tenantA, kind: "PROPOSAL" } })).rejects.toThrow();
      await expect(prisma.jointPurchaseCallOrigin.create({ data: { ...base, tenantId: f.tenantB, kind: "CATALOG" } })).rejects.toThrow();
      await expect(prisma.jointPurchaseCallOrigin.create({ data: { ...base, callId: id, tenantId: f.tenantA, kind: "CATALOG" } })).rejects.toThrow();
      expect(await prisma.jointPurchaseCallOrigin.count({ where: { callId: legacy.id } })).toBe(0);
    });

    it("serves the fingerprint under the rule of the figures: null once a disclosed figure of the draft is withdrawn", async () => {
      const p = await newProduct();
      const release = await prisma.collectiveRelease.create({
        data: {
          tenantId: f.tenantA,
          campaignId: f.campaigns.openA,
          canonicalProductId: p,
          projectionType: "DECLARED_NEED",
          baseUnit: "ML",
          totalBase: 777n,
          contributorCount: 3,
        },
      });
      const proposal = await prisma.jointPurchaseProposal.create({
        data: {
          tenantId: f.tenantA,
          campaignId: f.campaigns.openA,
          inputsFingerprint: randomBytes(32).toString("hex"),
          linkedMembers: 3,
          membersWithContribution: 3,
          generatedByUserId: userIdOf(director),
          lines: { create: [{ position: 0, canonicalProductId: p, baseUnit: "ML", status: "DISCLOSED", releaseId: release.id }] },
        },
      });
      const draft = await createDraft([p], { proposalId: proposal.id });
      expect(draft.body.origin.proposal_fingerprint).toBe(proposal.inputsFingerprint);
      // The origin never copies the figure, its contributors or its date.
      expect(JSON.stringify(draft.body.origin)).not.toMatch(/"777"|contributors|released_at|quantity/);
      await prisma.collectiveRelease.update({ where: { id: release.id }, data: { withdrawnAt: new Date() } });
      const after = await get(director, `${INST}/${draft.body.call_id}`);
      expect(after.body.origin).toMatchObject({ kind: "PROPOSAL", proposal_ref: proposal.id, proposal_fingerprint: null });
      const stored = await prisma.jointPurchaseCallOrigin.findUniqueOrThrow({ where: { callId: draft.body.call_id } });
      expect(stored.proposalFingerprint).toBe(proposal.inputsFingerprint);
    });
  });

  describe("no effects outside E2", () => {
    it("leaves purchases, debts, payments, stock, Sync v1 and forecasts untouched", async () => {
      // E2-D14 and E3-P2 each create one synthetic release for their drafts.
      expect(await legacyCounts()).toEqual({ ...legacyBefore, collectiveRelease: legacyBefore.collectiveRelease + 2 });
      const stocked = await prisma.product.findUniqueOrThrow({ where: { id: f.products.liquidA } });
      expect(stocked.currentStock.toString()).toBe("40");
    });
  });
});
