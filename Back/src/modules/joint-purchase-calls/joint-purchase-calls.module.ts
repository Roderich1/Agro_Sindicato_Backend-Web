import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { SyncV1AuthGuard } from "@/modules/sync-v1/api/rest/sync-v1-auth.guard";
import { CollectiveModule } from "../collective/collective.module";
import { FarmerCallsController } from "./api/rest/farmer-calls.controller";
import { InstitutionalCallsController } from "./api/rest/institutional-calls.controller";
import { SubstitutionPermissionsController } from "./api/rest/substitution-permissions.controller";
import { JointPurchaseAutoCloseWorker } from "./application/auto-close.worker";
import { CallClosingService } from "./application/call-closing.service";
import { JOINT_PURCHASE_CLOCK, systemClock } from "./application/clock";
import { FarmerParticipationUseCase } from "./application/farmer-participation.use-case";
import { InstitutionalCallsUseCase } from "./application/institutional-calls.use-case";
import { JointPurchaseConfig } from "./application/joint-purchase-config";
import { ResponsibleSubstitutionUseCase } from "./application/responsible-substitution.use-case";

/**
 * E2 (etapa 2): joint purchase calls and identified participation
 * (`docs/architecture/E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md`). The
 * farmer routes reuse the farmer authentication guard (`SyncV1AuthGuard`,
 * provided here with its own JWT registration) without touching Sync v1
 * routes, envelopes or tables. The server clock is a provider so tests can
 * move time without touching the system clock.
 */
@Module({
  imports: [
    CollectiveModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
      }),
    }),
  ],
  controllers: [FarmerCallsController, InstitutionalCallsController, SubstitutionPermissionsController],
  providers: [
    SyncV1AuthGuard,
    JointPurchaseConfig,
    { provide: JOINT_PURCHASE_CLOCK, useValue: systemClock },
    CallClosingService,
    InstitutionalCallsUseCase,
    ResponsibleSubstitutionUseCase,
    FarmerParticipationUseCase,
    JointPurchaseAutoCloseWorker,
  ],
  exports: [JOINT_PURCHASE_CLOCK, JointPurchaseAutoCloseWorker],
})
export class JointPurchaseCallsModule {}
