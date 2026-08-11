import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import { ListAuditLogsQueryDto } from '../../application/dto/list-audit-logs-query.dto';
import { ListAuditLogsUseCase } from '../../application/use-cases/list-audit-logs.use-case';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly listAuditLogsUseCase: ListAuditLogsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Consultar bitacora de cambios importantes' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListAuditLogsQueryDto) {
    return this.listAuditLogsUseCase.execute(user.tenantId, user.sub, user.role, query);
  }
}
