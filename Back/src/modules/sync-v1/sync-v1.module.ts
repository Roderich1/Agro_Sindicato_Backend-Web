import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { SyncV1AuthGuard } from "./api/rest/sync-v1-auth.guard";
import { SyncV1Controller } from "./api/rest/sync-v1.controller";
import { GetOperationUseCase } from "./application/get-operation.use-case";
import { ListReferencesUseCase } from "./application/list-references.use-case";
import { PushOperationUseCase } from "./application/push-operation.use-case";
import { SyncV1Config } from "./application/sync-v1-config";

/**
 * Sync Contract v1 target routes, in parallel with the legacy SyncModule
 * (contract §2, §14): legacy routes and stores are not modified or retired.
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
  controllers: [SyncV1Controller],
  providers: [
    SyncV1Config,
    SyncV1AuthGuard,
    PushOperationUseCase,
    GetOperationUseCase,
    ListReferencesUseCase,
  ],
})
export class SyncV1Module {}
