import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, UseFilters } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "@/modules/iam/api/rest/decorators/current-user.decorator";
import { Roles } from "@/modules/iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "@/modules/iam/application/types/authenticated-principal.type";
import { ResponsibleSubstitutionUseCase } from "../../application/responsible-substitution.use-case";
import { InstitutionalActor } from "../../domain/call-error";
import { GrantSubstitutionDto, RevokeSubstitutionDto } from "./calls.dto";
import { CallsExceptionFilter } from "./calls-exception.filter";
import { callErrorSchema, substitutionPermissionsSchema } from "./calls-openapi.schemas";

const error = (status: number, description: string) => ApiResponse({ status, description, schema: callErrorSchema });

const actorOf = (user: AuthenticatedPrincipal): InstitutionalActor => ({ tenantId: user.tenantId, userId: user.sub });

/**
 * P-A A1 (§12): the tenant permission «Sustituir responsable». Any
 * DIRECTIVA/ADMINISTRADOR of the tenant reads who holds it (no farmer data);
 * only an eligible ADMINISTRADOR grants and revokes it, to concrete persons,
 * never to themselves nor to a whole role.
 */
@ApiTags("joint purchase calls")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@UseFilters(CallsExceptionFilter)
@Controller("joint-purchase-substitution-permissions")
export class SubstitutionPermissionsController {
  constructor(private readonly substitution: ResponsibleSubstitutionUseCase) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Quién tiene «Sustituir responsable» en el sindicato y el historial de concesiones y revocaciones" })
  @ApiResponse({ status: 200, schema: substitutionPermissionsSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  list(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.substitution.permissions(actorOf(user));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Conceder «Sustituir responsable» a una persona DIRECTIVA o ADMINISTRADOR habilitada del sindicato, distinta de quien concede, con motivo y confirmación (sólo una ADMINISTRADOR habilitada); idempotente",
  })
  @ApiResponse({ status: 200, schema: substitutionPermissionsSchema })
  @error(400, "PAYLOAD_INVALID.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o SUBSTITUTION_FORBIDDEN: no es una ADMINISTRADOR habilitada.")
  @error(422, "CONFIRMATION_REQUIRED, REASON_REQUIRED o GRANTEE_NOT_ELIGIBLE (sin distinguir el motivo; también a sí misma).")
  grant(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: GrantSubstitutionDto) {
    return this.substitution.grantPermission(actorOf(user), dto);
  }

  @Post("revoke")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Revocar «Sustituir responsable» (una ADMINISTRADOR habilitada) o renunciar al propio; idempotente" })
  @ApiResponse({ status: 200, schema: substitutionPermissionsSchema })
  @error(400, "PAYLOAD_INVALID.")
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR, o SUBSTITUTION_FORBIDDEN.")
  @error(422, "REASON_REQUIRED: motivo de más de 280 caracteres.")
  revoke(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: RevokeSubstitutionDto) {
    return this.substitution.revokePermission(actorOf(user), dto);
  }
}
