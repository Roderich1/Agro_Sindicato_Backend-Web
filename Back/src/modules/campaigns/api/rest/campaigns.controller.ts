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
  CloseCampaignDto,
  CreateCampaignDto,
  ListCampaignsQueryDto,
  UpdateCampaignDto,
} from '../../application/dto/campaign.dto';
import { CampaignManagementUseCase } from '../../application/use-cases/campaign-management.use-case';

@ApiTags('campaigns')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('campaigns')
export class CampaignsController {
  private readonly logger = new Logger(CampaignsController.name);

  constructor(private readonly campaignManagementUseCase: CampaignManagementUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar campanas agricolas del sindicato' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListCampaignsQueryDto) {
    return this.campaignManagementUseCase.listCampaigns(user.tenantId, query);
  }

  @Get('active')
  @ApiOperation({ summary: 'Consultar la campana agricola activa del sindicato' })
  async getActive(@CurrentUser() user: JwtPayload) {
    return this.campaignManagementUseCase.getActiveCampaign(user.tenantId);
  }

  @Post()
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear una campana agricola planificada' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCampaignDto) {
    this.logger.log(`[CAMPAIGN CREATE] userId=${user.sub} tenantId=${user.tenantId} name=${dto.name}`);
    return this.campaignManagementUseCase.createCampaign(
      user.tenantId,
      user.sub,
      user.role as UserRole,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Editar una campana agricola planificada o abierta' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    this.logger.log(`[CAMPAIGN UPDATE] userId=${user.sub} tenantId=${user.tenantId} campaignId=${id}`);
    return this.campaignManagementUseCase.updateCampaign(
      user.tenantId,
      user.sub,
      user.role as UserRole,
      id,
      dto,
    );
  }

  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Abrir una campana agricola' })
  async open(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    this.logger.log(`[CAMPAIGN OPEN] userId=${user.sub} tenantId=${user.tenantId} campaignId=${id}`);
    return this.campaignManagementUseCase.openCampaign(user.tenantId, user.sub, user.role as UserRole, id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Cerrar una campana agricola activa' })
  async close(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloseCampaignDto,
  ) {
    this.logger.log(`[CAMPAIGN CLOSE] userId=${user.sub} tenantId=${user.tenantId} campaignId=${id}`);
    return this.campaignManagementUseCase.closeCampaign(
      user.tenantId,
      user.sub,
      user.role as UserRole,
      id,
      dto,
    );
  }
}
