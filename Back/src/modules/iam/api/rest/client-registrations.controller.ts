import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RegisterClientDto } from "../../application/dtos/register-client.dto";
import { JwtPayload } from "../../application/types/jwt-payload.type";
import { ManageClientRegistrationsUseCase } from "../../application/use-cases/manage-client-registrations.use-case";
import { CurrentUser } from "./decorators/current-user.decorator";

@ApiTags("auth clients")
@ApiBearerAuth()
@Controller("auth/clients")
export class ClientRegistrationsController {
  constructor(private readonly clients: ManageClientRegistrationsUseCase) {}

  @Post()
  @ApiOperation({
    summary: "Registrar la identidad lógica de esta instalación",
  })
  register(@CurrentUser() user: JwtPayload, @Body() dto: RegisterClientDto) {
    return this.clients.register(user.sub, user.tenantId, dto.clientId);
  }

  @Get()
  @ApiOperation({
    summary: "Listar registros de cliente de la membership autenticada",
  })
  list(@CurrentUser() user: JwtPayload) {
    return this.clients.list(user.sub, user.tenantId);
  }

  @Post(":id/revoke")
  @ApiOperation({ summary: "Revocar un registro de cliente propio" })
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param("id", new ParseUUIDPipe({ version: "4" })) registrationId: string,
  ) {
    return this.clients.revoke(user.sub, user.tenantId, registrationId);
  }
}
