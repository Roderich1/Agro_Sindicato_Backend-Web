import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import type { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { BackupHttpError } from "./backup-http-error";
import { BackupsConfig } from "./backups-config";
import { BackupsService } from "./backups.service";
import { BackupTooLargeError, Sha256Meter } from "./sha256-meter";

const owner = { tenantId: "t", memberId: "m" };

describe("Sha256Meter", () => {
  const sink = () => new Writable({ write: (_c, _e, done) => done() });

  it("hashes and counts what flows through", async () => {
    const meter = new Sha256Meter(1024);
    await pipeline(Readable.from([Buffer.from("abc"), Buffer.from("def")]), meter, sink());
    expect(meter.bytes).toBe(6);
    expect(meter.sha256).toBe(createHash("sha256").update("abcdef").digest("hex"));
  });

  it("fails as soon as the limit is exceeded", async () => {
    const meter = new Sha256Meter(4);
    await expect(
      pipeline(Readable.from([Buffer.from("abc"), Buffer.from("def")]), meter, sink()),
    ).rejects.toBeInstanceOf(BackupTooLargeError);
  });
});

describe("BackupsService without configured storage", () => {
  // No prisma call may happen: the routes are closed before touching data.
  const prisma = new Proxy({}, {
    get: () => {
      throw new Error("PostgreSQL must not be reached");
    },
  }) as unknown as PrismaService;
  const config = { maxBytes: 10, maxActivePerMember: 5 } as BackupsConfig;
  const service = new BackupsService(prisma, config, null);
  const unavailable = expect.objectContaining({
    status: 503,
    errorCode: "BACKUP_STORAGE_UNAVAILABLE",
  });

  it.each([
    ["list", () => service.list(owner)],
    ["download", () => service.download(owner, "00000000-0000-4000-8000-000000000000")],
    ["remove", () => service.remove(owner, "00000000-0000-4000-8000-000000000000")],
    [
      "upload",
      () =>
        service.upload(
          owner,
          {
            contentType: "application/octet-stream",
            contentLength: "1",
            sha256: "0".repeat(64),
            formatVersion: "1",
            schemaVersion: "9",
          },
          Readable.from([Buffer.from("x")]),
        ),
    ],
  ])("%s answers 503", async (_name, call) => {
    const failure = await call().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BackupHttpError);
    expect(failure).toEqual(unavailable);
  });
});
