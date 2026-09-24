import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { AuthenticatedPrincipal } from '../../../iam/application/types/authenticated-principal.type';
import {
  ListSyncOperationsQueryDto,
  SyncOperationsDto,
} from '../../application/dto/sync-operations.dto';
import { SyncOperationsUseCase } from '../../application/use-cases/sync-operations.use-case';

@ApiTags('sync')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(private readonly syncOperationsUseCase: SyncOperationsUseCase) {}

  @Post('operations')
  @Roles(UserRole.AGRICULTOR)
  @ApiForbiddenResponse({ description: 'Operación individual legacy: sólo Agricultor vigente.' })
  @ApiOperation({ summary: 'Sincronizar operaciones registradas sin conexion' })
  async sync(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: SyncOperationsDto) {
    this.logger.log(`[SYNC OPERATIONS] userId=${user.sub} tenantId=${user.tenantId} clientId=${dto.clientId} count=${dto.operations.length}`);
    return this.syncOperationsUseCase.sync(user.tenantId, user.sub, dto);
  }

  @Get('operations')
  @Roles(UserRole.AGRICULTOR)
  @ApiForbiddenResponse({ description: 'Consulta individual legacy: sólo Agricultor vigente.' })
  @ApiOperation({ summary: 'Consultar estado de operaciones sincronizadas' })
  async list(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListSyncOperationsQueryDto) {
    return this.syncOperationsUseCase.list(user.tenantId, user.sub, query);
  }
}
