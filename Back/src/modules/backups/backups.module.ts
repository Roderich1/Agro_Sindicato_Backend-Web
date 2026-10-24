import { Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { BackupsAuthGuard } from "./api/rest/backups-auth.guard";
import { BackupsController } from "./api/rest/backups.controller";
import { BackupsConfig } from "./application/backups-config";
import { BackupsService } from "./application/backups.service";
import {
  BACKUP_STORAGE,
  BackupStorage,
  BackupStorageInventory,
} from "./domain/backup-storage.port";
import { LocalDiskBackupStorage } from "./infrastructure/local-disk-backup-storage";
import {
  createS3Client,
  S3_LIMITS,
  S3BackupStorage,
  S3StagingCleanupReport,
} from "./infrastructure/s3-backup-storage";

/**
 * Storage only when configured and admitted; otherwise every route is 503.
 * `b2` never falls back to the disk, even with `BACKUP_STORAGE_DIR` set.
 */
export function createBackupStorage(
  config: BackupsConfig,
  logger: Pick<Logger, "error"> = new Logger("Backups"),
): (BackupStorage & BackupStorageInventory) | null {
  if (!config.admissionOpen) return null;
  if (config.storageProvider === "b2") {
    const s3 = config.s3Settings;
    if ("missing" in s3) {
      // Names only, never values.
      logger.error(`Backup storage b2 is not configured (missing ${s3.missing.join(", ")})`);
      return null;
    }
    const cleanupLogger = new Logger("Backups");
    return new S3BackupStorage(createS3Client(s3.settings), s3.settings, S3_LIMITS, (report) => {
      const message = describeStagingCleanup(report);
      if (report.complete) cleanupLogger.log(message);
      else cleanupLogger.warn(message);
    });
  }
  return config.storageDir ? new LocalDiskBackupStorage(config.storageDir) : null;
}

/** One line per cleanup of a failed or discarded staging: codes only, never names or keys. */
export function describeStagingCleanup(report: S3StagingCleanupReport): string {
  const cause = report.failure
    ? ` (${report.failure.origin} ${report.failure.name}${report.failure.status === undefined ? "" : ` ${report.failure.status}`})`
    : "";
  const outcome = report.complete
    ? "complete"
    : `pending reconciliation: ${report.pending.join(", ")}`;
  return `Backup staging cleanup after ${report.trigger}${cause}: ${outcome}`;
}

/**
 * F08 private backup (#37, #38, #39). Separate from Sync v1 and from the
 * collective projection (CURRENT_SCOPE §7, F06 §8): it imports neither.
 * Storage: development disk adapter in `BACKUP_STORAGE_DIR`, or Backblaze B2
 * through its S3 API with `BACKUP_STORAGE_PROVIDER=b2` (F08-BKP-07); without
 * a complete configuration the routes answer 503 (no implicit default
 * location), and in production also without `BACKUP_PRODUCTION_ADMISSION=enabled`.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
      }),
    }),
  ],
  controllers: [BackupsController],
  providers: [
    BackupsConfig,
    BackupsAuthGuard,
    BackupsService,
    {
      provide: BACKUP_STORAGE,
      inject: [BackupsConfig],
      useFactory: createBackupStorage,
    },
  ],
})
export class BackupsModule {}
