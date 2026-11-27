import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { AddressInfo } from "node:net";
import cookieParser = require("cookie-parser");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { configureProductIdentificationBody } from "../product-identification/api/rest/identification-body";
import { PRODUCT_PHOTO_STORAGE } from "../product-identification/infrastructure/product-photo-storage";
import { jpeg, jpegWithExif, png } from "../product-identification/test-support/images";
import { configureSyncV1BodyParser } from "../sync-v1/api/rest/sync-v1-body";
import {
  createIsolatedDatabase, createSession, JWT_SECRET, seedFixture, TestSession, unusablePasswordHash,
} from "../sync-v1/test-support/sync-v1-test-app";
import { configureBackupsBodyGuard } from "./api/rest/backups-body";
import { BACKUP_STORAGE } from "./domain/backup-storage.port";
import { createS3Client, S3BackupStorage, S3_PART_BYTES } from "./infrastructure/s3-backup-storage";
import { encryptedTrialPayload, sha256, trialConfiguration, trialInventory, verifyTrialKey } from "./test-support/b2-presentation-trial";

const run = process.env.B2_PRESENTATION_RUN;
const describeTrial = run ? describe : describe.skip;
const backupPath = "/me/backups";
const photoPath = "/catalog/identification-requests";
type Trial = ReturnType<typeof trialConfiguration>;
type Scope = Trial["scopes"][number];
type Storage = Record<Scope, S3BackupStorage>;
const empty = { objects: [], versions: [], markers: [], multipart: [] };

async function dropTrialDatabase(adminUrl: string, databaseUrl: string) {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!/^b2_presentation_[0-9a-f]{32}$/.test(name)) throw new Error("Unexpected disposable database name.");
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
}

describeTrial("Agrocuentas on real Backblaze B2 and isolated PostgreSQL", () => {
  let trial: Trial;
  let app: INestApplication;
  let databaseUrl: string;
  let prisma: PrismaService;
  let base: string;
  let storage: Storage;
  let owner: TestSession;
  let neighbor: TestSession;
  let otherTenant: TestSession;
  let director: TestSession;
  let otherDirector: TestSession;
  const known = { respaldos: new Set<string>(), fotos: new Set<string>() };

  async function inventory(scope: Scope) {
    const settings = trial.settings(scope);
    const client = createS3Client(settings);
    try {
      return await trialInventory(client, settings);
    } finally {
      client.destroy();
    }
  }

  async function call(path: string, expected: number, who: TestSession, options: RequestInit = {}) {
    const result = await fetch(base + path, {
      ...options, headers: { ...options.headers, Authorization: `Bearer ${who.token}` },
      redirect: "error", signal: AbortSignal.timeout(240_000),
    });
    const bytes = Buffer.from(await result.arrayBuffer());
    const code = result.headers.get("content-type")?.includes("application/json")
      ? (JSON.parse(bytes.toString("utf8")) as { errorCode?: string }).errorCode : undefined;
    const action = (options.method ?? "GET") + " " + path;
    if (result.status !== expected)
      throw new Error(`${action}: HTTP ${result.status} (expected ${expected})${code ? ` ${code}` : ""}`);
    return { json: <T>() => JSON.parse(bytes.toString("utf8")) as T, bytes, headers: result.headers };
  }

  beforeAll(async () => {
    trial = trialConfiguration(run!);
    await verifyTrialKey(trial.settings("respaldos"), trial.root);
    for (const scope of trial.scopes) expect(await inventory(scope)).toEqual(empty);
    databaseUrl = await createIsolatedDatabase(trial.pg, "b2_presentation").catch(() => {
      throw new Error("Could not create and migrate the disposable local PostgreSQL database.");
    });
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl, NODE_ENV: "production", COOKIE_SECURE: "true", CORS_ORIGIN: "https://agro.example.invalid",
      JWT_SECRET, JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
      BACKUP_STORAGE_PROVIDER: "b2", PRODUCT_PHOTO_STORAGE_PROVIDER: "b2",
      BACKUP_S3_PREFIX: trial.settings("respaldos").prefix, PRODUCT_PHOTO_S3_PREFIX: trial.settings("fotos").prefix,
      BACKUP_PRODUCTION_ADMISSION: "enabled", BACKUP_REQUIRE_CLIENT_ENCRYPTION: "true",
      PRODUCT_PHOTO_SWEEP_INTERVAL_MS: "", ESTIMATION_WORKER: "disabled", JOINT_PURCHASE_CLOSE_INTERVAL_MS: "disabled",
    });
    const { AppModule } = await import("@/app.module");
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix("api/v1");
    configureSyncV1BodyParser(app);
    app.use(cookieParser());
    configureBackupsBodyGuard(app);
    configureProductIdentificationBody(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
    storage = { respaldos: app.get(BACKUP_STORAGE), fotos: app.get(PRODUCT_PHOTO_STORAGE) };
    for (const provider of Object.values(storage)) expect(provider).toBeInstanceOf(S3BackupStorage);
    prisma = app.get(PrismaService);
    const f = await seedFixture(prisma);
    const foreign = await prisma.user.create({
      data: {
        name: "Directiva ficticia B", email: `${randomUUID()}@example.invalid`, passwordHash: unusablePasswordHash(),
        role: "DIRECTIVA", tenantId: f.tenantB, members: { create: { tenantId: f.tenantB, role: "DIRECTIVA" } },
      },
      include: { members: true },
    });
    const jwt = app.get(JwtService);
    [owner, neighbor, otherTenant, director, otherDirector] = await Promise.all(
      [f.members.farmerA, f.members.farmerA2, f.members.farmerB, f.members.directorA, foreign.members[0].id]
        .map((member) => createSession(prisma, jwt, member)),
    );
  }, 240_000);

  afterAll(async () => {
    try {
      if (prisma) {
        for (const { storageKey } of await prisma.backupMetadata.findMany({ select: { storageKey: true } }))
          known.respaldos.add(storageKey);
        for (const row of await prisma.productIdentificationRequest.findMany({ select: { photoStorageKey: true } }))
          if (row.photoStorageKey) known.fotos.add(row.photoStorageKey);
        for (const scope of trial.scopes) {
          for (const key of known[scope]) {
            await storage[scope].discardStaged(key).catch(() => undefined);
            await storage[scope].remove(key).catch(() => undefined);
          }
          const remaining = await inventory(scope);
          // The prefix was empty when the run started. Log only object names in this bounded inventory.
          if (Object.values(remaining).some((entries) => entries.length))
            throw new Error(`Residue in the trial prefix: ${JSON.stringify(remaining)}`);
        }
      }
    } finally {
      await app?.close();
      if (databaseUrl) await dropTrialDatabase(trial.pg, databaseUrl);
    }
  }, 600_000);

  it("stores an encrypted multipart backup, proves integrity and owner isolation, and purges all versions", async () => {
    const content = encryptedTrialPayload();
    const hash = sha256(content);
    const upload = (bytes: Buffer, format: string, status: number) => call(backupPath, status, owner, {
      method: "POST", body: new Uint8Array(bytes), headers: {
        "Content-Type": "application/octet-stream", "X-Content-SHA256": sha256(bytes),
        "X-Backup-Format-Version": format, "X-Backup-Schema-Version": "10",
      },
    });
    const plain = await upload(Buffer.from("PK\x03\x04synthetic", "latin1"), "1", 422);
    expect(plain.json<{ errorCode: string }>().errorCode).toBe("BACKUP_ENCRYPTION_REQUIRED");
    const uploaded = (await upload(content, "2", 201)).json<{ id: string }>();
    const row = await prisma.backupMetadata.findUniqueOrThrow({ where: { id: uploaded.id } });
    known.respaldos.add(row.storageKey);
    expect(row).toMatchObject({ status: "AVAILABLE", formatVersion: 2, sha256: hash, sizeBytes: BigInt(content.length) });
    const key = trial.settings("respaldos").prefix + "objects/" + row.storageKey;
    expect(await inventory("respaldos")).toEqual({ ...empty, objects: [key], versions: [key] });
    const list = (await call(backupPath, 200, owner)).json<{ backups: { id: string }[] }>();
    expect(list.backups.map((entry) => entry.id)).toEqual([uploaded.id]);
    const path = `${backupPath}/${uploaded.id}/content`;
    const downloaded = await call(path, 200, owner);
    expect(downloaded.bytes).toHaveLength(content.length);
    expect(sha256(downloaded.bytes)).toBe(hash);
    expect(downloaded.headers.get("x-content-sha256")).toBe(hash);
    await call(path, 404, neighbor);
    await call(path, 404, otherTenant);
    await call(`${backupPath}/${uploaded.id}`, 204, owner, { method: "DELETE" });
    await call(path, 404, owner);
    expect(await inventory("respaldos")).toEqual(empty);
  }, 360_000);

  it("aborts a real multipart staging upload and verifies the staging is empty", async () => {
    const key = randomUUID();
    known.respaldos.add(key);
    const source = new PassThrough();
    const attempt = storage.respaldos.stage(key, source).then(() => false, () => true);
    try {
      source.write(Buffer.alloc(S3_PART_BYTES + 1));
      let observed = false;
      for (let i = 0; i < 20 && !observed; i++) {
        observed = (await inventory("respaldos")).multipart.some((name) => name.includes(`/staging/${key}.`));
        if (!observed) await delay(500);
      }
      expect(observed).toBe(true);
    } finally {
      source.destroy(new Error("Trial source interrupted"));
      expect(await attempt).toBe(true);
    }
    expect(await inventory("respaldos")).toEqual(empty);
  }, 240_000);

  it("stores private photos, checks metadata and tenant isolation, and purges replaced and removed versions", async () => {
    const clientId = randomUUID();
    const replacedPath = `${photoPath}/${clientId}/photo`;
    await call(`${photoPath}/${clientId}`, 201, owner, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractVersion: 1, local_name: "Insumo ficticio", unit: "L",
        photo_consent: { version: "FOTO-1", accepted_at: new Date().toISOString() } }),
    });
    const put = (bytes: Buffer, status: number) => call(replacedPath, status, owner, {
      method: "PUT", body: new Uint8Array(bytes),
      headers: { "Content-Type": "application/octet-stream", "X-Content-SHA256": sha256(bytes) },
    });
    await put(await jpegWithExif(), 422);
    expect(await inventory("fotos")).toEqual(empty);
    const firstBytes = await jpeg(640, 480);
    await put(firstBytes, 201);
    const row = () => prisma.productIdentificationRequest.findFirstOrThrow({ where: { clientRequestId: clientId } });
    const first = await row();
    expect(first.photoStorageKey).toBeTruthy();
    known.fotos.add(first.photoStorageKey!);
    const readPath = `${photoPath}/${first.id}/photo`;
    await call(readPath, 403, neighbor);
    await call(readPath, 404, otherDirector);
    const served = await call(readPath, 200, director);
    expect(sha256(served.bytes)).toBe(sha256(firstBytes));
    expect(served.headers.get("cache-control")).toBe("private, no-store");
    const replacement = await png(320, 240);
    await put(replacement, 201);
    const next = await row();
    expect(next).toMatchObject({ photoWidth: 320, photoHeight: 240, photoContentType: "image/png", photoSizeBytes: replacement.length });
    expect(next.photoStorageKey).not.toBe(first.photoStorageKey);
    known.fotos.add(next.photoStorageKey!);
    const key = trial.settings("fotos").prefix + "objects/" + next.photoStorageKey;
    expect(await inventory("fotos")).toEqual({ ...empty, objects: [key], versions: [key] });
    expect(sha256((await call(readPath, 200, director)).bytes)).toBe(sha256(replacement));
    await call(replacedPath, 204, owner, { method: "DELETE" });
    await call(readPath, 404, director);
    expect(await inventory("fotos")).toEqual(empty);
  }, 300_000);
});
