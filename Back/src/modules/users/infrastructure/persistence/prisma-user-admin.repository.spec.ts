import { UserRole } from '@prisma/client';
import { UserAuditTrail } from '../../domain/ports/user-admin.repository.port';
import { PrismaUserAdminRepository } from './prisma-user-admin.repository';

describe('PrismaUserAdminRepository', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const user = {
    id: userId,
    tenantId,
    name: 'Juan Perez',
    email: 'juan@example.test',
    role: UserRole.AGRICULTOR,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2026-09-23T00:00:00.000Z'),
    updatedAt: new Date('2026-09-23T00:00:00.000Z'),
  };
  const created: UserAuditTrail = {
    actorUserId: 'admin-1',
    entries: [{ action: 'CREAR', event: 'USER_CREATED', summary: 'Cuenta creada.', after: { role: 'AGRICULTOR' } }],
  };

  it('creates User and Member inside the same Prisma transaction', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue(user) },
      member: { create: jest.fn().mockResolvedValue({ id: 'member-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaUserAdminRepository(prisma as never);

    await expect(
      repository.createWithMember({
        tenantId,
        name: user.name,
        email: user.email,
        passwordHash: 'password-hash',
        role: user.role,
      }, created),
    ).resolves.toEqual(user);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.member.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        userId,
        role: UserRole.AGRICULTOR,
        isActive: true,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        actorUserId: 'admin-1',
        ownerUserId: null,
        action: 'CREAR',
        entityName: 'User',
        entityId: userId,
        summary: 'Cuenta creada.',
        after: { role: 'AGRICULTOR' },
        metadata: { event: 'USER_CREATED' },
      },
    });
  });

  it('propagates a Member failure from the transaction instead of returning a partial User', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue(user) },
      member: {
        create: jest.fn().mockRejectedValue(new Error('member write failed')),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaUserAdminRepository(prisma as never);

    await expect(
      repository.createWithMember({
        tenantId,
        name: user.name,
        email: user.email,
        passwordHash: 'password-hash',
        role: user.role,
      }, created),
    ).rejects.toThrow('member write failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('scopes the User mutation by id and tenant and mirrors role and state to Member', async () => {
    const updated = { ...user, role: UserRole.DIRECTIVA, isActive: false };
    const tx = {
      member: {
        findUnique: jest.fn().mockResolvedValue({ id: 'member-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(updated),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaUserAdminRepository(prisma as never);

    await expect(
      repository.updateWithMember(
        userId,
        tenantId,
        { role: UserRole.DIRECTIVA, isActive: false },
        {
          actorUserId: 'admin-1',
          entries: [
            { action: 'ACTUALIZAR', event: 'USER_ROLE_CHANGED', summary: 'Rol cambiado.', before: { role: 'AGRICULTOR' }, after: { role: 'DIRECTIVA' } },
            { action: 'INACTIVAR', event: 'USER_DEACTIVATED', summary: 'Cuenta desactivada.', before: { isActive: true }, after: { isActive: false } },
          ],
        },
      ),
    ).resolves.toEqual(updated);

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: userId, tenantId },
      data: { role: UserRole.DIRECTIVA, isActive: false },
    });
    expect(tx.member.update).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId, userId } },
      data: { role: UserRole.DIRECTIVA, isActive: false },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    expect(tx.auditLog.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        tenantId,
        actorUserId: 'admin-1',
        ownerUserId: null,
        action: 'ACTUALIZAR',
        entityName: 'User',
        entityId: userId,
        before: { role: 'AGRICULTOR' },
        after: { role: 'DIRECTIVA' },
        metadata: { event: 'USER_ROLE_CHANGED' },
      }),
    });
    expect(tx.auditLog.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ action: 'INACTIVAR', metadata: { event: 'USER_DEACTIVATED' } }),
    });
  });

  it('resets the password hash and writes its entry in one transaction, without the hash', async () => {
    const tx = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaUserAdminRepository(prisma as never);

    await repository.updatePasswordHash(userId, tenantId, 'password-hash', {
      actorUserId: 'admin-1',
      entries: [{ action: 'OTRO', event: 'USER_PASSWORD_RESET', summary: 'Contraseña restablecida.' }],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { id: userId, tenantId }, data: { passwordHash: 'password-hash' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        actorUserId: 'admin-1',
        ownerUserId: null,
        action: 'OTRO',
        entityName: 'User',
        entityId: userId,
        summary: 'Contraseña restablecida.',
        metadata: { event: 'USER_PASSWORD_RESET' },
      },
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain('password-hash');
  });

  it('writes no entry when the tenant-scoped password update finds no account', async () => {
    const tx = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaUserAdminRepository(prisma as never);

    await expect(
      repository.updatePasswordHash(userId, 'other-tenant', 'password-hash', {
        actorUserId: 'admin-1',
        entries: [{ action: 'OTRO', event: 'USER_PASSWORD_RESET', summary: 'Contraseña restablecida.' }],
      }),
    ).rejects.toThrow();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
