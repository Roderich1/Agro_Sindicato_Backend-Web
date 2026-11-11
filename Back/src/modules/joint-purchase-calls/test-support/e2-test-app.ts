import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getOptionsToken } from "@nestjs/throttler";
import { randomBytes } from "node:crypto";
import cookieParser = require("cookie-parser");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { configureBackupsBodyGuard } from "@/modules/backups/api/rest/backups-body";
import { configureProductIdentificationBody } from "@/modules/product-identification/api/rest/identification-body";
import { configureSyncV1BodyParser } from "@/modules/sync-v1/api/rest/sync-v1-body";
import { JWT_SECRET } from "@/modules/sync-v1/test-support/sync-v1-test-app";
import { configureJointPurchaseCallsBody } from "../api/rest/calls-body";
import { JointPurchaseAutoCloseWorker } from "../application/auto-close.worker";
import { Clock, JOINT_PURCHASE_CLOCK } from "../application/clock";

/**
 * Server clock the tests move: real time plus an offset. The system clock is
 * never touched (contract §7).
 */
export class AdjustableClock implements Clock {
  offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number) {
    this.offsetMs += ms;
  }

  reset() {
    this.offsetMs = 0;
  }
}

/**
 * Real Nest application for the E2 PostgreSQL suite, wired as `main.ts`
 * (same middleware order, including the E2 body handling), with the server
 * clock replaced and the automatic close off (the suite runs it by hand).
 * Tokens are signed with the Sync v1 test secret, so `createSession` works.
 */
export async function createE2App(databaseUrl: string): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  clock: AdjustableClock;
  worker: JointPurchaseAutoCloseWorker;
}> {
  process.env["DATABASE_URL"] = databaseUrl;
  process.env["NODE_ENV"] = "test";
  process.env["JWT_SECRET"] = JWT_SECRET;
  process.env["JWT_REFRESH_SECRET"] ??= randomBytes(32).toString("hex");
  process.env["JOINT_PURCHASE_CLOSE_INTERVAL_MS"] = "disabled";
  process.env["ESTIMATION_WORKER"] = "disabled";
  const clock = new AdjustableClock();
  const { AppModule } = await import("@/app.module");
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getOptionsToken())
    .useValue({ throttlers: [{ ttl: 60000, limit: 20 }], skipIf: () => true })
    .overrideProvider(JOINT_PURCHASE_CLOCK)
    .useValue(clock)
    .compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  configureSyncV1BodyParser(app);
  configureBackupsBodyGuard(app);
  configureProductIdentificationBody(app);
  configureJointPurchaseCallsBody(app);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService), clock, worker: app.get(JointPurchaseAutoCloseWorker) };
}
