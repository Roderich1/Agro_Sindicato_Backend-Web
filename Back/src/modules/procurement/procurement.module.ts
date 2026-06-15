import { Module } from '@nestjs/common';
import { PurchasesController } from './api/rest/purchases.controller';
import { SuppliersController } from './api/rest/suppliers.controller';
import { CreateJointPurchaseUseCase } from './application/use-cases/create-joint-purchase.use-case';
import { CreatePurchaseUseCase } from './application/use-cases/create-purchase.use-case';
import { ListPurchasesUseCase } from './application/use-cases/list-purchases.use-case';
import { SuppliersUseCase } from './application/use-cases/suppliers.use-case';

@Module({
  controllers: [PurchasesController, SuppliersController],
  providers: [
    CreatePurchaseUseCase,
    CreateJointPurchaseUseCase,
    ListPurchasesUseCase,
    SuppliersUseCase,
  ],
})
export class ProcurementModule {}
