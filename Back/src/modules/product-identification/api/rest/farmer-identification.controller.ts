import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Put,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { Public } from "@/modules/iam/api/rest/decorators/public.decorator";
import { SyncV1AuthGuard, SyncV1Request } from "@/modules/sync-v1/api/rest/sync-v1-auth.guard";
import {
  FarmerIdentificationUseCase,
  PHOTO_CONTENT_TYPE,
} from "../../application/farmer-identification.use-case";
import { InstitutionalIdentificationUseCase } from "../../application/institutional-identification.use-case";
import { FarmerContext, IdentificationHttpError } from "../../domain/identification-error";
import { ListIdentificationRequestsQueryDto, UpsertIdentificationRequestDto } from "./identification.dto";
import { IdentificationExceptionFilter } from "./identification-exception.filter";
import { IdentificationListAuthGuard, IdentificationListRequest } from "./identification-list-auth.guard";
import {
  farmerRequestSchema,
  identificationErrorSchema,
  identificationListSchema,
} from "./identification-openapi.schemas";

const error = (status: number, description: string) =>
  ApiResponse({ status, description, schema: identificationErrorSchema });

function farmerOf(request: SyncV1Request): FarmerContext {
  if (!request.syncV1Context) throw new IdentificationHttpError(401, "AUTH_REQUIRED");
  return { tenantId: request.syncV1Context.tenantId, memberId: request.syncV1Context.memberId };
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

/**
 * E1 §4.1 (E1-D2): the farmer reports a local product for identification.
 * A channel apart from Sync v1 with the same farmer authentication: the
 * global JWT guard is bypassed and `SyncV1AuthGuard` revalidates the Member
 * AGRICULTOR, its Auth V2 session and client registration on every request.
 * `GET /` is shared with the Directiva/Administrador (see
 * `IdentificationListAuthGuard`).
 */
@ApiTags("catalog identification")
@ApiBearerAuth()
@Public()
@UseFilters(IdentificationExceptionFilter)
@Controller("catalog/identification-requests")
export class FarmerIdentificationController {
  constructor(
    private readonly farmer: FarmerIdentificationUseCase,
    private readonly institutional: InstitutionalIdentificationUseCase,
  ) {}

  @Get()
  @UseGuards(IdentificationListAuthGuard)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Agricultor: sus solicitudes (sin parámetros). Directiva/Administrador: las del tenant por estado, por fecha de recepción ascendente",
  })
  @ApiResponse({ status: 200, schema: identificationListSchema })
  @error(400, "Parámetro de consulta inválido (el agricultor no envía ninguno).")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto no permitido: ni agricultor con instalación vigente ni Directiva/Administrador.")
  @error(429, "Límite de solicitudes.")
  async list(@Req() request: IdentificationListRequest, @Query() query: ListIdentificationRequestsQueryDto) {
    if (request.syncV1Context) {
      if (Object.keys(request.query ?? {}).length > 0) throw new IdentificationHttpError(400, "PAYLOAD_INVALID");
      return this.farmer.listOwn(farmerOf(request));
    }
    if (!request.user) throw new IdentificationHttpError(401, "AUTH_REQUIRED");
    return this.institutional.list(request.user.tenantId, query.status ?? "PENDING");
  }

  @Put(":requestId")
  @UseGuards(SyncV1AuthGuard)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Crear o reenviar una solicitud de identificación (idempotente por request_id)" })
  @ApiParam({ name: "requestId", format: "uuid", description: "UUID v4 en minúsculas generado por el teléfono" })
  @ApiBody({ type: UpsertIdentificationRequestDto })
  @ApiResponse({ status: 201, description: "Solicitud creada.", schema: farmerRequestSchema })
  @ApiResponse({
    status: 200,
    description: "Ya existía para este agricultor: estado vigente (actualizada si estaba PENDING y cambió nombre, ingrediente o consentimiento).",
    schema: farmerRequestSchema,
  })
  @error(400, "PAYLOAD_INVALID: JSON, clave extra, longitudes o request_id inválidos.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Sesión, Member, registro de cliente o rol no permitido.")
  @error(409, "UNIT_IMMUTABLE: cambio de unidad. REQUEST_ID_CONFLICT: request_id de otro agricultor del tenant.")
  @error(422, "UNIT_UNSUPPORTED: unidad distinta de L o KG.")
  @error(429, "Límite de solicitudes.")
  async upsert(
    @Req() request: SyncV1Request,
    @Param("requestId") requestId: string,
    @Body() body: UpsertIdentificationRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.farmer.upsert(farmerOf(request), requestId, body);
    response.status(result.created ? 201 : 200);
    return result.view;
  }

  @Put(":requestId/photo")
  @UseGuards(SyncV1AuthGuard)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Subir o reemplazar la foto de la etiqueta (cuerpo binario, requiere consentimiento registrado)" })
  @ApiParam({ name: "requestId", format: "uuid" })
  @ApiHeader({ name: "Content-Length", required: true, description: "Obligatoria, como máximo 2097152" })
  @ApiHeader({ name: "X-Content-SHA256", required: true, description: "SHA-256 hex en minúsculas del cuerpo" })
  @ApiConsumes(PHOTO_CONTENT_TYPE)
  @ApiBody({ required: true, schema: { type: "string", format: "binary" } })
  @ApiResponse({ status: 201, description: "Foto almacenada (primera o reemplazo; la anterior se borra).", schema: farmerRequestSchema })
  @ApiResponse({ status: 200, description: "Mismo SHA-256 que la foto almacenada: nada se reescribe.", schema: farmerRequestSchema })
  @error(400, "PAYLOAD_INVALID: cabeceras inválidas o transferencia incompleta.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto no permitido.")
  @error(404, "REQUEST_NOT_FOUND: solicitud ajena o inexistente (indistinguibles).")
  @error(409, "PHOTO_CONSENT_REQUIRED: la solicitud no tiene consentimiento de foto.")
  @error(413, "IMAGE_TOO_LARGE: mayor que 2 MiB o sin Content-Length.")
  @error(415, "Content-Type distinto de application/octet-stream.")
  @error(
    422,
    "IMAGE_INVALID: no es JPEG/PNG por firma, cabecera ilegible o dimensiones fuera de [64, 4096]; o la decodificación completa falla (archivo truncado o corrupto, más de 4096 × 4096 píxeles, animado o de varias páginas, datos tras el marcador final, metadatos EXIF/XMP/IPTC, tipo o dimensiones distintos de la cabecera, más de 5 s). CONTENT_HASH_MISMATCH.",
  )
  @error(429, "Límite de solicitudes.")
  @error(503, "PHOTO_STORAGE_UNAVAILABLE: almacenamiento de fotos no configurado o no disponible.")
  async uploadPhoto(
    @Req() request: SyncV1Request,
    @Param("requestId") requestId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.farmer.storePhoto(
      farmerOf(request),
      requestId,
      {
        contentType: single(request.headers["content-type"]),
        contentLength: single(request.headers["content-length"]),
        sha256: single(request.headers["x-content-sha256"]),
      },
      request,
    );
    response.status(result.created ? 201 : 200);
    return result.view;
  }

  @Delete(":requestId/photo")
  @UseGuards(SyncV1AuthGuard)
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Retirar la foto (se borra el binario del servidor; idempotente)" })
  @ApiParam({ name: "requestId", format: "uuid" })
  @ApiResponse({ status: 204, description: "Sin foto almacenada." })
  @error(400, "request_id inválido.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto no permitido.")
  @error(404, "REQUEST_NOT_FOUND: solicitud ajena o inexistente.")
  @error(429, "Límite de solicitudes.")
  @error(503, "PHOTO_STORAGE_UNAVAILABLE.")
  async removePhoto(@Req() request: SyncV1Request, @Param("requestId") requestId: string) {
    await this.farmer.removePhoto(farmerOf(request), requestId);
  }
}
