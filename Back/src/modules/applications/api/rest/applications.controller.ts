import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import {
  CancelApplicationDto,
  CreateApplicationDto,
  ListApplicationsQueryDto,
} from '../../application/dto/application.dto';
import { ApplicationsUseCase } from '../../application/use-cases/applications.use-case';

@ApiTags('applications')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('applications')
export class ApplicationsController {
  private readonly logger = new Logger(ApplicationsController.name);

  constructor(private readonly applicationsUseCase: ApplicationsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar aplicaciones de agroquimicos visibles para el usuario' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListApplicationsQueryDto) {
    return this.applicationsUseCase.list(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      query,
    );
  }

  @Post()
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Registrar aplicacion de agroquimico a parcela y descontar stock' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateApplicationDto) {
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
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.applicationsUseCase.get(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Anular una aplicacion propia indicando motivo' })
  async cancel(
    @CurrentUser() user: JwtPayload,
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
