import { afterAll, beforeAll } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { URL } from "node:url";
import {
  FinalizeJournal,
  JournalFinalizationError,
  JournalOwnershipError,
  JournalValidationError,
  ReserveJournal,
} from "../domain/sync-v1-journal.repository";
import { PrismaSyncV1JournalRepository } from "./prisma-sync-v1-journal.repository";

// Explicit opt-in URL MUST refer to a disposable PostgreSQL test server.
// Create a separate empty DB; never truncate/delete fixtures from a supplied DB.
const postgresUrl = process.env["F05_SYNC_05A_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const conflictReference = "11111111-1111-4111-8111-111111111111";
const acceptedAt = new Date("2026-01-01T00:00:00.000Z");

describePostgres("Sync v1 journal persistence, not business projection", () => {
  let prisma: PrismaClient;
  let repository: PrismaSyncV1JournalRepository;
  let emptyTableCount: number;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const memberA = randomUUID();
  const memberA2 = randomUUID();
  const memberB = randomUUID();

  beforeAll(async () => {
    const admin = new PrismaClient({
      datasources: { db: { url: postgresUrl } },
    });
    const name = `f05_sync_05a_${randomUUID().replaceAll("-", "")}`;
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.$disconnect();
    }
    const isolatedUrl = new URL(postgresUrl!);
    isolatedUrl.pathname = `/${name}`;
    prisma = new PrismaClient({
      datasources: { db: { url: isolatedUrl.toString() } },
    });
    const tables = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
    `;
    emptyTableCount = Number(tables[0].count);
    const migration = spawnSync(
      process.execPath,
      [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        encoding: "utf8",
        timeout: 60000,
      },
    );
    if (migration.status !== 0)
      throw new Error(`Isolated migration deploy failed: ${migration.stderr}`);
    repository = new PrismaSyncV1JournalRepository(prisma);
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: "Synthetic A", slug: tenantA },
        { id: tenantB, name: "Synthetic B", slug: tenantB },
      ],
    });
    for (const [memberId, tenantId] of [
      [memberA, tenantA],
      [memberA2, tenantA],
      [memberB, tenantB],
    ]) {
      const userId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          tenantId,
          name: "Synthetic user",
          email: `${userId}@example.test`,
          passwordHash: "synthetic-unused-hash",
          role: "AGRICULTOR",
          members: { create: { id: memberId, tenantId, role: "AGRICULTOR" } },
        },
      });
    }
  }, 120000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function input(overrides: Partial<ReserveJournal> = {}): ReserveJournal {
    return {
      tenantId: tenantA,
      memberId: memberA,
      operationId: randomUUID(),
      contractVersion: 1,
      projectionType: "DECLARED_NEED",
      action: "PUBLISH",
      predecessorOperationId: null,
      causalReconciliationReference: null,
      fingerprint: Buffer.alloc(32, 0x11),
      fingerprintKeyVersion: 1,
      ...overrides,
    };
  }

  function applied(): FinalizeJournal {
    return {
      outcome: "APPLIED",
      disposition: "RETIRE_FROM_OUTBOX",
      resultCode: "OK",
      serverAcceptedAt: acceptedAt,
      reconciliationReference: null,
    };
  }

  it("migrates an empty database from zero and retains every legacy table", async () => {
    expect(emptyTableCount).toBe(0);
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const names = tables.map((t) => t.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "SyncV1OperationJournal",
        "SyncOperation",
        "SyncConflict",
        "DemandForecast",
        "Payment",
        "CalendarEvent",
      ]),
    );
    const migrations = await prisma.$queryRaw<
      { migration_name: string; finished_at: Date | null }[]
    >`
      SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name
    `;
    expect(migrations).toHaveLength(5);
    expect(migrations.every((m) => m.finished_at !== null)).toBe(true);
    expect(migrations[4].migration_name).toMatch(
      /_f05_sync_v1_journal_expand$/,
    );
  });

  it("creates a nominal PROCESSING journal without final ACK fields", async () => {
    const request = input();
    const result = await repository.reserve(request);
    expect(result.classification).toBe("CREATED");
    expect(result.journal.processingState).toBe("PROCESSING");
    expect(result.journal.outcome).toBeNull();
    expect(result.journal.disposition).toBeNull();
    expect(result.journal.resultCode).toBeNull();
    expect(result.journal.serverAcceptedAt).toBeNull();
    expect(Buffer.from(result.journal.fingerprint)).toEqual(
      Buffer.from(request.fingerprint),
    );
  });

  it("classifies a matching non-final reserve as operation in progress", async () => {
    const request = input();
    const first = await repository.reserve(request);
    const second = await repository.reserve(request);
    expect(second.classification).toBe("EXISTING_PROCESSING");
    expect(second.journal).toEqual(first.journal);
  });

  it("returns matching final receipt without changing its metadata or timestamps", async () => {
    const request = input();
    await repository.reserve(request);
    const final = await repository.finalize(request, applied());
    const replay = await repository.reserve(request);
    expect(replay.classification).toBe("EXISTING_SAME_FINGERPRINT");
    expect(replay.journal).toEqual(final.journal);
  });

  it("rejects changed fingerprint without overwriting a PROCESSING record", async () => {
    const request = input();
    const first = await repository.reserve(request);
    const mismatch = await repository.reserve({
      ...request,
      fingerprint: Buffer.alloc(32, 0x22),
    });
    expect(mismatch.classification).toBe("EXISTING_DIFFERENT_FINGERPRINT");
    expect(mismatch.journal).toEqual(first.journal);
  });

  it("preserves a final result when a different fingerprint is presented", async () => {
    const request = input();
    await repository.reserve(request);
    const final = await repository.finalize(request, applied());
    const mismatch = await repository.reserve({
      ...request,
      fingerprint: Buffer.alloc(32, 0x33),
    });
    expect(mismatch.classification).toBe("EXISTING_DIFFERENT_FINGERPRINT");
    expect(mismatch.journal).toEqual(final.journal);
  });

  it("converges eight concurrent reserves to one row and exactly one creator", async () => {
    const request = input();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repository.reserve(request)),
    );
    expect(results.filter((r) => r.classification === "CREATED")).toHaveLength(
      1,
    );
    expect(
      results.filter((r) => r.classification === "EXISTING_PROCESSING"),
    ).toHaveLength(7);
    expect(new Set(results.map((r) => r.journal.id)).size).toBe(1);
    expect(
      await prisma.syncV1OperationJournal.count({
        where: requestIdentity(request),
      }),
    ).toBe(1);
  });

  it("concurrent different fingerprints have one creator and one mismatch, either winner", async () => {
    const a = input();
    const b = { ...a, fingerprint: Buffer.alloc(32, 0x44) };
    const results = await Promise.all([
      repository.reserve(a),
      repository.reserve(b),
    ]);
    expect(results.map((r) => r.classification).sort()).toEqual([
      "CREATED",
      "EXISTING_DIFFERENT_FINGERPRINT",
    ]);
    const creator = results.find((r) => r.classification === "CREATED")!;
    const stored = await repository.findByIdentity(a);
    expect(stored).toEqual(creator.journal);
    expect(
      await prisma.syncV1OperationJournal.count({ where: requestIdentity(a) }),
    ).toBe(1);
  });

  it("the same operationId is independent in different tenants", async () => {
    const a = input();
    const b = input({
      operationId: a.operationId,
      tenantId: tenantB,
      memberId: memberB,
    });
    const results = await Promise.all([
      repository.reserve(a),
      repository.reserve(b),
    ]);
    expect(results.every((r) => r.classification === "CREATED")).toBe(true);
    expect(results[0].journal.id).not.toBe(results[1].journal.id);
  });

  it("the same operationId is independent for two Members of one tenant", async () => {
    const a = input();
    const b = input({ operationId: a.operationId, memberId: memberA2 });
    const results = await Promise.all([
      repository.reserve(a),
      repository.reserve(b),
    ]);
    expect(results.every((r) => r.classification === "CREATED")).toBe(true);
    expect(results[0].journal.id).not.toBe(results[1].journal.id);
  });

  it("rejects Member/tenant mismatch before inserting a journal", async () => {
    const request = input({ memberId: memberB });
    await expect(repository.reserve(request)).rejects.toBeInstanceOf(
      JournalOwnershipError,
    );
    expect(
      await prisma.syncV1OperationJournal.count({
        where: { operationId: request.operationId },
      }),
    ).toBe(0);
  });

  it("the composite PostgreSQL FK independently rejects cross-tenant Member rows", async () => {
    const request = input({ memberId: memberB });
    await expect(
      prisma.syncV1OperationJournal.create({ data: storage(request) }),
    ).rejects.toMatchObject({ code: "P2003" });
    expect(
      await prisma.syncV1OperationJournal.count({
        where: { operationId: request.operationId },
      }),
    ).toBe(0);
  });

  it("finalizes PROCESSING to APPLIED as a journal-only synthetic result", async () => {
    const request = input();
    await repository.reserve(request);
    const result = await repository.finalize(request, applied());
    expect(result.classification).toBe("FINALIZED");
    expect(result.journal.processingState).toBe("FINAL");
    expect(result.journal.outcome).toBe("APPLIED");
    expect(result.journal.serverAcceptedAt).toEqual(acceptedAt);
    expect(await prisma.agrochemicalApplication.count()).toBe(0);
    expect(await prisma.purchase.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("compatible re-finalization returns the identical final receipt", async () => {
    const request = input();
    await repository.reserve(request);
    const first = await repository.finalize(request, applied());
    const again = await repository.finalize(request, applied());
    expect(again.classification).toBe("ALREADY_FINAL");
    expect(again.journal).toEqual(first.journal);
  });

  it("rejects incompatible finalization without changing an APPLIED record", async () => {
    const request = input();
    await repository.reserve(request);
    const final = await repository.finalize(request, applied());
    await expect(
      repository.finalize(request, {
        outcome: "REJECTED",
        disposition: "MOVE_TO_TERMINAL_FAILURE",
        resultCode: "REFERENCE_UNAVAILABLE",
        serverAcceptedAt: null,
        reconciliationReference: null,
      }),
    ).rejects.toBeInstanceOf(JournalFinalizationError);
    expect(await repository.findByIdentity(request)).toEqual(final.journal);
  });

  it("scoped reads cannot expose another Member/tenant receipt with its ID/fingerprint", async () => {
    const request = input();
    await repository.reserve(request);
    expect(
      await repository.findByIdentity({
        ...requestIdentity(request),
        memberId: memberA2,
      }),
    ).toBeNull();
    expect(
      await repository.findByIdentity({
        ...requestIdentity(request),
        tenantId: tenantB,
        memberId: memberB,
      }),
    ).toBeNull();
    await expect(
      repository.findByIdentity({
        ...requestIdentity(request),
        memberId: memberB,
      }),
    ).rejects.toBeInstanceOf(JournalOwnershipError);
  });

  it("real columns/row omit payload, quantity, client IDs, snapshots and secrets", async () => {
    const columns = await prisma.$queryRaw<
      { column_name: string; data_type: string }[]
    >`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'SyncV1OperationJournal'
    `;
    expect(
      columns.filter((c) =>
        /payload|request|body|snapshot|quantity|notes|token|clientid|secret/i.test(
          c.column_name,
        ),
      ),
    ).toEqual([]);
    expect(
      columns.find((c) => c.column_name === "fingerprint")?.data_type,
    ).toBe("bytea");
    expect(
      columns.find((c) => c.column_name === "operationId")?.data_type,
    ).toBe("uuid");
    expect(columns.some((c) => /json/.test(c.data_type))).toBe(false);
    const result = await repository.reserve(input());
    expect(Object.keys(result.journal).sort()).toEqual(
      columns.map((c) => c.column_name).sort(),
    );
  });

  it("rolls back reservation in a caller-owned transaction", async () => {
    const request = input();
    await expect(
      prisma.$transaction(async (tx) => {
        await repository.reserve(request, tx);
        throw new Error("synthetic rollback");
      }),
    ).rejects.toThrow("synthetic rollback");
    expect(await repository.findByIdentity(request)).toBeNull();
  });

  it("rolls back finalization without losing an existing PROCESSING reservation", async () => {
    const request = input();
    const first = await repository.reserve(request);
    await expect(
      prisma.$transaction(async (tx) => {
        await repository.finalize(request, applied(), tx);
        throw new Error("synthetic rollback");
      }),
    ).rejects.toThrow("synthetic rollback");
    expect(await repository.findByIdentity(request)).toEqual(first.journal);
  });

  it("duplicate reserve keeps an external transaction usable, without catching P2002", async () => {
    const request = input();
    await repository.reserve(request);
    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await repository.reserve(request, tx);
      expect(await tx.tenant.count()).toBe(2);
      return duplicate;
    });
    expect(result.classification).toBe("EXISTING_PROCESSING");
  });

  it("concurrent incompatible finalizers preserve exactly one final result", async () => {
    const request = input();
    await repository.reserve(request);
    const results = await Promise.allSettled([
      repository.finalize(request, applied()),
      repository.finalize(request, {
        outcome: "REJECTED",
        disposition: "MOVE_TO_TERMINAL_FAILURE",
        resultCode: "CAMPAIGN_NOT_OPEN",
        serverAcceptedAt: null,
        reconciliationReference: null,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const final = await repository.findByIdentity(request);
    expect(["APPLIED", "REJECTED"]).toContain(final?.outcome);
  });

  it("keeps request causal metadata distinct from the final conflict reference", async () => {
    const request = input({
      predecessorOperationId: randomUUID(),
      causalReconciliationReference: randomUUID(),
    });
    await repository.reserve(request);
    const final = await repository.finalize(request, {
      outcome: "CONFLICT",
      disposition: "KEEP_FOR_RECONCILIATION",
      resultCode: "CAUSAL_FORK",
      serverAcceptedAt: null,
      reconciliationReference: conflictReference,
    });
    expect(final.journal.causalReconciliationReference).toBe(
      request.causalReconciliationReference,
    );
    expect(final.journal.reconciliationReference).toBe(conflictReference);
    expect((await repository.reserve(request)).classification).toBe(
      "EXISTING_SAME_FINGERPRINT",
    );
  });

  it("rejects a key-version change and preserves original digest/version", async () => {
    const request = input();
    const original = await repository.reserve(request);
    const result = await repository.reserve({
      ...request,
      fingerprintKeyVersion: 2,
    });
    expect(result.classification).toBe("EXISTING_DIFFERENT_FINGERPRINT");
    expect(result.journal).toEqual(original.journal);
  });

  it.each([0, -1, 1.5])(
    "rejects invalid fingerprint key version %s before insertion",
    async (fingerprintKeyVersion) => {
      const request = input({ fingerprintKeyVersion });
      await expect(repository.reserve(request)).rejects.toBeInstanceOf(
        JournalValidationError,
      );
      expect(
        await prisma.syncV1OperationJournal.count({
          where: { operationId: request.operationId },
        }),
      ).toBe(0);
    },
  );

  it("rejects a non-32-byte digest without inserting", async () => {
    const request = input({ fingerprint: Buffer.alloc(31) });
    await expect(repository.reserve(request)).rejects.toBeInstanceOf(
      JournalValidationError,
    );
    expect(await repository.findByIdentity(request)).toBeNull();
  });

  it("database CHECK constraints reject invalid processing/final metadata and digest", async () => {
    await expect(
      prisma.syncV1OperationJournal.create({
        data: { ...storage(input()), fingerprint: Buffer.alloc(31) },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.syncV1OperationJournal.create({
        data: { ...storage(input()), processingState: "FINAL" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.syncV1OperationJournal.create({
        data: { ...storage(input()), outcome: "APPLIED" },
      }),
    ).rejects.toThrow();
  });

  it("rejects impossible outcome/disposition combinations without modifying the journal", async () => {
    const request = input();
    const first = await repository.reserve(request);
    await expect(
      repository.finalize(request, {
        ...applied(),
        disposition: "KEEP_FOR_RECONCILIATION",
      }),
    ).rejects.toBeInstanceOf(JournalValidationError);
    expect(await repository.findByIdentity(request)).toEqual(first.journal);
  });

  it("legacy storage remains independently usable and is not copied to the journal", async () => {
    const before = await prisma.syncV1OperationJournal.count();
    const legacy = await prisma.syncOperation.create({
      data: {
        tenantId: tenantA,
        clientId: "synthetic-legacy-client",
        entityName: "PLOT_CREATE",
        operation: "PLOT_CREATE",
        payload: { fixture: true },
      },
    });
    expect(legacy.status).toBe("PENDIENTE");
    expect(legacy.payload).toEqual({ fixture: true });
    expect(await prisma.syncV1OperationJournal.count()).toBe(before);
  });

  function requestIdentity(request: ReserveJournal) {
    return {
      tenantId: request.tenantId,
      memberId: request.memberId,
      operationId: request.operationId,
    };
  }

  function storage(request: ReserveJournal) {
    return { ...request, fingerprint: Uint8Array.from(request.fingerprint) };
  }
});
