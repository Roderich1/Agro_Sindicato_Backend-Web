import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const DEFAULT_BACKUP_MAX_BYTES = 100 * 1024 * 1024;
export const DEFAULT_BACKUP_MAX_ACTIVE_PER_MEMBER = 5;
/** An upload still UPLOADING after this long is treated as abandoned. */
export const BACKUP_UPLOAD_ABANDON_MS = 60 * 60 * 1000;

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

  get maxBytes(): number {
    return this.config.get<number>("BACKUP_MAX_BYTES") ?? DEFAULT_BACKUP_MAX_BYTES;
  }

  get maxActivePerMember(): number {
    return (
      this.config.get<number>("BACKUP_MAX_ACTIVE_PER_MEMBER") ??
      DEFAULT_BACKUP_MAX_ACTIVE_PER_MEMBER
    );
  }
}
