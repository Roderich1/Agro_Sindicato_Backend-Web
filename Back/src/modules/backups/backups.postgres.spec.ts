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
import { BACKUP_STORAGE, BackupStorage } from "./domain/backup-storage.port";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  Fixture,
  JWT_SECRET,
  seedFixture,
  signFor,
  TestSession,
  unusablePasswordHash,
} from "../sync-v1/test-support/sync-v1-test-app";

/**
 * F08-BKP-01/02/03 (#37, #38, #39) on a disposable PostgreSQL server and a
 * real temporary storage directory. Opt-in: F08_BKP_PG_TEST_URL. Every
 * identity, name and value is synthetic.
 */
const postgresUrl = process.env["F08_BKP_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const BASE = "/api/v1/me/backups";
const MAX_BYTES = 64 * 1024;
const MAX_ACTIVE = 3;

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describePostgres("F08 private backups on PostgreSQL and disk", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let storageDir: string;
  let farmerA: TestSession;
  let farmerA2: TestSession;
  let farmerB: TestSession;
  let directorA: TestSession;
  let adminA: TestSession;
  let syncBefore: unknown;
  const logged: string[] = [];
  const secretsSeen: string[] = [];

  /** Full rows (not only counts) of Sync v1, collective, legacy sync and audit. */
  const syncAndCollectiveRows = async () => ({
    journal: await prisma.syncV1OperationJournal.findMany({ orderBy: { id: "asc" } }),
    contribution: await prisma.syncV1Contribution.findMany({ orderBy: { id: "asc" } }),
    dispute: await prisma.syncV1Dispute.findMany({ orderBy: { id: "asc" } }),
    release: await prisma.collectiveRelease.findMany({ orderBy: { id: "asc" } }),
    releaseItem: await prisma.collectiveReleaseItem.findMany({
      orderBy: [{ releaseId: "asc" }, { contributionId: "asc" }],
    }),
    association: await prisma.productCanonicalAssociation.findMany({ orderBy: { id: "asc" } }),
    legacyOperation: await prisma.syncOperation.findMany({ orderBy: { id: "asc" } }),
    legacyConflict: await prisma.syncConflict.findMany({ orderBy: { id: "asc" } }),
    audit: await prisma.auditLog.findMany({ orderBy: { id: "asc" } }),
  });

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "f08-bkp-storage-"));
    process.env["BACKUP_STORAGE_DIR"] = storageDir;
    process.env["BACKUP_MAX_BYTES"] = String(MAX_BYTES);
    process.env["BACKUP_MAX_ACTIVE_PER_MEMBER"] = String(MAX_ACTIVE);
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f08_bkp");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    f = await seedFixture(prisma);
    farmerA = await createSession(prisma, jwt, f.members.farmerA);
    farmerA2 = await createSession(prisma, jwt, f.members.farmerA2);
    farmerB = await createSession(prisma, jwt, f.members.farmerB);
    directorA = await createSession(prisma, jwt, f.members.directorA);
    adminA = await createSession(prisma, jwt, f.members.adminA);
    // A real Sync v1 publication first, so the comparison is not over empty
    // tables.
    const published = await request(server)
      .post("/api/v1/sync/v1/push")
      .set("Authorization", `Bearer ${farmerA.token}`)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({
        contractVersion: 1,
        operationId: randomUUID(),
        projectionType: "DECLARED_NEED",
        action: "PUBLISH",
        causal: { predecessorOperationId: null, reconciliationReference: null },
        payload: {
          campaign_ref: f.campaigns.openA,
          product_ref: f.products.liquidA,
          base_unit: "ML",
          quantity_base: "2500",
        },
      }));
    expect(published.body.outcome).toBe("APPLIED");
    syncBefore = await syncAndCollectiveRows();
    expect((syncBefore as { contribution: unknown[] }).contribution).toHaveLength(1);
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

  /** Synthetic backup bytes with a unique marker to search for in PostgreSQL. */
  function payload(size = 4096) {
    const marker = `F08-MARKER-${randomUUID()}`;
    const bytes = Buffer.concat([Buffer.from(marker), randomBytes(size)]);
    secretsSeen.push(marker);
    return { bytes, marker, sha256: sha(bytes) };
  }

  const http = () => request(server);
  const auth = (session: { token: string }) => ({ Authorization: `Bearer ${session.token}` });

  const upload = (
    session: { token: string },
    bytes: Buffer,
    headers: Record<string, string> = {},
  ) =>
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

  const files = async () => ({
    objects: (await readdir(join(storageDir, "objects")).catch(() => [])).sort(),
    staging: await readdir(join(storageDir, "staging")).catch(() => []),
  });

  const rowsOf = (memberId: string) =>
    prisma.backupMetadata.findMany({ where: { memberId }, orderBy: { createdAt: "asc" } });

  async function waitFor<T>(probe: () => Promise<T | undefined>, ms = 10000): Promise<T> {
    const until = Date.now() + ms;
    for (;;) {
      const value = await probe();
      if (value !== undefined) return value;
      if (Date.now() > until) throw new Error("timeout");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  let firstA: { id: string; bytes: Buffer; marker: string };

  it("uploads with SHA-256 verified by the server; the binary is on disk under a server key, never in PostgreSQL", async () => {
    const { bytes, marker, sha256 } = payload();
    const response = await upload(farmerA, bytes, {
      // Client-controlled hints never select the owner or the object name.
      "X-Tenant-Id": f.tenantB,
      "X-Member-Id": f.members.farmerB,
      "Content-Disposition": 'attachment; filename="../../evil.agrobackup"',
    });
    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(response.body).sort()).toEqual(
      ["contentType", "createdAt", "formatVersion", "id", "schemaVersion", "sha256", "sizeBytes"],
    );
    expect(response.body).toEqual(expect.objectContaining({
      sha256, sizeBytes: bytes.length, contentType: "application/octet-stream",
      formatVersion: 1, schemaVersion: 9,
    }));
    firstA = { id: response.body.id, bytes, marker };

    const row = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: firstA.id } });
    expect(row).toEqual(expect.objectContaining({
      tenantId: f.tenantA, memberId: f.members.farmerA, status: "AVAILABLE",
      sha256, sizeBytes: BigInt(bytes.length), failureCode: null, deletedAt: null,
    }));
    expect(row.storageKey).not.toBe(row.id);
    expect(await files()).toEqual({ objects: [row.storageKey], staging: [] });

    // No table or column of PostgreSQL contains the uploaded content.
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    // As text and as hex (how row_to_json renders a bytea column).
    const hex = Buffer.from(marker).toString("hex");
    for (const { table_name } of tables) {
      const hits = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table_name}" t
         WHERE row_to_json(t)::text LIKE $1 OR lower(row_to_json(t)::text) LIKE $2`,
        `%${marker}%`,
        `%${hex}%`,
      );
      expect({ table_name, n: Number(hits[0].n) }).toEqual({ table_name, n: 0 });
    }
  });

  it("lists and serves only the owner's copies; another Member or tenant gets an indistinguishable 404", async () => {
    const own = await http().get(BASE).set(auth(farmerA));
    expect(own.status).toBe(200);
    expect(own.body.backups.map((b: { id: string }) => b.id)).toEqual([firstA.id]);
    for (const other of [farmerA2, farmerB]) {
      const list = await http().get(`${BASE}?memberId=${f.members.farmerA}`).set(auth(other));
      expect(list.status).toBe(200);
      expect(list.body).toEqual({ backups: [] });
    }

    const served = await download(farmerA, firstA.id);
    expect(served.status).toBe(200);
    expect(Buffer.compare(served.body, firstA.bytes)).toBe(0);
    expect(served.headers["x-content-sha256"]).toBe(sha(firstA.bytes));
    expect(served.headers["cache-control"]).toBe("no-store");
    expect(served.headers["content-disposition"]).toBe(
      `attachment; filename="agrocuentas-${firstA.id}.agrobackup"`,
    );

    const missing = await download(farmerA, randomUUID());
    const malformed = await download(farmerA, "not-a-uuid");
    const reference = { status: missing.status, body: missing.body.toString() };
    expect(reference).toEqual({ status: 404, body: JSON.stringify({ errorCode: "BACKUP_NOT_FOUND" }) });
    expect({ status: malformed.status, body: malformed.body.toString() }).toEqual(reference);
    for (const other of [farmerA2, farmerB]) {
      const foreign = await download(other, firstA.id);
      expect({ status: foreign.status, body: foreign.body.toString() }).toEqual(reference);
      const removal = await http().delete(`${BASE}/${firstA.id}`).set(auth(other));
      expect({ status: removal.status, body: JSON.stringify(removal.body) }).toEqual(reference);
    }
    expect((await prisma.backupMetadata.findUniqueOrThrow({ where: { id: firstA.id } })).status)
      .toBe("AVAILABLE");
  });

  it("Directiva and Administrador of the same tenant have no access to private copies", async () => {
    for (const actor of [directorA, adminA]) {
      const forbidden = { errorCode: "AUTH_CONTEXT_FORBIDDEN" };
      expect((await http().get(BASE).set(auth(actor))).body).toEqual(forbidden);
      const served = await download(actor, firstA.id);
      expect(served.status).toBe(403);
      expect(served.body.toString()).toBe(JSON.stringify(forbidden));
      const removal = await http().delete(`${BASE}/${firstA.id}`).set(auth(actor));
      expect(removal.status).toBe(403);
      const { bytes } = payload(16);
      expect((await upload(actor, bytes)).status).toBe(403);
    }
    expect(await prisma.backupMetadata.count({
      where: { memberId: { in: [f.members.directorA, f.members.adminA] } },
    })).toBe(0);
  });

  it("requires a live Auth V2 mobile session", async () => {
    expect((await http().get(BASE)).status).toBe(401);
    expect((await http().get(BASE).set("Authorization", "Bearer x.y.z")).status).toBe(401);
    // Auth V1 token (no session): not a mobile owner context.
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: f.members.farmerA }, include: { user: true },
    });
    const v1 = jwt.sign(
      { sub: member.userId, email: member.user.email, tenantId: member.tenantId, role: member.role },
      { secret: JWT_SECRET, expiresIn: "5m" },
    );
    expect((await http().get(BASE).set("Authorization", `Bearer ${v1}`)).status).toBe(403);
    // Revoked session or registration: denied.
    const revoked = await createSession(prisma, jwt, f.members.farmerA);
    await prisma.authSession.update({ where: { id: revoked.sessionId }, data: { status: "REVOKED" } });
    expect((await http().get(BASE).set(auth(revoked))).status).toBe(403);
    const unbound = await createSession(prisma, jwt, f.members.farmerA, { bind: false });
    expect((await http().get(BASE).set(auth(unbound))).status).toBe(403);
  });

  it("rejects a SHA-256 mismatch with 422: no file stays and the previous copy remains", async () => {
    const before = await files();
    const { bytes } = payload();
    const response = await upload(farmerA, bytes, { "X-Content-SHA256": "a".repeat(64) });
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ errorCode: "BACKUP_SHA256_MISMATCH" });
    expect(await files()).toEqual(before);
    const rows = await rowsOf(f.members.farmerA);
    expect(rows.at(-1)).toEqual(expect.objectContaining({
      status: "FAILED", failureCode: "SHA256_MISMATCH", sizeBytes: null,
    }));
    const list = await http().get(BASE).set(auth(farmerA));
    expect(list.body.backups.map((b: { id: string }) => b.id)).toEqual([firstA.id]);
    expect(Buffer.compare((await download(farmerA, firstA.id)).body, firstA.bytes)).toBe(0);
  });

  it("enforces the size limit with 413, whether declared or streamed, leaving nothing", async () => {
    const before = await files();
    const big = randomBytes(MAX_BYTES + 1);
    const declared = await upload(farmerA, big);
    expect(declared.status).toBe(413);
    expect(declared.body).toEqual({ errorCode: "BACKUP_TOO_LARGE" });

    // Chunked transfer without Content-Length: cut by the streaming meter.
    const status = await new Promise<number>((resolve, reject) => {
      const { port } = server.address() as AddressInfo;
      const req = httpRequest({
        host: "127.0.0.1", port, method: "POST", path: BASE,
        headers: {
          ...auth(farmerA),
          "Content-Type": "application/octet-stream",
          "Transfer-Encoding": "chunked",
          "X-Content-SHA256": sha(big),
          "X-Backup-Format-Version": "1",
          "X-Backup-Schema-Version": "9",
        },
      }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on("error", reject);
      for (let offset = 0; offset < big.length; offset += 8192)
        req.write(big.subarray(offset, offset + 8192));
      req.end();
    });
    expect(status).toBe(413);
    const failed = await waitFor(async () => {
      const last = (await rowsOf(f.members.farmerA)).at(-1);
      return last?.failureCode === "TOO_LARGE" ? last : undefined;
    });
    expect(failed.status).toBe("FAILED");
    expect(await files()).toEqual(before);
  });

  it("a transfer cut by the client is recorded as FAILED and leaves no partial bytes", async () => {
    const before = await files();
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => {
      const req = httpRequest({
        host: "127.0.0.1", port, method: "POST", path: BASE,
        headers: {
          ...auth(farmerA),
          "Content-Type": "application/octet-stream",
          "Content-Length": "40000",
          "X-Content-SHA256": "b".repeat(64),
          "X-Backup-Format-Version": "1",
          "X-Backup-Schema-Version": "9",
        },
      });
      req.on("error", () => resolve());
      req.write(randomBytes(10000), () => setTimeout(() => {
        req.destroy();
        resolve();
      }, 200));
    });
    const failed = await waitFor(async () => {
      const last = (await rowsOf(f.members.farmerA)).at(-1);
      return last?.failureCode === "TRANSFER_INCOMPLETE" ? last : undefined;
    });
    expect(failed.status).toBe("FAILED");
    expect(await files()).toEqual(before);
  });

  it("rejects malformed uploads before storing anything", async () => {
    const before = await files();
    const { bytes } = payload(32);
    const cases: [Record<string, string>, number, string][] = [
      [{ "Content-Type": "application/json" }, 415, "UNSUPPORTED_MEDIA_TYPE"],
      [{ "X-Content-SHA256": "xyz" }, 400, "INVALID_REQUEST"],
      [{ "X-Backup-Format-Version": "0" }, 400, "INVALID_REQUEST"],
      [{ "X-Backup-Schema-Version": "-1" }, 400, "INVALID_REQUEST"],
    ];
    for (const [headers, status, errorCode] of cases) {
      const response = await upload(farmerA, bytes, headers);
      expect({ status: response.status, body: response.body }).toEqual({ status, body: { errorCode } });
    }
    const empty = await upload(farmerA, Buffer.alloc(0));
    expect(empty.status).toBe(400);
    expect(await files()).toEqual(before);
  });

  it("limits the copies in use per Member (409) and frees a slot on deletion", async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE; i++) {
      const response = await upload(farmerA2, payload(64).bytes);
      expect(response.status).toBe(201);
      ids.push(response.body.id);
    }
    const over = await upload(farmerA2, payload(64).bytes);
    expect(over.status).toBe(409);
    expect(over.body).toEqual({ errorCode: "BACKUP_QUOTA_EXCEEDED" });
    // Another Member is not affected by farmerA2's quota.
    expect((await upload(farmerB, payload(64).bytes)).status).toBe(201);

    expect((await http().delete(`${BASE}/${ids[0]}`).set(auth(farmerA2))).status).toBe(204);
    expect((await upload(farmerA2, payload(64).bytes)).status).toBe(201);
  });

  it("deletes logically and removes the file; it is no longer listed or served", async () => {
    const { bytes } = payload();
    const created = (await upload(farmerA, bytes)).body;
    const row = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: created.id } });
    expect((await files()).objects).toContain(row.storageKey);

    const removal = await http().delete(`${BASE}/${created.id}`).set(auth(farmerA));
    expect(removal.status).toBe(204);
    expect((await files()).objects).not.toContain(row.storageKey);
    expect(await prisma.backupMetadata.findUniqueOrThrow({ where: { id: created.id } }))
      .toEqual(expect.objectContaining({ status: "DELETED", deletedAt: expect.any(Date) }));
    const list = await http().get(BASE).set(auth(farmerA));
    expect(list.body.backups.map((b: { id: string }) => b.id)).not.toContain(created.id);
    expect((await download(farmerA, created.id)).status).toBe(404);
    expect((await http().delete(`${BASE}/${created.id}`).set(auth(farmerA))).status).toBe(404);
    // The other copy of the owner is untouched.
    expect(Buffer.compare((await download(farmerA, firstA.id)).body, firstA.bytes)).toBe(0);
  });

  it("does not deliver a stored copy that no longer matches its SHA-256", async () => {
    const { bytes } = payload();
    const created = (await upload(farmerA, bytes)).body;
    const row = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: created.id } });
    const altered = Buffer.from(bytes);
    altered[altered.length - 1] ^= 0xff;
    await writeFile(join(storageDir, "objects", row.storageKey), altered);

    const served = await download(farmerA, created.id);
    expect(served.status).toBe(500);
    expect(served.body.toString()).toBe(JSON.stringify({ errorCode: "BACKUP_INTEGRITY_FAILED" }));
    expect(served.headers["x-content-sha256"]).toBeUndefined();

    await rm(join(storageDir, "objects", row.storageKey));
    const absent = await download(farmerA, created.id);
    expect(absent.status).toBe(500);
    expect(absent.body.toString()).toBe(JSON.stringify({ errorCode: "BACKUP_INTEGRITY_FAILED" }));
  });

  it("a download racing with the owner's deletion answers 404, not an integrity failure", async () => {
    const created = (await upload(farmerA, payload().bytes)).body;
    const storage = app.get<BackupStorage>(BACKUP_STORAGE);
    const original = storage.open.bind(storage);
    jest.spyOn(storage, "open").mockImplementationOnce(async (key: string) => {
      await prisma.backupMetadata.update({ where: { id: created.id }, data: { status: "DELETED", deletedAt: new Date() } });
      await storage.remove(key);
      return original(key);
    });
    const served = await download(farmerA, created.id);
    expect({ status: served.status, body: served.body.toString() })
      .toEqual({ status: 404, body: JSON.stringify({ errorCode: "BACKUP_NOT_FOUND" }) });
  });

  it("if marking the copy AVAILABLE fails after the commit, its bytes are removed", async () => {
    const before = await files();
    jest.spyOn(prisma.backupMetadata, "updateMany").mockRejectedValueOnce(new Error("simulated"));
    const response = await upload(farmerA, payload().bytes);
    expect(response.status).toBe(500);
    expect(await files()).toEqual(before);
    expect((await rowsOf(f.members.farmerA)).at(-1)).toEqual(
      expect.objectContaining({ status: "FAILED", failureCode: "METADATA_UPDATE_FAILED" }),
    );
  });

  /** Raw bytes over a real socket (superagent would re-encode a Buffer). */
  function rawPost(
    headers: Record<string, string>,
    body: Buffer,
  ): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
    const { port } = server.address() as AddressInfo;
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1", port, method: "POST", path: BASE,
          headers: { ...headers, "Content-Length": String(body.length) },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }

  it("a body sent as JSON or urlencoded is never parsed, echoed or logged: closed 415", async () => {
    const before = await files();
    const rowsBefore = await prisma.backupMetadata.count();
    for (const [contentType, body] of [
      ["application/json", (marker: string) => Buffer.concat([Buffer.from(`{"x":"${marker}`), randomBytes(64)])],
      ["application/x-www-form-urlencoded", (marker: string) => Buffer.from(`a=${marker}&b=%ZZ`)],
      ["text/plain", (marker: string) => Buffer.from(marker)],
    ] as const) {
      const marker = `F08-PARSER-${randomUUID()}`;
      secretsSeen.push(marker);
      for (const authHeaders of [auth(farmerA), {}]) {
        const response = await rawPost(
          { ...authHeaders, "Content-Type": contentType, "X-Content-SHA256": "a".repeat(64),
            "X-Backup-Format-Version": "1", "X-Backup-Schema-Version": "9" },
          body(marker),
        );
        expect({ contentType, status: response.status, body: response.body }).toEqual({
          contentType, status: 415, body: JSON.stringify({ errorCode: "UNSUPPORTED_MEDIA_TYPE" }),
        });
        expect(response.headers["cache-control"]).toBe("no-store");
      }
    }
    expect(await files()).toEqual(before);
    expect(await prisma.backupMetadata.count()).toBe(rowsBefore);
  });

  describe("Auth V2 context is revalidated on every request", () => {
    async function freshFarmer(tenantId: string) {
      const userId = randomUUID();
      const memberId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId, tenantId, name: "Agricultor sintético de guardia",
          email: `guard-${userId}@example.test`, passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
          members: { create: { id: memberId, tenantId, role: "AGRICULTOR" } },
        },
      });
      const session = await createSession(prisma, jwt, memberId);
      expect((await http().get(BASE).set(auth(session))).status).toBe(200);
      return { session, userId, memberId };
    }
    const forbidden = { status: 403, body: { errorCode: "AUTH_CONTEXT_FORBIDDEN" } };
    const required = { status: 401, body: { errorCode: "AUTH_REQUIRED" } };
    const listAs = async (token: string) => {
      const r = await http().get(BASE).set("Authorization", `Bearer ${token}`);
      return { status: r.status, body: r.body };
    };

    it("revoked client registration: 403", async () => {
      const { session } = await freshFarmer(f.tenantA);
      await prisma.clientRegistration.update({ where: { id: session.registrationId! }, data: { status: "REVOKED" } });
      expect(await listAs(session.token)).toEqual(forbidden);
    });

    it("inactive Member: 403", async () => {
      const { session, memberId } = await freshFarmer(f.tenantA);
      await prisma.member.update({ where: { id: memberId }, data: { isActive: false } });
      expect(await listAs(session.token)).toEqual(forbidden);
    });

    it("inactive account (User): 403", async () => {
      const { session, userId } = await freshFarmer(f.tenantA);
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
      expect(await listAs(session.token)).toEqual(forbidden);
    });

    it("inactive tenant: 403", async () => {
      const tenantId = randomUUID();
      await prisma.tenant.create({ data: { id: tenantId, name: "Sintético C", slug: `f08-c-${tenantId}` } });
      const { session } = await freshFarmer(tenantId);
      await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } });
      expect(await listAs(session.token)).toEqual(forbidden);
    });

    it("expired session or expired token: 401", async () => {
      const { session } = await freshFarmer(f.tenantA);
      await prisma.authSession.update({ where: { id: session.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await listAs(session.token)).toEqual(required);

      const other = (await freshFarmer(f.tenantA)).session;
      const member = await prisma.member.findUniqueOrThrow({ where: { id: other.memberId }, include: { user: true } });
      const expired = signFor(jwt, member, other.sessionId, Math.floor(Date.now() / 1000) - 60);
      expect(await listAs(expired)).toEqual(required);
    });

    it("token whose tenant or Member differs from the session: 403", async () => {
      const { session, memberId } = await freshFarmer(f.tenantA);
      const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId }, include: { user: true } });
      expect(await listAs(signFor(jwt, { ...member, tenantId: f.tenantB }, session.sessionId))).toEqual(forbidden);
      expect(await listAs(signFor(jwt, { ...member, id: f.members.farmerA }, session.sessionId))).toEqual(forbidden);
      // The farmer whose id was borrowed is not affected, nor did anything leak.
      expect((await http().get(BASE).set(auth(farmerA))).status).toBe(200);
    });
  });

  it("no backup operation touched Sync v1, collective or audit tables, and nothing sensitive was logged", async () => {
    expect(await syncAndCollectiveRows()).toEqual(syncBefore);
    const rows = await prisma.backupMetadata.findMany();
    const text = logged.join(" | ");
    for (const value of [
      ...secretsSeen,
      ...rows.flatMap((r) => [r.id, r.storageKey, r.sha256, r.memberId]),
      farmerA.token, storageDir,
    ]) {
      expect(text).not.toContain(value);
    }
  });
});
