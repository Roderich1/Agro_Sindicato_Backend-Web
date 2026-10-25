import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { envSchema } from "@/config/env.schema";
import type { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { createBackupStorage, describeStagingCleanup } from "../backups.module";
import { storageFromEnv } from "../cli/backups-inventory";
import { LocalDiskBackupStorage } from "../infrastructure/local-disk-backup-storage";
import { S3BackupStorage } from "../infrastructure/s3-backup-storage";
import {
  BACKUP_UPLOAD_ABANDON_MS,
  BackupsConfig,
  DEFAULT_BACKUP_UPLOAD_DEADLINE_MS,
} from "./backups-config";
import { BackupsService } from "./backups.service";

/**
 * F08-BKP-07: explicit choice of provider. `b2` never falls back to the disk,
 * an incomplete `b2` leaves every route at 503, and no S3 secret is ever
 * printed. Synthetic values only.
 */
const SECRET = "SECRETO-SINTETICO-NO-REAL-0123456789abcdef";
const KEY_ID = "IDSINTETICO0000000000000";
const S3_ENV = {
  BACKUP_S3_ENDPOINT: "https://s3.us-east-005.backblazeb2.com",
  BACKUP_S3_REGION: "us-east-005",
  BACKUP_S3_BUCKET: "bucket-sintetico",
  BACKUP_S3_ACCESS_KEY_ID: KEY_ID,
  BACKUP_S3_SECRET_ACCESS_KEY: SECRET,
  BACKUP_S3_PREFIX: "ensayo-f08/",
};
const BASE_ENV = {
  DATABASE_URL: "postgresql://example",
  JWT_SECRET: "twelve-chars-minimum",
  JWT_REFRESH_SECRET: "x".repeat(32),
};
const configWith = (values: Record<string, unknown>) =>
  new BackupsConfig({ get: (key: string) => values[key] } as never);

describe("Backup storage provider selection", () => {
  let dir: string;
  const logged: string[] = [];
  const logger = { error: (message: string) => void logged.push(message) };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "f08-bkp-07-"));
    logged.length = 0;
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("empty or disk keeps the disk adapter in BACKUP_STORAGE_DIR, as before", () => {
    expect(createBackupStorage(configWith({ BACKUP_STORAGE_DIR: dir }), logger)).toBeInstanceOf(
      LocalDiskBackupStorage,
    );
    expect(
      createBackupStorage(configWith({ BACKUP_STORAGE_PROVIDER: "disk", BACKUP_STORAGE_DIR: dir }), logger),
    ).toBeInstanceOf(LocalDiskBackupStorage);
    expect(createBackupStorage(configWith({ BACKUP_STORAGE_PROVIDER: "disk" }), logger)).toBeNull();
  });

  it("b2 with every variable builds the S3 adapter, never the disk", () => {
    const storage = createBackupStorage(
      configWith({ BACKUP_STORAGE_PROVIDER: "b2", BACKUP_STORAGE_DIR: dir, ...S3_ENV }),
      logger,
    );
    expect(storage).toBeInstanceOf(S3BackupStorage);
    expect(logged).toEqual([]);
  });

  it.each(Object.keys(S3_ENV))(
    "b2 without %s: 503 on every route, nothing on the disk, only variable names logged",
    async (missing) => {
      const values: Record<string, unknown> = {
        BACKUP_STORAGE_PROVIDER: "b2",
        BACKUP_STORAGE_DIR: dir,
        ...S3_ENV,
        [missing]: undefined,
      };
      const storage = createBackupStorage(configWith(values), logger);
      expect(storage).toBeNull();
      expect(logged).toEqual([`Backup storage b2 is not configured (missing ${missing})`]);
      for (const value of Object.values(S3_ENV)) expect(logged.join("\n")).not.toContain(value);

      const prisma = new Proxy({}, {
        get: () => {
          throw new Error("PostgreSQL must not be reached");
        },
      }) as unknown as PrismaService;
      const service = new BackupsService(prisma, configWith(values), storage);
      const failure = await service
        .upload(
          { tenantId: "t", memberId: "m" },
          {
            contentType: "application/octet-stream",
            contentLength: "1",
            sha256: "0".repeat(64),
            formatVersion: "1",
            schemaVersion: "9",
          },
          Readable.from([Buffer.from("x")]),
        )
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ status: 503, errorCode: "BACKUP_STORAGE_UNAVAILABLE" });
      expect(await readdir(dir)).toEqual([]);
    },
  );

  it("production admission closes both providers", () => {
    for (const provider of ["disk", "b2"]) {
      const values = {
        NODE_ENV: "production",
        BACKUP_STORAGE_PROVIDER: provider,
        BACKUP_STORAGE_DIR: dir,
        ...S3_ENV,
      };
      expect(createBackupStorage(configWith(values), logger)).toBeNull();
      expect(
        createBackupStorage(configWith({ ...values, BACKUP_PRODUCTION_ADMISSION: "enabled" }), logger),
      ).not.toBeNull();
    }
  });
});

describe("staging cleanup log line (#151 5b, H3)", () => {
  it("carries the trigger, the cause and the pending codes only", () => {
    expect(
      describeStagingCleanup({
        trigger: "STAGE_FAILED",
        failure: { origin: "provider", name: "AccessDenied", status: 403 },
        complete: false,
        pending: ["MULTIPART_CREATION_UNKNOWN", "STAGING_PURGE_FAILED"],
      }),
    ).toBe(
      "Backup staging cleanup after STAGE_FAILED (provider AccessDenied 403): pending reconciliation: MULTIPART_CREATION_UNKNOWN, STAGING_PURGE_FAILED",
    );
    expect(describeStagingCleanup({ trigger: "DISCARDED", complete: true, pending: [] })).toBe(
      "Backup staging cleanup after DISCARDED: complete",
    );
  });
});

describe("BACKUP_UPLOAD_DEADLINE_MS (F08-BKP-06, consumed by the retention work)", () => {
  it("defaults to 30 min, below the 60 min abandon window", () => {
    expect(DEFAULT_BACKUP_UPLOAD_DEADLINE_MS).toBe(30 * 60 * 1000);
    expect(DEFAULT_BACKUP_UPLOAD_DEADLINE_MS).toBeLessThan(BACKUP_UPLOAD_ABANDON_MS);
    expect(configWith({}).uploadDeadlineMs).toBe(DEFAULT_BACKUP_UPLOAD_DEADLINE_MS);
    expect(envSchema.parse(BASE_ENV).BACKUP_UPLOAD_DEADLINE_MS).toBeUndefined();
  });

  it("accepts a value from 1 min up to just below the abandon window", () => {
    expect(envSchema.parse({ ...BASE_ENV, BACKUP_UPLOAD_DEADLINE_MS: "600000" }).BACKUP_UPLOAD_DEADLINE_MS).toBe(600_000);
    expect(envSchema.parse({ ...BASE_ENV, BACKUP_UPLOAD_DEADLINE_MS: "3599999" }).BACKUP_UPLOAD_DEADLINE_MS).toBe(3_599_999);
    expect(configWith({ BACKUP_UPLOAD_DEADLINE_MS: 600_000 }).uploadDeadlineMs).toBe(600_000);
  });

  it.each(["3600000", "0", "59999", "treinta", "1.5"])("rejects %p", (value) => {
    expect(() => envSchema.parse({ ...BASE_ENV, BACKUP_UPLOAD_DEADLINE_MS: value })).toThrow();
  });
});

describe("S3 variables in env.schema", () => {
  it("accepts the B2 variables and an empty provider", () => {
    const parsed = envSchema.parse({ ...BASE_ENV, BACKUP_STORAGE_PROVIDER: "b2", ...S3_ENV });
    expect(parsed.BACKUP_S3_PREFIX).toBe("ensayo-f08/");
    expect(envSchema.parse({ ...BASE_ENV, BACKUP_STORAGE_PROVIDER: "" }).BACKUP_STORAGE_PROVIDER).toBeUndefined();
  });

  it.each([
    ["BACKUP_STORAGE_PROVIDER", "s3"],
    ["BACKUP_S3_ENDPOINT", "http://s3.us-east-005.backblazeb2.com"],
    ["BACKUP_S3_ENDPOINT", "https://s3.us-east-005.backblazeb2.com/bucket"],
    ["BACKUP_S3_ENDPOINT", "https://user:pass@s3.example.com"],
    ["BACKUP_S3_ENDPOINT", "https://s3.example.com?x=1"],
    ["BACKUP_S3_REGION", "US East"],
    ["BACKUP_S3_BUCKET", "abc"],
    ["BACKUP_S3_PREFIX", "ensayo-f08"],
    ["BACKUP_S3_PREFIX", "/ensayo-f08/"],
    ["BACKUP_S3_PREFIX", "../x/"],
    ["BACKUP_S3_PREFIX", "a/b/"],
    ["BACKUP_S3_PREFIX", "/"],
  ])("rejects %s=%p", (name, value) => {
    expect(() => envSchema.parse({ ...BASE_ENV, ...S3_ENV, [name]: value })).toThrow();
  });

  it("a malformed secret is rejected without the value in the error", () => {
    for (const [name, value] of [
      ["BACKUP_S3_SECRET_ACCESS_KEY", `${SECRET} con espacio`],
      ["BACKUP_S3_ACCESS_KEY_ID", `${KEY_ID} con espacio`],
    ]) {
      const result = envSchema.safeParse({ ...BASE_ENV, ...S3_ENV, [name]: value });
      expect(result.success).toBe(false);
      const text = JSON.stringify(result.error) + String(result.error?.message);
      expect(text).toContain(name);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(KEY_ID);
    }
  });
});

describe("backups:inventory storage from the environment", () => {
  it("b2 incomplete or malformed: names the variables, never their values; never the disk", () => {
    const incomplete = storageFromEnv({
      DATABASE_URL: "postgresql://example",
      BACKUP_STORAGE_DIR: "/tmp/x",
      BACKUP_STORAGE_PROVIDER: "b2",
      ...S3_ENV,
      BACKUP_S3_SECRET_ACCESS_KEY: undefined,
    });
    expect(incomplete).toEqual({ error: "Faltan en el entorno: BACKUP_S3_SECRET_ACCESS_KEY." });

    const malformed = storageFromEnv({
      DATABASE_URL: "postgresql://example",
      BACKUP_STORAGE_PROVIDER: "b2",
      ...S3_ENV,
      BACKUP_S3_SECRET_ACCESS_KEY: `${SECRET} x`,
    });
    expect(malformed).toEqual({ error: "Variables con formato inválido: BACKUP_S3_SECRET_ACCESS_KEY." });
    expect(JSON.stringify(malformed)).not.toContain(SECRET);
  });

  it("selects S3 with b2 and the disk otherwise", () => {
    const b2 = storageFromEnv({ DATABASE_URL: "postgresql://example", BACKUP_STORAGE_PROVIDER: "b2", ...S3_ENV });
    expect("storage" in b2 && b2.storage).toBeInstanceOf(S3BackupStorage);
    const disk = storageFromEnv({ DATABASE_URL: "postgresql://example", BACKUP_STORAGE_DIR: "/tmp/x" });
    expect("storage" in disk && disk.storage).toBeInstanceOf(LocalDiskBackupStorage);
    expect(storageFromEnv({ DATABASE_URL: "postgresql://example" })).toEqual({
      error: "Faltan BACKUP_STORAGE_DIR o DATABASE_URL en el entorno.",
    });
  });
});
