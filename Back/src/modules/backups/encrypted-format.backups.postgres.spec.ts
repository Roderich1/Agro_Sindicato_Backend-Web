import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { envelopeHeader } from "./test-support/backup-envelope";
import { ENVELOPE_TAG_BYTES } from "./application/backup-format";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  Fixture,
  seedFixture,
  TestSession,
} from "../sync-v1/test-support/sync-v1-test-app";

/**
 * F08-ADR-003: copies encrypted on the phone (format 2) on a disposable
 * PostgreSQL server and a temporary storage directory. Opt-in:
 * F08_BKP_PG_TEST_URL. The bodies are synthetic: a valid outer header and
 * random bytes standing in for the ciphertext. The server never has a key and
 * these tests do not decrypt anything: what is checked is the outer shape,
 * the transport integrity and that retention and owner-scoping are unchanged.
 */
const postgresUrl = process.env["F08_BKP_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const BASE = "/api/v1/me/backups";
const MAX_ACTIVE = 3;

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A synthetic format-2 body: outer header + random "ciphertext" + tag. */
function envelope(plaintext = 2048): Buffer {
  return Buffer.concat([
    envelopeHeader(plaintext),
    randomBytes(plaintext),
    randomBytes(ENVELOPE_TAG_BYTES),
  ]);
}

describePostgres("F08-ADR-003 encrypted copies (format 2) on PostgreSQL and disk", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let storageDir: string;
  let farmerA: TestSession;
  let farmerB: TestSession;

  const http = () => request(server);
  const auth = (session: { token: string }) => ({ Authorization: `Bearer ${session.token}` });
  const upload = (session: { token: string }, bytes: Buffer, format: string) =>
    http()
      .post(BASE)
      .set(auth(session))
      .set("Content-Type", "application/octet-stream")
      .set("X-Content-SHA256", sha(bytes))
      .set("X-Backup-Format-Version", format)
      .set("X-Backup-Schema-Version", "10")
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
    ((await http().get(BASE).set(auth(session))).body.backups as { id: string }[]).map(
      (b) => b.id,
    );
  const objects = async () => (await readdir(join(storageDir, "objects")).catch(() => [])).sort();
  const staging = async () => readdir(join(storageDir, "staging")).catch(() => []);

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "f08-cif-storage-"));
    process.env["BACKUP_STORAGE_DIR"] = storageDir;
    process.env["BACKUP_MAX_BYTES"] = String(64 * 1024);
    process.env["BACKUP_MAX_ACTIVE_PER_MEMBER"] = String(MAX_ACTIVE);
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f08_cif");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    f = await seedFixture(prisma);
    farmerA = await createSession(prisma, jwt, f.members.farmerA);
    farmerB = await createSession(prisma, jwt, f.members.farmerB);
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await rm(storageDir, { recursive: true, force: true });
    delete process.env["BACKUP_STORAGE_DIR"];
    delete process.env["BACKUP_MAX_BYTES"];
    delete process.env["BACKUP_MAX_ACTIVE_PER_MEMBER"];
  });

  let legacyId: string;
  let firstEncrypted: { id: string; bytes: Buffer };

  it("a format-1 copy (before client-side encryption) is still accepted by default", async () => {
    const bytes = Buffer.concat([Buffer.from("PK\x03\x04", "latin1"), randomBytes(1024)]);
    const response = await upload(farmerA, bytes, "1");
    expect(response.status).toBe(201);
    expect(response.body.formatVersion).toBe(1);
    legacyId = response.body.id;
  });

  it("a format-2 copy is stored and served byte for byte; the API reports only format and transport hash", async () => {
    const bytes = envelope();
    const response = await upload(farmerA, bytes, "2");
    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({ formatVersion: 2, sha256: sha(bytes), sizeBytes: bytes.length }),
    );
    // Nothing in the answer about content, keys or validation of the inside.
    expect(Object.keys(response.body).sort()).toEqual(
      ["contentType", "createdAt", "formatVersion", "id", "schemaVersion", "sha256", "sizeBytes"],
    );
    firstEncrypted = { id: response.body.id, bytes };
    const served = await download(farmerA, firstEncrypted.id);
    expect(served.status).toBe(200);
    expect(served.headers["x-content-sha256"]).toBe(sha(bytes));
    expect(Buffer.compare(served.body, bytes)).toBe(0);
  });

  it("another Member gets the same 404 for an encrypted copy", async () => {
    expect((await download(farmerB, firstEncrypted.id)).status).toBe(404);
    expect(await listIds(farmerB)).not.toContain(firstEncrypted.id);
  });

  it.each([
    ["truncated (no tag)", () => envelope().subarray(0, -ENVELOPE_TAG_BYTES)],
    ["extra bytes at the end", () => Buffer.concat([envelope(), Buffer.from([0])])],
    ["plain container labelled as format 2", () => Buffer.concat([Buffer.from("PK\x03\x04", "latin1"), randomBytes(512)])],
    ["unknown algorithm", () => {
      const bytes = envelope();
      bytes[10] = 9;
      return bytes;
    }],
  ])("format 2 %s: 422 BACKUP_FORMAT_INVALID, no bytes kept, earlier copies intact", async (_name, make) => {
    const before = { objects: await objects(), ids: await listIds(farmerA) };
    const response = await upload(farmerA, make(), "2");
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ errorCode: "BACKUP_FORMAT_INVALID" });
    expect(await objects()).toEqual(before.objects);
    expect(await staging()).toEqual([]);
    expect(await listIds(farmerA)).toEqual(before.ids);
    const last = await prisma.backupMetadata.findFirstOrThrow({
      where: { memberId: f.members.farmerA },
      orderBy: { createdAt: "desc" },
    });
    expect(last).toEqual(expect.objectContaining({ status: "FAILED", failureCode: "FORMAT_INVALID" }));
  });

  it("an encrypted body labelled as format 1 is refused", async () => {
    const response = await upload(farmerA, envelope(), "1");
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ errorCode: "BACKUP_FORMAT_INVALID" });
  });

  it("an unknown format is refused from its header, before storing anything", async () => {
    const before = await objects();
    const response = await upload(farmerA, envelope(), "3");
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ errorCode: "BACKUP_FORMAT_INVALID" });
    expect(await objects()).toEqual(before);
  });

  it("retention keeps the N most recent verified copies; the unencrypted one is retired by rotation, not converted", async () => {
    // A has: legacy (format 1) and firstEncrypted. Two more format-2 uploads
    // with N = 3 retire the oldest: the legacy copy, only after the new one
    // is AVAILABLE.
    const second = await upload(farmerA, envelope(), "2");
    expect(second.status).toBe(201);
    expect(await listIds(farmerA)).toEqual([second.body.id, firstEncrypted.id, legacyId]);
    const third = await upload(farmerA, envelope(), "2");
    expect(third.status).toBe(201);
    expect(await listIds(farmerA)).toEqual([third.body.id, second.body.id, firstEncrypted.id]);
    const legacy = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: legacyId } });
    expect(legacy).toEqual(
      expect.objectContaining({ status: "DELETED", deletionReason: "RETENTION", formatVersion: 1 }),
    );
    expect(await objects()).toHaveLength(MAX_ACTIVE);
    // The surviving encrypted copy is untouched.
    expect(Buffer.compare((await download(farmerA, firstEncrypted.id)).body, firstEncrypted.bytes)).toBe(0);
  });

  it("a failed format-2 upload never retires the last valid copy", async () => {
    const before = await listIds(farmerA);
    const broken = envelope();
    broken.writeBigUInt64BE(1n, 72);
    expect((await upload(farmerA, broken, "2")).status).toBe(422);
    expect(await listIds(farmerA)).toEqual(before);
  });
});
