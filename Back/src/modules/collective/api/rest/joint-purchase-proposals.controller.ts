import { Controller, Get, Header, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { JointPurchaseProposalUseCase } from "../../application/joint-purchase-proposal.use-case";
import { proposalListSchema, proposalSchema } from "./collective-openapi.schemas";

const Unauthenticated = ApiResponse({ status: 401, description: "Sin credencial vigente" });
const Forbidden = ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" });

/**
 * F07 #26/#27: draft joint purchase proposals for the Directiva of the
 * effective tenant and its ADMINISTRADOR (RU-18/RU-19, ADR-003). Drafts only:
 * human review, no purchase, lot, movement, debt or payment.
 */
@ApiTags("collective")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller("collective")
export class JointPurchaseProposalsController {
  constructor(private readonly proposals: JointPurchaseProposalUseCase) {}

  @Post("campaigns/:campaignId/proposals")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Generar un borrador de propuesta desde la necesidad declarada divulgada" })
  @ApiResponse({ status: 201, schema: proposalSchema })
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "Campaña inexistente o de otro tenant (indistinguibles)" })
  @ApiResponse({ status: 409, description: "POLICY_PENDING: sin divulgación autorizada no se genera ni guarda nada" })
  generate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
  ) {
    return this.proposals.generate(user.tenantId, user.sub, campaignId);
  }

  @Get("campaigns/:campaignId/proposals")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Historial de borradores de la campaña (sin cantidades)" })
  @ApiResponse({ status: 200, schema: proposalListSchema })
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "Campaña inexistente o de otro tenant (indistinguibles)" })
  list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
  ) {
    return this.proposals.list(user.tenantId, campaignId);
  }

  @Get("proposals/:proposalId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Detalle del borrador con la misma política que el resumen" })
  @ApiResponse({ status: 200, schema: proposalSchema })
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "Propuesta inexistente o de otro tenant (indistinguibles)" })
  get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("proposalId", new ParseUUIDPipe()) proposalId: string,
  ) {
    return this.proposals.view(user.tenantId, proposalId);
  }

  @Get("proposals/:proposalId/csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="propuesta-conjunta.csv"')
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "El mismo detalle como CSV, con la misma política" })
  @ApiProduces("text/csv")
  @ApiResponse({ status: 200, description: "CSV con los mismos estados que el JSON", schema: { type: "string" } })
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "Propuesta inexistente o de otro tenant (indistinguibles)" })
  csv(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("proposalId", new ParseUUIDPipe()) proposalId: string,
  ) {
    return this.proposals.csv(user.tenantId, proposalId);
  }
}
