import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { SyncV1AuthGuard } from "@/modules/sync-v1/api/rest/sync-v1-auth.guard";
import { InventoryModule } from "../inventory/inventory.module";
import { FarmerIdentificationController } from "./api/rest/farmer-identification.controller";
import { IdentificationListAuthGuard } from "./api/rest/identification-list-auth.guard";
import { InstitutionalIdentificationController } from "./api/rest/institutional-identification.controller";
import { FarmerIdentificationUseCase } from "./application/farmer-identification.use-case";
import { InstitutionalIdentificationUseCase } from "./application/institutional-identification.use-case";
import { ProductPhotoConfig } from "./application/product-photo-config";
import { ProductPhotoSweep } from "./application/product-photo-sweep";
import {
  createProductPhotoStorage,
  PRODUCT_PHOTO_STORAGE,
} from "./infrastructure/product-photo-storage";

/**
 * E1 (etapa 1): identification of products reported by the farmer
 * (`docs/architecture/E1_IDENTIFICACION_PRODUCTOS_CONTRATO.md`). A channel
 * apart from Sync v1 (E1-D2): it reuses the farmer authentication guard
 * (`SyncV1AuthGuard`, provided here with its own JWT registration) without
 * touching Sync v1 routes, envelopes or tables. Photos live in a second
 * instance of the F08 private storage (E1-D8); without it, the photo routes
 * answer 503 and the request data routes keep working. Orphans, staging
 * leftovers and photos past their retention are removed by the photo sweep
 * (contract §10; opt-in interval or `npm run product-photos:sweep`).
 */
@Module({
  imports: [
    InventoryModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
      }),
    }),
  ],
  // The farmer controller first: its `GET /` serves both audiences.
  controllers: [FarmerIdentificationController, InstitutionalIdentificationController],
  providers: [
    SyncV1AuthGuard,
    IdentificationListAuthGuard,
    ProductPhotoConfig,
    FarmerIdentificationUseCase,
    InstitutionalIdentificationUseCase,
    ProductPhotoSweep,
    {
      provide: PRODUCT_PHOTO_STORAGE,
      inject: [ProductPhotoConfig],
      useFactory: (config: ProductPhotoConfig) => createProductPhotoStorage(config),
    },
  ],
})
export class ProductIdentificationModule {}
