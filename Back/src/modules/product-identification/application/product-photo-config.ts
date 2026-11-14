import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { resolve } from "node:path";
import type { S3BackupStorageSettings } from "@/modules/backups/infrastructure/s3-backup-storage";

export type ProductPhotoStorageProvider = "disk" | "b2";

/** §10 default: a linked request keeps its photo 90 days, then the sweep removes it. */
export const DEFAULT_RETENTION_DAYS_AFTER_LINK = 90;

/**
 * E1-D8: private storage of label photos, separate from the backups' root or
 * prefix (same `BackupStorage` interface, own location). Without a complete
 * configuration the photo routes answer 503 PHOTO_STORAGE_UNAVAILABLE and the
 * request data routes keep working (E1-D12).
 */
@Injectable()
export class ProductPhotoConfig {
  constructor(private readonly config: ConfigService) {}

  private read(name: string): string | undefined {
    return this.config.get<string>(name) || undefined;
  }

  /**
   * §10: how often this process sweeps the photo storage (orphans, staging
   * leftovers, retention after the link); null (empty) = never, the operator
   * runs `npm run product-photos:sweep` instead.
   */
  get sweepIntervalMs(): number | null {
    const value = Number(this.config.get<string | number>("PRODUCT_PHOTO_SWEEP_INTERVAL_MS") ?? Number.NaN);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  /** §10: days a LINKED request keeps its photo after the (last) link decision. */
  get retentionDaysAfterLink(): number {
    const value = Number(
      this.config.get<string | number>("PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK") ?? DEFAULT_RETENTION_DAYS_AFTER_LINK,
    );
    return Number.isInteger(value) && value >= 1 ? value : DEFAULT_RETENTION_DAYS_AFTER_LINK;
  }

  /** `disk` unless `b2` is chosen explicitly. */
  get storageProvider(): ProductPhotoStorageProvider {
    return this.config.get<ProductPhotoStorageProvider>("PRODUCT_PHOTO_STORAGE_PROVIDER") ?? "disk";
  }

  /**
   * Disk directory of the photos. Never the backups' directory: the backup
   * inventory would see the photos as foreign files.
   */
  get storageDir(): { dir: string } | { refused: string } | null {
    const dir = this.read("PRODUCT_PHOTO_STORAGE_DIR");
    if (!dir) return null;
    const backups = this.read("BACKUP_STORAGE_DIR");
    if (backups && resolve(backups) === resolve(dir)) {
      return { refused: "PRODUCT_PHOTO_STORAGE_DIR equals BACKUP_STORAGE_DIR" };
    }
    return { dir };
  }

  /**
   * `b2`: the bucket and credentials of the backups (`BACKUP_S3_*`) with the
   * photos' own prefix `PRODUCT_PHOTO_S3_PREFIX`, which must differ from
   * `BACKUP_S3_PREFIX`. Missing names are returned, never values.
   */
  get s3Settings(): { settings: S3BackupStorageSettings } | { missing: string[] } {
    const values = {
      endpoint: this.read("BACKUP_S3_ENDPOINT"),
      region: this.read("BACKUP_S3_REGION"),
      bucket: this.read("BACKUP_S3_BUCKET"),
      accessKeyId: this.read("BACKUP_S3_ACCESS_KEY_ID"),
      secretAccessKey: this.read("BACKUP_S3_SECRET_ACCESS_KEY"),
      prefix: this.read("PRODUCT_PHOTO_S3_PREFIX"),
    };
    const missing = S3_VARIABLES.filter(([field]) => values[field] === undefined).map(([, name]) => name);
    if (values.prefix !== undefined && values.prefix === this.read("BACKUP_S3_PREFIX")) {
      missing.push("PRODUCT_PHOTO_S3_PREFIX (distinct from BACKUP_S3_PREFIX)");
    }
    if (missing.length > 0) return { missing };
    return { settings: values as S3BackupStorageSettings };
  }
}

const S3_VARIABLES: [keyof S3BackupStorageSettings, string][] = [
  ["endpoint", "BACKUP_S3_ENDPOINT"],
  ["region", "BACKUP_S3_REGION"],
  ["bucket", "BACKUP_S3_BUCKET"],
  ["accessKeyId", "BACKUP_S3_ACCESS_KEY_ID"],
  ["secretAccessKey", "BACKUP_S3_SECRET_ACCESS_KEY"],
  ["prefix", "PRODUCT_PHOTO_S3_PREFIX"],
];
