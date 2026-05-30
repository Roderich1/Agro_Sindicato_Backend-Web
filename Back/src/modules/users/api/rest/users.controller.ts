import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import { CreateUserDto } from '../../application/dtos/create-user.dto';
import { ResetUserPasswordDto } from '../../application/dtos/reset-user-password.dto';
import { UpdateUserDto } from '../../application/dtos/update-user.dto';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from '../../application/use-cases/deactivate-user.use-case';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { ResetUserPasswordUseCase } from '../../application/use-cases/reset-user-password.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';

@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.ADMINISTRADOR)
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly getUserUseCase: GetUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly resetUserPasswordUseCase: ResetUserPasswordUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear un usuario en el tenant actual' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    this.logger.log(`[USERS CREATE] by=${user.sub} tenantId=${user.tenantId} role=${dto.role} email=${dto.email}`);
    return this.createUserUseCase.execute(user.tenantId, dto);
  }

  @Get()
  @Roles(UserRole.ADMINISTRADOR, UserRole.DIRECTIVA)
  @ApiOperation({ summary: 'Listar usuarios del tenant actual' })
  async list(@CurrentUser() user: JwtPayload) {
    return this.listUsersUseCase.execute(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario del tenant actual' })
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.getUserUseCase.execute(user.tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar nombre, rol o estado de un usuario' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    this.logger.log(`[USERS UPDATE] by=${user.sub} tenantId=${user.tenantId} targetId=${id}`);
    return this.updateUserUseCase.execute(user.tenantId, user.sub, id, dto);
  }

  @Patch(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Resetear la contrasena de un usuario' })
  async resetPassword(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    this.logger.log(`[USERS RESET_PASSWORD] by=${user.sub} tenantId=${user.tenantId} targetId=${id}`);
    await this.resetUserPasswordUseCase.execute(user.tenantId, id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar logicamente un usuario (isActive=false)' })
  async deactivate(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    this.logger.log(`[USERS DEACTIVATE] by=${user.sub} tenantId=${user.tenantId} targetId=${id}`);
    return this.deactivateUserUseCase.execute(user.tenantId, user.sub, id);
  }
}
