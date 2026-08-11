import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import {
  CreatePlotCropAssignmentDto,
  ListPlotCropAssignmentsQueryDto,
  UpdatePlotCropAssignmentDto,
} from '../../application/dto/plot-flow.dto';
import { PlotFlowUseCase } from '../../application/use-cases/plot-flow.use-case';

@ApiTags('plot-crop-assignments')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('plot-crop-assignments')
export class PlotCropAssignmentsController {
  private readonly logger = new Logger(PlotCropAssignmentsController.name);

  constructor(private readonly plotFlowUseCase: PlotFlowUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar asignaciones cultivo/parcela/campana visibles' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListPlotCropAssignmentsQueryDto) {
    return this.plotFlowUseCase.listAssignments(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      query,
    );
  }

  @Post()
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Asignar cultivo principal a una parcela propia en campana abierta' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePlotCropAssignmentDto) {
    this.logger.log(
      `[PLOT_CROP_ASSIGNMENT CREATE] userId=${user.sub} tenantId=${user.tenantId} plotId=${dto.plotId} cropId=${dto.cropId}`,
    );
    return this.plotFlowUseCase.createAssignment(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Actualizar cultivo asignado a una parcela propia en campana abierta' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlotCropAssignmentDto,
  ) {
    this.logger.log(`[PLOT_CROP_ASSIGNMENT UPDATE] userId=${user.sub} tenantId=${user.tenantId} assignmentId=${id}`);
    return this.plotFlowUseCase.updateAssignment(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
      dto,
    );
  }
}
