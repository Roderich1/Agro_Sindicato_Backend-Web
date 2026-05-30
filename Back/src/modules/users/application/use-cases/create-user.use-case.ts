import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from '../dtos/create-user.dto';
import {
  USER_ADMIN_REPOSITORY,
  UserAdminRepositoryPort,
} from '../../domain/ports/user-admin.repository.port';
import { toUserResponse, UserResponse } from '../mappers/user.mapper';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY)
    private readonly repo: UserAdminRepositoryPort,
  ) {}

  async execute(tenantId: string, dto: CreateUserDto): Promise<UserResponse> {
    if (dto.role === UserRole.ADMINISTRADOR && dto.allowAdministrator !== true) {
      throw new ForbiddenException(
        'Para crear un usuario ADMINISTRADOR debe confirmarse explicitamente con allowAdministrator=true.',
      );
    }

    const existing = await this.repo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('El email ya esta registrado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const created = await this.repo.create({
      tenantId,
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role,
    });

    return toUserResponse(created);
  }
}
