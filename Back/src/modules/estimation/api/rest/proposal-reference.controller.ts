import { Controller, Get, Header, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { ProposalEstimationReferenceUseCase } from "../../application/proposal-reference.use-case";
import { proposalEstimationReferenceSchema } from "./proposal-reference.schema";

const Unauthenticated = ApiResponse({ status: 401, description: "Sin credencial vigente" });
const Forbidden = ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" });
const NotFound = ApiResponse({ status: 404, description: "Propuesta inexistente o de otro tenant (indistinguibles)" });

/**
 * F12-EST-08 (#181): the estimation reference next to a draft joint purchase
 * proposal, for the Directiva of the effective tenant and its
 * ADMINISTRADOR (the proposal's roles). Read-only: nothing is written, and the
 * draft, its lines and its fingerprint are not recalculated.
 */
@ApiTags("collective")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller("collective")
export class ProposalEstimationReferenceController {
  constructor(private readonly references: ProposalEstimationReferenceUseCase) {}

  @Get("proposals/:proposalId/estimation-reference")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Estimación del consumo como referencia separada del borrador (no se suma ni cambia sus líneas)" })
  @ApiResponse({
    status: 200,
    description: "Por línea: el resultado del mismo producto canónico y unidad para la campaña del borrador, con su ejecución, fecha y vigencia; o el motivo de su ausencia",
    schema: proposalEstimationReferenceSchema,
  })
  @Unauthenticated
  @Forbidden
  @NotFound
  reference(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("proposalId", new ParseUUIDPipe()) proposalId: string,
  ) {
    return this.references.reference(user, proposalId);
  }
}
