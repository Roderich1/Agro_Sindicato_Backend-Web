import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { BackupsAuthGuard } from "./api/rest/backups-auth.guard";
import { BackupsController } from "./api/rest/backups.controller";
import { BackupsConfig } from "./application/backups-config";
import { BackupsService } from "./application/backups.service";
import { BACKUP_STORAGE } from "./domain/backup-storage.port";
import { LocalDiskBackupStorage } from "./infrastructure/local-disk-backup-storage";

/** Storage only when configured and admitted; otherwise every route is 503. */
export function createBackupStorage(config: BackupsConfig) {
  return config.storageDir && config.admissionOpen
    ? new LocalDiskBackupStorage(config.storageDir)
    : null;
}

/**
 * F08 private backup (#37, #38, #39). Separate from Sync v1 and from the
 * collective projection (CURRENT_SCOPE §7, F06 §8): it imports neither.
 * Storage: development disk adapter in `BACKUP_STORAGE_DIR`; without it the
 * routes answer 503 (no implicit default location), and in production
 * also without `BACKUP_PRODUCTION_ADMISSION=enabled`.
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
