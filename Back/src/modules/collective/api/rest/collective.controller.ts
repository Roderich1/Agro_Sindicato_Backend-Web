import { Controller, Get, Header, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { CollectiveSummaryUseCase } from "../../application/collective-summary.use-case";
import { collectiveSummarySchema } from "./collective-openapi.schemas";

const Unauthenticated = ApiResponse({ status: 401, description: "Sin credencial vigente" });
const Forbidden = ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" });
const NotFound = ApiResponse({ status: 404, description: "Campaña inexistente o de otro tenant (indistinguibles)" });

/**
 * F06 #21: collective summary of a campaign for the Directiva of the
 * effective tenant (and its ADMINISTRADOR, RU-18). The JSON is the only
 * channel: the Web builds the Excel export from it (2026-11-12, the CSV route
 * was withdrawn), so the export carries the same disclosure policy.
 */
@ApiTags("collective")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller("collective/campaigns")
export class CollectiveController {
  constructor(private readonly summary: CollectiveSummaryUseCase) {}

  @Get(":campaignId/summary")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Consolidado de la campaña (sin cifras mientras F07-POL-01 esté pendiente)" })
  @ApiResponse({ status: 200, schema: collectiveSummarySchema })
  @Unauthenticated
  @Forbidden
  @NotFound
  get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
  ) {
    return this.summary.execute(user.tenantId, campaignId);
  }
}
