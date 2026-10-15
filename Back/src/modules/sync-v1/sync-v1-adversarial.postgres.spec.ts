import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { PushOperationUseCase } from "./application/push-operation.use-case";
import { SyncV1Config } from "./application/sync-v1-config";
import { PrismaSyncV1JournalRepository } from "./infrastructure/prisma-sync-v1-journal.repository";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  Fixture,
  seedFixture,
  signFor,
  TestSession,
} from "./test-support/sync-v1-test-app";

/**
 * F05-SYNC-06 (#18): adversarial cases of the retry/idempotency matrix
 * (docs/architecture/F05_SYNC_V1_RETRY_IDEMPOTENCY_MATRIX.md) against the real
 * HTTP endpoint and PostgreSQL. Each test is named after its matrix row.
 * Rows that depend on Mobile (#29–#31) are recorded in the evidence as
 * NOT_MEASURED; they are not claimed here.
 *
 * Opt-in: F05_SYNC_06_PG_TEST_URL must point to a disposable server.
 */
const postgresUrl = process.env["F05_SYNC_06_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

const PUSH = "/api/v1/sync/v1/push";
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Sentinel quantity: it must never appear in logs, ACKs or GET responses. */
const SENTINEL = "987654321";

/** supertest is untyped in this baseline; the fields the suite reads. */
interface Res {
  status: number;
  body: any;
  headers: Record<string, string>;
}

describePostgres("F05-SYNC-06 adversarial suite on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let farmerA: TestSession;
  let farmerA2: TestSession;
  let farmerB: TestSession;
  const logged: string[] = [];

  beforeAll(async () => {
    const url = await createIsolatedDatabase(postgresUrl!, "f05_sync_06");
    ({ app, prisma, jwt } = await createSyncV1App(url));
    f = await seedFixture(prisma);
    farmerA = await createSession(prisma, jwt, f.members.farmerA);
    farmerA2 = await createSession(prisma, jwt, f.members.farmerA2);
    farmerB = await createSession(prisma, jwt, f.members.farmerB);
    for (const level of ["log", "warn", "error"] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => {
          logged.push(args.map(String).join(" "));
        });
    }
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  interface Env {
    operationId?: string;
    type?: "CONSUMPTION_TOTAL" | "DECLARED_NEED";
    action?: "PUBLISH" | "SUPERSEDE" | "CANCEL";
    pred?: string | null;
    ref?: string | null;
    campaign?: string;
    product?: string;
    unit?: "ML" | "G";
    quantity?: string;
  }

  function envelope(e: Env = {}) {
    const action = e.action ?? "PUBLISH";
    return {
      contractVersion: 1,
      operationId: e.operationId ?? randomUUID(),
      projectionType: e.type ?? "DECLARED_NEED",
      action,
      causal: {
        predecessorOperationId: e.pred ?? null,
        reconciliationReference: e.ref ?? null,
      },
      payload: {
        campaign_ref: e.campaign ?? f.campaigns.openA,
        product_ref: e.product ?? f.products.liquidA,
        base_unit: e.unit ?? "ML",
        ...(action === "CANCEL" ? {} : { quantity_base: e.quantity ?? "1250" }),
      },
    };
  }

  function post(session: { token: string } | null, body: unknown, contentType = "application/json") {
    const req = http().post(PUSH).set("Content-Type", contentType);
    if (session) req.set("Authorization", `Bearer ${session.token}`);
    return req.send(typeof body === "string" ? body : JSON.stringify(body));
  }

  function get(session: { token: string }, operationId: string) {
    return http()
      .get(`/api/v1/sync/v1/operations/${operationId}`)
      .set("Authorization", `Bearer ${session.token}`);
  }

  const DISPOSITION: Record<string, string> = {
    APPLIED: "RETIRE_FROM_OUTBOX",
    ALREADY_APPLIED: "RETIRE_FROM_OUTBOX",
    CONFLICT: "KEEP_FOR_RECONCILIATION",
    REJECTED: "MOVE_TO_TERMINAL_FAILURE",
    RETRYABLE: "KEEP_FOR_RETRY",
  };

  /** Contract §7: exactly seven keys and a consistent outcome/disposition. */
  function expectAck(response: Res, operationId: string, outcome: string, code: string) {
    expect({ status: response.status, body: response.body }).toEqual({
      status: 200,
      body: expect.objectContaining({ outcome, code }),
    });
    const ack = response.body;
    expect(Object.keys(ack).sort()).toEqual(
      ["code", "contractVersion", "disposition", "operationId", "outcome", "reconciliationReference", "serverAcceptedAt"],
    );
    expect(ack.contractVersion).toBe(1);
    expect(ack.operationId).toBe(operationId);
    expect(ack.disposition).toBe(DISPOSITION[outcome]);
    if (outcome === "APPLIED" || outcome === "ALREADY_APPLIED") expect(ack.serverAcceptedAt).toMatch(ISO_MS);
    else expect(ack.serverAcceptedAt).toBeNull();
    if (outcome === "CONFLICT") expect(ack.reconciliationReference).toMatch(/^[0-9a-f-]{36}$/);
    else expect(ack.reconciliationReference).toBeNull();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(ack)).not.toContain(SENTINEL);
    return ack;
  }

  /** Contract §9: exactly four keys, operationId null. */
  function expectError(response: Res, status: number, errorCode: string, disposition: string) {
    expect({ status: response.status, body: response.body }).toEqual({
      status,
      body: { contractVersion: 1, operationId: null, errorCode, disposition },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  }

  const journalCount = (memberId?: string) =>
    prisma.syncV1OperationJournal.count({ where: memberId ? { memberId } : {} });
  const journalOf = (session: TestSession, operationId: string) =>
    prisma.syncV1OperationJournal.findUnique({
      where: { tenantId_memberId_operationId: { tenantId: session.tenantId, memberId: session.memberId, operationId } },
    });
  const contributionOf = (
    session: TestSession,
    o: { type?: "CONSUMPTION_TOTAL" | "DECLARED_NEED"; campaign?: string; product?: string; unit?: "ML" | "G" } = {},
  ) =>
    prisma.syncV1Contribution.findUnique({
      where: {
        tenantId_memberId_projectionType_campaignId_productId_baseUnit: {
          tenantId: session.tenantId,
          memberId: session.memberId,
          projectionType: o.type ?? "DECLARED_NEED",
          campaignId: o.campaign ?? f.campaigns.openA,
          productId: o.product ?? f.products.liquidA,
          baseUnit: o.unit ?? "ML",
        },
      },
    });

  async function freshMember(tenantId = f.tenantA): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name: "Agricultor sintético", email: `fresh-${userId}@example.test`,
        passwordHash: "synthetic-unused-hash", role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId, role: "AGRICULTOR" } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function published(session: TestSession, quantity = "100") {
    const operationId = randomUUID();
    expectAck(await post(session, envelope({ operationId, quantity })), operationId, "APPLIED", "OK");
    return operationId;
  }

  it("C01 nominal PUBLISH: APPLIED, one ACTIVE total, journal FINAL", async () => {
    const s = await freshMember();
    const operationId = randomUUID();
    const response = await post(s, envelope({ operationId, quantity: SENTINEL }));
    const ack = expectAck(response, operationId, "APPLIED", "OK");
    const contribution = await contributionOf(s);
    expect(contribution).toEqual(expect.objectContaining({ status: "ACTIVE", headOperationId: operationId, quantityBase: BigInt(SENTINEL), lastSequence: 1, reconciliationReference: null }));
    const journal = await journalOf(s, operationId);
    expect(journal).toEqual(expect.objectContaining({ processingState: "FINAL", outcome: "APPLIED", resultCode: "OK", contributionId: contribution!.id, contributionSequence: 1 }));
    expect(journal!.serverAcceptedAt!.toISOString()).toBe(ack.serverAcceptedAt);
  });

  it("C02 ACK lost and identical replay ×3: ALREADY_APPLIED with the original time, one effect", async () => {
    const s = await freshMember();
    const body = envelope({ quantity: "300" });
    const first = expectAck(await post(s, body), body.operationId, "APPLIED", "OK");
    for (let i = 0; i < 3; i++) {
      const replay = expectAck(await post(s, body), body.operationId, "ALREADY_APPLIED", "OK");
      expect(replay.serverAcceptedAt).toBe(first.serverAcceptedAt);
    }
    expect(await journalCount(s.memberId)).toBe(1);
    expect(await contributionOf(s)).toEqual(expect.objectContaining({ quantityBase: 300n, lastSequence: 1 }));
  });

  it("C03 request lost before Central: the later identical send is the only effect", async () => {
    const s = await freshMember();
    const body = envelope();
    expect(await journalOf(s, body.operationId)).toBeNull();
    expectAck(await post(s, body), body.operationId, "APPLIED", "OK");
    expect(await journalCount(s.memberId)).toBe(1);
  });

  it("C04 commit durable and connection lost before the response: replay finds the result", async () => {
    const s = await freshMember();
    const body = envelope({ quantity: "40" });
    // Run the use case directly and discard the answer, as if the socket died.
    const lost = await app.get(PushOperationUseCase).execute(
      { tenantId: s.tenantId, memberId: s.memberId, sessionId: s.sessionId },
      { ...body, contractVersion: 1, payload: { ...body.payload, quantity_base: "40" } } as never,
    );
    expect(lost.outcome).toBe("APPLIED");
    const replay = expectAck(await post(s, body), body.operationId, "ALREADY_APPLIED", "OK");
    expect(replay.serverAcceptedAt).toBe(lost.serverAcceptedAt);
    expect(await journalCount(s.memberId)).toBe(1);
  });

  it("C05 500 before commit: full rollback, then the retry is the only effect", async () => {
    const s = await freshMember();
    const body = envelope({ quantity: "55" });
    const spy = jest
      .spyOn(PrismaSyncV1JournalRepository.prototype, "finalize")
      .mockRejectedValueOnce(new Error("simulated failure before commit"));
    try {
      expectError(await post(s, body), 500, "TEMPORARILY_UNAVAILABLE", "KEEP_FOR_RETRY");
    } finally {
      spy.mockRestore();
    }
    // Nothing partial: no journal, no contribution transition.
    expect(await journalOf(s, body.operationId)).toBeNull();
    const before = await contributionOf(s);
    expect(before?.status ?? "NEVER_PUBLISHED").toBe("NEVER_PUBLISHED");
    expectAck(await post(s, body), body.operationId, "APPLIED", "OK");
    expect(await contributionOf(s)).toEqual(expect.objectContaining({ quantityBase: 55n, lastSequence: 1 }));
  });

  it("C06 500 with unknown commit: the retry with the same ID finds the committed result", async () => {
    const s = await freshMember();
    const body = envelope({ quantity: "66" });
    const useCase = app.get(PushOperationUseCase);
    const original = useCase.execute.bind(useCase);
    const spy = jest.spyOn(useCase, "execute").mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error("response lost after commit");
    });
    try {
      expectError(await post(s, body), 500, "TEMPORARILY_UNAVAILABLE", "KEEP_FOR_RETRY");
    } finally {
      spy.mockRestore();
    }
    const committed = await journalOf(s, body.operationId);
    expect(committed?.outcome).toBe("APPLIED");
    const replay = expectAck(await post(s, body), body.operationId, "ALREADY_APPLIED", "OK");
    expect(replay.serverAcceptedAt).toBe(committed!.serverAcceptedAt!.toISOString());
    expect(await journalCount(s.memberId)).toBe(1);
  });

  it("C07 same ID and content with reordered keys and whitespace: ALREADY_APPLIED", async () => {
    const s = await freshMember();
    const body = envelope({ quantity: "70" });
    expectAck(await post(s, body), body.operationId, "APPLIED", "OK");
    const reordered =
      `{ "payload" : { "quantity_base":"70", "base_unit":"ML", "product_ref":"${body.payload.product_ref}", "campaign_ref":"${body.payload.campaign_ref}" },\n` +
      ` "causal": {"reconciliationReference":null,"predecessorOperationId":null}, "action":"PUBLISH",` +
      ` "projectionType":"DECLARED_NEED", "operationId":"${body.operationId}", "contractVersion":1 }`;
    expectAck(await post(s, reordered), body.operationId, "ALREADY_APPLIED", "OK");
  });

  it("C08 same ID with another quantity, action or causal: IDEMPOTENCY_MISMATCH, original intact", async () => {
    const s = await freshMember();
    const body = envelope({ quantity: "80" });
    expectAck(await post(s, body), body.operationId, "APPLIED", "OK");
    const journalBefore = await journalOf(s, body.operationId);
    const contributionBefore = await contributionOf(s);
    for (const mutated of [
      { ...body, payload: { ...body.payload, quantity_base: "81" } },
      { ...body, projectionType: "CONSUMPTION_TOTAL" },
      { ...body, causal: { predecessorOperationId: randomUUID(), reconciliationReference: null } },
      { ...body, payload: { ...body.payload, base_unit: "G", product_ref: f.products.solidA } },
    ]) {
      expectAck(await post(s, mutated), body.operationId, "REJECTED", "IDEMPOTENCY_MISMATCH");
    }
    expectError(await post(s, { ...body, contractVersion: 2 }), 422, "CONTRACT_VERSION_MISMATCH", "KEEP_FOR_RECONCILIATION");
    expect(await journalOf(s, body.operationId)).toEqual(journalBefore);
    expect(await contributionOf(s)).toEqual(contributionBefore);
    // The original still replays as accepted.
    expectAck(await post(s, body), body.operationId, "ALREADY_APPLIED", "OK");
  });

  it("C09 two simultaneous requests with the same ID: one effect, never two", async () => {
    const s = await freshMember();
    const body = envelope({ quantity: "90" });
    const responses: Res[] = await Promise.all([post(s, body), post(s, body), post(s, body)]);
    const outcomes: string[] = responses.map((r) => r.body.outcome).sort();
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(outcomes.filter((o) => o === "APPLIED")).toHaveLength(1);
    expect(outcomes.every((o) => ["APPLIED", "ALREADY_APPLIED", "RETRYABLE"].includes(o))).toBe(true);
    expect(await journalCount(s.memberId)).toBe(1);
    expect(await contributionOf(s)).toEqual(expect.objectContaining({ quantityBase: 90n, lastSequence: 1 }));
  });

  it("C10 another ACTIVE installation of the same Member replays the same ID: same key, one effect", async () => {
    const s = await freshMember();
    const body = envelope();
    expectAck(await post(s, body), body.operationId, "APPLIED", "OK");
    const otherDevice = await createSession(prisma, jwt, s.memberId);
    expect(otherDevice.registrationId).not.toBe(s.registrationId);
    expectAck(await post(otherDevice, body), body.operationId, "ALREADY_APPLIED", "OK");
    expect(await journalCount(s.memberId)).toBe(1);
  });

  describe("C11 forks: no arrival wins, a disputed value is not counted", () => {
    async function forkAfter(order: "first" | "second") {
      const s = await freshMember();
      const head = await published(s, "100");
      const a = envelope({ action: "SUPERSEDE", pred: head, quantity: "110" });
      const b = envelope({ action: "SUPERSEDE", pred: head, quantity: "120" });
      const [x, y] = order === "first" ? [a, b] : [b, a];
      expectAck(await post(s, x), x.operationId, "APPLIED", "OK");
      const conflict = expectAck(await post(s, y), y.operationId, "CONFLICT", "CAUSAL_FORK");
      const contribution = await contributionOf(s);
      expect(contribution).toEqual(expect.objectContaining({ status: "CONTESTED", headOperationId: x.operationId, quantityBase: null, reconciliationReference: conflict.reconciliationReference }));
      // The first receipt stays historical; GET separates it from the state.
      const view = await get(s, x.operationId);
      expect(view.body.ack.outcome).toBe("ALREADY_APPLIED");
      expect(view.body.contribution).toEqual({ status: "CONTESTED", headOperationId: x.operationId, reconciliationReference: conflict.reconciliationReference });
      return { s, x, y, conflict };
    }

    it("C11 order a→b", async () => {
      await forkAfter("first");
    });

    it("C11 order b→a (symmetric)", async () => {
      await forkAfter("second");
    });

    it("C11 concurrent successors of the same head: exactly one APPLIED, the other CONFLICT", async () => {
      const s = await freshMember();
      const head = await published(s, "100");
      const a = envelope({ action: "SUPERSEDE", pred: head, quantity: "130" });
      const b = envelope({ action: "SUPERSEDE", pred: head, quantity: "140" });
      const [ra, rb]: Res[] = await Promise.all([post(s, a), post(s, b)]);
      const outcomes = [ra.body.outcome, rb.body.outcome].sort();
      expect(outcomes).toEqual(["APPLIED", "CONFLICT"]);
      const contribution = await contributionOf(s);
      expect(contribution).toEqual(expect.objectContaining({ status: "CONTESTED", quantityBase: null }));
    });

    it("C11 CANCEL accepted before the competitor: the withdrawal holds", async () => {
      const s = await freshMember();
      const head = await published(s, "100");
      const cancel = envelope({ action: "CANCEL", pred: head });
      expectAck(await post(s, cancel), cancel.operationId, "APPLIED", "OK");
      const late = envelope({ action: "SUPERSEDE", pred: head, quantity: "150" });
      const conflict = expectAck(await post(s, late), late.operationId, "CONFLICT", "CANCELLED_PREDECESSOR");
      expect(await contributionOf(s)).toEqual(expect.objectContaining({ status: "CANCELLED", headOperationId: cancel.operationId, quantityBase: null, reconciliationReference: conflict.reconciliationReference }));
    });

    it("C11 competitor accepted before a CANCEL of the same head: the CANCEL is a fork", async () => {
      const s = await freshMember();
      const head = await published(s, "100");
      const supersede = envelope({ action: "SUPERSEDE", pred: head, quantity: "160" });
      expectAck(await post(s, supersede), supersede.operationId, "APPLIED", "OK");
      const cancel = envelope({ action: "CANCEL", pred: head });
      expectAck(await post(s, cancel), cancel.operationId, "CONFLICT", "CAUSAL_FORK");
      expect(await contributionOf(s)).toEqual(expect.objectContaining({ status: "CONTESTED", quantityBase: null }));
    });

    it("C14 resolution with the current head and reference, then a late replay and a fenced successor", async () => {
      const { s, x, y, conflict } = await forkAfter("first");
      const resolution = envelope({ action: "SUPERSEDE", pred: x.operationId, ref: conflict.reconciliationReference, quantity: "125" });
      expectAck(await post(s, resolution), resolution.operationId, "APPLIED", "OK");
      const contribution = await contributionOf(s);
      expect(contribution).toEqual(expect.objectContaining({ status: "ACTIVE", headOperationId: resolution.operationId, quantityBase: 125n, reconciliationReference: null, lastSequence: 3, fencedThroughSequence: 2 }));
      const dispute = await prisma.syncV1Dispute.findUniqueOrThrow({ where: { id: conflict.reconciliationReference } });
      expect(dispute).toEqual(expect.objectContaining({ closeReason: "RESOLVED", resolvedByOperationId: resolution.operationId }));
      expect(dispute.closedAt).not.toBeNull();
      // Replays keep their persisted results.
      expectAck(await post(s, x), x.operationId, "ALREADY_APPLIED", "OK");
      const replayedConflict = expectAck(await post(s, y), y.operationId, "CONFLICT", "CAUSAL_FORK");
      expect(replayedConflict.reconciliationReference).toBe(conflict.reconciliationReference);
      // C33: a new successor of the fenced branch never competes again.
      const fenced = envelope({ action: "SUPERSEDE", pred: x.operationId, quantity: "999" });
      expectAck(await post(s, fenced), fenced.operationId, "REJECTED", "CAUSAL_FENCED");
      expect(await contributionOf(s)).toEqual(expect.objectContaining({ quantityBase: 125n, headOperationId: resolution.operationId }));
    });

    it("C15 an obsolete reconciliation reference: RECONCILIATION_STALE, state intact", async () => {
      const { s, x, conflict } = await forkAfter("first");
      // A further divergent intention rotates the reference.
      const third = envelope({ action: "SUPERSEDE", pred: x.operationId, quantity: "170" });
      const rotated = expectAck(await post(s, third), third.operationId, "CONFLICT", "CAUSAL_FORK");
      expect(rotated.reconciliationReference).not.toBe(conflict.reconciliationReference);
      const before = await contributionOf(s);
      const stale = envelope({ action: "SUPERSEDE", pred: x.operationId, ref: conflict.reconciliationReference, quantity: "180" });
      const answer = expectAck(await post(s, stale), stale.operationId, "CONFLICT", "RECONCILIATION_STALE");
      expect(answer.reconciliationReference).toBe(rotated.reconciliationReference);
      expect(await contributionOf(s)).toEqual(before);
      expect(await prisma.syncV1Dispute.findUniqueOrThrow({ where: { id: conflict.reconciliationReference } }))
        .toEqual(expect.objectContaining({ closeReason: "SUPERSEDED" }));
    });
  });

  it("C12 CANCEL accepted and an old APPLIED replay: ALREADY_APPLIED, withdrawal holds", async () => {
    const s = await freshMember();
    const publish = envelope({ quantity: "200" });
    expectAck(await post(s, publish), publish.operationId, "APPLIED", "OK");
    const cancel = envelope({ action: "CANCEL", pred: publish.operationId });
    expectAck(await post(s, cancel), cancel.operationId, "APPLIED", "OK");
    expectAck(await post(s, publish), publish.operationId, "ALREADY_APPLIED", "OK");
    expect(await contributionOf(s)).toEqual(expect.objectContaining({ status: "CANCELLED", quantityBase: null, headOperationId: cancel.operationId }));
  });

  it("C13 CANCELLED and a late successor of an earlier head: CANCELLED_PREDECESSOR, no resurrection", async () => {
    const s = await freshMember();
    const p = await published(s, "10");
    const sup = envelope({ action: "SUPERSEDE", pred: p, quantity: "20" });
    expectAck(await post(s, sup), sup.operationId, "APPLIED", "OK");
    const cancel = envelope({ action: "CANCEL", pred: sup.operationId });
    expectAck(await post(s, cancel), cancel.operationId, "APPLIED", "OK");
    const late = envelope({ action: "SUPERSEDE", pred: p, quantity: "30" });
    expectAck(await post(s, late), late.operationId, "CONFLICT", "CANCELLED_PREDECESSOR");
    expect(await contributionOf(s)).toEqual(expect.objectContaining({ status: "CANCELLED", quantityBase: null }));
    // A deliberate re-publication against the accepted CANCEL, with the dispute.
    const contribution = (await contributionOf(s))!;
    const republish = envelope({ pred: cancel.operationId, ref: contribution.reconciliationReference, quantity: "40" });
    expectAck(await post(s, republish), republish.operationId, "APPLIED", "OK");
    expect(await contributionOf(s)).toEqual(expect.objectContaining({ status: "ACTIVE", quantityBase: 40n }));
  });

  it("C16 closed campaign for a new value: REJECTED CAMPAIGN_NOT_OPEN, no total", async () => {
    const s = await freshMember();
    const body = envelope({ campaign: f.campaigns.closedA });
    expectAck(await post(s, body), body.operationId, "REJECTED", "CAMPAIGN_NOT_OPEN");
    expect(await contributionOf(s, { campaign: f.campaigns.closedA })).toBeNull();
  });

  it("C17/C18/C39 campaign closed after acceptance: replay ALREADY_APPLIED, CANCEL allowed, rejections persist", async () => {
    const s = await freshMember();
    const campaignId = randomUUID();
    await prisma.agriculturalCampaign.create({ data: { id: campaignId, tenantId: f.tenantA, name: `Campaña ${campaignId}`, status: "ABIERTA", isActive: true, startDate: new Date() } });
    const publish = envelope({ campaign: campaignId, quantity: "500" });
    expectAck(await post(s, publish), publish.operationId, "APPLIED", "OK");
    await prisma.agriculturalCampaign.update({ where: { id: campaignId }, data: { status: "CERRADA", isActive: false } });
    // C17
    expectAck(await post(s, publish), publish.operationId, "ALREADY_APPLIED", "OK");
    const supersede = envelope({ campaign: campaignId, action: "SUPERSEDE", pred: publish.operationId, quantity: "600" });
    expectAck(await post(s, supersede), supersede.operationId, "REJECTED", "CAMPAIGN_NOT_OPEN");
    // C18
    const cancel = envelope({ campaign: campaignId, action: "CANCEL", pred: publish.operationId });
    expectAck(await post(s, cancel), cancel.operationId, "APPLIED", "OK");
    expect(await contributionOf(s, { campaign: campaignId })).toEqual(expect.objectContaining({ status: "CANCELLED", quantityBase: null }));
    // C39: reopening does not re-evaluate a persisted rejection.
    await prisma.agriculturalCampaign.update({ where: { id: campaignId }, data: { status: "ABIERTA", isActive: true } });
    expectAck(await post(s, supersede), supersede.operationId, "REJECTED", "CAMPAIGN_NOT_OPEN");
  });

  it("C19 inexistent, foreign or inactive product: same REFERENCE_UNAVAILABLE", async () => {
    const s = await freshMember();
    for (const productRef of [randomUUID(), f.products.liquidB, f.products.inactiveA]) {
      const body = envelope({ product: productRef });
      expectAck(await post(s, body), body.operationId, "REJECTED", "REFERENCE_UNAVAILABLE");
    }
    const foreignCampaign = envelope({ campaign: f.campaigns.openB });
    expectAck(await post(s, foreignCampaign), foreignCampaign.operationId, "REJECTED", "REFERENCE_UNAVAILABLE");
    expect(await prisma.syncV1Contribution.count({ where: { memberId: s.memberId } })).toBe(0);
  });

  it("C20 unit of another dimension, or a central unit outside L/KG: UNIT_INCOMPATIBLE", async () => {
    const s = await freshMember();
    for (const [product, unit] of [
      [f.products.liquidA, "G"],
      [f.products.solidA, "ML"],
      [f.products.otherUnitA, "ML"],
    ] as const) {
      const body = envelope({ product, unit });
      expectAck(await post(s, body), body.operationId, "REJECTED", "UNIT_INCOMPATIBLE");
    }
    // `kg` in the catalogue is KG: grams are admitted.
    const solid = envelope({ product: f.products.solidA, unit: "G", quantity: "0" });
    expectAck(await post(s, solid), solid.operationId, "APPLIED", "OK");
    expect(await contributionOf(s, { product: f.products.solidA, unit: "G" })).toEqual(expect.objectContaining({ quantityBase: 0n }));
  });

  it("C21 decimal quantity above int64: QUANTITY_INVALID; the maximum itself is exact", async () => {
    const s = await freshMember();
    const over = envelope({ quantity: "9223372036854775808" });
    expectAck(await post(s, over), over.operationId, "REJECTED", "QUANTITY_INVALID");
    const max = envelope({ quantity: "9223372036854775807" });
    expectAck(await post(s, max), max.operationId, "APPLIED", "OK");
    expect((await contributionOf(s))!.quantityBase).toBe(9223372036854775807n);
  });

  it("C22/C40 Member, account or tenant inactive: 403 without touching the journal", async () => {
    const s = await freshMember();
    const operationId = await published(s);
    const before = await journalCount();
    await prisma.member.update({ where: { id: s.memberId }, data: { isActive: false } });
    try {
      expectError(await post(s, envelope()), 403, "AUTH_CONTEXT_FORBIDDEN", "KEEP_FOR_RECONCILIATION");
      // No historical result is exposed under an invalid context.
      expectError(await get(s, operationId), 403, "AUTH_CONTEXT_FORBIDDEN", "KEEP_FOR_RECONCILIATION");
    } finally {
      await prisma.member.update({ where: { id: s.memberId }, data: { isActive: true } });
    }
    const member = await prisma.member.findUniqueOrThrow({ where: { id: s.memberId } });
    await prisma.user.update({ where: { id: member.userId }, data: { isActive: false } });
    try {
      expectError(await post(s, envelope()), 403, "AUTH_CONTEXT_FORBIDDEN", "KEEP_FOR_RECONCILIATION");
    } finally {
      await prisma.user.update({ where: { id: member.userId }, data: { isActive: true } });
    }
    expect(await journalCount()).toBe(before);
  });

  it("C40 revocation committed after the guard and before the decision: 403, nothing accepted", async () => {
    const s = await freshMember();
    const body = envelope();
    const useCase = app.get(PushOperationUseCase);
    const original = useCase.execute.bind(useCase);
    const spy = jest.spyOn(useCase, "execute").mockImplementationOnce(async (...args) => {
      // The guard already admitted the request; the registration is revoked now.
      await prisma.clientRegistration.update({ where: { id: s.registrationId! }, data: { status: "REVOKED", revokedAt: new Date() } });
      return original(...args);
    });
    try {
      expectError(await post(s, body), 403, "AUTH_CONTEXT_FORBIDDEN", "KEEP_FOR_RECONCILIATION");
    } finally {
      spy.mockRestore();
    }
    expect(await journalOf(s, body.operationId)).toBeNull();
    expect(await prisma.syncV1Contribution.count({ where: { memberId: s.memberId } })).toBe(0);
  });

  it("C23 ClientRegistration revoked: 403; the same owner resumes with a new registration", async () => {
    const s = await freshMember();
    const body = envelope({ quantity: "77" });
    await prisma.clientRegistration.update({ where: { id: s.registrationId! }, data: { status: "REVOKED", revokedAt: new Date() } });
    expectError(await post(s, body), 403, "AUTH_CONTEXT_FORBIDDEN", "KEEP_FOR_RECONCILIATION");
    expect(await journalOf(s, body.operationId)).toBeNull();
    const resumed = await createSession(prisma, jwt, s.memberId);
    expectAck(await post(resumed, body), body.operationId, "APPLIED", "OK");
    expectAck(await post(resumed, body), body.operationId, "ALREADY_APPLIED", "OK");
    // The revoked registration is not reactivated.
    expect((await prisma.clientRegistration.findUniqueOrThrow({ where: { id: s.registrationId! } })).status).toBe("REVOKED");
  });

  it("C24 expired access token: 401 AUTH_REQUIRED; after refresh the same intention is accepted once", async () => {
    const s = await freshMember();
    const member = await prisma.member.findUniqueOrThrow({ where: { id: s.memberId }, include: { user: true } });
    const expired = { token: signFor(jwt, member, s.sessionId, Math.floor(Date.now() / 1000) - 30) };
    const body = envelope();
    const response = await post(expired, body);
    expectError(response, 401, "AUTH_REQUIRED", "KEEP_FOR_RETRY");
    expect(response.headers["www-authenticate"]).toMatch(/^Bearer/);
    expect(await journalOf(s, body.operationId)).toBeNull();
    const refreshed = { token: signFor(jwt, member, s.sessionId) };
    expectAck(await post(refreshed, body), body.operationId, "APPLIED", "OK");
    expectAck(await post(refreshed, body), body.operationId, "ALREADY_APPLIED", "OK");
  });

  it("C25 contractVersion other than 1: 422, nothing interpreted or stored", async () => {
    const before = await journalCount();
    for (const version of [2, 0])
      expectError(await post(farmerA, { ...envelope(), contractVersion: version }), 422, "CONTRACT_VERSION_MISMATCH", "KEEP_FOR_RECONCILIATION");
    expect(await journalCount()).toBe(before);
  });

  it("C26 extra private field at any level: 400 FIELD_NOT_ALLOWED, no journal, value never logged", async () => {
    const before = await journalCount();
    const secret = "valor-privado-sintetico";
    const base = envelope();
    for (const body of [
      { ...base, tenantId: secret },
      { ...base, causal: { ...base.causal, clientId: secret } },
      { ...base, payload: { ...base.payload, notes: secret } },
      { ...base, payload: { ...base.payload, backup: Buffer.from(secret).toString("base64") } },
    ]) {
      expectError(await post(farmerA, body), 400, "FIELD_NOT_ALLOWED", "MOVE_TO_TERMINAL_FAILURE");
    }
    expect(await journalCount()).toBe(before);
    expect(logged.join("\n")).not.toContain(secret);
  });

  it("C27 predecessor unknown, foreign, not accepted or of another contribution: INVALID_PREDECESSOR", async () => {
    const s = await freshMember();
    const head = await published(s);
    const foreign = await published(farmerA2);
    const rejected = envelope({ product: randomUUID() });
    expectAck(await post(s, rejected), rejected.operationId, "REJECTED", "REFERENCE_UNAVAILABLE");
    const otherContribution = envelope({ type: "CONSUMPTION_TOTAL" });
    expectAck(await post(s, otherContribution), otherContribution.operationId, "APPLIED", "OK");
    for (const pred of [randomUUID(), foreign, rejected.operationId, otherContribution.operationId]) {
      const body = envelope({ action: "SUPERSEDE", pred, quantity: "5" });
      expectAck(await post(s, body), body.operationId, "REJECTED", "INVALID_PREDECESSOR");
    }
    expect(await contributionOf(s)).toEqual(expect.objectContaining({ headOperationId: head, status: "ACTIVE" }));
  });

  it("C31/C32 GET: owner sees ack and current state; others and unknown IDs get the same 404", async () => {
    const s = await freshMember();
    const operationId = await published(s, SENTINEL);
    const own = await get(s, operationId);
    expect(own.status).toBe(200);
    expect(Object.keys(own.body).sort()).toEqual(["ack", "contribution"]);
    expect(own.body.ack).toEqual(expect.objectContaining({ operationId, outcome: "ALREADY_APPLIED", code: "OK" }));
    expect(own.body.contribution).toEqual({ status: "ACTIVE", headOperationId: operationId, reconciliationReference: null });
    expect(JSON.stringify(own.body)).not.toContain(SENTINEL);
    expect(own.headers["cache-control"]).toBe("no-store");
    const answers: Res[] = [await get(farmerA2, operationId), await get(farmerB, operationId), await get(s, randomUUID())];
    for (const answer of answers) expectError(answer, 404, "OPERATION_NOT_FOUND", "KEEP_FOR_RETRY");
    expect(new Set(answers.map((a) => JSON.stringify(a.body))).size).toBe(1);
    expectError(await get(s, "NOT-A-UUID"), 400, "INVALID_REQUEST", "MOVE_TO_TERMINAL_FAILURE");
    // A rejected intention whose references did not resolve has no contribution.
    const rejected = envelope({ product: randomUUID() });
    await post(s, rejected);
    expect((await get(s, rejected.operationId)).body).toEqual({ ack: expect.objectContaining({ outcome: "REJECTED", code: "REFERENCE_UNAVAILABLE" }), contribution: null });
  });

  it("C34 the same operationId under another Member or tenant: independent keys and effects", async () => {
    const operationId = randomUUID();
    const owner = await freshMember();
    const sameTenant = await freshMember();
    const otherTenant = await freshMember(f.tenantB);
    expectAck(await post(owner, envelope({ operationId, quantity: "10" })), operationId, "APPLIED", "OK");
    expectAck(await post(sameTenant, envelope({ operationId, quantity: "11" })), operationId, "APPLIED", "OK");
    expectAck(await post(otherTenant, envelope({ operationId, campaign: f.campaigns.openB, product: f.products.liquidB, quantity: "12" })), operationId, "APPLIED", "OK");
    const journals = await prisma.syncV1OperationJournal.findMany({ where: { operationId } });
    expect(new Set(journals.map((j) => `${j.tenantId}/${j.memberId}`)).size).toBe(3);
    expect(new Set(journals.map((j) => j.contributionId)).size).toBe(3);
    const contributions = await Promise.all([contributionOf(owner), contributionOf(sameTenant)]);
    expect(contributions.map((c) => c!.quantityBase)).toEqual([10n, 11n]);
    // Nobody reads another owner's result for the same ID.
    expectError(await get(sameTenant, randomUUID()), 404, "OPERATION_NOT_FOUND", "KEEP_FOR_RETRY");
  });

  it("C35 session without a linked ClientRegistration, V1 token, Directiva or Administrador: 403", async () => {
    const unbound = await createSession(prisma, jwt, f.members.farmerA, { bind: false });
    const director = await createSession(prisma, jwt, f.members.directorA);
    const admin = await createSession(prisma, jwt, f.members.adminA);
    const member = await prisma.member.findUniqueOrThrow({ where: { id: f.members.farmerA }, include: { user: true } });
    const v1 = { token: jwt.sign({ sub: member.userId, email: member.user.email, tenantId: member.tenantId, role: "AGRICULTOR" }, { secret: "f05-sync-test-jwt-secret-long-enough", expiresIn: "15m" }) };
    const before = await journalCount();
    for (const session of [unbound, director, admin, v1])
      expectError(await post(session, envelope()), 403, "AUTH_CONTEXT_FORBIDDEN", "KEEP_FOR_RECONCILIATION");
    expect(await journalCount()).toBe(before);
  });

  it("C36 admission closed (no replay guarantee): 503, unknown IDs never accepted as new", async () => {
    const config = app.get(SyncV1Config) as { admissionOpen: boolean };
    config.admissionOpen = false;
    const before = await journalCount();
    try {
      const response = await post(farmerA, envelope());
      expectError(response, 503, "TEMPORARILY_UNAVAILABLE", "KEEP_FOR_RETRY");
    } finally {
      config.admissionOpen = true;
    }
    expect(await journalCount()).toBe(before);
  });

  it("C37 batch, duplicated JSON keys, invalid types or malformed JSON: 400 INVALID_REQUEST, nothing stored", async () => {
    const before = await journalCount();
    const base = envelope();
    const duplicated = JSON.stringify(base).replace('"action":"PUBLISH"', '"action":"PUBLISH","action":"CANCEL"');
    for (const body of [
      [base],
      duplicated,
      { ...base, operationId: base.operationId.toUpperCase() },
      { ...base, payload: { ...base.payload, quantity_base: 1250 } },
      ...["01", "-1", "1.5", "1e3", " 1"].map((q) => ({ ...base, payload: { ...base.payload, quantity_base: q } })),
      "{not json",
      "",
    ]) {
      expectError(await post(farmerA, body), 400, "INVALID_REQUEST", "MOVE_TO_TERMINAL_FAILURE");
    }
    expectError(await post(farmerA, base, "text/plain"), 415, "UNSUPPORTED_MEDIA_TYPE", "MOVE_TO_TERMINAL_FAILURE");
    expectError(await post(farmerA, base, "application/json; charset=latin1"), 415, "UNSUPPORTED_MEDIA_TYPE", "MOVE_TO_TERMINAL_FAILURE");
    const huge = { ...base, payload: { ...base.payload, notes: "x".repeat(20 * 1024) } };
    expectError(await post(farmerA, huge), 413, "REQUEST_TOO_LARGE", "MOVE_TO_TERMINAL_FAILURE");
    expect(await journalCount()).toBe(before);
  });

  it("missing or malformed credential: 401 AUTH_REQUIRED with WWW-Authenticate", async () => {
    for (const response of [
      await post(null, envelope()),
      await http().post(PUSH).set("Authorization", "Bearer not-a-jwt").set("Content-Type", "application/json").send(JSON.stringify(envelope())),
      await http().get("/api/v1/sync/v1/references"),
    ]) {
      expectError(response, 401, "AUTH_REQUIRED", "KEEP_FOR_RETRY");
      expect(response.headers["www-authenticate"]).toMatch(/^Bearer/);
    }
  });

  it("the journal only admits contractVersion 1, so GET never reinterprets another version", async () => {
    // The 422 branch of GET is defensive: migration 20261007202233 keeps a
    // CHECK (contractVersion = 1) on the journal.
    await expect(
      prisma.syncV1OperationJournal.create({
        data: {
          tenantId: farmerA.tenantId, memberId: farmerA.memberId, operationId: randomUUID(), contractVersion: 2,
          projectionType: "DECLARED_NEED", action: "PUBLISH", fingerprint: Buffer.alloc(32), fingerprintKeyVersion: 1,
        },
      }),
    ).rejects.toThrow(/contract_v1_check/);
  });

  it("privacy and individual domain: no quantities logged, no private or legacy effects", async () => {
    // Accepted, rejected and conflicting intentions have run above.
    const all = logged.join("\n");
    expect(all).not.toContain(SENTINEL);
    expect(all).not.toMatch(/quantity_base|campaign_ref|product_ref/);
    expect(all).not.toContain(farmerA.token);
    // Sync never creates purchases, lots, movements, debts, payments,
    // applications or legacy sync rows.
    const counts = await Promise.all([
      prisma.purchase.count(), prisma.inventoryLot.count(), prisma.stockMovement.count(),
      prisma.payableAccount.count(), prisma.payment.count(), prisma.agrochemicalApplication.count(),
      prisma.syncOperation.count(), prisma.auditLog.count(),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // business_effect_count <= 1 per key: accepted transitions equal journals APPLIED.
    const accepted = await prisma.syncV1OperationJournal.count({ where: { outcome: "APPLIED" } });
    const sequences = await prisma.syncV1Contribution.aggregate({ _sum: { lastSequence: true } });
    expect(sequences._sum.lastSequence).toBe(accepted);
  });
});
