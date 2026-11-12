import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { ProposalEstimationLinkUseCase } from "../../application/proposal-estimation-link.use-case";
import {
  clearBodySchema,
  estimationLinkActionSchema,
  estimationLinkViewSchema,
  linkErrorSchema,
  prepareBodySchema,
  selectionBodySchema,
  selectionSchema,
} from "./proposal-estimation-link.schema";

const error = (status: number, description: string) => ApiResponse({ status, description, schema: linkErrorSchema });
const Unauthenticated = ApiResponse({ status: 401, description: "Sin credencial vigente" });
const Forbidden = ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" });
const NotFound = error(404, "PROPOSAL_NOT_FOUND: borrador inexistente o de otro tenant (indistinguibles)");

/**
 * E3 (docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md §4): the
 * consumption estimate fixed as a reference of a draft joint purchase
 * proposal, and the products chosen for a call. Roles of the draft
 * (DIRECTIVA, ADMINISTRADOR). The bodies are validated by the use case so
 * that they answer the contract's own codes. The F12 route (estimation
 * reference) does not change; its CSV export was withdrawn on 2026-11-12
 * (Excel is the only export).
 */
@ApiTags("collective")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller("collective")
export class ProposalEstimationLinkController {
  constructor(private readonly links: ProposalEstimationLinkUseCase) {}

  @Get("proposals/:proposalId/estimation-link")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Referencia de consumo estimado fijada en el borrador, por línea, con comparación y metadatos (sólo lee)" })
  @ApiResponse({ status: 200, schema: estimationLinkViewSchema })
  @Unauthenticated
  @Forbidden
  @NotFound
  view(@CurrentUser() user: AuthenticatedPrincipal, @Param("proposalId", new ParseUUIDPipe()) proposalId: string) {
    return this.links.view(user, proposalId);
  }

  @Post("proposals/:proposalId/estimation-link/prepare")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Obtener o actualizar la referencia: fija una ejecución compatible, reutiliza un trabajo en curso o encola uno; idempotente por request_id y serializada por borrador",
  })
  @ApiBody({ schema: prepareBodySchema })
  @ApiResponse({ status: 200, schema: estimationLinkActionSchema })
  @error(400, "PAYLOAD_INVALID")
  @Unauthenticated
  @Forbidden
  @NotFound
  @error(409, "POLICY_PENDING, REFERENCE_CHANGED (con view), REFERENCE_UP_TO_DATE (con view) o REQUEST_ID_REUSED")
  prepare(@CurrentUser() user: AuthenticatedPrincipal, @Param("proposalId", new ParseUUIDPipe()) proposalId: string, @Body() body: unknown) {
    return this.links.prepare(user, proposalId, body);
  }

  @Post("proposals/:proposalId/estimation-link/clear")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Quitar la referencia (un vínculo CLEAR): un trabajo en curso deja de tener efecto en el borrador" })
  @ApiBody({ schema: clearBodySchema })
  @ApiResponse({ status: 200, schema: estimationLinkActionSchema })
  @error(400, "PAYLOAD_INVALID")
  @Unauthenticated
  @Forbidden
  @NotFound
  @error(409, "REFERENCE_CHANGED (con view), REFERENCE_UP_TO_DATE (ya no hay referencia, con view) o REQUEST_ID_REUSED")
  clear(@CurrentUser() user: AuthenticatedPrincipal, @Param("proposalId", new ParseUUIDPipe()) proposalId: string, @Body() body: unknown) {
    return this.links.clear(user, proposalId, body);
  }

  @Get("proposals/:proposalId/selection")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Productos del borrador elegidos para una convocatoria (revisión 0 y lista vacía si nunca se eligió)" })
  @ApiResponse({ status: 200, schema: selectionSchema })
  @Unauthenticated
  @Forbidden
  @NotFound
  selection(@CurrentUser() user: AuthenticatedPrincipal, @Param("proposalId", new ParseUUIDPipe()) proposalId: string) {
    return this.links.selection(user, proposalId);
  }

  @Put("proposals/:proposalId/selection")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Guardar la selección con control optimista; cada cambio deja una entrada de bitácora" })
  @ApiBody({ schema: selectionBodySchema })
  @ApiResponse({ status: 200, schema: selectionSchema })
  @error(400, "PAYLOAD_INVALID")
  @Unauthenticated
  @Forbidden
  @NotFound
  @error(409, "SELECTION_STALE (con selection vigente)")
  @error(422, "PRODUCT_NOT_IN_PROPOSAL")
  putSelection(@CurrentUser() user: AuthenticatedPrincipal, @Param("proposalId", new ParseUUIDPipe()) proposalId: string, @Body() body: unknown) {
    return this.links.putSelection(user, proposalId, body);
  }
}
