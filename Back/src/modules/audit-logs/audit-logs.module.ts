import { Module } from '@nestjs/common';
import { AuditLogsController } from './api/rest/audit-logs.controller';
import { ListAuditLogsUseCase } from './application/use-cases/list-audit-logs.use-case';

@Module({
  controllers: [AuditLogsController],
  providers: [ListAuditLogsUseCase],
})
export class AuditLogsModule {}
