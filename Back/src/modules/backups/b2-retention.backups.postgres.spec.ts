import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, afterEach, beforeAll } from "@jest/globals";
import { CreateMultipartUploadCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { request as httpRequest, Server } from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { cleanupBackupLeftovers, inventoryBackups } from "./application/backup-inventory";
import { BackupsConfig } from "./application/backups-config";
import { S3BackupStorage } from "./infrastructure/s3-backup-storage";
import { InMemoryS3, s3Error } from "./test-support/in-memory-s3";
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
 * F08-BKP-06 (#40), T-B2: retention with the S3 adapter of F08-BKP-07 over
 * the «doble S3 en memoria», which keeps every version like a bucket in
 * «Keep all versions». The double is **not** Backblaze B2. Opt-in:
 * F08_BKP_PG_TEST_URL (the CI runs it with `backups.postgres.spec.ts`).
 * Every identity, name and value is synthetic.
 */
const postgresUrl = process.env["F08_BKP_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const BASE = "/api/v1/me/backups";
const BUCKET = "bucket-sintetico-f08";
const PREFIX = "ensayo-f08/";
const N = 3;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const md5 = (bytes: Buffer) => createHash("md5").update(bytes).digest("base64"); // NOSONAR: S3 Content-MD5 of a test part, not cryptographic

describePostgres("F08-BKP-06 retention with the S3 adapter (in-memory S3 double)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let diskDir: string;
  let config: BackupsConfig;
  const s3 = new InMemoryS3(BUCKET);
  const storage = new S3BackupStorage(s3, { bucket: BUCKET, prefix: PREFIX });

  beforeAll(async () => {
    // A disk directory is configured on purpose: nothing may ever land in it.
    diskDir = await mkdtemp(join(tmpdir(), "f08-ret-b2-disk-"));
    process.env["BACKUP_STORAGE_DIR"] = diskDir;
    process.env["BACKUP_MAX_BYTES"] = String(64 * 1024);
    process.env["BACKUP_MAX_ACTIVE_PER_MEMBER"] = String(N);
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f08_ret_b2");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl, { backupStorage: storage }));
    server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    f = await seedFixture(prisma);
    config = app.get(BackupsConfig);
    for (const level of ["log", "warn", "error", "debug", "verbose"] as const)
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    if (diskDir) {
      expect(await readdir(diskDir)).toEqual([]);
      await rm(diskDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    s3.before = undefined;
    s3.after = undefined;
  });

  const auth = (session: { token: string }) => ({ Authorization: `Bearer ${session.token}` });
  const payload = () => Buffer.concat([Buffer.from(`F08-RET-B2-${randomUUID()}`), randomBytes(512)]);
  const upload = (session: TestSession, bytes = payload(), headers: Record<string, string> = {}) =>
    request(server)
      .post(BASE)
      .set(auth(session))
      .set("Content-Type", "application/octet-stream")
      .set("X-Content-SHA256", sha(bytes))
      .set("X-Backup-Format-Version", "1")
      .set("X-Backup-Schema-Version", "9")
      .set(headers)
      .send(bytes);
  const listIds = async (session: TestSession) =>
    ((await request(server).get(BASE).set(auth(session))).body.backups as { id: string }[]).map((b) => b.id);
  const rowsOf = (session: TestSession) =>
    prisma.backupMetadata.findMany({ where: { memberId: session.memberId }, orderBy: { createdAt: "asc" } });
  const finalName = (storageKey: string) => `${PREFIX}objects/${storageKey}`;
  /** Versions and markers of every name of the Member's rows, plus their staging. */
  async function entriesOf(session: TestSession) {
    let total = 0;
    for (const row of await rowsOf(session)) {
      total += s3.versionsOf(finalName(row.storageKey)).length;
      total += s3.names(`${PREFIX}staging/${row.storageKey}.`).length;
    }
    return total;
  }

  async function farmerWith(count: number) {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId: f.tenantA, name: "Agricultor sintético B2",
        email: `ret-b2-${userId}@example.test`, passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
      },
    });
    const session = await createSession(prisma, jwt, memberId);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const response = await upload(session);
      expect(response.status).toBe(201);
      ids.push(response.body.id);
    }
    return { session, ids };
  }

  it("rotation purges every version of the retired copy: N objects with one version each and no staging", async () => {
    const { session, ids } = await farmerWith(N);
    const oldest = (await rowsOf(session))[0];
    expect((await upload(session)).status).toBe(201);
    expect(await prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } }))
      .toEqual(expect.objectContaining({ status: "DELETED", deletionReason: "RETENTION", purgePending: false }));
    expect(s3.versionsOf(finalName(oldest.storageKey))).toEqual([]);
    const available = (await rowsOf(session)).filter((r) => r.status === "AVAILABLE");
    expect(available).toHaveLength(N);
    for (const row of available) expect(s3.versionsOf(finalName(row.storageKey))).toHaveLength(1);
    expect(await entriesOf(session)).toBe(N);
  });

  it("a provider that refuses version deletes keeps the retired copy pending, refuses uploads with 503 and reconciles", async () => {
    const { session, ids } = await farmerWith(N);
    const oldest = (await rowsOf(session))[0];
    s3.before = (command) => {
      if (command.name === "DeleteObjectCommand" && String(command.input["Key"]).includes("/objects/"))
        throw s3Error("ServiceUnavailable", 503);
    };
    expect((await upload(session)).status).toBe(201);
    expect(await prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } }))
      .toEqual(expect.objectContaining({ status: "DELETED", purgePending: true }));
    expect(s3.versionsOf(finalName(oldest.storageKey))).toHaveLength(1);
    expect(await entriesOf(session)).toBe(N + 1);
    expect((await upload(session)).status).toBe(503);
    expect(await entriesOf(session)).toBe(N + 1);

    s3.before = undefined;
    expect((await upload(session)).status).toBe(201);
    expect((await rowsOf(session)).filter((r) => r.purgePending)).toEqual([]);
    expect(s3.versionsOf(finalName(oldest.storageKey))).toEqual([]);
    expect(await entriesOf(session)).toBe(N);
  });

  it("a commit whose staging purge fails (R-c) leaves the row FAILED and pending, retires nothing, and is reconciled", async () => {
    const { session, ids } = await farmerWith(N);
    s3.before = (command) => {
      if (command.name === "DeleteObjectCommand" && String(command.input["Key"]).includes("/staging/"))
        throw s3Error("ServiceUnavailable", 503);
    };
    expect((await upload(session)).status).toBe(503);
    const failed = (await rowsOf(session)).at(-1)!;
    expect(failed).toEqual(expect.objectContaining({
      status: "FAILED", failureCode: "STORAGE_COMMIT_FAILED", purgePending: true,
    }));
    expect(await listIds(session)).toEqual([...ids].reverse());

    s3.before = undefined;
    expect((await upload(session)).status).toBe(201);
    expect((await prisma.backupMetadata.findUniqueOrThrow({ where: { id: failed.id } })).purgePending).toBe(false);
    expect(s3.versionsOf(finalName(failed.storageKey))).toEqual([]);
    expect(s3.names(`${PREFIX}staging/${failed.storageKey}.`)).toEqual([]);
  });

  it("an upload cut at its deadline is FAILED UPLOAD_DEADLINE, answers 503 and leaves no version or upload", async () => {
    const { session, ids } = await farmerWith(1);
    const deadline = jest.spyOn(config, "uploadDeadlineMs", "get").mockReturnValue(300);
    try {
      const bytes = payload();
      const { port } = server.address() as AddressInfo;
      const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
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
        // Half the body, and then nothing: only the deadline ends it.
        req.write(bytes.subarray(0, bytes.length / 2));
      });
      expect(response).toEqual({ status: 503, body: JSON.stringify({ errorCode: "BACKUP_STORAGE_UNAVAILABLE" }) });
    } finally {
      deadline.mockRestore();
    }
    const cut = (await rowsOf(session)).at(-1)!;
    expect(cut).toEqual(expect.objectContaining({ status: "FAILED", failureCode: "UPLOAD_DEADLINE", purgePending: false }));
    expect(s3.names(`${PREFIX}staging/${cut.storageKey}.`)).toEqual([]);
    expect([...s3.uploads.values()].filter((u) => u.key.includes(cut.storageKey))).toEqual([]);
    expect(await listIds(session)).toEqual(ids);
  });

  it("the inventory reports hidden versions and unfinished uploads apart; cleanup aborts only the old unfinished upload", async () => {
    // A third party: a version hidden by a delete marker, and a multipart
    // upload left open under a staging name.
    const strayKey = randomUUID();
    const strayBody = randomBytes(300);
    s3.putDirect(finalName(strayKey), strayBody);
    s3.hideDirect(finalName(strayKey));
    const stagingName = `${PREFIX}staging/${randomUUID()}.${randomBytes(8).toString("hex")}.part`;
    const signal = new AbortController().signal;
    const created = (await s3.send(
      new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: stagingName }), { abortSignal: signal },
    )) as { UploadId: string };
    const part = randomBytes(200);
    await s3.send(new UploadPartCommand({
      Bucket: BUCKET, Key: stagingName, UploadId: created.UploadId, PartNumber: 1,
      Body: part, ContentLength: part.length, ContentMD5: md5(part),
    }), { abortSignal: signal });

    const report = await inventoryBackups(prisma, storage);
    expect(report.summary.hiddenVersion).toEqual({ count: 2, bytes: strayBody.length });
    expect(report.summary.incompleteUpload).toEqual({ count: 1, bytes: part.length });
    // The hidden version is not matched against any row as a current object.
    expect(report.summary.unreferencedObject.count).toBe(0);

    const cleanup = await cleanupBackupLeftovers(prisma, storage, { olderThanMinutes: 60, apply: true });
    expect(cleanup.removed.incompleteUpload.count).toBe(1);
    expect(cleanup.removed.hiddenVersion.count).toBe(0);
    expect([...s3.uploads.values()].filter((u) => u.key === stagingName)).toEqual([]);
    // Only reported: a third party's hidden versions need a human decision.
    expect(s3.versionsOf(finalName(strayKey))).toHaveLength(2);
  });
});
