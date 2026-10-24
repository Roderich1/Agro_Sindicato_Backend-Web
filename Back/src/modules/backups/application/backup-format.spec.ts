import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import type { BackupStorage } from "../domain/backup-storage.port";
import { envelopeHeader } from "../test-support/backup-envelope";
import { ENVELOPE_HEADER_BYTES, ENVELOPE_TAG_BYTES, hasDeclaredShape } from "./backup-format";
import { BackupsConfig } from "./backups-config";
import { BackupsService } from "./backups.service";
import { Sha256Meter } from "./sha256-meter";

const total = (plaintext: number) => ENVELOPE_HEADER_BYTES + plaintext + ENVELOPE_TAG_BYTES;

describe("F08-ADR-003 outer format shape", () => {
  it("accepts a format-2 body whose length matches its header exactly", () => {
    expect(hasDeclaredShape(2, envelopeHeader(1000), total(1000))).toBe(true);
    expect(hasDeclaredShape(2, envelopeHeader(0), total(0))).toBe(true);
  });

  it.each([
    ["one byte more", envelopeHeader(1000), total(1000) + 1],
    ["truncated (no tag)", envelopeHeader(1000), total(1000) - ENVELOPE_TAG_BYTES],
    ["truncated header", envelopeHeader(1000).subarray(0, 40), 40],
    ["other magic", envelopeHeader(10, (h) => (h[0] = 0x50)), total(10)],
    ["version 3", envelopeHeader(10, (h) => h.writeUInt16BE(3, 8)), total(10)],
    ["unknown algorithm", envelopeHeader(10, (h) => (h[10] = 2)), total(10)],
    ["flags set", envelopeHeader(10, (h) => (h[11] = 1)), total(10)],
    ["huge declared length", envelopeHeader(10, (h) => h.writeBigUInt64BE(2n ** 63n, 72)), total(10)],
    ["plain ZIP", Buffer.from("PK\x03\x04 container", "latin1"), 4096],
  ])("rejects format 2 with %s", (_name, prefix, size) => {
    expect(hasDeclaredShape(2, prefix, size)).toBe(false);
  });

  it("format 1 is not inspected, except that an encrypted body cannot be labelled as plain", () => {
    expect(hasDeclaredShape(1, Buffer.from("PK\x03\x04", "latin1"), 4096)).toBe(true);
    expect(hasDeclaredShape(1, Buffer.from("F08-MARKER-x"), 4096)).toBe(true);
    expect(hasDeclaredShape(1, envelopeHeader(10), total(10))).toBe(false);
  });

  it("any other format is rejected", () => {
    expect(hasDeclaredShape(3, envelopeHeader(10), total(10))).toBe(false);
  });

  it("Sha256Meter keeps only the first bytes, across chunks", async () => {
    const meter = new Sha256Meter(1 << 20, ENVELOPE_HEADER_BYTES);
    const header = envelopeHeader(200);
    const body = Buffer.concat([header, Buffer.alloc(200 + ENVELOPE_TAG_BYTES, 9)]);
    const chunks = [body.subarray(0, 5), body.subarray(5, 79), body.subarray(79)];
    await pipeline(
      Readable.from(chunks),
      meter,
      new Writable({ write: (_c, _e, done) => done() }),
    );
    expect(meter.prefix.equals(header)).toBe(true);
    expect(meter.bytes).toBe(body.length);
    expect(hasDeclaredShape(2, meter.prefix, meter.bytes)).toBe(true);
  });
});

describe("format headers are decided before reading the body", () => {
  const owner = { tenantId: "t", memberId: "m" };
  // Reaching PostgreSQL means the headers were accepted.
  const prisma = new Proxy({}, {
    get: () => {
      throw new Error("PostgreSQL reached");
    },
  }) as unknown as PrismaService;
  const storage = {} as BackupStorage;
  const service = (requireClientEncryption: boolean) =>
    new BackupsService(
      prisma,
      { maxBytes: 1 << 20, maxActivePerMember: 5, requireClientEncryption } as BackupsConfig,
      storage,
    );
  const headers = (formatVersion: string) => ({
    contentType: "application/octet-stream",
    contentLength: "10",
    sha256: "0".repeat(64),
    formatVersion,
    schemaVersion: "10",
  });
  const body = () => Readable.from([Buffer.from("x")]);

  it.each([
    [false, "3", "BACKUP_FORMAT_INVALID"],
    [false, "9999", "BACKUP_FORMAT_INVALID"],
    [true, "1", "BACKUP_ENCRYPTION_REQUIRED"],
    [true, "3", "BACKUP_FORMAT_INVALID"],
  ])("require=%s, format %s: 422 %s", async (require, format, errorCode) => {
    await expect(service(require).upload(owner, headers(format), body())).rejects.toEqual(
      expect.objectContaining({ status: 422, errorCode }),
    );
  });

  it.each([
    [false, "1"],
    [false, "2"],
    [true, "2"],
  ])("require=%s, format %s: accepted headers", async (require, format) => {
    await expect(service(require).upload(owner, headers(format), body())).rejects.toThrow(
      "PostgreSQL reached",
    );
  });

  it("BackupsConfig: off unless exactly `true`", () => {
    const configWith = (value: string | undefined) =>
      new BackupsConfig({ get: () => value } as never).requireClientEncryption;
    expect(configWith(undefined)).toBe(false);
    expect(configWith("false")).toBe(false);
    expect(configWith("TRUE")).toBe(false);
    expect(configWith("true")).toBe(true);
  });
});
