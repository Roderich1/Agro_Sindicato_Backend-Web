import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { InventoryController } from './api/rest/inventory.controller';
import { ProductAssociationsController } from './api/rest/product-associations.controller';
import { InventoryAdjustmentUseCase } from './application/use-cases/inventory-adjustment.use-case';
import { InventoryLotUseCase } from './application/use-cases/inventory-lot.use-case';
import { InventoryStockUseCase } from './application/use-cases/inventory-stock.use-case';
import { ProductCatalogUseCase } from './application/use-cases/product-catalog.use-case';
import { ProductReconciliationUseCase } from './application/use-cases/product-reconciliation.use-case';

@Module({
  imports: [CampaignsModule],
  controllers: [InventoryController, ProductAssociationsController],
  providers: [
    InventoryStockUseCase,
    ProductCatalogUseCase,
    InventoryLotUseCase,
    InventoryAdjustmentUseCase,
    ProductReconciliationUseCase,
  ],
  exports: [InventoryStockUseCase],
})
export class InventoryModule {}
