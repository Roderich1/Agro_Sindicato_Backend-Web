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
import { ListGlobalStockQueryDto } from '../../application/dto/list-global-stock-query.dto';
import { ListLotsQueryDto, UpdateInventoryLotDto } from '../../application/dto/inventory-lot.dto';
import { ListStockMovementsQueryDto } from '../../application/dto/list-stock-movements-query.dto';
import {
  ListStockQueryDto,
  UpdateProductInventorySettingsDto,
} from '../../application/dto/list-stock-query.dto';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from '../../application/dto/product-catalog.dto';
import { RegisterInitialStockDto } from '../../application/dto/register-initial-stock.dto';
import { RegisterStockAdjustmentDto } from '../../application/dto/register-stock-adjustment.dto';
import { RegisterStockEntryDto } from '../../application/dto/register-stock-entry.dto';
import { RegisterStockExitDto } from '../../application/dto/register-stock-exit.dto';
import { InventoryAdjustmentUseCase } from '../../application/use-cases/inventory-adjustment.use-case';
import { InventoryLotUseCase } from '../../application/use-cases/inventory-lot.use-case';
import { InventoryStockUseCase } from '../../application/use-cases/inventory-stock.use-case';
import { ProductCatalogUseCase } from '../../application/use-cases/product-catalog.use-case';

@ApiTags('inventory')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(
    private readonly inventoryStockUseCase: InventoryStockUseCase,
    private readonly productCatalogUseCase: ProductCatalogUseCase,
    private readonly inventoryLotUseCase: InventoryLotUseCase,
    private readonly inventoryAdjustmentUseCase: InventoryAdjustmentUseCase,
  ) {}

  @Get('products')
  @ApiOperation({ summary: 'Listar productos agroquimicos del sindicato' })
  async listProducts(@CurrentUser() user: JwtPayload, @Query() query: ListProductsQueryDto) {
    return this.productCatalogUseCase.list(user.tenantId, query);
  }

  @Post('products')
  @ApiOperation({ summary: 'Registrar un producto agroquimico' })
  async createProduct(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    this.logger.log(`[INVENTORY PRODUCT_CREATE] userId=${user.sub} tenantId=${user.tenantId} name=${dto.name}`);
    return this.productCatalogUseCase.create(user.tenantId, dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Actualizar datos de un producto agroquimico' })
  async updateProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    this.logger.log(`[INVENTORY PRODUCT_UPDATE] userId=${user.sub} tenantId=${user.tenantId} productId=${id}`);
    return this.productCatalogUseCase.update(user.tenantId, id, dto);
  }

  @Post('initial-stock')
  @ApiOperation({ summary: 'Registrar inventario inicial del agricultor autenticado' })
  async registerInitialStock(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterInitialStockDto,
  ) {
    this.logger.log(`[INVENTORY INITIAL] userId=${user.sub} tenantId=${user.tenantId}`);
    return this.inventoryStockUseCase.registerInitialStock(user.tenantId, user.sub, dto);
  }

  @Post('entries')
  @ApiOperation({ summary: 'Registrar una entrada de agroquimico' })
  async registerEntry(@CurrentUser() user: JwtPayload, @Body() dto: RegisterStockEntryDto) {
    this.logger.log(`[INVENTORY ENTRY] userId=${user.sub} tenantId=${user.tenantId} reason=${dto.entryReason}`);
    return this.inventoryStockUseCase.registerEntry(user.tenantId, user.sub, dto);
  }

  @Post('exits')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar una salida de agroquimico validando stock disponible' })
  async registerExit(@CurrentUser() user: JwtPayload, @Body() dto: RegisterStockExitDto) {
    this.logger.log(`[INVENTORY EXIT] userId=${user.sub} tenantId=${user.tenantId} productId=${dto.productId}`);
    return this.inventoryStockUseCase.registerExit(user.tenantId, user.sub, dto);
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar ajuste de inventario por perdida, dano o correccion' })
  async registerAdjustment(@CurrentUser() user: JwtPayload, @Body() dto: RegisterStockAdjustmentDto) {
    this.logger.log(`[INVENTORY ADJUSTMENT] userId=${user.sub} tenantId=${user.tenantId} productId=${dto.productId}`);
    return this.inventoryAdjustmentUseCase.execute(user.tenantId, user.sub, dto);
  }

  @Get('lots')
  @ApiOperation({ summary: 'Listar lotes del agricultor autenticado' })
  async listLots(@CurrentUser() user: JwtPayload, @Query() query: ListLotsQueryDto) {
    return this.inventoryLotUseCase.list(user.tenantId, user.sub, query);
  }

  @Patch('lots/:id')
  @ApiOperation({ summary: 'Actualizar lote, vencimiento o almacen de un lote' })
  async updateLot(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInventoryLotDto,
  ) {
    this.logger.log(`[INVENTORY LOT_UPDATE] userId=${user.sub} tenantId=${user.tenantId} lotId=${id}`);
    return this.inventoryLotUseCase.update(user.tenantId, user.sub, id, dto);
  }

  @Get('stock')
  @ApiOperation({ summary: 'Consultar stock disponible con filtros y busqueda' })
  async listStock(@CurrentUser() user: JwtPayload, @Query() query: ListStockQueryDto) {
    return this.inventoryStockUseCase.listStock(user.tenantId, user.sub, query);
  }

  @Get('global-stock')
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Consultar inventario global de todos los agricultores' })
  async listGlobalStock(@CurrentUser() user: JwtPayload, @Query() query: ListGlobalStockQueryDto) {
    return this.inventoryStockUseCase.listGlobalStock(user.tenantId, query);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Consultar alertas de stock minimo y vencimiento' })
  async listAlerts(@CurrentUser() user: JwtPayload) {
    return this.inventoryStockUseCase.listAlerts(user.tenantId, user.sub);
  }

  @Patch('products/:id/settings')
  @ApiOperation({ summary: 'Configurar categoria, stock minimo y umbral de vencimiento' })
  async updateProductSettings(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductInventorySettingsDto,
  ) {
    this.logger.log(`[INVENTORY PRODUCT_SETTINGS] userId=${user.sub} tenantId=${user.tenantId} productId=${id}`);
    return this.inventoryStockUseCase.updateProductSettings(user.tenantId, id, dto);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Consultar historial de movimientos con filtros' })
  async listMovements(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListStockMovementsQueryDto,
  ) {
    return this.inventoryStockUseCase.listMovements(user.tenantId, user.sub, query);
  }
}
