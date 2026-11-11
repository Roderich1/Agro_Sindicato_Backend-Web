import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "@/modules/iam/api/rest/decorators/current-user.decorator";
import { Roles } from "@/modules/iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "@/modules/iam/application/types/authenticated-principal.type";
import { InstitutionalCallsUseCase } from "../../application/institutional-calls.use-case";
import { InstitutionalActor } from "../../domain/call-error";
import {
  CancelCallDto,
  ConfirmActionDto,
  CreateCallDto,
  ListCallsQueryDto,
  PatchCallDto,
} from "./calls.dto";
import { CallsExceptionFilter } from "./calls-exception.filter";
import {
  callDetailSchema,
  callErrorSchema,
  callSummaryListSchema,
  closingSchema,
  eligibleResponsiblesSchema,
  participantsSchema,
} from "./calls-openapi.schemas";

const error = (status: number, description: string) => ApiResponse({ status, description, schema: callErrorSchema });

const actorOf = (user: AuthenticatedPrincipal): InstitutionalActor => ({ tenantId: user.tenantId, userId: user.sub });

/**
 * E2 §4.1: joint purchase calls of the Directiva of the effective tenant; its
 * ADMINISTRADOR holds the Directiva functions (RU-18/RU-19). AGRICULTOR is
 * refused (403). Another tenant's call is 404. The identified participants
 * need the specific permission of E2-D6, which no role grants.
 */
@ApiTags("joint purchase calls")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@UseFilters(CallsExceptionFilter)
@Controller("joint-purchase-calls")
export class InstitutionalCallsController {
  constructor(private readonly calls: InstitutionalCallsUseCase) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Convocatorias del tenant (sin identidades de agricultores), las más recientes primero" })
  @ApiResponse({ status: 200, schema: callSummaryListSchema })
  @error(400, "PAYLOAD_INVALID: parámetro desconocido o estado inválido.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  list(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListCallsQueryDto) {
    return this.calls.list(actorOf(user), { campaignId: query.campaignId, status: query.status });
  }

  @Get("eligible-responsibles")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Usuarios DIRECTIVA o ADMINISTRADOR activos del tenant, elegibles como responsable (E2-D5)" })
  @ApiResponse({ status: 200, schema: eligibleResponsiblesSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  eligibleResponsibles(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.calls.eligibleResponsibles(actorOf(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Crear un borrador (DRAFT) con productos colectivos, fecha límite y responsable" })
  @ApiResponse({ status: 201, schema: callDetailSchema })
  @error(400, "PAYLOAD_INVALID: estructura, nombre (1–120) o fecha inválidos.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CAMPAIGN_NOT_FOUND, PRODUCT_NOT_FOUND o PROPOSAL_NOT_FOUND (inexistente o de otro tenant).")
  @error(
    422,
    "DEADLINE_IN_PAST, CAMPAIGN_NOT_ELIGIBLE, RESPONSIBLE_NOT_ELIGIBLE, PRODUCT_INACTIVE, PRODUCT_UNIT_UNSUPPORTED, PRODUCT_NOT_CANONICAL, PRODUCT_DUPLICATED o PROPOSAL_CAMPAIGN_MISMATCH.",
  )
  create(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateCallDto) {
    return this.calls.create(actorOf(user), dto);
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Detalle: productos con referencia, totales según E2-D7, historial y can_view_participants" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: callDetailSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CALL_NOT_FOUND: inexistente o de otro tenant.")
  detail(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.calls.detail(actorOf(user), id);
  }

  @Patch(":id")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Editar el borrador (sólo DRAFT): nombre, fecha límite, responsable, productos" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: callDetailSchema })
  @error(400, "PAYLOAD_INVALID.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CALL_NOT_FOUND, PRODUCT_NOT_FOUND o PROPOSAL_NOT_FOUND.")
  @error(409, "CALL_NOT_EDITABLE (con status): ya no está en DRAFT.")
  @error(422, "Las mismas validaciones que al crear.")
  patch(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: PatchCallDto) {
    return this.calls.patch(actorOf(user), id, dto);
  }

  @Post(":id/open")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Abrir (DRAFT → OPEN) con confirmación; crea el permiso del responsable (E2-D6)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: callDetailSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CALL_NOT_FOUND o PRODUCT_NOT_FOUND.")
  @error(409, "INVALID_TRANSITION (con status) o PRODUCT_IN_OPEN_CALL (E2-D3).")
  @error(
    422,
    "CONFIRMATION_REQUIRED, DEADLINE_IN_PAST, CAMPAIGN_NOT_ELIGIBLE, RESPONSIBLE_NOT_ELIGIBLE, PRODUCT_INACTIVE, PRODUCT_UNIT_UNSUPPORTED o PRODUCT_NOT_CANONICAL.",
  )
  open(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: ConfirmActionDto) {
    return this.calls.open(actorOf(user), id, dto);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Cancelar desde DRAFT u OPEN con motivo; libera los productos; idempotente desde CANCELLED" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: callDetailSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "INVALID_TRANSITION (con status): ya está CLOSED.")
  @error(422, "CONFIRMATION_REQUIRED o REASON_REQUIRED.")
  cancel(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: CancelCallDto) {
    return this.calls.cancel(actorOf(user), id, dto);
  }

  @Post(":id/close")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Cerrar (OPEN → CLOSED) con confirmación; corte = min(ahora, fecha límite); idempotente desde CLOSED",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, description: "El consolidado al cierre, como lo ve quien cierra.", schema: closingSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "INVALID_TRANSITION (con status): DRAFT o CANCELLED.")
  @error(422, "CONFIRMATION_REQUIRED.")
  close(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: ConfirmActionDto) {
    return this.calls.close(actorOf(user), id, dto);
  }

  @Get(":id/participants")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Participantes identificados vigentes: sólo con el permiso específico (E2-D6); provisional mientras OPEN",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: participantsSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o PARTICIPANTS_FORBIDDEN: sin el permiso específico.")
  @error(404, "CALL_NOT_FOUND.")
  participants(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.calls.participants(actorOf(user), id);
  }

  @Get(":id/closing")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Consolidado al cierre (cantidades solicitadas): totales según E2-D7; detalle sólo con permiso" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: closingSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "CALL_NOT_CLOSED (con status).")
  closing(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.calls.closingView(actorOf(user), id);
  }
}
