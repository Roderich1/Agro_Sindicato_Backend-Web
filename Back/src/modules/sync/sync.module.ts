import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { SyncController } from './api/rest/sync.controller';
import { SyncOperationsUseCase } from './application/use-cases/sync-operations.use-case';

@Module({
  imports: [InventoryModule],
  controllers: [SyncController],
  providers: [SyncOperationsUseCase],
})
export class SyncModule {}
