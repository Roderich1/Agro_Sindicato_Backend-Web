import { Module } from '@nestjs/common';
import { InventoryController } from './api/rest/inventory.controller';
import { InventoryAdjustmentUseCase } from './application/use-cases/inventory-adjustment.use-case';
import { InventoryLotUseCase } from './application/use-cases/inventory-lot.use-case';
import { InventoryStockUseCase } from './application/use-cases/inventory-stock.use-case';
import { ProductCatalogUseCase } from './application/use-cases/product-catalog.use-case';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryStockUseCase,
    ProductCatalogUseCase,
    InventoryLotUseCase,
    InventoryAdjustmentUseCase,
  ],
  exports: [InventoryStockUseCase],
})
export class InventoryModule {}
