import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "@/modules/iam/api/rest/decorators/public.decorator";
import { GetOperationUseCase } from "../../application/get-operation.use-case";
import { ListReferencesUseCase } from "../../application/list-references.use-case";
import { PushOperationUseCase } from "../../application/push-operation.use-case";
import { SyncV1HttpError } from "../../application/sync-v1-http-error";
import { validateEnvelope } from "../../domain/envelope";
import { SyncV1AuthGuard, SyncV1Request } from "./sync-v1-auth.guard";
import { readSyncV1Body } from "./sync-v1-body";
import { SyncV1ExceptionFilter } from "./sync-v1-exception.filter";
import {
  syncV1AckSchema,
  syncV1EnvelopeSchema,
  syncV1ErrorSchema,
  syncV1OperationViewSchema,
  syncV1ReferencesSchema,
} from "./sync-v1-openapi.schemas";

const error = (status: number, description: string) =>
  ApiResponse({ status, description, schema: syncV1ErrorSchema });

function contextOf(request: SyncV1Request) {
  if (!request.syncV1Context) throw new SyncV1HttpError(401, "AUTH_REQUIRED");
  return request.syncV1Context;
}

/**
 * Sync Contract v1 (F05-SYNC-04 #16, implemented by #17 and #106). The global
 * JWT guard is bypassed on purpose: `SyncV1AuthGuard` revalidates the full
 * Auth V2 context and answers with the contract's 401/403 bodies. The
 * contract version `sync/v1` is independent of the API prefix `api/v1`.
 */
@ApiTags("sync v1")
@ApiBearerAuth()
@Public()
@UseGuards(SyncV1AuthGuard)
@UseFilters(SyncV1ExceptionFilter)
@Controller("sync/v1")
export class SyncV1Controller {
  constructor(
    private readonly push: PushOperationUseCase,
    private readonly operations: GetOperationUseCase,
    private readonly references: ListReferencesUseCase,
  ) {}

  @Post("push")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Publicar, sustituir o cancelar una proyección mínima (una operación por request)" })
  @ApiBody({ schema: syncV1EnvelopeSchema })
  @ApiResponse({ status: 200, description: "ACK de una operación admitida (APPLIED, ALREADY_APPLIED, CONFLICT, REJECTED o RETRYABLE).", schema: syncV1AckSchema })
  @error(400, "JSON, estructura, enum, UUID o whitelist inválidos; batch; claves duplicadas.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Sesión, Member, registro de cliente o rol revocado, inactivo o no permitido.")
  @error(413, "Envelope mayor que el límite operativo.")
  @error(415, "Content-Type distinto de application/json UTF-8.")
  @error(422, "contractVersion distinto de 1.")
  @error(429, "Límite de solicitudes; respetar Retry-After.")
  @error(503, "Admisión cerrada o transitoriamente no disponible.")
  pushOperation(@Req() request: SyncV1Request) {
    const context = contextOf(request);
    const validation = validateEnvelope(readSyncV1Body(request));
    if (!validation.ok)
      throw new SyncV1HttpError(validation.status, validation.errorCode);
    return this.push.execute(context, validation.envelope);
  }

  @Get("operations/:operationId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Consultar el resultado y el estado causal de una operación propia" })
  @ApiResponse({ status: 200, description: "Resultado persistido; APPLIED se presenta como ALREADY_APPLIED.", schema: syncV1OperationViewSchema })
  @error(400, "operationId no es UUID v4 lowercase.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto revocado, inactivo o no permitido.")
  @error(404, "Operación ajena, inexistente o no visible (indistinguibles).")
  @error(422, "Registro de otra versión de contrato.")
  @error(429, "Límite de solicitudes; respetar Retry-After.")
  getOperation(
    @Req() request: SyncV1Request,
    @Param("operationId") operationId: string,
  ) {
    return this.operations.execute(contextOf(request), operationId);
  }

  @Get("references")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Referencias centrales de campañas y productos del tenant para vinculación móvil (F05-SYNC-07)" })
  @ApiResponse({ status: 200, description: "Whitelist cerrada; sin stock, fichas, notas ni usuarios.", schema: syncV1ReferencesSchema })
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto revocado, inactivo o sin rol AGRICULTOR.")
  @error(429, "Límite de solicitudes; respetar Retry-After.")
  listReferences(@Req() request: SyncV1Request) {
    return this.references.execute(contextOf(request));
  }
}
