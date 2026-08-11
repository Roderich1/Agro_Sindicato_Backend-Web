import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import {
  CreatePlotDto,
  ListPlotsQueryDto,
  UpdatePlotDto,
} from '../../application/dto/plot-flow.dto';
import { PlotFlowUseCase } from '../../application/use-cases/plot-flow.use-case';

@ApiTags('plots')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('plots')
export class PlotsController {
  private readonly logger = new Logger(PlotsController.name);

  constructor(private readonly plotFlowUseCase: PlotFlowUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar parcelas visibles para el usuario autenticado' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListPlotsQueryDto) {
    return this.plotFlowUseCase.listPlots(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      query,
    );
  }

  @Post()
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Crear una parcela del agricultor autenticado' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePlotDto) {
    this.logger.log(`[PLOT CREATE] userId=${user.sub} tenantId=${user.tenantId} name=${dto.name}`);
    return this.plotFlowUseCase.createPlot(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Editar una parcela propia del agricultor autenticado' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlotDto,
  ) {
    this.logger.log(`[PLOT UPDATE] userId=${user.sub} tenantId=${user.tenantId} plotId=${id}`);
    return this.plotFlowUseCase.updatePlot(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
      dto,
    );
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Inactivar una parcela propia sin borrar su historial' })
  async deactivate(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    this.logger.log(`[PLOT DEACTIVATE] userId=${user.sub} tenantId=${user.tenantId} plotId=${id}`);
    return this.plotFlowUseCase.deactivatePlot(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
    );
  }
}
