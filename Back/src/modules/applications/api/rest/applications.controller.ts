import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { AuthenticatedPrincipal } from '../../../iam/application/types/authenticated-principal.type';
import {
  CancelApplicationDto,
  CreateApplicationDto,
  ListApplicationsQueryDto,
} from '../../application/dto/application.dto';
import { ApplicationsUseCase } from '../../application/use-cases/applications.use-case';
import { LegacyPrivateWrite } from '@/shared/api/legacy-private-writes';

@ApiTags('applications')
@ApiBearerAuth()
// F10-SEC-02 (#45): applications (plot, dose, notes) are private; owner only.
@Roles(UserRole.AGRICULTOR)
@Controller('applications')
export class ApplicationsController {
  private readonly logger = new Logger(ApplicationsController.name);

  constructor(private readonly applicationsUseCase: ApplicationsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar aplicaciones de agroquimicos visibles para el usuario' })
  async list(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListApplicationsQueryDto) {
    return this.applicationsUseCase.list(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      query,
    );
  }

  @Post()
  @LegacyPrivateWrite(201)
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Registrar aplicacion de agroquimico a parcela y descontar stock' })
  async create(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateApplicationDto) {
    this.logger.log(
      `[APPLICATION CREATE] userId=${user.sub} tenantId=${user.tenantId} plotId=${dto.plotId} productId=${dto.productId}`,
    );
    return this.applicationsUseCase.create(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      dto,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una aplicacion visible para el usuario' })
  async get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.applicationsUseCase.get(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
    );
  }

  @Post(':id/cancel')
  @LegacyPrivateWrite(200)
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Anular una aplicacion propia indicando motivo' })
  async cancel(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelApplicationDto,
  ) {
    this.logger.log(`[APPLICATION CANCEL] userId=${user.sub} tenantId=${user.tenantId} applicationId=${id}`);
    return this.applicationsUseCase.cancel(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
      dto.reason,
    );
  }
}
