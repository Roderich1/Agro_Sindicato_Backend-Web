import { Controller, Get, Header, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { CollectiveSummaryUseCase, summaryCsv } from "../../application/collective-summary.use-case";
import { collectiveSummarySchema } from "./collective-openapi.schemas";

const Unauthenticated = ApiResponse({ status: 401, description: "Sin credencial vigente" });
const Forbidden = ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" });
const NotFound = ApiResponse({ status: 404, description: "Campaña inexistente o de otro tenant (indistinguibles)" });

/**
 * F06 #21: collective summary of a campaign for the Directiva of the
 * effective tenant (and its ADMINISTRADOR, RU-18). Both channels come from
 * the same use case, so the disclosure policy is the same for each.
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

  @Get(":campaignId/summary.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "El mismo consolidado como CSV, con la misma política" })
  @ApiProduces("text/csv")
  @ApiResponse({ status: 200, description: "CSV con las mismas decisiones que el JSON", schema: { type: "string" } })
  @Unauthenticated
  @Forbidden
  @NotFound
  async csv(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
  ) {
    return summaryCsv(await this.summary.execute(user.tenantId, campaignId));
  }
}
