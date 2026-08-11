import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import { ReportQueryDto } from '../../application/dto/report-query.dto';
import { ReportsUseCase } from '../../application/use-cases/reports.use-case';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsUseCase: ReportsUseCase) {}

  @Get('inventory/current')
  @ApiOperation({ summary: 'Reporte de inventario actual' })
  inventoryCurrent(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.inventoryCurrent(user.tenantId, this.actor(user), query);
  }

  @Get('inventory/by-campaign')
  @ApiOperation({ summary: 'Reporte de inventario agrupado por campana' })
  inventoryByCampaign(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.inventoryByCampaign(user.tenantId, this.actor(user), query);
  }

  @Get('inventory/by-farmer')
  @ApiOperation({ summary: 'Reporte de inventario agrupado por agricultor' })
  inventoryByFarmer(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.inventoryByFarmer(user.tenantId, this.actor(user), query);
  }

  @Get('purchases/by-campaign')
  @ApiOperation({ summary: 'Reporte de compras por campana' })
  purchasesByCampaign(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.purchasesByCampaign(user.tenantId, this.actor(user), query);
  }

  @Get('purchases/joint')
  @ApiOperation({ summary: 'Reporte de compras conjuntas' })
  jointPurchases(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.jointPurchases(user.tenantId, this.actor(user), query);
  }

  @Get('applications/by-plot-crop')
  @ApiOperation({ summary: 'Reporte de aplicaciones por parcela y cultivo' })
  applicationsByPlotCrop(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.applicationsByPlotCrop(user.tenantId, this.actor(user), query);
  }

  @Get('consumption/by-product')
  @ApiOperation({ summary: 'Reporte de consumo por producto' })
  consumptionByProduct(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.consumptionByProduct(user.tenantId, this.actor(user), query);
  }

  @Get('consumption/by-crop')
  @ApiOperation({ summary: 'Reporte de consumo por cultivo' })
  consumptionByCrop(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.consumptionByCrop(user.tenantId, this.actor(user), query);
  }

  @Get('products/expired')
  @ApiOperation({ summary: 'Reporte de productos vencidos y proximos a vencer' })
  expiredProducts(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.expiredProducts(user.tenantId, this.actor(user), query);
  }

  @Get('payables')
  @ApiOperation({ summary: 'Reporte de cuentas por pagar y pagos' })
  payablesAndPayments(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.payablesAndPayments(user.tenantId, this.actor(user), query);
  }

  @Get('audit-log')
  @ApiOperation({ summary: 'Reporte de bitacora por campana' })
  auditByCampaign(@CurrentUser() user: JwtPayload, @Query() query: ReportQueryDto) {
    return this.reportsUseCase.auditByCampaign(user.tenantId, this.actor(user), query);
  }

  private actor(user: JwtPayload) {
    return { userId: user.sub, role: user.role as UserRole };
  }
}
