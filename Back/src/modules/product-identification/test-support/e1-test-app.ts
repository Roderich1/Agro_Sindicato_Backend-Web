import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getOptionsToken } from "@nestjs/throttler";
import { randomBytes } from "node:crypto";
import cookieParser = require("cookie-parser");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import type { BackupStorage } from "@/modules/backups/domain/backup-storage.port";
import { configureBackupsBodyGuard } from "@/modules/backups/api/rest/backups-body";
import { configureSyncV1BodyParser } from "@/modules/sync-v1/api/rest/sync-v1-body";
import { JWT_SECRET } from "@/modules/sync-v1/test-support/sync-v1-test-app";
import { configureProductIdentificationBody } from "../api/rest/identification-body";
import { PRODUCT_PHOTO_STORAGE } from "../infrastructure/product-photo-storage";

/**
 * Real Nest application for the E1 PostgreSQL suite, wired as `main.ts`
 * (same middleware order, including the E1 body handling), with the photo
 * storage given explicitly: an adapter, or null for "not configured".
 * The database comes from `createIsolatedDatabase`; tokens are signed with
 * the Sync v1 test secret, so `createSession` works unchanged.
 */
export async function createE1App(
  databaseUrl: string,
  options: { photoStorage: BackupStorage | null },
): Promise<{ app: INestApplication; prisma: PrismaService }> {
  process.env["DATABASE_URL"] = databaseUrl;
  process.env["NODE_ENV"] = "test";
  process.env["JWT_SECRET"] = JWT_SECRET;
  process.env["JWT_REFRESH_SECRET"] ??= randomBytes(32).toString("hex");
  const { AppModule } = await import("@/app.module");
  const module = await Test.createTestingModule({ imports: [AppModule] })
    // As createSyncV1App: the real limit (20/min) is skipped through its options.
    .overrideProvider(getOptionsToken())
    .useValue({ throttlers: [{ ttl: 60000, limit: 20 }], skipIf: () => true })
    .overrideProvider(PRODUCT_PHOTO_STORAGE)
    .useFactory({ factory: () => options.photoStorage })
    .compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  configureSyncV1BodyParser(app);
  configureBackupsBodyGuard(app);
  configureProductIdentificationBody(app);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}
