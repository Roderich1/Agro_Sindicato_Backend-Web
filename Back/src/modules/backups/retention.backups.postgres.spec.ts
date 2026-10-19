import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest, Server } from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { purgePending } from "./application/backup-retention";
import { BackupsConfig } from "./application/backups-config";
import { main as inventoryMain } from "./cli/backups-inventory";
import { BACKUP_STORAGE, BackupStorage } from "./domain/backup-storage.port";
import { gateCommit, interceptCompletion } from "./test-support/backup-test-hooks";
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
 * F08-BKP-06 (#40): retention of the N most recent verified copies
 * (`docs/architecture/F08_BKP_06_RETENCION.md` §9), on a disposable
 * PostgreSQL server and the development disk adapter. Opt-in:
 * F08_BKP_PG_TEST_URL. Not B2: the disk adapter has no versions. Every
 * identity and value is synthetic.
 */
const postgresUrl = process.env["F08_BKP_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const BASE = "/api/v1/me/backups";
const N = 3;

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describePostgres("F08-BKP-06 retention on PostgreSQL and disk", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let storageDir: string;
  let databaseUrl: string;
  let storage: BackupStorage;
  let config: BackupsConfig;
  const logged: string[] = [];
  const sessions: TestSession[] = [];

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "f08-ret-storage-"));
    process.env["BACKUP_STORAGE_DIR"] = storageDir;
    process.env["BACKUP_MAX_BYTES"] = String(64 * 1024);
    process.env["BACKUP_MAX_ACTIVE_PER_MEMBER"] = String(N);
    databaseUrl = await createIsolatedDatabase(postgresUrl!, "f08_ret");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    f = await seedFixture(prisma);
    storage = app.get<BackupStorage>(BACKUP_STORAGE);
    config = app.get(BackupsConfig);
    for (const level of ["log", "warn", "error", "debug", "verbose"] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  });

  const http = () => request(server);
  const auth = (session: { token: string }) => ({ Authorization: `Bearer ${session.token}` });
  const payload = () => Buffer.concat([Buffer.from(`F08-RET-${randomUUID()}`), randomBytes(512)]);

  const upload = (session: { token: string }, bytes = payload(), headers: Record<string, string> = {}) =>
    http()
      .post(BASE)
      .set(auth(session))
      .set("Content-Type", "application/octet-stream")
      .set("X-Content-SHA256", sha(bytes))
      .set("X-Backup-Format-Version", "1")
      .set("X-Backup-Schema-Version", "9")
      .set(headers)
      .send(bytes);

  const download = (session: { token: string }, id: string) =>
    http()
      .get(`${BASE}/${id}/content`)
      .set(auth(session))
      .buffer(true)
      .parse((res: Readable, done: (e: Error | null, b: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });

  const listIds = async (session: { token: string }) =>
    ((await http().get(BASE).set(auth(session))).body.backups as { id: string }[]).map((b) => b.id);

  const objects = async () => new Set(await readdir(join(storageDir, "objects")).catch(() => []));
  const staging = async () => readdir(join(storageDir, "staging")).catch(() => [] as string[]);

  const rowsOf = (session: TestSession) =>
    prisma.backupMetadata.findMany({ where: { memberId: session.memberId }, orderBy: { createdAt: "asc" } });

  /** Objects on disk that belong to the Member's rows (the bound R5 counts these). */
  async function objectsOf(session: TestSession) {
    const onDisk = await objects();
    return (await rowsOf(session)).filter((r) => onDisk.has(r.storageKey)).length;
  }

  async function newFarmer(): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId: f.tenantA, name: "Agricultor sintético de retención",
        email: `ret-${userId}@example.test`, passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
      },
    });
    const session = await createSession(prisma, jwt, memberId);
    sessions.push(session);
    return session;
  }

  /** A farmer with `count` AVAILABLE copies, oldest first. */
  async function farmerWith(count: number) {
    const session = await newFarmer();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const response = await upload(session);
      expect(response.status).toBe(201);
      ids.push(response.body.id);
    }
    return { session, ids };
  }

  async function waitFor<T>(probe: () => Promise<T | undefined>, ms = 10000): Promise<T> {
    const until = Date.now() + ms;
    for (;;) {
      const value = await probe();
      if (value !== undefined) return value;
      if (Date.now() > until) throw new Error("timeout");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  /** An upload whose body is sent in two halves, so it stays UPLOADING between them. */
  function slowUpload(session: TestSession, bytes = payload()) {
    const { port } = server.address() as AddressInfo;
    const half = Math.floor(bytes.length / 2);
    let finish!: () => void;
    const done = new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest({
        host: "127.0.0.1", port, method: "POST", path: BASE,
        headers: {
          ...auth(session),
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bytes.length),
          "X-Content-SHA256": sha(bytes),
          "X-Backup-Format-Version": "1",
          "X-Backup-Schema-Version": "9",
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
      });
      req.on("error", reject);
      req.write(bytes.subarray(0, half));
      finish = () => req.end(bytes.subarray(half));
    });
    return { done, finish: () => finish() };
  }

  it("T-R1/T-R1b: up to N copies nothing is retired; the next upload is 201 and retires only the oldest", async () => {
    const session = await newFarmer();
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      const response = await upload(session);
      expect(response.status).toBe(201);
      ids.push(response.body.id);
      expect((await rowsOf(session)).filter((r) => r.status !== "AVAILABLE")).toEqual([]);
    }
    const oldest = (await rowsOf(session))[0];
    const next = await upload(session);
    expect(next.status).toBe(201);

    expect(await listIds(session)).toEqual([next.body.id, ...ids.slice(1).reverse()]);
    const retired = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(retired).toEqual(expect.objectContaining({
      status: "DELETED", deletionReason: "RETENTION", purgePending: false, deletedAt: expect.any(Date),
    }));
    expect((await objects()).has(oldest.storageKey)).toBe(false);
    expect(await objectsOf(session)).toBe(N);
    expect((await download(session, ids[0])).status).toBe(404);
    expect((await http().delete(`${BASE}/${ids[0]}`).set(auth(session))).status).toBe(404);
    // The surviving copies are intact.
    for (const id of ids.slice(1)) expect((await download(session, id)).status).toBe(200);
  });

  it("T-R1c: copies never expire by age", async () => {
    const { session, ids } = await farmerWith(2);
    const ancient = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000);
    await prisma.backupMetadata.updateMany({
      where: { id: { in: ids } }, data: { createdAt: ancient, completedAt: ancient },
    });
    expect((await upload(session, payload(), { "X-Content-SHA256": "a".repeat(64) })).status).toBe(422);
    const third = await upload(session);
    expect(third.status).toBe(201);
    expect((await listIds(session)).sort()).toEqual([...ids, third.body.id].sort());
  });

  it("T-R2: with N = 1 the previous copy leaves only after the new one is AVAILABLE; failed uploads retire nothing", async () => {
    const limit = jest.spyOn(config, "maxActivePerMember", "get").mockReturnValue(1);
    try {
      const { session, ids: [first] } = await farmerWith(1);
      expect((await upload(session, payload(), { "X-Content-SHA256": "b".repeat(64) })).status).toBe(422);
      const originalStage = storage.stage.bind(storage);
      jest.spyOn(storage, "stage").mockImplementationOnce(async (key: string, source: Readable) => {
        const staged = await originalStage(key, source);
        return {
          commit: async () => {
            await staged.discard();
            throw new Error("simulated commit failure");
          },
          discard: () => staged.discard(),
        };
      });
      expect((await upload(session)).status).toBe(503);
      expect(await listIds(session)).toEqual([first]);

      let seenInside: string | undefined;
      interceptCompletion(prisma, {
        inside: async () => {
          // Another connection: the previous copy is still AVAILABLE while the
          // new one is being completed.
          seenInside = (await prisma.backupMetadata.findUniqueOrThrow({ where: { id: first } })).status;
        },
      });
      const second = await upload(session);
      expect(second.status).toBe(201);
      expect(seenInside).toBe("AVAILABLE");
      expect(await listIds(session)).toEqual([second.body.id]);
      expect(await prisma.backupMetadata.findUniqueOrThrow({ where: { id: first } }))
        .toEqual(expect.objectContaining({ status: "DELETED", deletionReason: "RETENTION" }));
    } finally {
      limit.mockRestore();
    }
  });

  it("T-R4: a completion that fails retires nothing; an ambiguous one that committed leaves the retired copy pending, purged by the next upload", async () => {
    const { session, ids } = await farmerWith(N);
    const before = await objects();
    interceptCompletion(prisma, { fail: "before" });
    expect((await upload(session)).status).toBe(500);
    expect(await listIds(session)).toEqual([...ids].reverse());
    expect(await objects()).toEqual(before);
    expect((await rowsOf(session)).at(-1)).toEqual(expect.objectContaining({
      status: "FAILED", failureCode: "METADATA_UPDATE_FAILED", purgePending: false,
    }));

    interceptCompletion(prisma, { fail: "after" });
    const ambiguous = await upload(session);
    expect(ambiguous.status).toBe(201);
    const retired = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(retired).toEqual(expect.objectContaining({ status: "DELETED", deletionReason: "RETENTION", purgePending: true }));
    expect((await objects()).has(retired.storageKey)).toBe(true);
    expect(await objectsOf(session)).toBe(N + 1);

    expect((await upload(session)).status).toBe(201);
    const purged = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(purged.purgePending).toBe(false);
    expect((await objects()).has(retired.storageKey)).toBe(false);
    expect(await objectsOf(session)).toBe(N);
  });

  it("T-R5: a purge that fails during rotation keeps the bounded excess, refuses uploads with 503 and is reconciled", async () => {
    const { session, ids } = await farmerWith(N);
    const outage = jest.spyOn(storage, "remove").mockRejectedValue(new Error("simulated outage"));
    try {
      const rotated = await upload(session);
      expect(rotated.status).toBe(201);
      const retired = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } });
      expect(retired).toEqual(expect.objectContaining({ status: "DELETED", deletionReason: "RETENTION", purgePending: true }));
      expect(await objectsOf(session)).toBe(N + 1);

      const rowsBefore = (await rowsOf(session)).length;
      const refused = await upload(session);
      expect({ status: refused.status, body: refused.body })
        .toEqual({ status: 503, body: { errorCode: "BACKUP_STORAGE_UNAVAILABLE" } });
      expect((await rowsOf(session)).length).toBe(rowsBefore);
      expect(await objectsOf(session)).toBe(N + 1);
      expect(await listIds(session)).toHaveLength(N);
    } finally {
      outage.mockRestore();
    }
    expect((await upload(session)).status).toBe(201);
    expect((await rowsOf(session)).filter((r) => r.purgePending)).toEqual([]);
    expect(await objectsOf(session)).toBe(N);
  });

  it("T-R5: a failed upload whose purge fails also counts against the bound until reconciled", async () => {
    const { session } = await farmerWith(N);
    const removeOutage = jest.spyOn(storage, "remove").mockRejectedValue(new Error("simulated outage"));
    const discardOutage = jest.spyOn(storage, "discardStaged").mockRejectedValue(new Error("simulated outage"));
    try {
      expect((await upload(session, payload(), { "X-Content-SHA256": "c".repeat(64) })).status).toBe(422);
      expect((await rowsOf(session)).at(-1)).toEqual(expect.objectContaining({
        status: "FAILED", failureCode: "SHA256_MISMATCH", purgePending: true,
      }));
      expect((await upload(session)).status).toBe(503);
    } finally {
      removeOutage.mockRestore();
      discardOutage.mockRestore();
    }
    expect((await upload(session)).status).toBe(201);
    expect((await rowsOf(session)).filter((r) => r.purgePending)).toEqual([]);
  });

  it("T-R7: the owner may delete the last copy; that deletion is recorded as OWNER", async () => {
    const { session, ids: [only] } = await farmerWith(1);
    const row = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: only } });
    expect((await http().delete(`${BASE}/${only}`).set(auth(session))).status).toBe(204);
    expect(await listIds(session)).toEqual([]);
    expect(await prisma.backupMetadata.findUniqueOrThrow({ where: { id: only } }))
      .toEqual(expect.objectContaining({ status: "DELETED", deletionReason: "OWNER", purgePending: false }));
    expect((await objects()).has(row.storageKey)).toBe(false);
  });

  it("C1: a second upload while one is in progress gets 409 BACKUP_UPLOAD_IN_PROGRESS; the first retires exactly one copy", async () => {
    const { session, ids } = await farmerWith(N);
    const first = slowUpload(session);
    await waitFor(async () =>
      (await rowsOf(session)).some((r) => r.status === "UPLOADING") ? true : undefined);
    const second = await upload(session);
    expect({ status: second.status, body: second.body })
      .toEqual({ status: 409, body: { errorCode: "BACKUP_UPLOAD_IN_PROGRESS" } });
    first.finish();
    const done = await first.done;
    expect(done.status).toBe(201);
    const rows = await rowsOf(session);
    expect(rows.filter((r) => r.status === "AVAILABLE")).toHaveLength(N);
    expect(rows.filter((r) => r.deletionReason === "RETENTION").map((r) => r.id)).toEqual([ids[0]]);
  });

  it("C2: an owner deletion before the completion retires nothing more; one during it waits for the Member lock", async () => {
    {
      const { session, ids } = await farmerWith(N);
      const gate = gateCommit(storage);
      const pending = upload(session).then((r: { status: number }) => r); // supertest only sends when awaited
      await gate.reached;
      expect((await http().delete(`${BASE}/${ids[0]}`).set(auth(session))).status).toBe(204);
      gate.release();
      expect((await pending).status).toBe(201);
      const rows = await rowsOf(session);
      expect(rows.filter((r) => r.status === "AVAILABLE")).toHaveLength(N);
      expect(rows.filter((r) => r.deletionReason === "RETENTION")).toEqual([]);
      expect(rows.filter((r) => r.deletionReason === "OWNER").map((r) => r.id)).toEqual([ids[0]]);
    }
    {
      const { session, ids } = await farmerWith(N);
      let deletion: Promise<{ status: number }> | undefined;
      let deleted = false;
      interceptCompletion(prisma, {
        inside: async () => {
          deletion = http().delete(`${BASE}/${ids[1]}`).set(auth(session)).then((r: { status: number }) => {
            deleted = true;
            return r;
          });
          await new Promise((resolve) => setTimeout(resolve, 400));
          expect(deleted).toBe(false);
        },
      });
      expect((await upload(session)).status).toBe(201);
      expect((await deletion!).status).toBe(204);
      const rows = await rowsOf(session);
      expect(rows.filter((r) => r.deletionReason === "RETENTION").map((r) => r.id)).toEqual([ids[0]]);
      expect(rows.filter((r) => r.deletionReason === "OWNER").map((r) => r.id)).toEqual([ids[1]]);
      expect(rows.filter((r) => r.status === "AVAILABLE")).toHaveLength(N - 1);
    }
  });

  it("C3: a download racing with the retirement of that copy answers 404", async () => {
    const { session, ids } = await farmerWith(N);
    const original = storage.open.bind(storage);
    jest.spyOn(storage, "open").mockImplementationOnce(async (key: string) => {
      expect((await upload(session)).status).toBe(201);
      return original(key);
    });
    const served = await download(session, ids[0]);
    expect({ status: served.status, body: served.body.toString() })
      .toEqual({ status: 404, body: JSON.stringify({ errorCode: "BACKUP_NOT_FOUND" }) });
  });

  it("C4: simultaneous uploads of two Members each rotate only their own copies", async () => {
    const x = await farmerWith(N);
    const y = await farmerWith(N);
    const [rx, ry] = await Promise.all([upload(x.session), upload(y.session)]);
    expect([rx.status, ry.status]).toEqual([201, 201]);
    expect(await listIds(x.session)).toEqual([rx.body.id, ...x.ids.slice(1).reverse()]);
    expect(await listIds(y.session)).toEqual([ry.body.id, ...y.ids.slice(1).reverse()]);
  });

  it("C5: a recent UPLOADING row is never closed; an abandoned one is closed and its staging purged; a late completion changes nothing", async () => {
    const session = await newFarmer();
    const key = randomUUID();
    const row = await prisma.backupMetadata.create({
      data: {
        id: randomUUID(), tenantId: f.tenantA, memberId: session.memberId, storageKey: key,
        contentType: "application/octet-stream", formatVersion: 1, schemaVersion: 9, sha256: "d".repeat(64),
      },
    });
    const part = `${key}.${randomBytes(8).toString("hex")}.part`;
    await writeFile(join(storageDir, "staging", part), randomBytes(64));

    expect((await upload(session)).status).toBe(409);
    expect((await prisma.backupMetadata.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("UPLOADING");
    expect(await staging()).toContain(part);

    await prisma.backupMetadata.update({
      where: { id: row.id }, data: { createdAt: new Date(Date.now() - 61 * 60 * 1000) },
    });
    expect((await upload(session)).status).toBe(201);
    expect(await prisma.backupMetadata.findUniqueOrThrow({ where: { id: row.id } })).toEqual(
      expect.objectContaining({ status: "FAILED", failureCode: "ABANDONED", purgePending: false }),
    );
    expect(await staging()).not.toContain(part);

    // An upload closed as abandoned while it was waiting to commit.
    const gate = gateCommit(storage);
    const late = upload(session).then((r: { status: number }) => r);
    await gate.reached;
    const waiting = (await rowsOf(session)).find((r) => r.status === "UPLOADING")!;
    await prisma.backupMetadata.update({
      where: { id: waiting.id }, data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    const other = await upload(session);
    expect(other.status).toBe(201);
    gate.release();
    expect((await late).status).toBe(503);
    expect(await prisma.backupMetadata.findUniqueOrThrow({ where: { id: waiting.id } })).toEqual(
      expect.objectContaining({ status: "FAILED", failureCode: "ABANDONED", purgePending: false }),
    );
    expect((await objects()).has(waiting.storageKey)).toBe(false);
    expect(await listIds(session)).not.toContain(waiting.id);
  });

  it("C6: the database refuses a pending purge on an AVAILABLE copy; concurrent reconciliations never touch AVAILABLE copies", async () => {
    const { session, ids } = await farmerWith(N);
    await expect(prisma.backupMetadata.update({ where: { id: ids[0] }, data: { purgePending: true } }))
      .rejects.toThrow();
    await expect(prisma.backupMetadata.update({ where: { id: ids[0] }, data: { deletionReason: "RETENTION" } }))
      .rejects.toThrow();

    const outage = jest.spyOn(storage, "remove").mockRejectedValue(new Error("simulated outage"));
    try {
      expect((await http().delete(`${BASE}/${ids[0]}`).set(auth(session))).status).toBe(204);
      expect((await http().delete(`${BASE}/${ids[1]}`).set(auth(session))).status).toBe(204);
    } finally {
      outage.mockRestore();
    }
    const available = () => prisma.backupMetadata.findMany({ where: { status: "AVAILABLE" }, orderBy: { id: "asc" } });
    const availableBefore = await available();
    const onDiskBefore = await objects();
    const [a, b] = await Promise.all([
      purgePending(prisma, storage, {}),
      purgePending(prisma, storage, {}),
    ]);
    expect(a.confirmed + b.confirmed).toBe(2);
    expect(await available()).toEqual(availableBefore);
    for (const r of availableBefore) expect(onDiskBefore.has(r.storageKey)).toBe(true);
    for (const r of availableBefore) expect((await objects()).has(r.storageKey)).toBe(true);
    expect((await rowsOf(session)).filter((r) => r.purgePending)).toEqual([]);
  });

  it("T-B2 (service level): a commit that fails after the object became visible leaves the row FAILED, purges it and retires nothing", async () => {
    const { session, ids } = await farmerWith(N);
    const originalStage = storage.stage.bind(storage);
    jest.spyOn(storage, "stage").mockImplementationOnce(async (key: string, source: Readable) => {
      const staged = await originalStage(key, source);
      return {
        commit: async () => {
          await staged.commit();
          throw new Error("staging purge not confirmed (simulated)");
        },
        discard: () => staged.discard(),
      };
    });
    expect((await upload(session)).status).toBe(503);
    const failed = (await rowsOf(session)).at(-1)!;
    expect(failed).toEqual(expect.objectContaining({
      status: "FAILED", failureCode: "STORAGE_COMMIT_FAILED", purgePending: false,
    }));
    expect((await objects()).has(failed.storageKey)).toBe(false);
    expect(await listIds(session)).toEqual([...ids].reverse());
  });

  it("the operator reconciliation counts pending purges as a dry-run and purges them with --apply, printing no identifiers", async () => {
    const { session, ids } = await farmerWith(2);
    const outage = jest.spyOn(storage, "remove").mockRejectedValue(new Error("simulated outage"));
    try {
      expect((await http().delete(`${BASE}/${ids[0]}`).set(auth(session))).status).toBe(204);
    } finally {
      outage.mockRestore();
    }
    const row = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(row.purgePending).toBe(true);
    const previous = { db: process.env["DATABASE_URL"], dir: process.env["BACKUP_STORAGE_DIR"] };
    process.env["DATABASE_URL"] = databaseUrl;
    process.env["BACKUP_STORAGE_DIR"] = storageDir;
    try {
      const dry: string[] = [];
      expect(await inventoryMain(["--reconcile"], (l) => dry.push(l))).toBe(0);
      expect(dry.join("\n")).toContain('"OWNER": 1');
      expect(dry.join("\n")).toContain("dry-run");
      expect((await objects()).has(row.storageKey)).toBe(true);

      const applied: string[] = [];
      expect(await inventoryMain(["--reconcile", "--apply"], (l) => applied.push(l))).toBe(0);
      expect(applied.join("\n")).toContain('"confirmadas": 1');
      expect((await objects()).has(row.storageKey)).toBe(false);
      expect((await prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } })).purgePending).toBe(false);
      for (const text of [dry.join("\n"), applied.join("\n")]) {
        for (const id of [row.id, row.storageKey, session.memberId, f.tenantA]) expect(text).not.toContain(id);
        expect(text).not.toContain(storageDir);
      }
    } finally {
      if (previous.db === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = previous.db;
      if (previous.dir === undefined) delete process.env["BACKUP_STORAGE_DIR"];
      else process.env["BACKUP_STORAGE_DIR"] = previous.dir;
    }
  });

  it("nothing logged carries a key, a backup id, a Member or a token", async () => {
    const rows = await prisma.backupMetadata.findMany();
    const text = logged.join(" | ");
    expect(text).toContain("Backup retention purge pending");
    for (const value of [
      ...rows.flatMap((r) => [r.id, r.storageKey, r.memberId]),
      ...sessions.map((s) => s.token),
      storageDir,
    ]) {
      expect(text).not.toContain(value);
    }
  });
});
