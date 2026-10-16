import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { BackupsAuthGuard } from "./api/rest/backups-auth.guard";
import { BackupsController } from "./api/rest/backups.controller";
import { BackupsConfig } from "./application/backups-config";
import { BackupsService } from "./application/backups.service";
import { BACKUP_STORAGE } from "./domain/backup-storage.port";
import { LocalDiskBackupStorage } from "./infrastructure/local-disk-backup-storage";

/**
 * F08 private backup (#37, #38, #39). Separate from Sync v1 and from the
 * collective projection (CURRENT_SCOPE §7, F06 §8): it imports neither.
 * Storage: development disk adapter in `BACKUP_STORAGE_DIR`; without it the
 * routes answer 503 (no implicit default location).
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
      useFactory: (config: BackupsConfig) =>
        config.storageDir ? new LocalDiskBackupStorage(config.storageDir) : null,
    },
  ],
})
export class BackupsModule {}
