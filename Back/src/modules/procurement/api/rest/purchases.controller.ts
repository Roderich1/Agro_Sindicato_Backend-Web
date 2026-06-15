import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import { CreateJointPurchaseDto } from '../../application/dto/create-joint-purchase.dto';
import { CreatePurchaseDto } from '../../application/dto/create-purchase.dto';
import { ListPurchasesQueryDto } from '../../application/dto/list-purchases-query.dto';
import { CreateJointPurchaseUseCase } from '../../application/use-cases/create-joint-purchase.use-case';
import { CreatePurchaseUseCase } from '../../application/use-cases/create-purchase.use-case';
import { ListPurchasesUseCase } from '../../application/use-cases/list-purchases.use-case';

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
  @ApiOperation({ summary: 'Listar compras visibles para el usuario autenticado' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListPurchasesQueryDto) {
    return this.listPurchasesUseCase.list(user.tenantId, user.sub, user.role, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una compra visible para el usuario autenticado' })
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.listPurchasesUseCase.get(user.tenantId, user.sub, user.role, id);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar compra al contado o a credito con entrada de inventario' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePurchaseDto) {
    this.logger.log(`[PURCHASE CREATE] userId=${user.sub} tenantId=${user.tenantId} mode=${dto.paymentMode}`);
    return this.createPurchaseUseCase.execute(user.tenantId, user.sub, dto);
  }

  @Post('joint')
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear compra conjunta y distribuir productos entre agricultores' })
  async createJoint(@CurrentUser() user: JwtPayload, @Body() dto: CreateJointPurchaseDto) {
    this.logger.log(`[PURCHASE JOINT_CREATE] userId=${user.sub} tenantId=${user.tenantId} mode=${dto.paymentMode}`);
    return this.createJointPurchaseUseCase.execute(user.tenantId, user.sub, dto);
  }
}
