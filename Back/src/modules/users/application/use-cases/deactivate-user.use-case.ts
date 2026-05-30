import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  USER_ADMIN_REPOSITORY,
  UserAdminRepositoryPort,
} from '../../domain/ports/user-admin.repository.port';
import { toUserResponse, UserResponse } from '../mappers/user.mapper';

@Injectable()
export class DeactivateUserUseCase {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY)
    private readonly repo: UserAdminRepositoryPort,
  ) {}

  async execute(
    tenantId: string,
    currentUserId: string,
    id: string,
  ): Promise<UserResponse> {
    if (id === currentUserId) {
      throw new ForbiddenException('No puede desactivarse a si mismo.');
    }

    const target = await this.repo.findByIdInTenant(id, tenantId);
    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (!target.isActive) {
      throw new BadRequestException('El usuario ya esta desactivado.');
    }

    const updated = await this.repo.update(id, { isActive: false });
    return toUserResponse(updated);
  }
}
