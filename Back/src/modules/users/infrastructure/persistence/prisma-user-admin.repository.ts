import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import {
  AdminUserView,
  CreateUserData,
  UpdateUserData,
  UserAdminRepositoryPort,
} from '../../domain/ports/user-admin.repository.port';

const SELECT_ADMIN_USER = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaUserAdminRepository implements UserAdminRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<AdminUserView | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: SELECT_ADMIN_USER,
    });
  }

  async findByIdInTenant(id: string, tenantId: string): Promise<AdminUserView | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: SELECT_ADMIN_USER,
    });
    return user;
  }

  async listByTenant(tenantId: string): Promise<AdminUserView[]> {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: SELECT_ADMIN_USER,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: CreateUserData): Promise<AdminUserView> {
    return this.prisma.user.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
      },
      select: SELECT_ADMIN_USER,
    });
  }

  async update(id: string, data: UpdateUserData): Promise<AdminUserView> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      select: SELECT_ADMIN_USER,
    });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }
}
