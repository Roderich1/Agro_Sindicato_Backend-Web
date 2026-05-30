import { Module } from '@nestjs/common';
import { AccountsPayableController } from './api/rest/accounts-payable.controller';
import { AccountsPayableUseCase } from './application/use-cases/accounts-payable.use-case';

@Module({
  controllers: [AccountsPayableController],
  providers: [AccountsPayableUseCase],
})
export class AccountsPayableModule {}
