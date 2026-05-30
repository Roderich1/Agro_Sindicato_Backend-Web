import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { USER_REPOSITORY, UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { AuthResponseDto } from '../dtos/auth-response.dto';

@Injectable()
export class GetMeUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(userId: string): Promise<AuthResponseDto['user']> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant,
    };
  }
}
