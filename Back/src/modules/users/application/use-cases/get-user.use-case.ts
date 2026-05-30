import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  USER_ADMIN_REPOSITORY,
  UserAdminRepositoryPort,
} from '../../domain/ports/user-admin.repository.port';
import { toUserResponse, UserResponse } from '../mappers/user.mapper';

@Injectable()
export class GetUserUseCase {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY)
    private readonly repo: UserAdminRepositoryPort,
  ) {}

  async execute(tenantId: string, id: string): Promise<UserResponse> {
    const user = await this.repo.findByIdInTenant(id, tenantId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    return toUserResponse(user);
  }
}
