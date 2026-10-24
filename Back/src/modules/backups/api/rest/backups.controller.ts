import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
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
  ApiProduces,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { pipeline } from "node:stream/promises";
import { Public } from "@/modules/iam/api/rest/decorators/public.decorator";
import { BackupHttpError } from "../../application/backup-http-error";
import {
  BACKUP_CONTENT_TYPE,
  BackupsService,
  uploadHeadersOf,
} from "../../application/backups.service";
import { BackupsAuthGuard, BackupsRequest } from "./backups-auth.guard";
import { BackupsExceptionFilter } from "./backups-exception.filter";
import {
  backupErrorSchema,
  backupListSchema,
  backupViewSchema,
} from "./backups-openapi.schemas";

const error = (status: number, description: string) =>
  ApiResponse({ status, description, schema: backupErrorSchema });

function ownerOf(request: BackupsRequest) {
  if (!request.backupOwner) throw new BackupHttpError(401, "AUTH_REQUIRED");
  return request.backupOwner;
}

/**
 * F08-BKP-03 (#39): private backups of the authenticated farmer. The global
 * JWT guard is bypassed on purpose: `BackupsAuthGuard` revalidates the full
 * Auth V2 context of the mobile installation. Backup is not Sync (F06 §8):
 * no route here reads or writes Sync v1 or collective data.
 */
@ApiTags("me backups")
@ApiBearerAuth()
@Public()
@UseGuards(BackupsAuthGuard)
@UseFilters(BackupsExceptionFilter)
@Controller("me/backups")
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Listar los respaldos privados propios disponibles" })
  @ApiResponse({ status: 200, description: "Sólo copias AVAILABLE del Member autenticado.", schema: backupListSchema })
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Sesión, Member, registro de cliente o rol no permitido (Directiva/Administrador incluidos).")
  @error(429, "Límite de solicitudes.")
  @error(503, "Almacenamiento privado no configurado.")
  list(@Req() request: BackupsRequest) {
    return this.backups.list(ownerOf(request));
  }

  @Post()
  @HttpCode(201)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Subir un respaldo privado (cuerpo binario en streaming)" })
  @ApiHeader({ name: "X-Content-SHA256", required: true, description: "SHA-256 hex del cuerpo; el servidor lo recalcula en streaming." })
  @ApiHeader({ name: "X-Backup-Format-Version", required: true, description: "1 (contenedor sin cifrar, anterior; rechazado con BACKUP_REQUIRE_CLIENT_ENCRYPTION=true) o 2 (cifrado en el teléfono, F08-ADR-003). Otro valor: 422 BACKUP_FORMAT_INVALID." })
  @ApiHeader({ name: "X-Backup-Schema-Version", required: true, description: "Versión del esquema SQLite (entero >= 0)." })
  @ApiConsumes(BACKUP_CONTENT_TYPE)
  @ApiBody({ required: true, schema: { type: "string", format: "binary" } })
  @ApiResponse({ status: 201, description: "Copia verificada y disponible. Si el Member ya tenía BACKUP_MAX_ACTIVE_PER_MEMBER copias, en la misma transacción se retiran las más antiguas que sobran (dejan de listarse y de servirse); nunca antes de que esta quede verificada. BACKUP_QUOTA_EXCEEDED ya no se emite.", schema: backupViewSchema })
  @error(400, "Cabeceras inválidas, cuerpo vacío o transferencia incompleta.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto no permitido.")
  @error(409, "BACKUP_UPLOAD_IN_PROGRESS: otra subida del mismo Member sigue en curso.")
  @error(413, "Mayor que BACKUP_MAX_BYTES.")
  @error(415, "Content-Type distinto de application/octet-stream.")
  @error(422, "BACKUP_SHA256_MISMATCH: el SHA-256 recalculado no coincide con X-Content-SHA256. BACKUP_FORMAT_INVALID: formato desconocido o cuerpo sin la forma exterior de su formato (en el 2: cabecera, versión, algoritmo y longitud exacta; el contenido cifrado no se puede ni se intenta comprobar). BACKUP_ENCRYPTION_REQUIRED: formato 1 con BACKUP_REQUIRE_CLIENT_ENCRYPTION=true.")
  @error(429, "Límite de solicitudes.")
  @error(503, "Almacenamiento privado no disponible, o purgas de copias anteriores aún pendientes por encima del cupo del Member.")
  upload(@Req() request: BackupsRequest) {
    return this.backups.upload(ownerOf(request), uploadHeadersOf(request), request);
  }

  @Get(":id/content")
  @ApiOperation({ summary: "Descargar un respaldo propio (se verifica su integridad antes de enviarlo)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiProduces(BACKUP_CONTENT_TYPE)
  @ApiResponse({ status: 200, description: "Bytes de la copia; cabecera X-Content-SHA256.", content: { [BACKUP_CONTENT_TYPE]: { schema: { type: "string", format: "binary" } } } })
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto no permitido.")
  @error(404, "Copia ajena, inexistente, eliminada o id inválido (indistinguibles).")
  @error(429, "Límite de solicitudes.")
  @error(500, "La copia almacenada no coincide con su SHA-256: no se entrega.")
  @error(503, "Almacenamiento privado no disponible.")
  async download(
    @Req() request: BackupsRequest,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    const { view, stream } = await this.backups.download(ownerOf(request), id);
    response.status(200);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", BACKUP_CONTENT_TYPE);
    response.setHeader("Content-Length", String(view.sizeBytes));
    response.setHeader("X-Content-SHA256", view.sha256);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="agrocuentas-${view.id}.agrobackup"`,
    );
    try {
      await pipeline(stream, response);
    } catch {
      // Headers already sent: the truncated body fails the client's check.
      response.destroy();
    }
  }

  @Delete(":id")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Eliminar un respaldo propio (borrado lógico y del archivo)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 204, description: "Eliminado; deja de listarse y de servirse." })
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto no permitido.")
  @error(404, "Copia ajena, inexistente, ya eliminada o id inválido (indistinguibles).")
  @error(429, "Límite de solicitudes.")
  @error(503, "Almacenamiento privado no disponible.")
  async remove(@Req() request: BackupsRequest, @Param("id") id: string) {
    await this.backups.remove(ownerOf(request), id);
  }
}
