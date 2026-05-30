import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UpdateUserDto } from '../dtos/update-user.dto';
import {
  USER_ADMIN_REPOSITORY,
  UserAdminRepositoryPort,
} from '../../domain/ports/user-admin.repository.port';
import { toUserResponse, UserResponse } from '../mappers/user.mapper';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY)
    private readonly repo: UserAdminRepositoryPort,
  ) {}

  async execute(
    tenantId: string,
    currentUserId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponse> {
    if (dto.name === undefined && dto.role === undefined && dto.isActive === undefined) {
      throw new BadRequestException('Debe especificar al menos un campo a actualizar.');
    }

    const target = await this.repo.findByIdInTenant(id, tenantId);
    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (
      id === currentUserId &&
      dto.role !== undefined &&
      dto.role !== UserRole.ADMINISTRADOR &&
      target.role === UserRole.ADMINISTRADOR
    ) {
      throw new ForbiddenException('No puede degradar su propio rol de ADMINISTRADOR.');
    }

    if (id === currentUserId && dto.isActive === false) {
      throw new ForbiddenException('No puede desactivarse a si mismo.');
    }

    const updated = await this.repo.update(id, {
      name: dto.name,
      role: dto.role,
      isActive: dto.isActive,
    });

    return toUserResponse(updated);
  }
}
