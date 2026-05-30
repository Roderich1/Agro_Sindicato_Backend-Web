import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ResetUserPasswordDto } from '../dtos/reset-user-password.dto';
import {
  USER_ADMIN_REPOSITORY,
  UserAdminRepositoryPort,
} from '../../domain/ports/user-admin.repository.port';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class ResetUserPasswordUseCase {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY)
    private readonly repo: UserAdminRepositoryPort,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    dto: ResetUserPasswordDto,
  ): Promise<void> {
    const target = await this.repo.findByIdInTenant(id, tenantId);
    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.repo.updatePasswordHash(id, passwordHash);
  }
}
