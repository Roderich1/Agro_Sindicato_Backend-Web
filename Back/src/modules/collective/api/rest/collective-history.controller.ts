import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { CollectiveSealUseCase } from "../../application/collective-seal.use-case";
import { CollectiveTrendsUseCase, trendsCsv } from "../../application/collective-trends.use-case";
import { SealCampaignDto, TrendsQueryDto } from "../../application/dto/collective-seal.dto";
import { sealResultSchema, sealStateSchema, trendsSchema } from "./collective-openapi.schemas";

const Unauthenticated = ApiResponse({ status: 401, description: "Sin credencial vigente" });
const Forbidden = ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" });
const NotFound = ApiResponse({ status: 404, description: "Campaña inexistente o de otro tenant (indistinguibles)" });

/**
 * F07 (2026-10-23, F07_SEALED_HISTORY_CONTRACT): manual seal of a campaign's
 * collective version and the first trends query, for DIRECTIVA and
 * ADMINISTRADOR of the effective tenant (RU-18/RU-19, ADR-003). Role and
 * tenant are checked here, before anything says whether a campaign is sealed.
 */
@ApiTags("collective")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller("collective")
export class CollectiveHistoryController {
  constructor(
    private readonly seals: CollectiveSealUseCase,
    private readonly trends: CollectiveTrendsUseCase,
  ) {}

  @Get("campaigns/:campaignId/seal")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Estado del sellado y revisión previa (cobertura, datos aceptados hasta, conflictos y límites)" })
  @ApiResponse({ status: 200, schema: sealStateSchema })
  @Unauthenticated
  @Forbidden
  @NotFound
  state(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
  ) {
    return this.seals.state(user.tenantId, campaignId);
  }

  @Post("campaigns/:campaignId/seal")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Sellar la versión colectiva de una campaña cerrada (idempotente)" })
  @ApiResponse({ status: 200, schema: sealResultSchema, description: "created=false si ya estaba sellada" })
  @ApiResponse({ status: 400, description: "Body no válido" })
  @Unauthenticated
  @Forbidden
  @NotFound
  @ApiResponse({
    status: 409,
    description: "SEALING_DISABLED, POLICY_PENDING, CAMPAIGN_NOT_CLOSED o SEAL_REVIEW_STALE: no se escribe nada",
  })
  @ApiResponse({ status: 422, description: "CONFIRMATION_REQUIRED: no se escribe nada" })
  seal(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Body() body: SealCampaignDto,
  ) {
    return this.seals.seal(user.tenantId, { userId: user.sub, role: user.role }, campaignId, {
      confirmed: body.confirmed,
      reviewRef: body.review_ref,
    });
  }

  @Get("trends")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Tendencias descriptivas entre versiones selladas (sin sumas entre campañas)" })
  @ApiResponse({ status: 200, schema: trendsSchema })
  @Unauthenticated
  @Forbidden
  get(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: TrendsQueryDto) {
    return this.trends.execute(user.tenantId, query.projection_type ?? null);
  }

  @Get("trends.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="tendencias-colectivas.csv"')
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Las mismas tendencias como CSV, con la misma política" })
  @ApiProduces("text/csv")
  @ApiResponse({ status: 200, description: "CSV con los mismos estados y cifras que el JSON", schema: { type: "string" } })
  @Unauthenticated
  @Forbidden
  async csv(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: TrendsQueryDto) {
    return trendsCsv(await this.trends.execute(user.tenantId, query.projection_type ?? null));
  }
}
