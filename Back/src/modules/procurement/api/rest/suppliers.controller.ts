import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from '../../application/dto/supplier.dto';
import { SuppliersUseCase } from '../../application/use-cases/suppliers.use-case';

@ApiTags('suppliers')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('suppliers')
export class SuppliersController {
  private readonly logger = new Logger(SuppliersController.name);

  constructor(private readonly suppliersUseCase: SuppliersUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar proveedores del sindicato' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListSuppliersQueryDto) {
    return this.suppliersUseCase.list(user.tenantId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar proveedor' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSupplierDto) {
    this.logger.log(`[SUPPLIER CREATE] userId=${user.sub} tenantId=${user.tenantId} name=${dto.name}`);
    return this.suppliersUseCase.create(user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    this.logger.log(`[SUPPLIER UPDATE] userId=${user.sub} tenantId=${user.tenantId} supplierId=${id}`);
    return this.suppliersUseCase.update(user.tenantId, id, dto);
  }
}
