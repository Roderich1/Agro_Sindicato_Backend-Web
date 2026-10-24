import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { S3BackupStorageSettings } from "../infrastructure/s3-backup-storage";

export const DEFAULT_BACKUP_MAX_BYTES = 100 * 1024 * 1024;
export const DEFAULT_BACKUP_MAX_ACTIVE_PER_MEMBER = 5;
/** An upload still UPLOADING after this long is treated as abandoned. */
export const BACKUP_UPLOAD_ABANDON_MS = 60 * 60 * 1000;
/**
 * Deadline of one upload (F08-BKP-06, #40): below the abandon window, so a
 * row past that window has no transfer in progress.
 */
export const DEFAULT_BACKUP_UPLOAD_DEADLINE_MS = 30 * 60 * 1000;

@Injectable()
export class BackupsConfig {
  constructor(private readonly config: ConfigService) {}

  /** Private storage directory; without it the routes answer 503. */
  get storageDir(): string | undefined {
    return this.config.get<string>("BACKUP_STORAGE_DIR") || undefined;
  }

  /**
   * In production the service stays closed (503) unless
   * `BACKUP_PRODUCTION_ADMISSION=enabled`, as Sync v1 and the collective
   * disclosure: provider, threat model, encryption at rest and retention
   * (DEC-F01-10, #40) are not decided yet.
   */
  get admissionOpen(): boolean {
    return (
      this.config.get<string>("NODE_ENV") !== "production" ||
      this.config.get<string>("BACKUP_PRODUCTION_ADMISSION") === "enabled"
    );
  }

  /**
   * F08-ADR-003: `true` refuses new format-1 uploads (not encrypted on the
   * phone). Off by default for the synthetic environment and the B2 tool; a
   * condition before admitting real data (threat model §5), not an
   * admission.
   */
  get requireClientEncryption(): boolean {
    return this.config.get<string>("BACKUP_REQUIRE_CLIENT_ENCRYPTION") === "true";
  }

  get maxBytes(): number {
    return this.config.get<number>("BACKUP_MAX_BYTES") ?? DEFAULT_BACKUP_MAX_BYTES;
  }

  get maxActivePerMember(): number {
    return (
      this.config.get<number>("BACKUP_MAX_ACTIVE_PER_MEMBER") ??
      DEFAULT_BACKUP_MAX_ACTIVE_PER_MEMBER
    );
  }

  /** Deadline of one upload; always below [BACKUP_UPLOAD_ABANDON_MS]. */
  get uploadDeadlineMs(): number {
    return (
      this.config.get<number>("BACKUP_UPLOAD_DEADLINE_MS") ?? DEFAULT_BACKUP_UPLOAD_DEADLINE_MS
    );
  }

  /** F08-BKP-07: `disk` unless `b2` is chosen explicitly. */
  get storageProvider(): BackupStorageProvider {
    return this.config.get<BackupStorageProvider>("BACKUP_STORAGE_PROVIDER") ?? "disk";
  }

  /**
   * S3 settings of the `b2` provider, or the names of the variables that are
   * missing (never their values).
   */
  get s3Settings(): { settings: S3BackupStorageSettings } | { missing: string[] } {
    const read = (name: string) => this.config.get<string>(name) || undefined;
    const values = {
      endpoint: read("BACKUP_S3_ENDPOINT"),
      region: read("BACKUP_S3_REGION"),
      bucket: read("BACKUP_S3_BUCKET"),
      accessKeyId: read("BACKUP_S3_ACCESS_KEY_ID"),
      secretAccessKey: read("BACKUP_S3_SECRET_ACCESS_KEY"),
      prefix: read("BACKUP_S3_PREFIX"),
    };
    const missing = S3_VARIABLES.filter(([field]) => values[field] === undefined).map(
      ([, name]) => name,
    );
    if (missing.length > 0) return { missing };
    return { settings: values as S3BackupStorageSettings };
  }
}

export type BackupStorageProvider = "disk" | "b2";

const S3_VARIABLES: [keyof S3BackupStorageSettings, string][] = [
  ["endpoint", "BACKUP_S3_ENDPOINT"],
  ["region", "BACKUP_S3_REGION"],
  ["bucket", "BACKUP_S3_BUCKET"],
  ["accessKeyId", "BACKUP_S3_ACCESS_KEY_ID"],
  ["secretAccessKey", "BACKUP_S3_SECRET_ACCESS_KEY"],
  ["prefix", "BACKUP_S3_PREFIX"],
];
