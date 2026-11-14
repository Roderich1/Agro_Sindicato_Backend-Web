import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import {
  AdminUserView,
  CreateUserData,
  UpdateUserData,
  UserAdminRepositoryPort,
  UserAuditTrail,
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

/** Entity name of the Bitácora entries for account changes (RF-02, RF-25). */
export const USER_AUDIT_ENTITY = 'User';

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

  async createWithMember(data: CreateUserData, audit: UserAuditTrail): Promise<AdminUserView> {
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
      await this.writeAudit(tx, user.tenantId, user.id, audit);

      return user;
    });
  }

  async updateWithMember(
    id: string,
    tenantId: string,
    data: UpdateUserData,
    audit: UserAuditTrail,
  ): Promise<AdminUserView> {
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
      await this.writeAudit(tx, tenantId, id, audit);

      return user;
    });
  }

  async updatePasswordHash(
    id: string,
    tenantId: string,
    passwordHash: string,
    audit: UserAuditTrail,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id, tenantId },
        data: { passwordHash },
      });
      if (result.count !== 1) {
        throw new Error('La actualización tenant-scoped no encontró exactamente un usuario.');
      }
      await this.writeAudit(tx, tenantId, id, audit);
    });
  }

  /**
   * Institutional entries (`ownerUserId: null`) of the account's tenant, in the
   * transaction of the change: no change without its entry, and no entry for a
   * change that did not happen.
   */
  private async writeAudit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    audit: UserAuditTrail,
  ): Promise<void> {
    for (const entry of audit.entries) {
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: audit.actorUserId,
          ownerUserId: null,
          action: entry.action,
          entityName: USER_AUDIT_ENTITY,
          entityId: userId,
          summary: entry.summary,
          ...(entry.before ? { before: entry.before } : {}),
          ...(entry.after ? { after: entry.after } : {}),
          metadata: { event: entry.event },
        },
      });
    }
  }
}
