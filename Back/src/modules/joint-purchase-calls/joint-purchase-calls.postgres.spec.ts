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
import { CONSENT_V4_HELP, CONSENT_V4_TEXT } from "./domain/consent";
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

  /**
   * §10.6 (P-C): a consent decision of its own, with its own order, from the
   * phone that reads contract 2 (the only one that knows this route; P-A
   * shapes the answer by contract too).
   */
  const decide = (
    session: TestSession,
    callId: string,
    scope: "COLLABORATORS" | "RESPONSIBLE_ONLY",
    sequence: number,
    operationId = randomUUID(),
    version = "CONV-3",
    decidedAt = "2026-11-12T10:00:00.000Z",
  ) =>
    http().post(`${ME}/${callId}/participation/consent`).set("Authorization", auth(session)).set("X-Joint-Purchase-Contract", "2").send({
      operation_id: operationId,
      sequence,
      scope,
      consent: { version, decided_at: decidedAt },
    });

  // ------------------------------------------------------------------ E4 helpers

  /** E4 §4.1: the consent of contract 4. */
  const CONV4 = { version: "CONV-4", accepted_at: "2026-11-13T12:00:00.000Z" };

  /** A farmer write declaring a contract (`null`: no header, contract 1). */
  function confirmAs(
    contract: "2" | "3" | "4" | null,
    session: TestSession,
    callId: string,
    lines: [string, string][],
    sequence: number,
    consent: object | null = CONV4,
    operationId = randomUUID(),
  ): Promise<Res> {
    let req = http().put(`${ME}/${callId}/participation`).set("Authorization", auth(session));
    if (contract) req = req.set("X-Joint-Purchase-Contract", contract);
    return req.send({
      operation_id: operationId,
      sequence,
      ...(consent ? { consent } : {}),
      lines: lines.map(([product_ref, quantity_base]) => ({ product_ref, quantity_base })),
    });
  }

  /** E4: a first confirmation (or a modification) from the app of contract 4. */
  const confirm4 = (session: TestSession, callId: string, lines: [string, string][], sequence: number, operationId = randomUUID(), consent: object | null = CONV4) =>
    confirmAs("4", session, callId, lines, sequence, consent, operationId);

  function decideAs(
    contract: "2" | "3" | "4" | null,
    session: TestSession,
    callId: string,
    body: { scope: string; sequence: number; version?: string; decided_at?: string; responsible_version?: number; authorize_responsible?: boolean },
    operationId = randomUUID(),
  ): Promise<Res> {
    let req = http().post(`${ME}/${callId}/participation/consent`).set("Authorization", auth(session));
    if (contract) req = req.set("X-Joint-Purchase-Contract", contract);
    return req.send({
      operation_id: operationId,
      sequence: body.sequence,
      scope: body.scope,
      consent: { version: body.version ?? "CONV-4", decided_at: body.decided_at ?? "2026-11-13T13:00:00.000Z" },
      ...(body.responsible_version !== undefined ? { responsible_version: body.responsible_version } : {}),
      ...(body.authorize_responsible !== undefined ? { authorize_responsible: body.authorize_responsible } : {}),
    });
  }

  /** E4 §4.2: a consent decision from the app of contract 4. */
  const decide4 = (session: TestSession, callId: string, scope: string, sequence: number, operationId = randomUUID(), version = "CONV-4") =>
    decideAs("4", session, callId, { scope, sequence, version }, operationId);

  const withdrawAs = (contract: "2" | "3" | "4" | null, session: TestSession, callId: string, sequence: number, operationId = randomUUID()) => {
    let req = http().post(`${ME}/${callId}/participation/withdraw`).set("Authorization", auth(session));
    if (contract) req = req.set("X-Joint-Purchase-Contract", contract);
    return req.send({ operation_id: operationId, sequence });
  };

  /**
   * E4 §4.4: view permissions stored BEFORE E4. Since the E4 migration the
   * database refuses new PARTICIPANTS rows, so the test writes them with the
   * guard disabled inside one transaction (the throwaway database's owner),
   * as data that existed before the change. Never used for MANAGE.
   */
  async function storedBeforeE4(rows: { callId: string; userId: string; grantedByUserId: string | null; responsibleVersion?: number }[]) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "JointPurchaseCallAccess" DISABLE TRIGGER "joint_purchase_call_access_guard"');
      for (const row of rows) {
        await tx.jointPurchaseCallAccess.create({
          data: { grant: "PARTICIPANTS", responsibleVersion: 1, grantedAt: new Date("2026-11-12T15:00:00.000Z"), ...row },
        });
        if (row.grantedByUserId !== null) {
          await tx.jointPurchaseCallAccessEvent.create({
            data: {
              callId: row.callId,
              userId: row.userId,
              grant: "PARTICIPANTS",
              action: "GRANTED",
              actorUserId: row.grantedByUserId,
              at: new Date("2026-11-12T15:00:00.000Z"),
            },
          });
        }
      }
      await tx.$executeRawUnsafe('ALTER TABLE "JointPurchaseCallAccess" ENABLE TRIGGER "joint_purchase_call_access_guard"');
    });
  }

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

    // Rewritten for E4 §2 (declared): before E4 only the responsible (through the PARTICIPANTS row created at
    // opening) saw identified participants. Now only an eligible ADMINISTRADOR, by role, and only those with CONV-4.
    it("E4 §2: identified participants only for an eligible Administración and only with consent ADMINISTRATION; never for the Directiva, also when she is the responsible", async () => {
      const p1 = await newProduct();
      const p2 = await newProduct("kg");
      const id = await openCall([p1, p2]);
      expect((await confirm4(farmerA, id, [[p1, "1500"], [p2, "300"]], 1)).status).toBe(200);
      expect((await confirm(farmerA2, id, [[p1, "500"]], 1)).status).toBe(200);

      for (const directiva of [director, director2]) {
        const denied = await get(directiva, `${INST}/${id}/participants`);
        expect(denied.status).toBe(403);
        expect(denied.body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
        const detail = await get(directiva, `${INST}/${id}`);
        expect(detail.body).toMatchObject({ contractVersion: 2, can_view_participants: false, participant_count: 2, pending_consent_count: 1 });
        expect(detail.body.products.map((p: any) => p.totals)).toEqual([
          { participant_count: 2, total_quantity_base: null, visibility: "PENDING_CONSENT", totals_basis: null },
          { participant_count: 1, total_quantity_base: "300", visibility: "VISIBLE", totals_basis: "ROLE_CONSENT" },
        ]);
        const text = JSON.stringify(detail.body);
        expect(text).not.toContain("farmerA");
        expect(text).not.toContain("1500");
      }
      expect((await get(director2, `${INST}/${id}`)).body.is_responsible).toBe(true);

      const allowed = await get(admin, `${INST}/${id}/participants`);
      expect(allowed.status).toBe(200);
      expect(allowed.body).toMatchObject({
        contractVersion: 2,
        provisional: true,
        notice: "Lista provisional: puede cambiar hasta el cierre",
        participant_count: 2,
        pending_consent_count: 1,
      });
      expect(allowed.body.pending_consent_notice).toMatch(/^1 participación sin la autorización vigente/);
      expect(allowed.body.participants.map((p: any) => p.name)).toEqual(["Usuario sintético farmerA"]);
      expect(JSON.stringify(allowed.body)).not.toMatch(/farmerA2|"500"/);
      const adminDetail = await get(admin, `${INST}/${id}`);
      expect(adminDetail.body).toMatchObject({ can_view_participants: true, is_responsible: false, can_manage: false });
      expect(adminDetail.body.products.map((p: any) => p.totals.visibility)).toEqual(["PENDING_CONSENT", "VISIBLE"]);

      // Closing: totals of rule T for everyone; per-person detail only for the Administración (ADMINISTRATION).
      expect((await post(director, `${INST}/${id}/close`, { confirmed: true })).body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      await grantAccess(id, director, "MANAGE");
      const closed = await post(director, `${INST}/${id}/close`, { confirmed: true });
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({
        contractVersion: 2,
        status: "CLOSED",
        mode: "MANUAL",
        participant_count: 2,
        can_view_participants: false,
        participants: null,
        pending_consent_count: 1,
      });
      expect(closed.body.lines.map((l: any) => [l.participant_count, l.total_quantity_base, l.visibility])).toEqual([
        [2, null, "PENDING_CONSENT"],
        [1, "300", "VISIBLE"],
      ]);
      expect((await get(director2, `${INST}/${id}/closing`)).body.participants).toBeNull();
      const adminClosing = await get(admin, `${INST}/${id}/closing`);
      expect(adminClosing.body.can_view_participants).toBe(true);
      expect(adminClosing.body.participants.map((p: any) => [p.name, p.lines.map((l: any) => l.quantity_base).sort()])).toEqual([
        ["Usuario sintético farmerA", ["1500", "300"]],
      ]);
      // The Administración sees them by role, not by being the responsible; a Directiva responsible does not.
      const adminCall = await openCall([await newProduct()], { responsible: admin });
      expect((await get(admin, `${INST}/${adminCall}/participants`)).status).toBe(200);
      expect((await get(director2, `${INST}/${adminCall}/participants`)).status).toBe(403);
      // Opening grants nothing any more (E4 §3.1) and says so.
      expect(await prisma.jointPurchaseCallAccess.count({ where: { callId: { in: [id, adminCall] }, grant: "PARTICIPANTS" } })).toBe(0);
      expect((await get(admin, `${INST}/${adminCall}`)).body.history.find((e: any) => e.kind === "OPENED").detail).toBe("Convocatoria abierta.");
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
      // Rewritten for E4 §7.1 (declared): every contract reads the shape of contract 4, with CONV-4 and its help
      // (serving CONV-1/CONV-3 would say that the responsible sees the data, which is no longer true).
      expect(mine.body).toMatchObject({ contractVersion: 4, consent: { version: "CONV-4", text: CONSENT_V4_TEXT, help: CONSENT_V4_HELP }, history: { older_count: 0 } });
      const item = mine.body.calls.find((c: any) => c.call_id === id);
      expect(item.participation.consent_scope).toMatchObject({ scope: "RESPONSIBLE_ONLY", version: "CONV-1", sequence: 0 });
      expect(item.participation.responsible_authorization).toBeUndefined();
      expect(item.responsible).toEqual({ name: "Usuario sintético directorA2" });

      // Without the header (contract 1), and with 3 and 4: the same shape 4 and the same data.
      for (const contract of [null, "3", "4"]) {
        const read = contract ? await http().get(ME).set("Authorization", auth(farmerA)).set("X-Joint-Purchase-Contract", contract) : await get(farmerA, ME);
        expect(Object.keys(read.body).sort()).toEqual(["calls", "consent", "contractVersion", "history", "server_time"]);
        expect(read.body.contractVersion).toBe(4);
        const same = read.body.calls.find((c: any) => c.call_id === id);
        expect({ ...same, server_time: null }).toEqual({ ...item, server_time: null });
      }
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
      // Rewritten for E4 §5.2 (declared): one person with CONV-1 does not cover the totals: PENDING_CONSENT for the
      // Directiva responsible (under E2 she saw "400" through her PARTICIPANTS row).
      expect(closing.body.lines[0]).toMatchObject({ participant_count: 1, total_quantity_base: null, visibility: "PENDING_CONSENT", totals_basis: null });
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
      // Rewritten for E4 §5.2 (declared, rule T point 2): three earlier consents in p1 and nobody seen by name: the
      // closing keeps the earlier rule (PREVIOUS_POLICY_K3); p2 (2 persons) is PENDING_CONSENT instead of UNDER_THRESHOLD.
      expect(first.body.lines.map((l: any) => [l.participant_count, l.total_quantity_base, l.visibility, l.totals_basis])).toEqual([
        [3, "600", "VISIBLE", "PREVIOUS_POLICY_K3"],
        [2, null, "PENDING_CONSENT", null],
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
    // Rewritten for E4 §3.1 (declared): the same rules for MANAGE (the only grant in force); PARTICIPANTS is retired
    // (409 GRANT_RETIRED, see the E4 block) and the database refuses any new PARTICIPANTS row.
    it("only the responsible grants MANAGE, to another eligible user of the tenant; idempotent; recorded in three places without farmer data", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      await confirm(farmerA, id, [[p, "7654321"]], 1);
      const inactiveMember = await addPerson("directorInactivo", f.tenantA, "DIRECTIVA");
      await prisma.member.update({ where: { id: inactiveMember }, data: { isActive: false } });
      const grantBody = (to: string, grant = "MANAGE") => ({ user_ref: to, grant, confirmed: true });

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

      const granted = await grantAccess(id, director, "MANAGE");
      expect(granted.body).toMatchObject({
        contractVersion: 2,
        can_grant: true,
        collaborators: [{ user_ref: userIdOf(director), name: "Usuario sintético directorA", role: "DIRECTIVA", grants: [{ grant: "MANAGE", granted_by: { user_ref: userIdOf(director2) } }] }],
        retired_grants: [],
        history: [{ action: "GRANTED", grant: "MANAGE", user: { user_ref: userIdOf(director) }, actor: { user_ref: userIdOf(director2) }, retired: false, notice: null }],
      });
      // A collaborator cannot grant (no chains), not even with MANAGE.
      expect((await post(director, `${INST}/${id}/collaborators`, grantBody(userIdOf(admin)))).body).toEqual({ errorCode: "COLLABORATORS_FORBIDDEN" });
      // Granting again: 200, no new event.
      const events = await prisma.jointPurchaseCallAccessEvent.count({ where: { callId: id } });
      await grantAccess(id, director, "MANAGE");
      expect(await prisma.jointPurchaseCallAccessEvent.count({ where: { callId: id } })).toBe(events);
      // Revoking what does not exist: 200, no new event.
      expect((await post(director2, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(admin), grant: "MANAGE" })).status).toBe(200);
      expect(await prisma.jointPurchaseCallAccessEvent.count({ where: { callId: id } })).toBe(events);
      // The responsible's own permission is not a collaborator grant.
      expect((await post(director2, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(director2), grant: "MANAGE" })).body).toEqual({
        errorCode: "COLLABORATOR_NOT_ELIGIBLE",
      });
      // Someone else's grant cannot be revoked by a non-responsible; the collaborator renounces their own.
      expect((await post(admin, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(director), grant: "MANAGE" })).body).toEqual({
        errorCode: "COLLABORATORS_FORBIDDEN",
      });
      const renounced = await post(director, `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(director), grant: "MANAGE" });
      expect(renounced.status).toBe(200);
      expect(renounced.body.collaborators).toEqual([]);

      // Anyone of the Directiva/Administración sees the collaborators; another tenant does not.
      const listed = await get(admin, `${INST}/${id}/collaborators`);
      expect(listed.status).toBe(200);
      expect(listed.body.can_grant).toBe(false);
      expect(listed.body.history.map((h: any) => [h.action, h.grant])).toEqual([["GRANTED", "MANAGE"], ["REVOKED", "MANAGE"]]);
      expect((await get(directorB, `${INST}/${id}/collaborators`)).status).toBe(404);
      expect((await get(farmerA, `${INST}/${id}/collaborators`)).status).toBe(403);

      const detail = await get(director, `${INST}/${id}`);
      expect(detail.body).toMatchObject({ can_view_participants: false, can_manage: false, my_grants: [], collaborator_count: 0 });
      expect(detail.body.history.filter((e: any) => e.kind.startsWith("ACCESS_")).map((e: any) => e.kind)).toEqual(["ACCESS_GRANTED", "ACCESS_REVOKED"]);
      expect(detail.body.history.find((e: any) => e.kind === "ACCESS_REVOKED").detail).toBe(
        "Usuario sintético directorA renunció al permiso «Administrar la convocatoria».",
      );
      const responsibleDetail = await get(director2, `${INST}/${id}`);
      expect(responsibleDetail.body).toMatchObject({ can_manage: true, my_grants: ["MANAGE"], is_responsible: true });
      const accessEvents = await prisma.jointPurchaseCallAccessEvent.findMany({ where: { callId: id } });
      expect(accessEvents).toHaveLength(2);
      const audit = await prisma.auditLog.findMany({ where: { entityId: id } });
      expect(audit.filter((a) => /Permiso|Renuncia/.test(a.summary ?? ""))).toHaveLength(2);
      expect(audit.every((a) => a.ownerUserId === null)).toBe(true);
      const recorded = JSON.stringify({ audit, accessEvents, history: detail.body.history });
      expect(recorded).not.toMatch(/farmerA|7654321/);

      // The database keeps the record: no change, no deletion; no new PARTICIPANTS row, from anyone.
      await expect(prisma.jointPurchaseCallAccessEvent.update({ where: { id: accessEvents[0]!.id }, data: { grant: "PARTICIPANTS" } })).rejects.toThrow();
      await expect(prisma.jointPurchaseCallAccessEvent.delete({ where: { id: accessEvents[0]!.id } })).rejects.toThrow();
      await expect(
        prisma.jointPurchaseCallAccess.create({ data: { callId: id, userId: userIdOf(admin), grant: "PARTICIPANTS", grantedByUserId: userIdOf(director2) } }),
      ).rejects.toThrow(/PARTICIPANTS está retirado/);
      await expect(
        prisma.jointPurchaseCallAccess.create({ data: { callId: id, userId: userIdOf(director2), grant: "PARTICIPANTS", grantedByUserId: null } }),
      ).rejects.toThrow(/PARTICIPANTS está retirado/);

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

    // Rewritten for E4 (declared, only the lines about participants): MANAGE, N2 and m6 are unchanged; what changes is
    // that the identified detail follows the role (an eligible Administración sees it, also with the responsible not
    // eligible) and no PARTICIPANTS delegation exists any more (director gets MANAGE instead).
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
      // Granted in DRAFT, MANAGE lets the collaborator edit and open; the detail follows the role, not MANAGE.
      await grantAccess(id, admin, "MANAGE");
      expect((await patch(admin, `${INST}/${id}`, { name: "Editada con MANAGE" })).status).toBe(200);
      const opened = await post(admin, `${INST}/${id}/open`, { confirmed: true });
      expect(opened.status).toBe(200);
      expect(opened.body).toMatchObject({ can_manage: true, can_view_participants: true, my_grants: ["MANAGE"] });
      expect((await get(admin, `${INST}/${id}/participants`)).status).toBe(200);
      // The Directiva responsible coordinates but does not see names (E4 §9.1).
      expect((await get(director2, `${INST}/${id}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });

      // N2 rejected (2026-11-12): an ineligible responsible gives nobody cancel or close by role.
      const director3Member = await addPerson("directorA3", f.tenantA, "DIRECTIVA");
      const director3 = await createSession(prisma, jwt, director3Member);
      const q = await newProduct();
      const orphan = await openCall([q], { responsible: director3, deadlineInMs: 2 * HOUR });
      await confirm4(farmerA, orphan, [[q, "55"]], 1);
      // m6: what she granted works while she is eligible...
      await grantAccess(orphan, admin, "MANAGE", director3);
      await grantAccess(orphan, director, "MANAGE", director3);
      expect((await get(director, `${INST}/${orphan}`)).body).toMatchObject({ can_manage: true, delegations_suspended: false });
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
        // E4 §6.3: the eligible Administración may substitute her.
        can_substitute_responsible: true,
      });
      for (const res of [
        await post(admin, `${INST}/${orphan}/close`, { confirmed: true }),
        await post(director, `${INST}/${orphan}/close`, { confirmed: true }),
        await post(director2, `${INST}/${orphan}/cancel`, { confirmed: true, reason: "Responsable inactiva" }),
      ]) {
        expect(res.body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      }
      // E4 §2: the Administración's access does not depend on the responsible.
      expect((await get(admin, `${INST}/${orphan}/participants`)).body.participants.map((x: any) => x.name)).toEqual(["Usuario sintético farmerA"]);
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
      expect((await get(director, `${INST}/${orphan}`)).body).toMatchObject({ can_manage: true, delegations_suspended: false });
    });

    // Rewritten for E4 (declared): under E2 CONV-1 reached the responsible and CONV-2 her collaborators. Under E4 no earlier
    // scope reaches anybody's identified detail, totals follow rule T, and a stored PARTICIPANTS row gives nothing.
    it("E4: earlier consents (CONV-1, CONV-2) reach nobody's detail; totals follow rule T open and closed; a decision ADMINISTRATION in CLOSED changes what is seen without touching the closing", async () => {
      const CONV2 = { version: "CONV-2", accepted_at: "2026-11-11T20:00:00.000Z" };
      const p1 = await newProduct();
      const p2 = await newProduct();
      const id = await openCall([p1, p2]);
      expect((await confirm(farmerA, id, [[p1, "100"]], 1)).body.participation.consent.version).toBe("CONV-1");
      expect((await confirm(farmerA2, id, [[p1, "200"], [p2, "20"]], 1, randomUUID(), CONV2)).body.participation.consent.version).toBe("CONV-2");
      expect((await confirm4(farmerA3, id, [[p1, "300"], [p2, "30"]], 1)).status).toBe(200);
      // director held «Consultar participantes» before E4: the row is kept and gives nothing.
      await storedBeforeE4([{ callId: id, userId: userIdOf(director), grantedByUserId: userIdOf(director2) }]);

      expect((await get(director, `${INST}/${id}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
      expect((await get(director2, `${INST}/${id}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
      const adminList = await get(admin, `${INST}/${id}/participants`);
      expect(adminList.body).toMatchObject({ participant_count: 3, pending_consent_count: 2 });
      expect(adminList.body.participants.map((x: any) => x.name)).toEqual(["Usuario sintético farmerA3"]);
      expect(JSON.stringify(adminList.body)).not.toMatch(/Usuario sintético farmerA"|"100"|"200"/);

      // Open: every product has an earlier participation, so no live total for anyone.
      const totals = async (session: TestSession) =>
        (await get(session, `${INST}/${id}`)).body.products.map((x: any) => [x.totals.total_quantity_base, x.totals.visibility, x.totals.totals_basis]);
      for (const viewer of [director, director2, admin]) {
        expect(await totals(viewer)).toEqual([[null, "PENDING_CONSENT", null], [null, "PENDING_CONSENT", null]]);
      }

      expect((await post(director2, `${INST}/${id}/close`, { confirmed: true })).status).toBe(200);
      const closingOf = async (session: TestSession) => (await get(session, `${INST}/${id}/closing`)).body;
      const lines = (body: any) => body.lines.map((l: any) => [l.participant_count, l.total_quantity_base, l.visibility, l.totals_basis]);
      // The Directiva sees nobody by name: p1 (3 persons) keeps the earlier rule; p2 (2) is pending.
      for (const viewer of [director, director2]) {
        const closing = await closingOf(viewer);
        expect(lines(closing)).toEqual([[3, "600", "VISIBLE", "PREVIOUS_POLICY_K3"], [2, null, "PENDING_CONSENT", null]]);
        expect(closing).toMatchObject({ can_view_participants: false, participants: null, pending_consent_count: 2 });
      }
      // The Administración sees farmerA3 by name: subtracting would reveal the others, so p1 is pending for her.
      const adminClosing = await closingOf(admin);
      expect(lines(adminClosing)).toEqual([[3, null, "PENDING_CONSENT", null], [2, null, "PENDING_CONSENT", null]]);
      expect(adminClosing.participants.map((x: any) => x.name)).toEqual(["Usuario sintético farmerA3"]);

      // E4 §8 test 8: farmerA2 authorizes the Administración in the CLOSED call: what is seen changes, the closing does not.
      const frozen = async () => ({
        lines: await prisma.jointPurchaseCallClosingLine.findMany({ where: { callId: id }, orderBy: { productId: "asc" } }),
        participants: await prisma.jointPurchaseCallClosingParticipant.count({ where: { callId: id } }),
        participantLines: await prisma.jointPurchaseCallClosingParticipantLine.count({ where: { callId: id } }),
        closing: await prisma.jointPurchaseCallClosing.findUniqueOrThrow({ where: { callId: id } }),
      });
      const before = await frozen();
      expect((await decide4(farmerA2, id, "ADMINISTRATION", 1)).status).toBe(200);
      expect(await frozen()).toEqual(before);
      const after = await closingOf(admin);
      expect(after.participants.map((x: any) => x.name).sort()).toEqual(["Usuario sintético farmerA2", "Usuario sintético farmerA3"]);
      // p2 now has only ADMINISTRATION participations: visible to both roles; p1 still has farmerA (CONV-1).
      expect(lines(after)).toEqual([[3, null, "PENDING_CONSENT", null], [2, "50", "VISIBLE", "ROLE_CONSENT"]]);
      expect(lines(await closingOf(director))).toEqual([[3, "600", "VISIBLE", "PREVIOUS_POLICY_K3"], [2, "50", "VISIBLE", "ROLE_CONSENT"]]);
      // The stored row is history only.
      const collaborators = (await get(director, `${INST}/${id}/collaborators`)).body;
      expect(collaborators.collaborators).toEqual([]);
      expect(collaborators.retired_grants).toEqual([
        expect.objectContaining({ grant: "PARTICIPANTS", user: expect.objectContaining({ user_ref: userIdOf(director) }), retired: true, notice: expect.stringMatching(/^Permiso de visualización retirado el \d{4}-\d{2}-\d{2}; no da acceso\.$/) }),
      ]);
      expect(collaborators.history).toEqual([expect.objectContaining({ action: "GRANTED", grant: "PARTICIPANTS", retired: true })]);
    });

    // Rewritten for E4 §4.2 (declared): the decisions are now ADMINISTRATION, TOTALS_ONLY and the earlier reduction;
    // widening to COLLABORATORS is retired. The P-C properties (own order, idempotency, quantities never change the
    // consent, insert-only register) are kept and checked again.
    it("E4 §4.2 (test 8): CONV-4 gives ADMINISTRATION; TOTALS_ONLY and reductions in their own order; widening and authorizing retired; quantities and decisions never cross", async () => {
      const p1 = await newProduct();
      const id = await openCall([p1], { deadlineInMs: 4 * HOUR });
      const names = async () => ((await get(admin, `${INST}/${id}/participants`)).body.participants as any[]).map((x) => x.name);
      const total = async () => (await get(director, `${INST}/${id}`)).body.products[0].totals;
      const stored = () =>
        prisma.jointPurchaseParticipation.findFirstOrThrow({
          where: { callId: id, member: { user: { name: "Usuario sintético farmerA" } } },
          include: { lines: true },
        });
      const decisions = async () =>
        (await prisma.jointPurchaseConsentDecision.findMany({ where: { callId: id }, orderBy: [{ sequence: "asc" }, { receivedAt: "asc" }] })).map(
          (d) => [d.source, d.scope, d.consentVersion, d.sequence, d.responsibleVersion],
        );

      // Without a participation there is nothing to decide on: the phone keeps the decision pending.
      expect((await decide4(farmerA, id, "ADMINISTRATION", 1)).body).toEqual({ errorCode: "PARTICIPATION_REQUIRED" });

      // First confirmation with CONV-4: ADMINISTRATION, and no responsible authorized (P-A C1 is history only).
      const first = await confirm4(farmerA, id, [[p1, "100"]], 1);
      expect(first.status).toBe(200);
      expect(first.body.participation.consent_scope).toMatchObject({ scope: "ADMINISTRATION", version: "CONV-4", sequence: 0 });
      expect(first.body.participation.responsible_authorization).toBeUndefined();
      expect((await stored()).consentResponsibleVersion).toBeNull();
      expect(await names()).toEqual(["Usuario sintético farmerA"]);
      expect(await total()).toEqual({ participant_count: 1, total_quantity_base: "100", visibility: "VISIBLE", totals_basis: "ROLE_CONSENT" });

      // A modification carrying another text never changes the scope.
      const modified = await confirm4(farmerA, id, [[p1, "150"]], 2, randomUUID(), { version: "CONV-2", accepted_at: "2026-11-13T09:10:00.000Z" });
      expect(modified.status).toBe(200);
      expect((await stored()).consentScope).toBe("ADMINISTRATION");
      expect((await stored()).consentVersion).toBe("CONV-4");

      // TOTALS_ONLY (D-05): with any known text; the name leaves the detail, the total stays.
      const totalsOnly = await decide4(farmerA, id, "TOTALS_ONLY", 1, randomUUID(), "CONV-1");
      expect(totalsOnly.status).toBe(200);
      expect(totalsOnly.body.participation).toMatchObject({
        lines: [{ product_ref: p1, quantity_base: "150" }],
        last_sequence: 2,
        consent: { version: "CONV-4" },
        consent_scope: { scope: "TOTALS_ONLY", version: "CONV-1", sequence: 1 },
      });
      expect(await names()).toEqual([]);
      expect((await total()).visibility).toBe("VISIBLE");

      // ADMINISTRATION needs CONV-4 and never names a responsible.
      expect((await decide4(farmerA, id, "ADMINISTRATION", 2, randomUUID(), "CONV-3")).body).toEqual({ errorCode: "CONSENT_REQUIRED" });
      expect((await decideAs("4", farmerA, id, { scope: "ADMINISTRATION", sequence: 2, authorize_responsible: false })).body).toEqual({
        errorCode: "PAYLOAD_INVALID",
      });
      // Out of order: never restores an earlier access.
      const stale = await decide4(farmerA, id, "ADMINISTRATION", 1);
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({ errorCode: "STALE_SEQUENCE", participation: { consent_scope: { scope: "TOTALS_ONLY" } } });
      expect(await names()).toEqual([]);

      const adminOp = randomUUID();
      const authorized = await decide4(farmerA, id, "ADMINISTRATION", 2, adminOp);
      expect(authorized.status).toBe(200);
      expect(authorized.body.participation).toMatchObject({ lines: [{ quantity_base: "150" }], last_sequence: 2, consent_scope: { scope: "ADMINISTRATION", sequence: 2 } });
      expect(await names()).toEqual(["Usuario sintético farmerA"]);
      // The same operation_id: the same answer; with another body: refused.
      expect((await decide4(farmerA, id, "ADMINISTRATION", 2, adminOp)).body).toEqual(authorized.body);
      expect((await decide4(farmerA, id, "TOTALS_ONLY", 2, adminOp)).body).toEqual({ errorCode: "OPERATION_ID_REUSED" });

      // Widening to collaborators and authorizing a responsible are retired, with any version, definitively.
      const widenOp = randomUUID();
      for (const version of ["CONV-1", "CONV-2", "CONV-3", "CONV-4"]) {
        expect((await decide4(farmerA, id, "COLLABORATORS", 3, version === "CONV-3" ? widenOp : randomUUID(), version)).body).toEqual({
          errorCode: "CONSENT_VERSION_RETIRED",
        });
      }
      expect((await decide4(farmerA, id, "COLLABORATORS", 3, widenOp, "CONV-3")).body).toEqual({ errorCode: "CONSENT_VERSION_RETIRED" });
      expect(
        (await decideAs("4", farmerA, id, { scope: "RESPONSIBLE_ONLY", sequence: 3, version: "CONV-3", responsible_version: 1, authorize_responsible: true })).body,
      ).toEqual({ errorCode: "CONSENT_VERSION_RETIRED" });
      expect((await stored()).consentScope).toBe("ADMINISTRATION");

      // A reduction is respected; a late one is STALE and a later one is respected.
      expect((await decide4(farmerA, id, "RESPONSIBLE_ONLY", 4, randomUUID(), "CONV-1")).status).toBe(200);
      expect(await names()).toEqual([]);
      expect((await decide4(farmerA, id, "ADMINISTRATION", 5)).status).toBe(200);
      expect((await decide4(farmerA, id, "RESPONSIBLE_ONLY", 3, randomUUID(), "CONV-1")).body.errorCode).toBe("STALE_SEQUENCE");
      expect(await names()).toEqual(["Usuario sintético farmerA"]);
      expect((await decide4(farmerA, id, "RESPONSIBLE_ONLY", 6, randomUUID(), "CONV-1")).status).toBe(200);
      expect(await names()).toEqual([]);
      expect((await decide4(farmerA, id, "ADMINISTRATION", 7)).status).toBe(200);

      // Quantities and decisions keep their own orders and never cross.
      expect((await confirm4(farmerA, id, [[p1, "160"]], 3)).status).toBe(200);
      expect((await stored()).consentScope).toBe("ADMINISTRATION");
      expect((await stored()).consentScopeSequence).toBe(7);
      expect((await stored()).lastSequence).toBe(3);
      expect((await stored()).lines.map((l) => l.quantityBase)).toEqual([160n]);

      // Each accepted decision is recorded once, in order, insert-only; retired ones write nothing.
      expect(await decisions()).toEqual([
        ["INITIAL", "ADMINISTRATION", "CONV-4", 0, null],
        ["DECISION", "TOTALS_ONLY", "CONV-1", 1, null],
        ["DECISION", "ADMINISTRATION", "CONV-4", 2, null],
        ["DECISION", "RESPONSIBLE_ONLY", "CONV-1", 4, null],
        ["DECISION", "ADMINISTRATION", "CONV-4", 5, null],
        ["DECISION", "RESPONSIBLE_ONLY", "CONV-1", 6, null],
        ["DECISION", "ADMINISTRATION", "CONV-4", 7, null],
      ]);
      const retired = await prisma.jointPurchaseParticipationOperation.findUniqueOrThrow({
        where: { callId_memberId_operationId: { callId: id, memberId: f.members.farmerA, operationId: widenOp } },
      });
      expect(retired.outcome).toBe("CONSENT_VERSION_RETIRED");
      const row = await prisma.jointPurchaseConsentDecision.findFirstOrThrow({ where: { callId: id } });
      await expect(prisma.jointPurchaseConsentDecision.update({ where: { id: row.id }, data: { scope: "TOTALS_ONLY" } })).rejects.toThrow();
      await expect(prisma.jointPurchaseConsentDecision.delete({ where: { id: row.id } })).rejects.toThrow();

      // After the deadline: quantities are refused, decisions are not; in CLOSED too.
      clock.advance(5 * HOUR);
      expect((await confirm4(farmerA, id, [[p1, "170"]], 4)).body).toEqual({ errorCode: "CALL_NOT_OPEN", reason: "DEADLINE_PASSED" });
      expect((await decide4(farmerA, id, "TOTALS_ONLY", 8)).status).toBe(200);
      await worker.runOnce();
      expect((await get(admin, `${INST}/${id}/closing`)).body.participants).toEqual([]);
      expect((await decide4(farmerA, id, "ADMINISTRATION", 9)).status).toBe(200);
      expect(((await get(admin, `${INST}/${id}/closing`)).body.participants as any[]).map((x) => x.name)).toEqual(["Usuario sintético farmerA"]);
      // The Directiva never, also as the responsible.
      expect((await get(director2, `${INST}/${id}/closing`)).body.participants).toBeNull();
    });

    // Rewritten for E4 §4.2 (declared): on a CANCELLED call ADMINISTRATION and TOTALS_ONLY are refused (no change there);
    // widening is retired everywhere; the earlier reduction is still accepted.
    it("E4 §4.2: on a cancelled call ADMINISTRATION and TOTALS_ONLY are refused, widening is retired and a reduction is accepted", async () => {
      const p1 = await newProduct();
      const id = await openCall([p1]);
      await confirm4(farmerA2, id, [[p1, "40"]], 1);
      expect((await post(director2, `${INST}/${id}/cancel`, { confirmed: true, reason: "Motivo sintético" })).status).toBe(200);
      expect((await decide4(farmerA2, id, "TOTALS_ONLY", 1)).body).toEqual({ errorCode: "WIDENING_NOT_ALLOWED", status: "CANCELLED" });
      expect((await decide4(farmerA2, id, "ADMINISTRATION", 1)).body).toEqual({ errorCode: "WIDENING_NOT_ALLOWED", status: "CANCELLED" });
      expect((await decide4(farmerA2, id, "COLLABORATORS", 1, randomUUID(), "CONV-3")).body).toEqual({ errorCode: "CONSENT_VERSION_RETIRED" });
      expect((await decide4(farmerA2, id, "RESPONSIBLE_ONLY", 2, randomUUID(), "CONV-1")).status).toBe(200);
      // Another tenant's farmer does not reach it.
      expect((await decide4(farmerB, id, "RESPONSIBLE_ONLY", 1)).status).toBe(404);
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

  // Rewritten for E4 §3.2 and §6.3 (declared): the tenant permission «Sustituir responsable» (A1) is retired; the eligible
  // Administración substitutes by role. Every B1 safeguard of the earlier block is checked again here (self-substitution,
  // RESPONSIBLE_STILL_ELIGIBLE, RESPONSIBLE_CHANGED, REQUEST_ID_REUSED, DRAFT/OPEN/CLOSED/CANCELLED, closing and deadline
  // kept, no purchases/debts/stock); C1 (the farmer authorizing the responsible) no longer decides any access.
  describe("E4 §6.3 substitution by the eligible Administración (P-A safeguards kept)", () => {
    const PERMS = "/api/v1/joint-purchase-substitution-permissions";
    const substitute = (by: TestSession, callId: string, to: TestSession, expected: number, requestId = randomUUID(), reason = "Responsable de baja por viaje") =>
      post(by, `${INST}/${callId}/responsible`, {
        request_id: requestId,
        expected_responsible_version: expected,
        new_responsible_ref: userIdOf(to),
        reason,
        confirmed: true,
      });
    const own = async (session: TestSession, callId: string, contract: "2" | "3" | "4" = "4") =>
      ((await http().get(ME).set("Authorization", auth(session)).set("X-Joint-Purchase-Contract", contract)).body.calls as any[]).find(
        (c) => c.call_id === callId,
      );

    let admin2: TestSession;

    /** A permission «Sustituir responsable» granted before E4 (the rows are history; inserting them is still possible in the base). */
    async function permissionGrantedBeforeE4(holder: TestSession) {
      const exists = await prisma.jointPurchaseSubstitutionGrant.findUnique({ where: { tenantId_userId: { tenantId: f.tenantA, userId: userIdOf(holder) } } });
      if (exists) return;
      const at = new Date("2026-11-12T19:00:00.000Z");
      await prisma.jointPurchaseSubstitutionGrant.create({
        data: { tenantId: f.tenantA, userId: userIdOf(holder), grantedByUserId: userIdOf(admin2), grantedAt: at, reason: "Cobertura sintética" },
      });
      await prisma.jointPurchaseSubstitutionGrantEvent.create({
        data: { tenantId: f.tenantA, userId: userIdOf(holder), action: "GRANTED", actorUserId: userIdOf(admin2), at, reason: "Cobertura sintética" },
      });
    }

    beforeAll(async () => {
      admin2 = await createSession(prisma, jwt, await addPerson("adminA2", f.tenantA, "ADMINISTRADOR"));
    });

    it("E4 §8 test 6: granting and revoking «Sustituir responsable» answer 409 SUBSTITUTION_PERMISSION_RETIRED and write nothing; the GET is read-only history", async () => {
      await permissionGrantedBeforeE4(director);
      const counts = async () => ({
        grants: await prisma.jointPurchaseSubstitutionGrant.count(),
        events: await prisma.jointPurchaseSubstitutionGrantEvent.count(),
        audit: await prisma.auditLog.count({ where: { entityName: "JointPurchaseSubstitutionGrant" } }),
      });
      const before = await counts();
      const body = (user: string) => ({ user_ref: user, reason: "Coordinar entregas", confirmed: true });
      for (const by of [admin, admin2, director]) {
        const granted = await post(by, PERMS, body(userIdOf(director2)));
        expect(granted.status).toBe(409);
        expect(granted.body).toEqual({ errorCode: "SUBSTITUTION_PERMISSION_RETIRED" });
        expect((await post(by, `${PERMS}/revoke`, { user_ref: userIdOf(director) })).body).toEqual({ errorCode: "SUBSTITUTION_PERMISSION_RETIRED" });
      }
      // A holder cannot renounce either: the row is history.
      expect((await post(director, `${PERMS}/revoke`, { user_ref: userIdOf(director), reason: "Ya no coordino" })).status).toBe(409);
      expect((await post(farmerA, PERMS, body(userIdOf(director)))).status).toBe(403);
      expect(await counts()).toEqual(before);

      const read = await get(director, PERMS);
      expect(read.status).toBe(200);
      expect(Object.keys(read.body).sort()).toEqual(["can_grant", "contractVersion", "history", "holders", "notice", "retired_at"]);
      expect(read.body).toMatchObject({ contractVersion: 2, can_grant: false, notice: "Ya no se usa: sustituye la Administración habilitada" });
      expect(new Date(read.body.retired_at).toISOString()).toBe(read.body.retired_at);
      expect(read.body.holders).toEqual([
        expect.objectContaining({ user_ref: userIdOf(director), granted_by: expect.objectContaining({ user_ref: userIdOf(admin2) }), reason: "Cobertura sintética" }),
      ]);
      expect(read.body.history.map((h: any) => [h.action, h.user.user_ref])).toEqual([["GRANTED", userIdOf(director)]]);
      expect((await get(admin, PERMS)).body.can_grant).toBe(false);
      // Another tenant sees nothing of it; the base keeps the trace.
      expect((await get(directorB, PERMS)).body).toMatchObject({ holders: [], history: [] });
      await expect(prisma.jointPurchaseSubstitutionGrantEvent.deleteMany({ where: { tenantId: f.tenantA } })).rejects.toThrow();
    });

    it("E4 §8 test 7: an eligible Administración substitutes without any permission; a Directiva with a permission granted before gets 403; every condition on an OPEN call", async () => {
      await permissionGrantedBeforeE4(director);
      const respMember = await addPerson("respE4", f.tenantA, "DIRECTIVA");
      const resp = await createSession(prisma, jwt, respMember);
      const p1 = await newProduct();
      const p2 = await newProduct();
      const id = await openCall([p1, p2], { responsible: resp });
      expect((await confirm4(farmerA, id, [[p1, "100"]], 1)).status).toBe(200);
      expect((await confirm(farmerA2, id, [[p1, "200"], [p2, "20"]], 1)).status).toBe(200);
      await grantAccess(id, admin2, "MANAGE", resp);
      // director held «Consultar participantes» on this call before E4.
      await storedBeforeE4([{ callId: id, userId: userIdOf(director), grantedByUserId: userIdOf(resp) }]);
      const before = await prisma.jointPurchaseParticipation.findMany({ where: { callId: id }, include: { lines: true }, orderBy: { id: "asc" } });
      const callBefore = await prisma.jointPurchaseCall.findUniqueOrThrow({ where: { id } });
      const accessBefore = await prisma.jointPurchaseCallAccess.findMany({ where: { callId: id, grant: "PARTICIPANTS" } });
      const legacy = await legacyCounts();

      // While the responsible is eligible nobody substitutes her.
      expect((await substitute(admin, id, director2, 1)).body).toEqual({ errorCode: "RESPONSIBLE_STILL_ELIGIBLE" });
      expect((await get(admin, `${INST}/${id}`)).body.can_substitute_responsible).toBe(false);
      await prisma.member.update({ where: { id: respMember }, data: { isActive: false } });
      expect((await get(admin, `${INST}/${id}`)).body.can_substitute_responsible).toBe(true);
      expect((await get(director, `${INST}/${id}`)).body.can_substitute_responsible).toBe(false);
      // A Directiva, also with a permission granted before; another tenant.
      expect((await substitute(director, id, director2, 1)).body).toEqual({ errorCode: "SUBSTITUTION_FORBIDDEN" });
      expect((await substitute(director2, id, director, 1)).body).toEqual({ errorCode: "SUBSTITUTION_FORBIDDEN" });
      expect((await substitute(directorB, id, director, 1)).status).toBe(404);
      // The successor: eligible, of the tenant, never the actor herself.
      for (const to of [admin, farmerA, directorB]) {
        expect((await substitute(admin, id, to, 1)).body).toEqual({ errorCode: "SUCCESSOR_NOT_ELIGIBLE" });
      }
      expect((await substitute(admin, id, director2, 1, randomUUID(), " ")).body).toEqual({ errorCode: "REASON_REQUIRED" });
      expect(
        (await post(admin, `${INST}/${id}/responsible`, { request_id: randomUUID(), expected_responsible_version: 1, new_responsible_ref: userIdOf(director2), reason: "x" }))
          .body,
      ).toEqual({ errorCode: "CONFIRMATION_REQUIRED" });
      expect((await substitute(admin, id, director2, 2)).body).toEqual({ errorCode: "RESPONSIBLE_CHANGED", responsible_version: 1 });

      const requestId = randomUUID();
      const done = await substitute(admin, id, director2, 1, requestId);
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({
        contractVersion: 2,
        status: "OPEN",
        deadline_at: callBefore.deadlineAt.toISOString(),
        responsible: { user_ref: userIdOf(director2), eligible: true, version: 2 },
        // The actor is an Administración: she sees the participations with ADMINISTRATION, as before the change.
        can_view_participants: true,
        responsible_changes: [
          { version: 2, previous: { user_ref: userIdOf(resp) }, next: { user_ref: userIdOf(director2) }, actor: { user_ref: userIdOf(admin) }, call_status: "OPEN", suspended_delegations: 1 },
        ],
      });
      // A retry answers the same, without a second change; the same id with another body is refused.
      expect((await substitute(admin, id, director2, 1, requestId)).status).toBe(200);
      expect((await substitute(admin, id, director2, 1, requestId, "Otro motivo")).body).toEqual({ errorCode: "REQUEST_ID_REUSED" });
      expect(await prisma.jointPurchaseResponsibleChange.count({ where: { callId: id } })).toBe(1);
      expect(await prisma.jointPurchaseCallEvent.count({ where: { callId: id, kind: "RESPONSIBLE_REPLACED" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { entityId: id, summary: { contains: "Persona responsable sustituida" } } })).toBe(1);
      // Nothing else changed: participations, quantities, scopes, PARTICIPANTS rows, purchases, debts and stock.
      const after = await prisma.jointPurchaseParticipation.findMany({ where: { callId: id }, include: { lines: true }, orderBy: { id: "asc" } });
      const shape = (rows: typeof before) =>
        rows.map((p) => [p.status, p.lines.map((l) => [l.productId, l.quantityBase.toString()]), p.consentScope, p.consentResponsibleVersion]);
      expect(shape(after)).toEqual(shape(before));
      expect(await prisma.jointPurchaseCallAccess.findMany({ where: { callId: id, grant: "PARTICIPANTS" } })).toEqual(accessBefore);
      expect(await legacyCounts()).toEqual(legacy);

      // Only MANAGE delegations are suspended until the successor reviews them; the stored view permission is history.
      const collaborators = await get(director2, `${INST}/${id}/collaborators`);
      expect(collaborators.body).toMatchObject({ contractVersion: 2, can_review: true, responsible_version: 2 });
      expect(collaborators.body.collaborators.map((c: any) => [c.user_ref, c.grants.map((g: any) => [g.grant, g.status])])).toEqual([
        [userIdOf(admin2), [["MANAGE", "PENDING_REVIEW"]]],
      ]);
      expect(collaborators.body.retired_grants.map((g: any) => g.user.user_ref)).toEqual([userIdOf(director)]);
      expect(collaborators.body.history.filter((h: any) => h.action === "SUSPENDED").map((h: any) => h.grant)).toEqual(["MANAGE"]);
      expect((await post(admin2, `${INST}/${id}/close`, { confirmed: true })).body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });

      // E4 §2: the detail does not depend on the responsible: the Administración keeps seeing ADMINISTRATION, the
      // new Directiva responsible manages and sees no names, the former responsible recovers nothing.
      const adminList = await get(admin, `${INST}/${id}/participants`);
      expect(adminList.body).toMatchObject({ participant_count: 2, pending_consent_count: 1 });
      expect(adminList.body.participants.map((p: any) => p.name)).toEqual(["Usuario sintético farmerA"]);
      expect((await get(admin2, `${INST}/${id}/participants`)).body.participants.map((p: any) => p.name)).toEqual(["Usuario sintético farmerA"]);
      expect((await get(director2, `${INST}/${id}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
      expect((await get(director, `${INST}/${id}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
      expect((await get(director2, `${INST}/${id}`)).body).toMatchObject({ can_manage: true, pending_delegation_reviews: 1, pending_consent_count: 1, can_substitute_responsible: false });
      await prisma.member.update({ where: { id: respMember }, data: { isActive: true } });
      expect((await get(resp, `${INST}/${id}`)).body).toMatchObject({ is_responsible: false, can_manage: false, can_view_participants: false });

      // The farmers are asked nothing new: contract 4 carries no responsible version nor authorization.
      const mine = await own(farmerA, id);
      expect(mine.responsible).toEqual({ name: "Usuario sintético directorA2" });
      expect(mine.participation.responsible_authorization).toBeUndefined();
      expect(mine.participation.consent_scope.scope).toBe("ADMINISTRATION");

      // Review: MANAGE confirmed by the current responsible; PARTICIPANTS is retired.
      expect((await post(director2, `${INST}/${id}/collaborators/review`, { user_ref: userIdOf(director), grant: "PARTICIPANTS", decision: "CONFIRM" })).body).toEqual({
        errorCode: "GRANT_RETIRED",
      });
      expect((await post(director, `${INST}/${id}/collaborators/review`, { user_ref: userIdOf(admin2), grant: "MANAGE", decision: "CONFIRM" })).body).toEqual({
        errorCode: "COLLABORATORS_FORBIDDEN",
      });
      const confirmed = await post(director2, `${INST}/${id}/collaborators/review`, { user_ref: userIdOf(admin2), grant: "MANAGE", decision: "CONFIRM" });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.collaborators[0].grants[0]).toMatchObject({ grant: "MANAGE", status: "IN_FORCE", responsible_version: 2 });
      expect((await post(director2, `${INST}/${id}/collaborators/review`, { user_ref: userIdOf(admin2), grant: "MANAGE", decision: "CONFIRM" })).body).toEqual({
        errorCode: "DELEGATION_NOT_PENDING",
      });
      expect((await get(admin2, `${INST}/${id}`)).body.can_manage).toBe(true);
    });

    it("B1 on a DRAFT and a CLOSED call, never a CANCELLED one; the closing and the deadline are kept; a farmer's decision in CLOSED changes only what is seen", async () => {
      const respMember = await addPerson("respE4b", f.tenantA, "DIRECTIVA");
      const resp = await createSession(prisma, jwt, respMember);
      // DRAFT: the successor administers it and opens it; no view permission is created.
      const draft = await createDraft([await newProduct()], { responsible: resp });
      await prisma.member.update({ where: { id: respMember }, data: { isActive: false } });
      expect((await patch(director, `${INST}/${draft.body.call_id}`, { name: "Sin permiso" })).body).toEqual({ errorCode: "MANAGE_FORBIDDEN" });
      const drafted = await substitute(admin, draft.body.call_id, director, 1);
      expect(drafted.body).toMatchObject({ status: "DRAFT", responsible: { user_ref: userIdOf(director), version: 2 } });
      expect((await post(director, `${INST}/${draft.body.call_id}/open`, { confirmed: true })).status).toBe(200);
      expect(await prisma.jointPurchaseCallAccess.count({ where: { callId: draft.body.call_id } })).toBe(0);

      // CLOSED: coordinating the delivery; nothing of the closing changes.
      await prisma.member.update({ where: { id: respMember }, data: { isActive: true } });
      const q = await newProduct();
      const closedId = await openCall([q], { responsible: resp, deadlineInMs: 2 * HOUR });
      for (const [s, qty] of [[farmerA, "10"], [farmerA2, "20"], [farmerA3, "30"]] as const) {
        expect((await confirm(s, closedId, [[q, qty]], 1)).status).toBe(200);
      }
      clock.advance(3 * HOUR);
      expect(await worker.runOnce()).toContain(closedId);
      const closingBefore = (await get(resp, `${INST}/${closedId}/closing`)).body;
      const callBefore = await prisma.jointPurchaseCall.findUniqueOrThrow({ where: { id: closedId } });
      const frozenBefore = await prisma.jointPurchaseCallClosingParticipantLine.findMany({ where: { callId: closedId }, orderBy: { participationId: "asc" } });
      await prisma.member.update({ where: { id: respMember }, data: { isActive: false } });
      const closed = await substitute(admin, closedId, director2, 1);
      expect(closed.body).toMatchObject({ status: "CLOSED", responsible: { version: 2 }, closed_at: callBefore.closedAt!.toISOString() });
      const callAfter = await prisma.jointPurchaseCall.findUniqueOrThrow({ where: { id: closedId } });
      expect([callAfter.deadlineAt, callAfter.closedAt, callAfter.openedAt]).toEqual([callBefore.deadlineAt, callBefore.closedAt, callBefore.openedAt]);
      const lines = (body: any) => body.lines.map((l: any) => [l.participant_count, l.total_quantity_base, l.visibility, l.totals_basis]);
      // Three earlier consents and nobody seen by name: the earlier rule, for the Directiva and the Administración alike.
      const directivaClosing = (await get(director2, `${INST}/${closedId}/closing`)).body;
      expect(directivaClosing).toMatchObject({ cutoff_at: closingBefore.cutoff_at, closed_at: closingBefore.closed_at, participant_count: 3, participants: null, pending_consent_count: 3 });
      expect(lines(directivaClosing)).toEqual([[3, "60", "VISIBLE", "PREVIOUS_POLICY_K3"]]);
      const adminClosing = (await get(admin2, `${INST}/${closedId}/closing`)).body;
      expect(adminClosing.participants).toEqual([]);
      expect(lines(adminClosing)).toEqual([[3, "60", "VISIBLE", "PREVIOUS_POLICY_K3"]]);
      // A farmer authorizes the Administración in the closed call without editing the order.
      expect((await confirm(farmerA, closedId, [[q, "99"]], 2)).body).toMatchObject({ errorCode: "CALL_NOT_OPEN" });
      expect((await decide4(farmerA, closedId, "ADMINISTRATION", 1)).status).toBe(200);
      const seen = (await get(admin2, `${INST}/${closedId}/closing`)).body;
      expect(seen.participants.map((p: any) => [p.name, p.lines[0].quantity_base])).toEqual([["Usuario sintético farmerA", "10"]]);
      // Now she sees one by name: subtracting would reveal the others, so no total for her; the Directiva keeps it.
      expect(lines(seen)).toEqual([[3, null, "PENDING_CONSENT", null]]);
      expect(lines((await get(director2, `${INST}/${closedId}/closing`)).body)).toEqual([[3, "60", "VISIBLE", "PREVIOUS_POLICY_K3"]]);
      expect(await prisma.jointPurchaseCallClosingParticipantLine.findMany({ where: { callId: closedId }, orderBy: { participationId: "asc" } })).toEqual(frozenBefore);

      // CANCELLED: no substitution.
      await prisma.member.update({ where: { id: respMember }, data: { isActive: true } });
      const cancelled = await createDraft([await newProduct()], { responsible: resp });
      expect((await post(resp, `${INST}/${cancelled.body.call_id}/cancel`, { confirmed: true, reason: "No va" })).status).toBe(200);
      await prisma.member.update({ where: { id: respMember }, data: { isActive: false } });
      expect((await get(admin, `${INST}/${cancelled.body.call_id}`)).body.can_substitute_responsible).toBe(false);
      expect((await substitute(admin, cancelled.body.call_id, director2, 1)).body).toEqual({ errorCode: "INVALID_TRANSITION", status: "CANCELLED" });

      // The database refuses a change of responsible without its record, and a substitution that changes anything else.
      await expect(prisma.jointPurchaseCall.update({ where: { id: closedId }, data: { responsibleUserId: userIdOf(director) } })).rejects.toThrow();
      await expect(
        prisma.jointPurchaseCall.update({ where: { id: closedId }, data: { responsibleUserId: userIdOf(director), responsibleVersion: 3 } }),
      ).rejects.toThrow(/sin registro válido/);
      await expect(prisma.jointPurchaseResponsibleChange.deleteMany({ where: { callId: closedId } })).rejects.toThrow();
    });

    it("two concurrent substitutions by two Administraciones: one wins, the other is refused (never overwritten silently)", async () => {
      const respMember = await addPerson("respE4c", f.tenantA, "DIRECTIVA");
      const resp = await createSession(prisma, jwt, respMember);
      const id = await openCall([await newProduct()], { responsible: resp });
      await prisma.member.update({ where: { id: respMember }, data: { isActive: false } });
      const results = await Promise.all([substitute(admin, id, director2, 1), substitute(admin2, id, director, 1)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body).toEqual({ errorCode: "RESPONSIBLE_CHANGED", responsible_version: 2 });
      expect(await prisma.jointPurchaseResponsibleChange.count({ where: { callId: id } })).toBe(1);
      expect((await prisma.jointPurchaseCall.findUniqueOrThrow({ where: { id } })).responsibleVersion).toBe(2);
    });

    it("author's decision (2026-11-12): whoever substitutes never names herself; another Administración may name her", async () => {
      const respMember = await addPerson("respE4d", f.tenantA, "DIRECTIVA");
      const resp = await createSession(prisma, jwt, respMember);
      const id = await openCall([await newProduct()], { responsible: resp });
      await prisma.member.update({ where: { id: respMember }, data: { isActive: false } });
      expect((await substitute(admin, id, admin, 1)).body).toEqual({ errorCode: "SUCCESSOR_NOT_ELIGIBLE" });
      expect(await prisma.jointPurchaseResponsibleChange.count({ where: { callId: id } })).toBe(0);
      expect((await prisma.jointPurchaseCall.findUniqueOrThrow({ where: { id } })).responsibleVersion).toBe(1);
      const named = await substitute(admin2, id, admin, 1);
      expect(named.status).toBe(200);
      expect(named.body).toMatchObject({ status: "OPEN", responsible: { user_ref: userIdOf(admin), version: 2 } });
      expect(await prisma.jointPurchaseResponsibleChange.findFirstOrThrow({ where: { callId: id } })).toMatchObject({
        version: 2,
        previousUserId: userIdOf(resp),
        newUserId: userIdOf(admin),
        actorUserId: userIdOf(admin2),
      });
      // An Administración that is no longer eligible cannot substitute.
      const id2 = await openCall([await newProduct()], { responsible: director });
      await prisma.member.update({ where: { id: director.memberId }, data: { isActive: false } });
      await prisma.member.update({ where: { id: admin2.memberId }, data: { isActive: false } });
      try {
        // The IAM context refuses an inactive Member before the route (401, as for every institutional route).
        expect((await substitute(admin2, id2, director2, 1)).status).toBe(401);
      } finally {
        await prisma.member.update({ where: { id: admin2.memberId }, data: { isActive: true } });
        await prisma.member.update({ where: { id: director.memberId }, data: { isActive: true } });
      }
    });
  });

  describe("E4 access by role and compatibility (§8)", () => {
    it("test 1: the Directiva never gets names or quantities per person (detail, list, history, collaborators, audit, errors), also with a stored PARTICIPANTS row and as the responsible", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      expect((await confirm4(farmerA, id, [[p, "7777001"]], 1)).status).toBe(200);
      expect((await confirm4(farmerA2, id, [[p, "7777002"]], 1)).status).toBe(200);
      // Stored before E4: the responsible's system row and a delegation to director.
      await storedBeforeE4([
        { callId: id, userId: userIdOf(director2), grantedByUserId: null },
        { callId: id, userId: userIdOf(director), grantedByUserId: userIdOf(director2) },
      ]);
      const leaks = /farmerA|7777001|7777002|participation_ref/;
      const check = async (session: TestSession) => {
        expect((await get(session, `${INST}/${id}/participants`)).body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
        const detail = await get(session, `${INST}/${id}`);
        expect(detail.body).toMatchObject({ can_view_participants: false, pending_consent_count: 0 });
        // The total is an aggregate (both accepted CONV-4); no per-person quantity anywhere.
        expect(detail.body.products[0].totals).toEqual({ participant_count: 2, total_quantity_base: "15554003", visibility: "VISIBLE", totals_basis: "ROLE_CONSENT" });
        for (const body of [
          detail.body,
          (await get(session, INST)).body,
          (await get(session, `${INST}/${id}/collaborators`)).body,
          (await post(session, `${INST}/${id}/collaborators`, { user_ref: userIdOf(admin), grant: "PARTICIPANTS", confirmed: true })).body,
        ]) {
          expect(JSON.stringify(body)).not.toMatch(leaks);
        }
      };
      await check(director);
      await check(director2);
      expect((await post(director2, `${INST}/${id}/close`, { confirmed: true })).status).toBe(200);
      for (const session of [director, director2]) {
        const closing = (await get(session, `${INST}/${id}/closing`)).body;
        expect(closing).toMatchObject({ can_view_participants: false, participants: null, pending_consent_count: 0 });
        expect(JSON.stringify(closing)).not.toMatch(leaks);
      }
      const audit = await prisma.auditLog.findMany({ where: { entityId: id } });
      const events = await prisma.jointPurchaseCallEvent.findMany({ where: { callId: id } });
      expect(JSON.stringify({ audit, events })).not.toMatch(/farmerA|7777001|7777002/);
      // The Administración sees both by name, with the same aggregate.
      expect(((await get(admin, `${INST}/${id}/closing`)).body.participants as any[]).map((x) => x.name).sort()).toEqual([
        "Usuario sintético farmerA",
        "Usuario sintético farmerA2",
      ]);
    });

    it("test 2: the Administración sees only ADMINISTRATION participations, also as the responsible and with delegations; RESPONSIBLE_ONLY, COLLABORATORS and TOTALS_ONLY only count", async () => {
      const p = await newProduct();
      const id = await openCall([p], { responsible: admin });
      const CONV2 = { version: "CONV-2", accepted_at: "2026-11-11T20:00:00.000Z" };
      const farmerA4 = await createSession(prisma, jwt, await addPerson("farmerA4", f.tenantA, "AGRICULTOR"));
      expect((await confirm4(farmerA, id, [[p, "11"]], 1)).status).toBe(200);
      expect((await confirm(farmerA2, id, [[p, "22"]], 1)).status).toBe(200);
      expect((await confirm(farmerA3, id, [[p, "33"]], 1, randomUUID(), CONV2)).status).toBe(200);
      expect((await confirm4(farmerA4, id, [[p, "44"]], 1)).status).toBe(200);
      expect((await decide4(farmerA4, id, "TOTALS_ONLY", 1)).status).toBe(200);
      await grantAccess(id, director, "MANAGE", admin);
      const admin3 = await createSession(prisma, jwt, await addPerson("adminA3", f.tenantA, "ADMINISTRADOR"));
      for (const viewer of [admin, admin3]) {
        const list = (await get(viewer, `${INST}/${id}/participants`)).body;
        expect(list).toMatchObject({ participant_count: 4, pending_consent_count: 3 });
        expect(list.participants.map((x: any) => x.name)).toEqual(["Usuario sintético farmerA"]);
        expect(JSON.stringify(list)).not.toMatch(/farmerA2|farmerA3|farmerA4|"22"|"33"|"44"/);
      }
      // MANAGE gives the Directiva coordination, never the detail.
      expect((await get(director, `${INST}/${id}`)).body).toMatchObject({ can_manage: true, can_view_participants: false });
      expect((await get(director, `${INST}/${id}/participants`)).status).toBe(403);
    });

    // E4 §8.3 asks for 403. Observed: an inactive Member, account or tenant is refused by the IAM context
    // (CurrentAuthContextResolver, outside E4) with 401 on every institutional route; a change of role reaches the
    // route and gets 403 PARTICIPANTS_FORBIDDEN. Either way the access is cut at the next request and the token is not
    // revoked: once eligible again the same token works. Declared as a discrepancy with the contract wording.
    it("test 3: an Administración that stops being eligible (Member, account, role or tenant) or becomes Directiva loses access from the next request, without signing out", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      await confirm4(farmerA, id, [[p, "5"]], 1);
      const memberId = await addPerson("adminRevalida", f.tenantA, "ADMINISTRADOR");
      const session = await createSession(prisma, jwt, memberId);
      const userId = userOf[memberId]!;
      const participants = () => get(session, `${INST}/${id}/participants`);
      expect((await participants()).status).toBe(200);
      const expected: Record<string, number> = { member: 401, account: 401, role: 403, tenant: 401 };
      const cases: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
        ["member", () => prisma.member.update({ where: { id: memberId }, data: { isActive: false } }), () => prisma.member.update({ where: { id: memberId }, data: { isActive: true } })],
        ["account", () => prisma.user.update({ where: { id: userId }, data: { isActive: false } }), () => prisma.user.update({ where: { id: userId }, data: { isActive: true } })],
        [
          "role",
          async () => {
            await prisma.member.update({ where: { id: memberId }, data: { role: "DIRECTIVA" } });
            await prisma.user.update({ where: { id: userId }, data: { role: "DIRECTIVA" } });
          },
          async () => {
            await prisma.member.update({ where: { id: memberId }, data: { role: "ADMINISTRADOR" } });
            await prisma.user.update({ where: { id: userId }, data: { role: "ADMINISTRADOR" } });
          },
        ],
        ["tenant", () => prisma.tenant.update({ where: { id: f.tenantA }, data: { isActive: false } }), () => prisma.tenant.update({ where: { id: f.tenantA }, data: { isActive: true } })],
      ];
      for (const [label, cut, restore] of cases) {
        await cut();
        try {
          const res = await participants();
          expect([label, res.status]).toEqual([label, expected[label]]);
          if (label === "role") {
            expect(res.body).toEqual({ errorCode: "PARTICIPANTS_FORBIDDEN" });
            expect((await get(session, `${INST}/${id}`)).body.can_view_participants).toBe(false);
          }
        } finally {
          await restore();
        }
        // The same token works again once eligible: nothing was cached.
        expect([label, (await participants()).status]).toEqual([label, 200]);
      }
    });

    it("test 4: another tenant gets 404 on every call route; a farmer gets 403 on every institutional route", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      const routes: [string, string, object?][] = [
        ["get", `${INST}/${id}`],
        ["get", `${INST}/${id}/participants`],
        ["get", `${INST}/${id}/closing`],
        ["get", `${INST}/${id}/collaborators`],
        ["post", `${INST}/${id}/collaborators`, { user_ref: userIdOf(director), grant: "PARTICIPANTS", confirmed: true }],
        ["post", `${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(director), grant: "PARTICIPANTS" }],
        ["post", `${INST}/${id}/collaborators/review`, { user_ref: userIdOf(director), grant: "MANAGE", decision: "RETIRE" }],
        ["post", `${INST}/${id}/responsible`, { request_id: randomUUID(), expected_responsible_version: 1, new_responsible_ref: userIdOf(director), reason: "x", confirmed: true }],
        ["post", `${INST}/${id}/close`, { confirmed: true }],
        ["post", `${INST}/${id}/cancel`, { confirmed: true, reason: "x" }],
      ];
      const call = (session: TestSession, [method, path, body]: (typeof routes)[number]) => (method === "get" ? get(session, path) : post(session, path, body));
      for (const route of routes) {
        expect([route[1], (await call(directorB, route)).status]).toEqual([route[1], 404]);
        expect([route[1], (await call(farmerA, route)).status]).toEqual([route[1], 403]);
      }
      expect((await get(farmerA, "/api/v1/joint-purchase-substitution-permissions")).status).toBe(403);
    });

    it("test 5: PARTICIPANTS grant, revoke and review answer 409 GRANT_RETIRED without rows, events or audit; the stored row stays", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      await storedBeforeE4([{ callId: id, userId: userIdOf(admin), grantedByUserId: userIdOf(director2) }]);
      const counts = async () => ({
        access: await prisma.jointPurchaseCallAccess.count({ where: { callId: id } }),
        accessEvents: await prisma.jointPurchaseCallAccessEvent.count({ where: { callId: id } }),
        callEvents: await prisma.jointPurchaseCallEvent.count({ where: { callId: id } }),
        audit: await prisma.auditLog.count({ where: { entityId: id } }),
      });
      const before = await counts();
      for (const by of [director2, director, admin]) {
        for (const [path, body] of [
          [`${INST}/${id}/collaborators`, { user_ref: userIdOf(director), grant: "PARTICIPANTS", confirmed: true }],
          [`${INST}/${id}/collaborators/revoke`, { user_ref: userIdOf(admin), grant: "PARTICIPANTS" }],
          [`${INST}/${id}/collaborators/review`, { user_ref: userIdOf(admin), grant: "PARTICIPANTS", decision: "RETIRE" }],
        ] as const) {
          const res = await post(by, path, body);
          expect([path, res.status, res.body]).toEqual([path, 409, { errorCode: "GRANT_RETIRED" }]);
        }
      }
      expect(await counts()).toEqual(before);
      expect(await prisma.jointPurchaseCallAccess.findUnique({ where: { callId_userId_grant: { callId: id, userId: userIdOf(admin), grant: "PARTICIPANTS" } } })).not.toBeNull();
      // The base refuses to delete it behind the application's back.
      await expect(
        prisma.jointPurchaseCallAccess.delete({ where: { callId_userId_grant: { callId: id, userId: userIdOf(admin), grant: "PARTICIPANTS" } } }),
      ).rejects.toThrow(/historia y no se borra/);
      // MANAGE is unchanged.
      expect((await grantAccess(id, director, "MANAGE")).body.collaborators.map((c: any) => c.user_ref)).toEqual([userIdOf(director)]);
    });

    it("test 9: contracts 1, 2 and 3 read the shape 4; their writes get their own shape or a definitive 409, never a 2xx with a scope they do not know", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      const bodies: any[] = [];
      const keep = (res: Res) => {
        if (res.status >= 200 && res.status < 300) bodies.push(res.body);
        return res;
      };
      // Reads: shape 4 for every contract.
      for (const contract of [null, "2", "3", "4"] as const) {
        const req = http().get(ME).set("Authorization", auth(farmerA));
        const res = contract ? await req.set("X-Joint-Purchase-Contract", contract) : await req;
        expect(res.body).toMatchObject({ contractVersion: 4, consent: { version: "CONV-4", text: CONSENT_V4_TEXT, help: CONSENT_V4_HELP } });
        const hist = contract ? await http().get(`${ME}/history`).set("Authorization", auth(farmerA)).set("X-Joint-Purchase-Contract", contract) : await get(farmerA, `${ME}/history`);
        expect(hist.body.contractVersion).toBe(4);
      }
      // Writes of contracts 1–3 on a participation with an earlier scope: accepted, in their own shape.
      const c3 = keep(await confirmAs("3", farmerA, id, [[p, "10"]], 1, { version: "CONV-3", accepted_at: "2026-11-12T09:00:00.000Z" }));
      expect(c3.status).toBe(200);
      expect(Object.keys(c3.body.participation).sort()).toEqual([
        "accepted_at", "consent", "consent_scope", "last_operation_id", "last_sequence", "lines", "responsible_authorization", "status",
      ]);
      expect(c3.body.participation.consent_scope.scope).toBe("RESPONSIBLE_ONLY");
      const c2 = keep(await confirmAs("2", farmerA, id, [[p, "11"]], 2, null));
      expect(c2.status).toBe(200);
      expect(c2.body.participation.responsible_authorization).toBeUndefined();
      expect(c2.body.participation.consent_scope.scope).toBe("RESPONSIBLE_ONLY");
      const c1 = keep(await confirmAs(null, farmerA, id, [[p, "12"]], 3, null));
      expect(Object.keys(c1.body.participation).sort()).toEqual(["accepted_at", "consent", "last_operation_id", "last_sequence", "lines", "status"]);
      expect(keep(await decideAs("2", farmerA, id, { scope: "RESPONSIBLE_ONLY", sequence: 1, version: "CONV-3" })).status).toBe(200);
      // Widening or authorizing: definitive 409.
      expect((await decideAs("2", farmerA, id, { scope: "COLLABORATORS", sequence: 2, version: "CONV-3" })).body).toEqual({ errorCode: "CONSENT_VERSION_RETIRED" });
      expect(
        (await decideAs("3", farmerA, id, { scope: "RESPONSIBLE_ONLY", sequence: 2, version: "CONV-3", responsible_version: 1, authorize_responsible: true })).body,
      ).toEqual({ errorCode: "CONSENT_VERSION_RETIRED" });
      // A contract 1–3 phone never sends the new scopes, nor creates a CONV-4 participation.
      expect((await decideAs("3", farmerA, id, { scope: "ADMINISTRATION", sequence: 3 })).body).toEqual({ errorCode: "PAYLOAD_INVALID" });
      expect((await confirmAs("3", farmerA2, id, [[p, "1"]], 1, CONV4)).body).toEqual({ errorCode: "APP_UPDATE_REQUIRED" });
      expect(await prisma.jointPurchaseParticipation.count({ where: { callId: id, memberId: f.members.farmerA2 } })).toBe(0);

      // A participation with a new scope (a second phone already updated): contracts 1–3 get 409 APP_UPDATE_REQUIRED before deciding.
      expect((await confirm4(farmerA2, id, [[p, "20"]], 1)).status).toBe(200);
      const journal = () => prisma.jointPurchaseParticipationOperation.count({ where: { callId: id, memberId: f.members.farmerA2 } });
      const journaled = await journal();
      const pendingOp = randomUUID();
      for (const contract of [null, "2", "3"] as const) {
        expect((await confirmAs(contract, farmerA2, id, [[p, "21"]], 2, null, pendingOp)).body).toEqual({ errorCode: "APP_UPDATE_REQUIRED" });
        expect((await withdrawAs(contract, farmerA2, id, 2)).body).toEqual({ errorCode: "APP_UPDATE_REQUIRED" });
        expect((await decideAs(contract, farmerA2, id, { scope: "RESPONSIBLE_ONLY", sequence: 1, version: "CONV-1" })).body).toEqual({ errorCode: "APP_UPDATE_REQUIRED" });
      }
      expect(await journal()).toBe(journaled);
      const kept = await prisma.jointPurchaseParticipation.findFirstOrThrow({ where: { callId: id, memberId: f.members.farmerA2 }, include: { lines: true } });
      expect([kept.consentScope, kept.lastSequence, kept.lines.map((l) => l.quantityBase)]).toEqual(["ADMINISTRATION", 1, [20n]]);
      // Not journaled: once updated, the same pending operation is decided.
      expect((await confirmAs("4", farmerA2, id, [[p, "21"]], 2, null, pendingOp)).status).toBe(200);

      // Contract 4 sending an operation prepared before updating: CONV-3 creates the earlier scope, never CONV-4 (§9.9).
      const old = await confirm4(farmerA3, id, [[p, "30"]], 1, randomUUID(), { version: "CONV-3", accepted_at: "2026-11-12T09:00:00.000Z" });
      expect(old.body.participation.consent_scope).toMatchObject({ scope: "RESPONSIBLE_ONLY", version: "CONV-3" });
      expect(old.body.participation.responsible_authorization).toBeUndefined();

      // Never a 2xx with a new scope for contracts 1–3.
      expect(bodies.length).toBeGreaterThan(0);
      expect(JSON.stringify(bodies)).not.toMatch(/ADMINISTRATION|TOTALS_ONLY|CONV-4/);
    });

    it("test 12: the database refuses PARTICIPANTS rows and an incoherent policy and threshold in CollectiveSeal and EstimationRun", async () => {
      const p = await newProduct();
      const id = await openCall([p]);
      await expect(
        prisma.jointPurchaseCallAccess.create({ data: { callId: id, userId: userIdOf(admin), grant: "PARTICIPANTS", grantedByUserId: userIdOf(director2) } }),
      ).rejects.toThrow(/PARTICIPANTS está retirado/);
      await expect(
        prisma.jointPurchaseCallAccess.create({ data: { callId: id, userId: userIdOf(director2), grant: "PARTICIPANTS", grantedByUserId: null } }),
      ).rejects.toThrow(/PARTICIPANTS está retirado/);
      // MANAGE by the responsible is still accepted (and revocable).
      await prisma.jointPurchaseCallAccess.create({ data: { callId: id, userId: userIdOf(admin), grant: "MANAGE", grantedByUserId: userIdOf(director2) } });
      await prisma.jointPurchaseCallAccess.delete({ where: { callId_userId_grant: { callId: id, userId: userIdOf(admin), grant: "MANAGE" } } });

      // CHECK política ⇔ umbral, evaluated alone: the user triggers of the table are disabled inside a transaction
      // that is always rolled back (nothing is written).
      const SENTINEL = "rolled back on purpose";
      const checkOnly = async (table: "CollectiveSeal" | "EstimationRun", insert: string): Promise<string> => {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
            await tx.$executeRawUnsafe(insert);
            throw new Error(SENTINEL);
          });
        } catch (error) {
          return String((error as Error).message);
        }
        return "no error";
      };
      const seal = (policy: string, threshold: string) =>
        `INSERT INTO "CollectiveSeal" ("id","tenantId","campaignId","version","sealedAt","sealedByUserId","sealedByRole","disclosureMode","policy","threshold","linkedMembers","membersWithContribution","suppressedCells","openDisputes","reviewRef")
         VALUES ('${randomUUID()}','${f.tenantA}','${f.campaigns.closedA}',1,now(),'${userIdOf(director)}','DIRECTIVA','PROVISIONAL_SYNTHETIC','${policy}',${threshold},1,1,false,false,'${"a".repeat(64)}')`;
      expect(await checkOnly("CollectiveSeal", seal("F07-POL-02", "3"))).toMatch(/CollectiveSeal_policy_threshold/);
      expect(await checkOnly("CollectiveSeal", seal("F07-POL-01", "NULL"))).toMatch(/CollectiveSeal_policy_threshold/);
      expect(await checkOnly("CollectiveSeal", seal("F07-POL-03", "NULL"))).toMatch(/CollectiveSeal_policy_threshold/);
      expect(await checkOnly("CollectiveSeal", seal("F07-POL-01", "0"))).toMatch(/CollectiveSeal_policy_threshold/);
      expect(await checkOnly("CollectiveSeal", seal("F07-POL-02", "NULL"))).toBe(SENTINEL);
      expect(await checkOnly("CollectiveSeal", seal("F07-POL-01", "3"))).toBe(SENTINEL);
      const run = (policy: string, threshold: string) =>
        `INSERT INTO "EstimationRun" ("id","tenantId","jobId","requestedByUserId","requestedByRole","targetCampaignId","seasonId","targetClassificationId","contractVersion","method","methodVersion","parameters","horizon","disclosureMode","policy","threshold","outcome","contentHash")
         VALUES ('${randomUUID()}','${f.tenantA}','${randomUUID()}','${userIdOf(director)}','DIRECTIVA','${f.campaigns.closedA}','${randomUUID()}','${randomUUID()}',1,'SES_NAIVE','1','{}'::jsonb,1,'PROVISIONAL_SYNTHETIC','${policy}',${threshold},'CALCULATED','${"b".repeat(64)}')`;
      expect(await checkOnly("EstimationRun", run("F07-POL-02", "3"))).toMatch(/EstimationRun_policy_threshold/);
      expect(await checkOnly("EstimationRun", run("F07-POL-01", "NULL"))).toMatch(/EstimationRun_policy_threshold/);
      // Coherent values pass the CHECK (the foreign keys, deliberately missing here, are what fails then).
      expect(await checkOnly("EstimationRun", run("F07-POL-02", "NULL"))).not.toMatch(/policy_threshold/);
      expect(await checkOnly("EstimationRun", run("F07-POL-01", "3"))).not.toMatch(/policy_threshold/);
      // Nothing stayed written and the triggers are back.
      expect(await prisma.collectiveSeal.count({ where: { campaignId: f.campaigns.closedA } })).toBe(0);
      const disabled = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM pg_trigger WHERE tgrelid IN ('"CollectiveSeal"'::regclass, '"EstimationRun"'::regclass) AND NOT tgisinternal AND tgenabled = 'D'`,
      );
      expect(Number(disabled[0]!.n)).toBe(0);
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
