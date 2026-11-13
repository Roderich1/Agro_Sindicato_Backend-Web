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
import { ResponsibleSubstitutionUseCase } from "../../application/responsible-substitution.use-case";
import { InstitutionalActor } from "../../domain/call-error";
import {
  CancelCallDto,
  ConfirmActionDto,
  CreateCallDto,
  GrantCollaboratorDto,
  ListCallsQueryDto,
  PatchCallDto,
  ReviewDelegationDto,
  RevokeCollaboratorDto,
  SubstituteResponsibleDto,
} from "./calls.dto";
import { CallsExceptionFilter } from "./calls-exception.filter";
import {
  callDetailSchema,
  callErrorSchema,
  callSummaryListSchema,
  closingSchema,
  collaboratorsSchema,
  eligibleResponsiblesSchema,
  participantsSchema,
} from "./calls-openapi.schemas";

const error = (status: number, description: string) => ApiResponse({ status, description, schema: callErrorSchema });

const actorOf = (user: AuthenticatedPrincipal): InstitutionalActor => ({ tenantId: user.tenantId, userId: user.sub });

const MANAGE_OR_FALLBACK =
  "Rol distinto de DIRECTIVA o ADMINISTRADOR, o MANAGE_FORBIDDEN: ni responsable ni MANAGE vigente (N2 rechazada; la salida es la sustitución de P-A, §12).";

/**
 * E2 §4.1: joint purchase calls of the Directiva of the effective tenant; its
 * ADMINISTRADOR holds the Directiva functions (RU-18/RU-19). AGRICULTOR is
 * refused (403). Another tenant's call is 404. E4 §2: the identified
 * participants are consulted only by an eligible ADMINISTRADOR, for the
 * participations whose consent covers `ADMINISTRATION`.
 */
@ApiTags("joint purchase calls")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@UseFilters(CallsExceptionFilter)
@Controller("joint-purchase-calls")
export class InstitutionalCallsController {
  constructor(
    private readonly calls: InstitutionalCallsUseCase,
    private readonly substitution: ResponsibleSubstitutionUseCase,
  ) {}

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
  @ApiOperation({
    summary:
      "Detalle: productos con referencia, totales según §10.3, historial, can_view_participants, can_manage, my_grants y collaborator_count",
  })
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
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o MANAGE_FORBIDDEN: ni responsable ni permiso MANAGE (§10.2).")
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
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o MANAGE_FORBIDDEN: ni responsable ni permiso MANAGE (§10.2).")
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
  @error(403, MANAGE_OR_FALLBACK)
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
  @error(403, MANAGE_OR_FALLBACK)
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "INVALID_TRANSITION (con status): DRAFT o CANCELLED.")
  @error(422, "CONFIRMATION_REQUIRED.")
  close(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: ConfirmActionDto) {
    return this.calls.close(actorOf(user), id, dto);
  }

  @Get(":id/participants")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "E4 §3.1: participantes identificados vigentes, sólo para una ADMINISTRADOR habilitada y sólo los de alcance ADMINISTRATION; los demás como conteo (pending_consent_count); provisional mientras OPEN",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: participantsSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o PARTICIPANTS_FORBIDDEN: no es una ADMINISTRADOR habilitada (también la Directiva responsable).")
  @error(404, "CALL_NOT_FOUND.")
  participants(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.calls.participants(actorOf(user), id);
  }

  @Get(":id/closing")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Consolidado al cierre (cantidades solicitadas): totales según la regla T (E4 §5.2) y detalle por persona sólo para una ADMINISTRADOR habilitada (alcance ADMINISTRATION)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: closingSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "CALL_NOT_CLOSED (con status).")
  closing(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.calls.closingView(actorOf(user), id);
  }

  @Get(":id/collaborators")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Colaboradores MANAGE vigentes, permisos de visualización retirados (sólo historia) y el historial de concesiones y revocaciones; sin datos de agricultores",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: collaboratorsSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(404, "CALL_NOT_FOUND.")
  collaborators(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string) {
    return this.calls.collaborators(actorOf(user), id);
  }

  @Post(":id/collaborators")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Conceder MANAGE a otro usuario institucional activo del tenant (sólo el responsable; DRAFT, OPEN o CLOSED); idempotente. PARTICIPANTS: 409 GRANT_RETIRED (E4)",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: collaboratorsSchema })
  @error(400, "PAYLOAD_INVALID: user_ref o grant inválidos.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o COLLABORATORS_FORBIDDEN: no es el responsable.")
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "GRANT_RETIRED (grant PARTICIPANTS, sin escribir nada) o INVALID_TRANSITION (con status): convocatoria cancelada.")
  @error(422, "CONFIRMATION_REQUIRED o COLLABORATOR_NOT_ELIGIBLE (sin distinguir el motivo).")
  grant(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: GrantCollaboratorDto) {
    return this.calls.grant(actorOf(user), id, dto);
  }

  @Post(":id/collaborators/revoke")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Revocar un MANAGE (el responsable) o renunciar al propio (el colaborador), en cualquier estado; idempotente; rige desde la petición siguiente. PARTICIPANTS: 409 GRANT_RETIRED (la fila se conserva como historia)",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: collaboratorsSchema })
  @error(400, "PAYLOAD_INVALID.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o COLLABORATORS_FORBIDDEN.")
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "GRANT_RETIRED: grant PARTICIPANTS.")
  @error(422, "COLLABORATOR_NOT_ELIGIBLE: los permisos del responsable no se revocan.")
  revoke(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: RevokeCollaboratorDto) {
    return this.calls.revoke(actorOf(user), id, dto);
  }

  @Post(":id/collaborators/review")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "P-A §12: la responsable actual revisa una delegación de una versión anterior de la responsabilidad: CONFIRM la concede otra vez con la versión vigente; RETIRE la retira",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: collaboratorsSchema })
  @error(400, "PAYLOAD_INVALID.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o COLLABORATORS_FORBIDDEN: no es la responsable habilitada.")
  @error(404, "CALL_NOT_FOUND.")
  @error(409, "GRANT_RETIRED (grant PARTICIPANTS), DELEGATION_NOT_PENDING (no hay esa delegación pendiente de revisión) o INVALID_TRANSITION (confirmar en una cancelada).")
  @error(422, "COLLABORATOR_NOT_ELIGIBLE: la persona ya no está habilitada (sólo se puede retirar).")
  review(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: ReviewDelegationDto) {
    return this.calls.reviewDelegation(actorOf(user), id, dto);
  }

  @Post(":id/responsible")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "E4 §6.3 (P-A B1): una ADMINISTRADOR habilitada, sin permiso adicional, sustituye a una responsable que ya no está habilitada, con motivo y confirmación; en DRAFT, OPEN o CLOSED (no reabre ni cambia nada más); idempotente por request_id",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: callDetailSchema })
  @error(400, "PAYLOAD_INVALID: request_id, expected_responsible_version o new_responsible_ref inválidos.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o SUBSTITUTION_FORBIDDEN: no es una ADMINISTRADOR habilitada (una Directiva, aunque tuviera un permiso concedido antes).")
  @error(404, "CALL_NOT_FOUND.")
  @error(
    409,
    "INVALID_TRANSITION (cancelada), RESPONSIBLE_CHANGED (con responsible_version: otra sustitución ganó), RESPONSIBLE_STILL_ELIGIBLE (la responsable sigue habilitada) o REQUEST_ID_REUSED.",
  )
  @error(422, "CONFIRMATION_REQUIRED, REASON_REQUIRED o SUCCESSOR_NOT_ELIGIBLE (sin distinguir el motivo).")
  substitute(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string, @Body() dto: SubstituteResponsibleDto) {
    return this.substitution.substitute(actorOf(user), id, dto);
  }
}
