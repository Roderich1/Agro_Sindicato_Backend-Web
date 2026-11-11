import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseFilters,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { Response } from "express";
import { CurrentUser } from "@/modules/iam/api/rest/decorators/current-user.decorator";
import { Roles } from "@/modules/iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "@/modules/iam/application/types/authenticated-principal.type";
import { InstitutionalIdentificationUseCase } from "../../application/institutional-identification.use-case";
import {
  CreateIdentifiedProductDto,
  DeferIdentificationDto,
  LinkIdentificationDto,
} from "./identification.dto";
import { IdentificationExceptionFilter } from "./identification-exception.filter";
import {
  candidateListSchema,
  decisionSchema,
  historySchema,
  identificationErrorSchema,
} from "./identification-openapi.schemas";

const error = (status: number, description: string) =>
  ApiResponse({ status, description, schema: identificationErrorSchema });

/**
 * E1 §4.2: identification of reported products by the Directiva of the
 * effective tenant; its ADMINISTRADOR holds the Directiva functions (RU-18/
 * RU-19, ADR-003). AGRICULTOR is refused. No view here carries the identity
 * of the farmer who reported the product (E1-D5).
 */
@ApiTags("catalog identification")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@UseFilters(IdentificationExceptionFilter)
@Controller("catalog/identification-requests")
export class InstitutionalIdentificationController {
  constructor(private readonly identification: InstitutionalIdentificationUseCase) {}

  @Get(":id/candidates")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Hasta 5 productos de la misma dimensión parecidos por nombre o ingrediente (sólo sugerencia)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: candidateListSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "REQUEST_NOT_FOUND: inexistente o de otro tenant (indistinguibles).")
  candidates(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.identification.candidates(user.tenantId, id);
  }

  @Get(":id/history")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Eventos de la solicitud; actor sólo en decisiones institucionales" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: historySchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "REQUEST_NOT_FOUND.")
  history(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.identification.history(user.tenantId, id);
  }

  @Get(":id/photo")
  @ApiOperation({ summary: "Foto de la etiqueta (acceso autorizado; nunca una URL pública)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiProduces("image/jpeg", "image/png")
  @ApiResponse({
    status: 200,
    description:
      "Bytes verificados contra su SHA-256; cabeceras X-Content-SHA256, Content-Disposition inline y Cache-Control: private, no-store.",
    content: {
      "image/jpeg": { schema: { type: "string", format: "binary" } },
      "image/png": { schema: { type: "string", format: "binary" } },
    },
  })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "PHOTO_NOT_FOUND: sin foto, retirada, o solicitud de otro tenant (indistinguibles).")
  @error(500, "PHOTO_INTEGRITY_FAILED: el binario no coincide con su SHA-256; no se entrega.")
  @error(503, "PHOTO_STORAGE_UNAVAILABLE.")
  async photo(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Res() response: Response) {
    const photo = await this.identification.photo(user.tenantId, id);
    response.status(200);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", photo.contentType);
    response.setHeader("Content-Length", String(photo.content.length));
    response.setHeader("X-Content-SHA256", photo.sha256);
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${photo.contentType === "image/png" ? "etiqueta.png" : "etiqueta.jpg"}"`,
    );
    response.end(photo.content);
  }

  @Post(":id/link")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Vincular (o corregir el vínculo) a un producto existente, con confirmación y motivo" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, description: "changed=false si ya era el vínculo vigente.", schema: decisionSchema })
  @error(400, "PAYLOAD_INVALID.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "REQUEST_NOT_FOUND o PRODUCT_NOT_FOUND (inexistente o de otro tenant).")
  @error(422, "CONFIRMATION_REQUIRED, REASON_REQUIRED, PRODUCT_INACTIVE o UNIT_DIMENSION_MISMATCH.")
  link(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: LinkIdentificationDto) {
    return this.identification.link(user.tenantId, user.sub, id, dto);
  }

  @Post(":id/create-product")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Crear el producto colectivo (unidad de la solicitud) y vincularlo" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 201, schema: decisionSchema })
  @error(400, "PAYLOAD_INVALID: nombre de 2 a 160 caracteres.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "REQUEST_NOT_FOUND.")
  @error(409, "PRODUCT_NAME_TAKEN: ya existe un producto con ese nombre (sin distinguir mayúsculas); vincularlo en su lugar.")
  @error(422, "CONFIRMATION_REQUIRED o REASON_REQUIRED.")
  createProduct(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateIdentifiedProductDto,
  ) {
    return this.identification.createProduct(user.tenantId, user.sub, id, dto);
  }

  @Post(":id/defer")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Dejar pendiente por falta de información, con una nota" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: decisionSchema })
  @error(400, "PAYLOAD_INVALID.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "REQUEST_NOT_FOUND.")
  @error(409, "REQUEST_ALREADY_LINKED: un vínculo se corrige, no se deshace (E1-P3).")
  @error(422, "CONFIRMATION_REQUIRED o REASON_REQUIRED.")
  defer(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: DeferIdentificationDto) {
    return this.identification.defer(user.tenantId, user.sub, id, dto);
  }
}
