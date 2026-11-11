import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "@/modules/iam/api/rest/decorators/public.decorator";
import { SyncV1AuthGuard, SyncV1Request } from "@/modules/sync-v1/api/rest/sync-v1-auth.guard";
import { FarmerParticipationUseCase } from "../../application/farmer-participation.use-case";
import { CallHttpError, FarmerContext } from "../../domain/call-error";
import { ConfirmParticipationDto, FarmerHistoryQueryDto, WithdrawParticipationDto } from "./calls.dto";
import { CallsExceptionFilter } from "./calls-exception.filter";
import { acceptedSchema, callErrorSchema, farmerHistorySchema, farmerListSchema } from "./calls-openapi.schemas";

const error = (status: number, description: string) => ApiResponse({ status, description, schema: callErrorSchema });

function farmerOf(request: SyncV1Request): FarmerContext {
  if (!request.syncV1Context) throw new CallHttpError(401, "AUTH_REQUIRED");
  return { tenantId: request.syncV1Context.tenantId, memberId: request.syncV1Context.memberId };
}

/**
 * E2 §4.2: the farmer's participation in joint purchase calls. A channel of
 * its own (not Sync v1, not `sync_outbox`) with the farmer authentication of
 * Sync v1: the global JWT guard is bypassed and `SyncV1AuthGuard` revalidates
 * the Member AGRICULTOR, its Auth V2 session and client registration on every
 * request. The farmer never sees another farmer's data.
 */
@ApiTags("joint purchase calls")
@ApiBearerAuth()
@Public()
@UseGuards(SyncV1AuthGuard)
@UseFilters(CallsExceptionFilter)
@Controller("me/joint-purchase-calls")
export class FarmerCallsController {
  constructor(private readonly farmer: FarmerParticipationUseCase) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Convocatorias OPEN del tenant y las CLOSED/CANCELLED recientes (180 días) en las que participó, con la participación propia y el número de anteriores (history.older_count)",
  })
  @ApiResponse({ status: 200, schema: farmerListSchema })
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Sesión, Member, registro de cliente o rol no permitido.")
  @error(429, "Límite de solicitudes.")
  list(@Req() request: SyncV1Request) {
    return this.farmer.list(farmerOf(request));
  }

  @Get("history")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Historial (E2-P2): convocatorias CLOSED/CANCELLED con participación propia terminadas antes de los 180 días, de la más reciente a la más antigua, con cursor opaco",
  })
  @ApiResponse({ status: 200, schema: farmerHistorySchema })
  @error(400, "PAYLOAD_INVALID: cursor no emitido por el servidor, limit fuera de 1–50 o parámetro desconocido.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Sesión, Member, registro de cliente o rol no permitido.")
  @error(429, "Límite de solicitudes.")
  history(@Req() request: SyncV1Request, @Query() query: FarmerHistoryQueryDto) {
    return this.farmer.history(farmerOf(request), { before: query.before, limit: query.limit });
  }

  @Put(":id/participation")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Confirmar o modificar la participación (idempotente por operation_id, ordenada por sequence); sin líneas = retiro",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({ type: ConfirmParticipationDto })
  @ApiResponse({ status: 200, description: "Aceptada (o reintento de una aceptada: la misma respuesta).", schema: acceptedSchema })
  @error(400, "PAYLOAD_INVALID: JSON, clave extra, operation_id, sequence o producto repetido.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto no permitido.")
  @error(404, "CALL_NOT_FOUND: inexistente o de otro tenant.")
  @error(
    409,
    "CALL_NOT_OPEN (reason DEADLINE_PASSED|CLOSED|CANCELLED|DRAFT), STALE_SEQUENCE (participation vigente), OPERATION_ID_REUSED o CONSENT_REQUIRED.",
  )
  @error(422, "PRODUCT_NOT_IN_CALL o QUANTITY_INVALID.")
  @error(429, "Límite de solicitudes.")
  confirm(@Req() request: SyncV1Request, @Param("id") id: string, @Body() body: ConfirmParticipationDto) {
    return this.farmer.confirm(farmerOf(request), id, body);
  }

  @Post(":id/participation/withdraw")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Retirar la participación (idempotente por operation_id, ordenada por sequence)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({ type: WithdrawParticipationDto })
  @ApiResponse({ status: 200, description: "Aceptada; participation null si no había participación.", schema: acceptedSchema })
  @error(400, "PAYLOAD_INVALID.")
  @error(401, "Credencial ausente, inválida o expirada.")
  @error(403, "Contexto no permitido.")
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "CALL_NOT_OPEN, STALE_SEQUENCE u OPERATION_ID_REUSED.")
  @error(429, "Límite de solicitudes.")
  withdraw(@Req() request: SyncV1Request, @Param("id") id: string, @Body() body: WithdrawParticipationDto) {
    return this.farmer.withdraw(farmerOf(request), id, body);
  }
}
