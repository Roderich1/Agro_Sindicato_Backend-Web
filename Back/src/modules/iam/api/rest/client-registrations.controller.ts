import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RegisterClientDto } from "../../application/dtos/register-client.dto";
import { AuthenticatedPrincipal } from "../../application/types/authenticated-principal.type";
import { ManageClientRegistrationsUseCase } from "../../application/use-cases/manage-client-registrations.use-case";
import { CurrentUser } from "./decorators/current-user.decorator";
import { clientRegistrationResponseSchema } from "./auth-openapi.schemas";

@ApiTags("auth clients")
@ApiBearerAuth()
@Controller("auth/clients")
export class ClientRegistrationsController {
  constructor(private readonly clients: ManageClientRegistrationsUseCase) {}

  @Post()
  @ApiResponse({ status: 201, description: "ClientRegistration propio creado; clientId no se almacena en claro.", schema: clientRegistrationResponseSchema })
  @ApiResponse({ status: 400, description: "clientId no es UUID v4 valido." })
  @ApiResponse({ status: 401, description: "Contexto invalido o inactivo." })
  @ApiResponse({ status: 409, description: "Registro de cliente en conflicto." })
  @ApiOperation({
    summary: "Registrar la identidad lógica de esta instalación",
  })
  register(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: RegisterClientDto) {
    return this.clients.register(user.sub, user.tenantId, dto.clientId);
  }

  @Get()
  @ApiResponse({ status: 200, description: "Registros de la membresia actual.", schema: { type: "array", items: clientRegistrationResponseSchema } })
  @ApiResponse({ status: 401, description: "Contexto invalido o inactivo." })
  @ApiOperation({
    summary: "Listar registros de cliente de la membership autenticada",
  })
  list(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.clients.list(user.sub, user.tenantId);
  }

  @Post(":id/revoke")
  @ApiResponse({ status: 201, description: "Registro propio revocado.", schema: clientRegistrationResponseSchema })
  @ApiResponse({ status: 400, description: "ID invalido." })
  @ApiResponse({ status: 401, description: "Contexto invalido o inactivo." })
  @ApiResponse({ status: 404, description: "Registro no visible." })
  @ApiOperation({ summary: "Revocar un registro de cliente propio" })
  revoke(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) registrationId: string,
  ) {
    return this.clients.revoke(user.sub, user.tenantId, registrationId);
  }
}
