import { Module } from '@nestjs/common';
import { ReportsController } from './api/rest/reports.controller';
import { ReportsUseCase } from './application/use-cases/reports.use-case';

@Module({
  controllers: [ReportsController],
  providers: [ReportsUseCase],
})
export class ReportsModule {}
