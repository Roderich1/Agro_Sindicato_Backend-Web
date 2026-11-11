import { afterEach, beforeEach } from "@jest/globals";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { main, parseArgs, photoStorageFromEnv } from "../cli/product-photo-sweep";
import { FakeIdentificationPrisma } from "../test-support/fake-identification-prisma";
import { InMemoryPhotoStorage } from "../test-support/in-memory-photo-storage";
import { jpeg } from "../test-support/images";
import { FarmerIdentificationUseCase } from "./farmer-identification.use-case";
import { DEFAULT_RETENTION_DAYS_AFTER_LINK, ProductPhotoConfig } from "./product-photo-config";
import {
  describeSweep,
  PHOTO_SWEEP_GRACE_MS,
  ProductPhotoSweep,
  RETENTION_DETAIL,
  sweepProductPhotos,
} from "./product-photo-sweep";

const FARMER = { tenantId: "tenant-a", memberId: "member-1" };
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function config(values: Record<string, unknown> = {}) {
  return new ProductPhotoConfig({ get: (name: string) => values[name] } as unknown as ConfigService);
}

// Images are encoded with sharp at test time; under the full parallel suite
// that can exceed Jest's default 5 s per test.
jest.setTimeout(30_000);

describe("E1 §10 product photo sweep", () => {
  let prisma: FakeIdentificationPrisma;
  let storage: InMemoryPhotoStorage;
  let farmer: FarmerIdentificationUseCase;
  const now = new Date("2027-03-01T12:00:00.000Z");
  const old = new Date(now.getTime() - PHOTO_SWEEP_GRACE_MS - HOUR);
  const young = new Date(now.getTime() - HOUR);

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    prisma = new FakeIdentificationPrisma();
    storage = new InMemoryPhotoStorage();
    storage.clock = () => old;
    farmer = new FarmerIdentificationUseCase(prisma as any, storage);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** A request with a stored photo (written "long ago"); returns its row. */
  async function requestWithPhoto(seed: number) {
    const id = randomUUID();
    await farmer.upsert(FARMER, id, {
      contractVersion: 1,
      local_name: `Producto ${seed}`,
      active_ingredient: null,
      unit: "L",
      photo_consent: { version: "FOTO-1", accepted_at: "2026-11-11T18:20:00.000Z" },
    } as any);
    const bytes = await jpeg(200, 150, { seed });
    await farmer.storePhoto(
      FARMER,
      id,
      {
        contentType: "application/octet-stream",
        contentLength: String(bytes.length),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      Readable.from([bytes]),
    );
    return prisma.requests.find((r) => r.clientRequestId === id)!;
  }

  function link(row: any, resolvedAt: Date) {
    prisma.products.push({ id: `p-${row.id}`, tenantId: FARMER.tenantId, name: "Producto", unit: "L", isActive: true });
    Object.assign(row, { status: "LINKED", resolution: "LINKED_EXISTING", productId: `p-${row.id}`, resolvedAt });
  }

  const sweep = (apply = true) =>
    sweepProductPhotos(prisma as any, storage, { apply, retentionDaysAfterLink: 90, now });

  it("removes orphans and staging leftovers older than the grace period; keeps young and referenced files", async () => {
    const referenced = await requestWithPhoto(1);
    const oldOrphan = randomUUID();
    const youngOrphan = randomUUID();
    const oldStaging = randomUUID();
    const youngStaging = randomUUID();
    storage.plant("objects", oldOrphan, old);
    storage.plant("objects", youngOrphan, young);
    storage.plant("staging", oldStaging, old);
    storage.plant("staging", youngStaging, young);
    storage.foreignFiles.push({ area: "objects", name: "nota.txt", key: null, sizeBytes: 3, modifiedAt: old });

    const report = await sweep();
    expect(report).toEqual({
      apply: true,
      retention: { planned: 0, removed: 0, failed: 0 },
      orphans: { planned: 1, removed: 1, failed: 0 },
      staging: { planned: 1, removed: 1, failed: 0 },
      recent: 2,
      referenced: 1,
      foreign: 1,
    });
    expect([...storage.objects.keys()].sort()).toEqual([referenced.photoStorageKey, youngOrphan].sort());
    expect([...storage.staging.keys()]).toEqual([youngStaging]);
    // Orphans have no row: nothing is written to the database.
    expect(prisma.events.map((e) => e.kind)).toEqual(["RECEIVED", "PHOTO_RECEIVED"]);
    expect(referenced.photoState).toBe("STORED");
  });

  it("removes the photo of a request linked longer than the retention, with an event without actor", async () => {
    const expired = await requestWithPhoto(2);
    const recent = await requestWithPhoto(3);
    const pending = await requestWithPhoto(4);
    const expiredKey = expired.photoStorageKey;
    link(expired, new Date(now.getTime() - 91 * DAY));
    link(recent, new Date(now.getTime() - 89 * DAY));
    // PENDING since long ago: its photo is needed to identify the product.
    pending.receivedAt = new Date(now.getTime() - 400 * DAY);

    const report = await sweep();
    expect(report.retention).toEqual({ planned: 1, removed: 1, failed: 0 });
    expect(storage.objects.has(expiredKey)).toBe(false);
    expect(expired).toMatchObject({
      status: "LINKED",
      photoState: "REMOVED",
      photoStorageKey: null,
      photoSha256: null,
      photoContentType: null,
      photoSizeBytes: null,
      photoWidth: null,
      photoHeight: null,
      photoStoredAt: null,
    });
    expect(expired.photoRemovedAt).toBeInstanceOf(Date);
    expect(expired.photoConsentVersion).toBe("FOTO-1");
    const event = prisma.events.filter((e) => e.requestId === expired.id).at(-1);
    expect(event).toMatchObject({ kind: "PHOTO_REMOVED", actorUserId: null, detail: RETENTION_DETAIL });
    expect(recent.photoState).toBe("STORED");
    expect(pending.photoState).toBe("STORED");
    expect(storage.objects.size).toBe(2);
    expect(prisma.locks).toContain(`product-identification:${FARMER.tenantId}`);
    expect(prisma.audits).toHaveLength(0);

    // Idempotent: a second sweep has nothing left to do.
    expect((await sweep()).retention).toEqual({ planned: 0, removed: 0, failed: 0 });
  });

  it("dry-run only counts: nothing is removed or written", async () => {
    const expired = await requestWithPhoto(5);
    link(expired, new Date(now.getTime() - 200 * DAY));
    storage.plant("objects", randomUUID(), old);
    storage.plant("staging", randomUUID(), old);
    const events = prisma.events.length;
    const report = await sweep(false);
    expect(report).toMatchObject({
      apply: false,
      retention: { planned: 1, removed: 0 },
      orphans: { planned: 1, removed: 0 },
      staging: { planned: 1, removed: 0 },
    });
    expect(storage.objects.size).toBe(2);
    expect(storage.staging.size).toBe(1);
    expect(expired.photoState).toBe("STORED");
    expect(prisma.events).toHaveLength(events);
  });

  it("a failed removal is counted and retried by the next sweep; the row keeps its photo meanwhile", async () => {
    const expired = await requestWithPhoto(6);
    link(expired, new Date(now.getTime() - 100 * DAY));
    storage.removeFailures = 1;
    const first = await sweep();
    expect(first.retention).toEqual({ planned: 1, removed: 0, failed: 1 });
    expect(expired.photoState).toBe("STORED");
    expect(prisma.events.some((e) => e.detail === RETENTION_DETAIL)).toBe(false);

    const orphan = randomUUID();
    storage.plant("objects", orphan, old);
    storage.removeFailures = 1;
    const second = await sweep();
    // Retention is processed first: it takes the failure this time.
    expect(second.retention.removed + second.orphans.removed).toBe(1);
    expect(second.retention.failed + second.orphans.failed).toBe(1);
    const third = await sweep();
    expect(third.retention.failed + third.orphans.failed).toBe(0);
    expect(expired.photoState).toBe("REMOVED");
    expect(storage.objects.has(orphan)).toBe(false);
  });

  it("an orphan referenced by a row by the time it would be removed is kept", async () => {
    const key = randomUUID();
    storage.plant("objects", key, old);
    const row = await requestWithPhoto(7);
    const findMany = prisma.productIdentificationRequest.findMany;
    let calls = 0;
    prisma.productIdentificationRequest.findMany = async (args: any) => {
      // After the listing (retention query, first key lookup), a row takes the key.
      if (args?.where?.photoStorageKey && ++calls === 2) row.photoStorageKey = key;
      return findMany(args);
    };
    const report = await sweep();
    expect(report.orphans).toEqual({ planned: 0, removed: 0, failed: 0 });
    expect(storage.objects.has(key)).toBe(true);
  });

  it("an orphan left by a failed rollback after commit is removed once the grace period has passed", async () => {
    const row = await requestWithPhoto(8);
    storage.clock = () => young;
    // Replacement whose removal of the old object fails: the transaction rolls
    // back and the new committed object cannot be removed either.
    storage.removeFailures = 2;
    const bytes = await jpeg(200, 150, { seed: 80 });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await expect(
      farmer.storePhoto(
        FARMER,
        row.clientRequestId,
        { contentType: "application/octet-stream", contentLength: String(bytes.length), sha256 },
        Readable.from([bytes]),
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(storage.objects.size).toBe(2);
    expect((await sweep()).orphans).toEqual({ planned: 0, removed: 0, failed: 0 });
    const later = new Date(now.getTime() + PHOTO_SWEEP_GRACE_MS);
    const report = await sweepProductPhotos(prisma as any, storage, { apply: true, retentionDaysAfterLink: 90, now: later });
    expect(report.orphans).toEqual({ planned: 1, removed: 1, failed: 0 });
    expect([...storage.objects.keys()]).toEqual([row.photoStorageKey]);
  });

  it("logs counts only", async () => {
    const row = await requestWithPhoto(9);
    storage.plant("objects", randomUUID(), old);
    const line = describeSweep(await sweep());
    expect(line).toBe("[PRODUCT PHOTO SWEEP] retention=0/0 orphans=1/1 staging=0/0 recent=0 referenced=1 foreign=0");
    expect(line).not.toContain(row.photoStorageKey);
  });

  it("reads its configuration: interval opt-in, retention 90 days by default", () => {
    expect(config().sweepIntervalMs).toBeNull();
    expect(config({ PRODUCT_PHOTO_SWEEP_INTERVAL_MS: 3_600_000 }).sweepIntervalMs).toBe(3_600_000);
    expect(config().retentionDaysAfterLink).toBe(DEFAULT_RETENTION_DAYS_AFTER_LINK);
    expect(DEFAULT_RETENTION_DAYS_AFTER_LINK).toBe(90);
    expect(config({ PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK: 30 }).retentionDaysAfterLink).toBe(30);
  });

  it("the service sweeps only with a storage, and starts no timer unless configured", async () => {
    const setInterval = jest.spyOn(globalThis, "setInterval");
    const disabled = new ProductPhotoSweep(prisma as any, config(), storage);
    disabled.onApplicationBootstrap();
    expect(setInterval).not.toHaveBeenCalled();
    const withoutStorage = new ProductPhotoSweep(prisma as any, config({ PRODUCT_PHOTO_SWEEP_INTERVAL_MS: 60_000 }), null);
    withoutStorage.onApplicationBootstrap();
    expect(await withoutStorage.run()).toBeNull();
    storage.plant("objects", randomUUID(), old);
    const enabled = new ProductPhotoSweep(prisma as any, config({ PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK: 30 }), storage);
    expect((await enabled.run({ now }))?.orphans.removed).toBe(1);
    setInterval.mockRestore();
  });
});

describe("E1 §10 product photo sweep CLI", () => {
  it("is a dry-run unless --apply", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseArgs(["--force"])).toThrow("uso:");
    expect(() => parseArgs(["--apply", "--apply"])).toThrow("uso:");
  });

  it("names missing or invalid variables, never their values", () => {
    expect(photoStorageFromEnv({})).toEqual({ error: "Falta DATABASE_URL en el entorno." });
    const noStorage = photoStorageFromEnv({ DATABASE_URL: "postgresql://x" });
    expect("error" in noStorage && noStorage.error).toContain("PRODUCT_PHOTO_STORAGE_DIR");
    const invalid = photoStorageFromEnv({ DATABASE_URL: "postgresql://x", PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK: "-3" });
    expect(invalid).toEqual({ error: "Variables con formato inválido: PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK." });
    const secret = "secreto-que-no-debe-aparecer";
    const b2 = photoStorageFromEnv({
      DATABASE_URL: "postgresql://x",
      PRODUCT_PHOTO_STORAGE_PROVIDER: "b2",
      BACKUP_S3_SECRET_ACCESS_KEY: secret,
    });
    expect("error" in b2 && b2.error).toContain("BACKUP_S3_BUCKET");
    expect(JSON.stringify(b2)).not.toContain(secret);
  });

  it("exits 2 on bad arguments", async () => {
    const lines: string[] = [];
    expect(await main(["--nope"], (line) => lines.push(line))).toBe(2);
    expect(lines).toEqual(["uso: product-photo-sweep [--apply]"]);
  });
});
