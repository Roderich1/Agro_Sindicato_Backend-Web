import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { request as httpRequest, Server } from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
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
} from "../sync-v1/test-support/sync-v1-test-app";
import { S3BackupStorage } from "./infrastructure/s3-backup-storage";
import { InMemoryS3, s3Error } from "./test-support/in-memory-s3";

/**
 * F08-BKP-07: the backup service on a disposable PostgreSQL with the S3
 * adapter over the «doble S3 en memoria». The double is **not** Backblaze B2.
 * Opt-in: F08_BKP_PG_TEST_URL (the CI runs it with `backups.postgres.spec.ts`).
 * Every identity, name and value is synthetic.
 */
const postgresUrl = process.env["F08_BKP_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const BASE = "/api/v1/me/backups";
const BUCKET = "bucket-sintetico-f08";
const PREFIX = "ensayo-f08/";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describePostgres("F08 private backups on PostgreSQL and the S3 adapter (in-memory S3 double)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let diskDir: string;
  let farmer: TestSession;
  const s3 = new InMemoryS3(BUCKET);
  const logged: string[] = [];

  beforeAll(async () => {
    // A disk directory is configured on purpose: nothing may ever land in it.
    diskDir = await mkdtemp(join(tmpdir(), "f08-bkp-07-disk-"));
    process.env["BACKUP_STORAGE_DIR"] = diskDir;
    process.env["BACKUP_MAX_BYTES"] = String(64 * 1024);
    process.env["BACKUP_MAX_ACTIVE_PER_MEMBER"] = "5";
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f08_bkp07");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl, {
      backupStorage: new S3BackupStorage(s3, { bucket: BUCKET, prefix: PREFIX }),
    }));
    server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    f = await seedFixture(prisma);
    farmer = await createSession(prisma, jwt, f.members.farmerA);
    for (const level of ["log", "warn", "error", "debug", "verbose"] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    if (diskDir) await rm(diskDir, { recursive: true, force: true });
  });

  afterEach(() => {
    s3.before = undefined;
    s3.after = undefined;
  });

  const auth = (session: { token: string }) => ({ Authorization: `Bearer ${session.token}` });
  const upload = (bytes: Buffer, headers: Record<string, string> = {}) =>
    request(server)
      .post(BASE)
      .set(auth(farmer))
      .set("Content-Type", "application/octet-stream")
      .set("X-Content-SHA256", sha(bytes))
      .set("X-Backup-Format-Version", "1")
      .set("X-Backup-Schema-Version", "9")
      .set(headers)
      .send(bytes);
  const download = (id: string) =>
    request(server)
      .get(`${BASE}/${id}/content`)
      .set(auth(farmer))
      .buffer(true)
      .parse((res: Readable, done: (e: Error | null, b: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
  const lastRow = async () =>
    (await prisma.backupMetadata.findMany({ where: { memberId: f.members.farmerA }, orderBy: { createdAt: "asc" } })).at(-1)!;
  /** Every version, marker and unfinished upload in the double. */
  const stored = () => s3.totalEntries();
  async function waitFor<T>(probe: () => Promise<T | undefined>, ms = 10000): Promise<T> {
    const until = Date.now() + ms;
    for (;;) {
      const value = await probe();
      if (value !== undefined) return value;
      if (Date.now() > until) throw new Error("timeout");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  let first: { id: string; bytes: Buffer; storageKey: string };

  it("uploads with SHA-256 verified, stores one version under the prefix and serves it back", async () => {
    const bytes = Buffer.concat([Buffer.from(`F08-B2-MARKER-${randomUUID()}`), randomBytes(4096)]);
    const response = await upload(bytes);
    expect(response.status).toBe(201);
    const row = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: response.body.id } });
    first = { id: response.body.id, bytes, storageKey: row.storageKey };
    expect(s3.names()).toEqual([`${PREFIX}objects/${row.storageKey}`]);
    expect(s3.versionsOf(`${PREFIX}objects/${row.storageKey}`)).toHaveLength(1);
    expect(s3.uploads.size).toBe(0);
    const served = await download(first.id);
    expect(served.status).toBe(200);
    expect(Buffer.compare(served.body, bytes)).toBe(0);
    expect(await readdir(diskDir)).toEqual([]);
  });

  it("a SHA-256 mismatch is 422: FAILED, nothing left in the bucket, the previous copy intact", async () => {
    const before = stored();
    const response = await upload(randomBytes(2048), { "X-Content-SHA256": "a".repeat(64) });
    expect(response.status).toBe(422);
    expect(await lastRow()).toEqual(expect.objectContaining({ status: "FAILED", failureCode: "SHA256_MISMATCH" }));
    expect(stored()).toBe(before);
    expect(Buffer.compare((await download(first.id)).body, first.bytes)).toBe(0);
  });

  it("a transfer cut by the client is FAILED and leaves no version or upload", async () => {
    const before = stored();
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => {
      const req = httpRequest({
        host: "127.0.0.1", port, method: "POST", path: BASE,
        headers: {
          ...auth(farmer),
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
      const last = await lastRow();
      return last.failureCode === "TRANSFER_INCOMPLETE" ? last : undefined;
    });
    expect(failed.status).toBe("FAILED");
    await waitFor(async () => (stored() === before ? true : undefined));
  });

  it("a provider that denies the write is 503: FAILED, nothing stored, never the disk", async () => {
    const before = stored();
    s3.before = (command) => {
      if (command.name === "PutObjectCommand") throw s3Error("AccessDenied", 403);
    };
    const response = await upload(randomBytes(1024));
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ errorCode: "BACKUP_STORAGE_UNAVAILABLE" });
    expect(await lastRow()).toEqual(expect.objectContaining({ status: "FAILED", failureCode: "STORAGE_WRITE_FAILED" }));
    expect(stored()).toBe(before);
    expect(await readdir(diskDir)).toEqual([]);
  });

  it("a copy that fails at commit is 503: FAILED, no final object, the previous copy intact", async () => {
    const before = stored();
    s3.before = (command) => {
      if (command.name === "CopyObjectCommand") throw s3Error("InternalError", 500);
    };
    const response = await upload(randomBytes(1024));
    expect(response.status).toBe(503);
    expect(await lastRow()).toEqual(expect.objectContaining({ status: "FAILED", failureCode: "STORAGE_COMMIT_FAILED" }));
    expect(stored()).toBe(before);
    s3.before = undefined;
    expect(Buffer.compare((await download(first.id)).body, first.bytes)).toBe(0);
  });

  it("an AVAILABLE copy whose object vanished is a closed integrity failure, never served", async () => {
    const bytes = randomBytes(1024);
    const response = await upload(bytes);
    expect(response.status).toBe(201);
    const row = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: response.body.id } });
    s3.hideDirect(`${PREFIX}objects/${row.storageKey}`);
    const served = await download(response.body.id);
    expect(served.status).toBe(500);
    expect(served.body.toString()).toBe(JSON.stringify({ errorCode: "BACKUP_INTEGRITY_FAILED" }));
  });

  it("delete is logical and purges every version and marker of the object", async () => {
    const name = `${PREFIX}objects/${first.storageKey}`;
    s3.putDirect(name, first.bytes); // a second physical version
    const response = await request(server).delete(`${BASE}/${first.id}`).set(auth(farmer));
    expect(response.status).toBe(204);
    expect(s3.versionsOf(name)).toEqual([]);
    expect((await prisma.backupMetadata.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("DELETED");
    expect(s3.sent.filter((c) => c.name === "DeleteObjectCommand").every((c) => typeof c.input["VersionId"] === "string")).toBe(true);
  });

  it("logs name no bucket, prefix, storage key or content", () => {
    const text = logged.join("\n");
    expect(text).not.toContain(BUCKET);
    expect(text).not.toContain(PREFIX);
    expect(text).not.toContain(first.storageKey);
    expect(text).not.toContain("F08-B2-MARKER");
  });
});
