import { Inject, Injectable } from '@nestjs/common';
import {
  USER_ADMIN_REPOSITORY,
  UserAdminRepositoryPort,
} from '../../domain/ports/user-admin.repository.port';
import { toUserResponse, UserResponse } from '../mappers/user.mapper';

@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY)
    private readonly repo: UserAdminRepositoryPort,
  ) {}

  async execute(tenantId: string): Promise<UserResponse[]> {
    const users = await this.repo.listByTenant(tenantId);
    return users.map(toUserResponse);
  }
}
