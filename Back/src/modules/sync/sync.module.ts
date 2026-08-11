import { Module } from '@nestjs/common';
import { AccountsPayableModule } from '../accounts-payable/accounts-payable.module';
import { ApplicationsModule } from '../applications/applications.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PlotsModule } from '../plots/plots.module';
import { SyncController } from './api/rest/sync.controller';
import { SyncOperationsUseCase } from './application/use-cases/sync-operations.use-case';

@Module({
  imports: [InventoryModule, PlotsModule, ApplicationsModule, AccountsPayableModule],
  controllers: [SyncController],
  providers: [SyncOperationsUseCase],
})
export class SyncModule {}
