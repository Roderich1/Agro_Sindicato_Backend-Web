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

  async createWithMember(data: CreateUserData): Promise<AdminUserView> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: data.tenantId,
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role,
        },
        select: SELECT_ADMIN_USER,
      });

      await tx.member.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          role: user.role,
          isActive: user.isActive,
        },
      });

      return user;
    });
  }

  async updateWithMember(id: string, tenantId: string, data: UpdateUserData): Promise<AdminUserView> {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({
        where: { tenantId_userId: { tenantId, userId: id } },
        select: { id: true },
      });
      if (!member) {
        throw new Error('No existe la membership esperada para el usuario y tenant.');
      }

      const result = await tx.user.updateMany({
        where: { id, tenantId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
      if (result.count !== 1) {
        throw new Error('La actualización tenant-scoped no encontró exactamente un usuario.');
      }

      if (data.role !== undefined || data.isActive !== undefined) {
        await tx.member.update({
          where: { tenantId_userId: { tenantId, userId: id } },
          data: {
            ...(data.role !== undefined ? { role: data.role } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          },
        });
      }

      const user = await tx.user.findFirst({
        where: { id, tenantId },
        select: SELECT_ADMIN_USER,
      });
      if (!user) {
        throw new Error('El usuario actualizado no pudo recuperarse en el tenant.');
      }

      return user;
    });
  }

  async updatePasswordHash(id: string, tenantId: string, passwordHash: string): Promise<void> {
    const result = await this.prisma.user.updateMany({
      where: { id, tenantId },
      data: { passwordHash },
    });
    if (result.count !== 1) {
      throw new Error('La actualización tenant-scoped no encontró exactamente un usuario.');
    }
  }
}
