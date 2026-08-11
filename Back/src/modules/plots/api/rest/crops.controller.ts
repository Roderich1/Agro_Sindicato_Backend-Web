import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import {
  CreateCropDto,
  ListCropsQueryDto,
  UpdateCropDto,
} from '../../application/dto/plot-flow.dto';
import { PlotFlowUseCase } from '../../application/use-cases/plot-flow.use-case';

@ApiTags('crops')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('crops')
export class CropsController {
  private readonly logger = new Logger(CropsController.name);

  constructor(private readonly plotFlowUseCase: PlotFlowUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar catalogo de cultivos del sindicato' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListCropsQueryDto) {
    return this.plotFlowUseCase.listCrops(user.tenantId, query);
  }

  @Post()
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear un cultivo del catalogo del sindicato' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCropDto) {
    this.logger.log(`[CROP CREATE] userId=${user.sub} tenantId=${user.tenantId} name=${dto.name}`);
    return this.plotFlowUseCase.createCrop(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Actualizar un cultivo del catalogo del sindicato' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCropDto,
  ) {
    this.logger.log(`[CROP UPDATE] userId=${user.sub} tenantId=${user.tenantId} cropId=${id}`);
    return this.plotFlowUseCase.updateCrop(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
      dto,
    );
  }
}
