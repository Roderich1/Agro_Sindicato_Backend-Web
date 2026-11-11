import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { clearInterval, setInterval } from "node:timers";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import type { BackupStorage, StoredBackupFile } from "@/modules/backups/domain/backup-storage.port";
import {
  PRODUCT_PHOTO_STORAGE,
  ProductPhotoStorage,
  photoStorageInventory,
} from "../infrastructure/product-photo-storage";
import { lockTenant, PHOTO_TRANSACTION_OPTIONS } from "./identification-store";
import { ProductPhotoConfig } from "./product-photo-config";

/**
 * Grace period before a file without a row is removed: far longer than any
 * upload (2 MiB, transaction timeout 60 s), so the sweep never races an
 * upload whose object is committed but whose row is not written yet.
 */
export const PHOTO_SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;

export const RETENTION_DETAIL = "Retención vencida tras la identificación";

const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_BATCH = 500;

export interface PhotoSweepOptions {
  /** Without `apply` only the plan is counted; nothing is removed or written. */
  apply: boolean;
  /** Days a LINKED request keeps its photo after the last link decision. */
  retentionDaysAfterLink: number;
  /** Reference time for the grace period and the retention (tests). */
  now?: Date;
  graceMs?: number;
}

export interface SweepCount {
  /** Candidates past the grace period or the retention. */
  planned: number;
  /** Removed in this run (always 0 without `apply`). */
  removed: number;
  /** Removal failed; retried by the next sweep. */
  failed: number;
}

export interface PhotoSweepReport {
  apply: boolean;
  /** LINKED requests whose photo outlived the retention. */
  retention: SweepCount;
  /** Committed objects that no row references (failed removals, rollbacks). */
  orphans: SweepCount;
  /** Staging leftovers (abandoned or failed uploads). */
  staging: SweepCount;
  /** Orphans or staging files younger than the grace period: left for later. */
  recent: number;
  /** Objects referenced by a STORED row: never touched. */
  referenced: number;
  /** Files outside the storage layout: never touched (human review). */
  foreign: number;
}

type SweepPrisma = Pick<PrismaClient, "productIdentificationRequest" | "$transaction">;

const count = (): SweepCount => ({ planned: 0, removed: 0, failed: 0 });

/**
 * E1 §10: lifecycle of the label photos in the private storage.
 *
 * 1. Retention after the link: a LINKED request whose last link decision is
 *    older than the retention loses its photo. Under the tenant lock, the
 *    row is read again, the binary removed first (as `DELETE /photo`) and the
 *    row then set to REMOVED with a `PHOTO_REMOVED` event without actor. A
 *    PENDING request keeps its photo: it is needed to identify the product.
 * 2. Orphans: committed objects that no row references, older than the
 *    grace period, are removed after checking the database again.
 * 3. Staging leftovers older than the grace period are removed.
 *
 * Objects referenced by a row and files outside the layout are never
 * touched. A failed removal is counted and retried by the next run; nothing
 * else is written. No key, name or byte is returned or logged: counts only.
 */
export async function sweepProductPhotos(
  prisma: SweepPrisma,
  storage: ProductPhotoStorage,
  options: PhotoSweepOptions,
): Promise<PhotoSweepReport> {
  const now = (options.now ?? new Date()).getTime();
  const cutoff = now - (options.graceMs ?? PHOTO_SWEEP_GRACE_MS);
  const report: PhotoSweepReport = {
    apply: options.apply,
    retention: count(),
    orphans: count(),
    staging: count(),
    recent: 0,
    referenced: 0,
    foreign: 0,
  };

  await applyRetention(prisma, storage, new Date(now - options.retentionDaysAfterLink * DAY_MS), options.apply, report);

  const objects = new Map<string, Date>();
  const staging: StoredBackupFile[] = [];
  for (const file of await storage.list()) {
    if (!file.key) {
      report.foreign += 1;
    } else if (file.area === "staging") {
      staging.push(file);
    } else {
      // Versioned stores list every version of a key: the newest one counts.
      const seen = objects.get(file.key);
      if (!seen || file.modifiedAt > seen) objects.set(file.key, file.modifiedAt);
    }
  }

  const referenced = await referencedKeys(prisma, [...objects.keys()]);
  for (const [key, modifiedAt] of objects) {
    if (referenced.has(key)) {
      report.referenced += 1;
      continue;
    }
    if (modifiedAt.getTime() > cutoff) {
      report.recent += 1;
      continue;
    }
    report.orphans.planned += 1;
    if (!options.apply) continue;
    try {
      // Checked again right before removing: a row may reference it now.
      if ((await referencedKeys(prisma, [key])).size > 0) {
        report.orphans.planned -= 1;
        report.referenced += 1;
        continue;
      }
      await storage.remove(key);
      report.orphans.removed += 1;
    } catch {
      report.orphans.failed += 1;
    }
  }

  for (const file of staging) {
    if (file.modifiedAt.getTime() > cutoff) {
      report.recent += 1;
      continue;
    }
    report.staging.planned += 1;
    if (!options.apply) continue;
    try {
      await storage.removeStagedFile(file.name);
      report.staging.removed += 1;
    } catch {
      report.staging.failed += 1;
    }
  }
  return report;
}

async function applyRetention(
  prisma: SweepPrisma,
  storage: BackupStorage,
  linkedBefore: Date,
  apply: boolean,
  report: PhotoSweepReport,
): Promise<void> {
  const due = { status: "LINKED", photoState: "STORED", resolvedAt: { lt: linkedBefore } } as const;
  const rows = await prisma.productIdentificationRequest.findMany({
    where: due,
    select: { id: true, tenantId: true },
  });
  report.retention.planned = rows.length;
  if (!apply) return;
  for (const row of rows) {
    try {
      const purged = await prisma.$transaction(async (tx) => {
        await lockTenant(tx, row.tenantId);
        const current = await tx.productIdentificationRequest.findFirst({
          where: { id: row.id, ...due },
          select: { id: true, photoStorageKey: true },
        });
        // Removed, replaced or relinked meanwhile: nothing to do.
        if (!current?.photoStorageKey) return false;
        // The binary goes first: if it fails, the row still lists the photo
        // and the next sweep retries; removing an absent object is no error.
        await storage.remove(current.photoStorageKey);
        await tx.productIdentificationRequest.update({
          where: { id: current.id },
          data: {
            photoState: "REMOVED",
            photoStorageKey: null,
            photoSha256: null,
            photoContentType: null,
            photoSizeBytes: null,
            photoWidth: null,
            photoHeight: null,
            photoStoredAt: null,
            photoRemovedAt: new Date(),
            events: { create: { kind: "PHOTO_REMOVED", actorUserId: null, detail: RETENTION_DETAIL } },
          },
        });
        return true;
      }, PHOTO_TRANSACTION_OPTIONS);
      if (purged) report.retention.removed += 1;
      else report.retention.planned -= 1;
    } catch {
      report.retention.failed += 1;
    }
  }
}

/** Keys among `keys` that a row references (a key is set only while STORED, by CHECK). */
async function referencedKeys(prisma: SweepPrisma, keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += KEY_BATCH) {
    const rows = await prisma.productIdentificationRequest.findMany({
      where: { photoStorageKey: { in: keys.slice(i, i + KEY_BATCH) } },
      select: { photoStorageKey: true },
    });
    for (const row of rows) if (row.photoStorageKey) found.add(row.photoStorageKey);
  }
  return found;
}

/** One log line, counts only. */
export function describeSweep(report: PhotoSweepReport): string {
  const part = (name: string, c: SweepCount) => `${name}=${c.removed}/${c.planned}${c.failed ? ` failed=${c.failed}` : ""}`;
  return [
    report.apply ? "[PRODUCT PHOTO SWEEP]" : "[PRODUCT PHOTO SWEEP dry-run]",
    part("retention", report.retention),
    part("orphans", report.orphans),
    part("staging", report.staging),
    `recent=${report.recent}`,
    `referenced=${report.referenced}`,
    `foreign=${report.foreign}`,
  ].join(" ");
}

/**
 * Opt-in periodic sweep inside the API process
 * (`PRODUCT_PHOTO_SWEEP_INTERVAL_MS`; empty = disabled). The same sweep runs
 * on demand from `npm run product-photos:sweep` (dry-run unless `--apply`).
 * Several processes may sweep at once: retention is serialised by the
 * tenant lock and re-read, removals are idempotent.
 */
@Injectable()
export class ProductPhotoSweep implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("ProductPhotos");
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ProductPhotoConfig,
    @Inject(PRODUCT_PHOTO_STORAGE) private readonly storage: BackupStorage | null,
  ) {}

  onApplicationBootstrap() {
    const interval = this.config.sweepIntervalMs;
    if (interval === null) return;
    if (!photoStorageInventory(this.storage)) {
      this.logger.warn("Product photo sweep not started: photo storage not configured");
      return;
    }
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One sweep; null when there is no photo storage to sweep. */
  async run(options: { apply?: boolean; now?: Date } = {}): Promise<PhotoSweepReport | null> {
    const storage = photoStorageInventory(this.storage);
    if (!storage) return null;
    const report = await sweepProductPhotos(this.prisma, storage, {
      apply: options.apply ?? true,
      retentionDaysAfterLink: this.config.retentionDaysAfterLink,
      now: options.now,
    });
    this.logger.log(describeSweep(report));
    return report;
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`Product photo sweep failed (${error instanceof Error ? error.name : typeof error})`);
    } finally {
      this.busy = false;
    }
  }
}
