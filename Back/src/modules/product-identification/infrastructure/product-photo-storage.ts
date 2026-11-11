import { Logger } from "@nestjs/common";
import type { BackupStorage, BackupStorageInventory } from "@/modules/backups/domain/backup-storage.port";
import { LocalDiskBackupStorage } from "@/modules/backups/infrastructure/local-disk-backup-storage";
import {
  createS3Client,
  S3_LIMITS,
  S3BackupStorage,
} from "@/modules/backups/infrastructure/s3-backup-storage";
import { ProductPhotoConfig } from "../application/product-photo-config";

/** Second instance of the F08 private storage, for label photos only (E1-D8). */
export const PRODUCT_PHOTO_STORAGE = Symbol("PRODUCT_PHOTO_STORAGE");

/** The photo storage with the inventory listing of the F08 adapters (§10 sweep). */
export type ProductPhotoStorage = BackupStorage & BackupStorageInventory;

/**
 * The storage when it can list what it holds and remove staging leftovers
 * (both F08 adapters, disk and S3/B2, can); null otherwise.
 */
export function photoStorageInventory(storage: BackupStorage | null): ProductPhotoStorage | null {
  if (!storage) return null;
  const candidate = storage as Partial<BackupStorageInventory>;
  return typeof candidate.list === "function" && typeof candidate.removeStagedFile === "function"
    ? (storage as ProductPhotoStorage)
    : null;
}

/**
 * Storage only when configured; otherwise null and the photo routes answer
 * 503. `b2` never falls back to the disk. Logs carry variable names, never
 * values, keys or bytes.
 */
export function createProductPhotoStorage(
  config: ProductPhotoConfig,
  logger: Pick<Logger, "error" | "warn"> = new Logger("ProductPhotos"),
): BackupStorage | null {
  if (config.storageProvider === "b2") {
    const s3 = config.s3Settings;
    if ("missing" in s3) {
      logger.error(`Product photo storage b2 is not configured (missing ${s3.missing.join(", ")})`);
      return null;
    }
    return new S3BackupStorage(createS3Client(s3.settings), s3.settings, S3_LIMITS, (report) => {
      if (!report.complete) logger.warn(`Product photo staging cleanup after ${report.trigger}: pending`);
    });
  }
  const disk = config.storageDir;
  if (disk === null) return null;
  if ("refused" in disk) {
    logger.error(`Product photo storage refused (${disk.refused})`);
    return null;
  }
  return new LocalDiskBackupStorage(disk.dir);
}
