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
 * P-A A1 (§12) with E4 §3.2: the tenant permission «Sustituir responsable»
 * is retired (the eligible Administración substitutes by role). Any
 * DIRECTIVA/ADMINISTRADOR of the tenant reads its history (no farmer data);
 * granting and revoking answer 409 SUBSTITUTION_PERMISSION_RETIRED and write
 * nothing. The rows are kept.
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
  @ApiOperation({ summary: "E4: historia de sólo lectura de «Sustituir responsable» (ya no se usa: sustituye la Administración habilitada)" })
  @ApiResponse({ status: 200, schema: substitutionPermissionsSchema })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  list(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.substitution.permissions(actorOf(user));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "E4 §3.2: retirado. Siempre 409 SUBSTITUTION_PERMISSION_RETIRED; no escribe nada" })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(409, "SUBSTITUTION_PERMISSION_RETIRED.")
  grant(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: GrantSubstitutionDto) {
    return this.substitution.grantPermission(actorOf(user), dto);
  }

  @Post("revoke")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "E4 §3.2: retirado. Siempre 409 SUBSTITUTION_PERMISSION_RETIRED; las filas no se borran" })
  @error(401, "Sin credencial vigente.")
  @error(403, "Rol distinto de DIRECTIVA o ADMINISTRADOR.")
  @error(409, "SUBSTITUTION_PERMISSION_RETIRED.")
  revoke(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: RevokeSubstitutionDto) {
    return this.substitution.revokePermission(actorOf(user), dto);
  }
}
