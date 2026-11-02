import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { CorrectClassificationDto, GenerateEstimationDto, ResultsQueryDto, RunsQueryDto } from "../../application/dto/estimation.dto";
import { EstimationClassificationsUseCase } from "../../application/estimation-classifications.use-case";
import { EstimationJobsUseCase } from "../../application/estimation-jobs.use-case";
import { EstimationReadsUseCase } from "../../application/estimation-reads.use-case";

const Invalid = (description: string) => ApiResponse({ status: 400, description });
const Unauthenticated = ApiResponse({ status: 401, description: "Sin sesión válida, o cuenta, Member o tenant inactivos" });
const Forbidden = ApiResponse({ status: 403, description: "Rol no admitido (RolesGuard global): no se ejecuta ni se registra nada" });
const PolicyPending = ApiResponse({ status: 409, description: "POLICY_PENDING: no hay política de divulgación en vigor; no se entrega ninguna cifra" });

/**
 * F12-EST-05 (#178): the INT-09 routes this stage implements
 * (F12_EST_01_ESTIMATION_CONTRACT §4; docs/api/openapi-f12-estimation.json is
 * the contract). Asking queues a job (202); the worker calculates it outside
 * the request. Reading runs and results applies the policy and the
 * permissions in force. There is no route that modifies or deletes a job, a
 * run or a result. Correcting a classification inserts a new version
 * (EST-D-14). Seasons, the first classification and its list, and the
 * download remain specified, not implemented here.
 */
@ApiTags("estimation")
@ApiBearerAuth()
@Controller("estimation")
export class EstimationController {
  constructor(
    private readonly jobs: EstimationJobsUseCase,
    private readonly reads: EstimationReadsUseCase,
    private readonly classifications: EstimationClassificationsUseCase,
  ) {}

  @Post("campaign-classifications/:campaignId/corrections")
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @HttpCode(201)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "EST-D-14: corregir la clasificación de una campaña con una versión nueva y su motivo" })
  @ApiResponse({ status: 201, description: "Versión nueva; las anteriores, y las series y ejecuciones que las usaron, no cambian" })
  @Invalid("Cuerpo inválido")
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "CAMPAIGN_NOT_FOUND, SEASON_NOT_FOUND o CLASSIFICATION_NOT_FOUND (inexistente o de otro sindicato)" })
  @ApiResponse({ status: 409, description: "CLASSIFICATION_STALE: la versión citada ya no es la vigente" })
  @ApiResponse({ status: 422, description: "CLASSIFICATION_UNCHANGED: la corrección no cambia la temporada" })
  correct(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Body() body: CorrectClassificationDto,
  ) {
    return this.classifications.correct(user, {
      campaignId,
      previousClassificationId: body.previous_classification_ref,
      seasonId: body.season_ref,
      reason: body.reason,
    });
  }

  @Get("campaign-classifications/:campaignId/history")
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Todas las versiones de la clasificación de una campaña, con sus motivos" })
  @ApiResponse({ status: 200, description: "Versiones, de la primera a la vigente" })
  @Invalid("Identificador inválido")
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "CAMPAIGN_NOT_FOUND" })
  history(@CurrentUser() user: AuthenticatedPrincipal, @Param("campaignId", new ParseUUIDPipe()) campaignId: string) {
    return this.classifications.history(user.tenantId, campaignId);
  }

  @Post("jobs")
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "CU-20: pedir la estimación de una campaña objetivo; se calcula por lotes" })
  @ApiResponse({ status: 200, description: "Repetición del mismo request_id con la misma petición: el mismo trabajo" })
  @ApiResponse({ status: 202, description: "Trabajo en cola (QUEUED)" })
  @Invalid("Cuerpo inválido, o más productos que ESTIMATION_MAX_PRODUCTS")
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "TARGET_CAMPAIGN_NOT_FOUND o PRODUCT_NOT_FOUND (inexistente o de otro sindicato)" })
  @ApiResponse({ status: 409, description: "REQUEST_ID_REUSED o POLICY_PENDING: no se encola nada" })
  @ApiResponse({ status: 422, description: "TARGET_CAMPAIGN_NOT_ELIGIBLE, TARGET_CAMPAIGN_NOT_CLASSIFIED o PRODUCT_NOT_ESTIMABLE" })
  async request(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body: GenerateEstimationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { created, job } = await this.jobs.request(user, {
      requestId: body.request_id,
      targetCampaignId: body.target_campaign_ref,
      ...(body.product_refs ? { productRefs: body.product_refs } : {}),
    });
    if (!created) response.status(200);
    return job;
  }

  @Get("jobs/:jobId")
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Estado operativo de un trabajo (sin cifras)" })
  @ApiResponse({ status: 200, description: "Trabajo" })
  @Invalid("Identificador inválido")
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "JOB_NOT_FOUND (inexistente o de otro sindicato)" })
  job(@CurrentUser() user: AuthenticatedPrincipal, @Param("jobId", new ParseUUIDPipe()) jobId: string) {
    return this.jobs.get(user.tenantId, jobId);
  }

  @Get("runs")
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Ejecuciones anteriores, de la más reciente a la más antigua, paginadas con un cursor opaco" })
  @ApiResponse({ status: 200, description: "Lista paginada" })
  @Invalid("Parámetros inválidos (limit fuera de 1 a 50, o un cursor que no emitió esta ruta)")
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "TARGET_CAMPAIGN_NOT_FOUND" })
  @PolicyPending
  runs(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: RunsQueryDto) {
    return this.reads.list(user.tenantId, {
      ...(query.target_campaign_ref ? { targetCampaignId: query.target_campaign_ref } : {}),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
  }

  @Get("runs/:runId")
  @Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Una ejecución con sus resultados, la serie y la vigencia derivada, con la política vigente" })
  @ApiResponse({ status: 200, description: "Ejecución conservada" })
  @Invalid("Identificador inválido")
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "RUN_NOT_FOUND (inexistente o de otro sindicato)" })
  @PolicyPending
  run(@CurrentUser() user: AuthenticatedPrincipal, @Param("runId", new ParseUUIDPipe()) runId: string) {
    return this.reads.run(user.tenantId, runId);
  }

  @Get("results")
  @Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "CU-21: resultados permitidos para la identidad y el ámbito, con vigencia derivada" })
  @ApiResponse({ status: 200, description: "Perfil INSTITUTIONAL o FARMER según el rol" })
  @Invalid("Parámetros inválidos")
  @Unauthenticated
  @Forbidden
  @ApiResponse({ status: 404, description: "TARGET_CAMPAIGN_NOT_FOUND" })
  @PolicyPending
  results(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ResultsQueryDto) {
    return this.reads.results(user, query.target_campaign_ref);
  }
}
