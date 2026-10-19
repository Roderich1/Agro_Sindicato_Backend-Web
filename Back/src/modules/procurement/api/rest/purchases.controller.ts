import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { AuthenticatedPrincipal } from '../../../iam/application/types/authenticated-principal.type';
import { CreateJointPurchaseDto } from '../../application/dto/create-joint-purchase.dto';
import { CreatePurchaseDto } from '../../application/dto/create-purchase.dto';
import { ListPurchasesQueryDto } from '../../application/dto/list-purchases-query.dto';
import { CreateJointPurchaseUseCase } from '../../application/use-cases/create-joint-purchase.use-case';
import { CreatePurchaseUseCase } from '../../application/use-cases/create-purchase.use-case';
import { ListPurchasesUseCase } from '../../application/use-cases/list-purchases.use-case';
import { LegacyRouteClosedGuard } from '@/shared/api/legacy-route-closed.guard';
import { LegacyPrivateWrite } from '@/shared/api/legacy-private-writes';

@ApiTags('purchases')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('purchases')
export class PurchasesController {
  private readonly logger = new Logger(PurchasesController.name);

  constructor(
    private readonly createPurchaseUseCase: CreatePurchaseUseCase,
    private readonly createJointPurchaseUseCase: CreateJointPurchaseUseCase,
    private readonly listPurchasesUseCase: ListPurchasesUseCase,
  ) {}

  @Get()
  // F10-SEC-02 (#45): individual purchases are private; institutional roles do not read them (ADR-003).
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Listar compras visibles para el usuario autenticado' })
  async list(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListPurchasesQueryDto) {
    return this.listPurchasesUseCase.list(user.tenantId, user.sub, user.role, query);
  }

  @Get(':id')
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Obtener detalle de una compra visible para el usuario autenticado' })
  async get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.listPurchasesUseCase.get(user.tenantId, user.sub, user.role, id);
  }

  @Post()
  @LegacyPrivateWrite()
  @Roles(UserRole.AGRICULTOR)
  @ApiOperation({ summary: 'Registrar compra al contado o a credito con entrada de inventario' })
  async create(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreatePurchaseDto) {
    this.logger.log(`[PURCHASE CREATE] userId=${user.sub} tenantId=${user.tenantId} mode=${dto.paymentMode}`);
    return this.createPurchaseUseCase.execute(user.tenantId, user.sub, dto);
  }

  @Post('joint')
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  // F10-SEC-02 (#45): executes a joint purchase that creates lots, movements,
  // debts and events for farmers. The valid path is the draft proposal
  // (/collective/.../proposals), with no automatic effects. Closed.
  @UseGuards(LegacyRouteClosedGuard)
  @ApiForbiddenResponse({ description: 'Cerrada en F10-SEC-02 (#45): responde siempre 403 con message LEGACY_ROUTE_CLOSED, sin efectos. Se conserva para la transición (#81); el camino vigente es la propuesta en borrador (/collective/campaigns/{campaignId}/proposals).' })
  @ApiOperation({ summary: 'Crear compra conjunta y distribuir productos entre agricultores (cerrada)' })
  async createJoint(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateJointPurchaseDto) {
    this.logger.log(`[PURCHASE JOINT_CREATE] userId=${user.sub} tenantId=${user.tenantId} mode=${dto.paymentMode}`);
    return this.createJointPurchaseUseCase.execute(user.tenantId, user.sub, dto);
  }
}
