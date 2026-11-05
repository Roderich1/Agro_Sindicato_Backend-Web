import { Controller, Get, Header } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../../iam/api/rest/decorators/current-user.decorator";
import { Roles } from "../../../iam/api/rest/decorators/roles.decorator";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import { FarmerSyncStatusUseCase } from "../../application/farmer-sync-status.use-case";
import { farmerSyncStatusSchema } from "./collective-openapi.schemas";

/**
 * F07-WEB-03 (#25): read-only list of the linked farmers of the caller's
 * tenant with their latest accepted send, for DIRECTIVA and ADMINISTRADOR
 * (ADR-003). The tenant always comes from the credential, never from the
 * request.
 */
@ApiTags("collective")
@ApiBearerAuth()
@Roles(UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller("collective/farmers")
export class CollectiveFarmersController {
  constructor(private readonly status: FarmerSyncStatusUseCase) {}

  @Get("sync-status")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Agricultores vinculados y fecha de su último envío aceptado" })
  @ApiResponse({ status: 200, schema: farmerSyncStatusSchema })
  @ApiResponse({ status: 401, description: "Sin credencial vigente" })
  @ApiResponse({ status: 403, description: "Rol distinto de DIRECTIVA o ADMINISTRADOR" })
  get(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.status.execute(user.tenantId);
  }
}
