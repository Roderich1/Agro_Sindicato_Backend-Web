import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { AssociateProductDto, CloseProductAssociationDto } from "../../application/dto/product-association.dto";
import { ProductReconciliationUseCase } from "../../application/use-cases/product-reconciliation.use-case";
import {
  associationChangeSchema,
  associationListSchema,
  productCatalogSchema,
} from "../../../collective/api/rest/collective-openapi.schemas";

/**
 * F07-REC-01 (#108): Directiva of the effective tenant; the ADMINISTRADOR of
 * the same tenant holds the Directiva functions (RU-18/RU-19, ADR-003).
 * AGRICULTOR is refused. No totals are exposed here.
 */
@ApiTags("collective")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller("collective/product-associations")
export class ProductAssociationsController {
  constructor(private readonly reconciliation: ProductReconciliationUseCase) {}

  @Get()
  // F10-SEC-02 M8 (#45): never cached, like its catalog.
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Asociaciones vigentes e historial de denominaciones con su producto canónico" })
  @ApiResponse({ status: 200, schema: associationListSchema })
  @ApiResponse({ status: 401, description: "Sin credencial vigente" })
  @ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" })
  list(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.reconciliation.list(user.tenantId);
  }

  @Get("catalog")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Denominaciones del catálogo del tenant: nombre y unidad, sin stock" })
  @ApiResponse({ status: 200, schema: productCatalogSchema })
  @ApiResponse({ status: 401, description: "Sin credencial vigente" })
  @ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" })
  catalog(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.reconciliation.catalog(user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Asociar o corregir una denominación (confirmación explícita)" })
  @ApiResponse({ status: 200, schema: associationChangeSchema })
  @ApiResponse({ status: 401, description: "Sin credencial vigente" })
  @ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" })
  @ApiResponse({ status: 404, description: "Producto inexistente o de otro tenant (indistinguibles)" })
  @ApiResponse({ status: 409, description: "La asociación cambió en paralelo" })
  @ApiResponse({ status: 422, description: "Sin confirmación o motivo, dimensión distinta, cadena o autoasociación" })
  associate(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: AssociateProductDto) {
    return this.reconciliation.associate(user.tenantId, user.sub, dto);
  }

  @Post(":productId/close")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cerrar la asociación vigente; la fila queda en el historial" })
  @ApiResponse({ status: 200, schema: associationChangeSchema })
  @ApiResponse({ status: 401, description: "Sin credencial vigente" })
  @ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" })
  @ApiResponse({ status: 404, description: "Sin asociación vigente" })
  @ApiResponse({ status: 422, description: "Sin confirmación o motivo" })
  close(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body() dto: CloseProductAssociationDto,
  ) {
    return this.reconciliation.close(user.tenantId, user.sub, { productId, ...dto });
  }
}
