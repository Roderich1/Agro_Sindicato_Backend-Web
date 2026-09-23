import { UserRole } from '@prisma/client';
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

  it('creates User and Member inside the same Prisma transaction', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue(user) },
      member: { create: jest.fn().mockResolvedValue({ id: 'member-1' }) },
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
      }),
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
  });

  it('propagates a Member failure from the transaction instead of returning a partial User', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue(user) },
      member: {
        create: jest.fn().mockRejectedValue(new Error('member write failed')),
      },
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
      }),
    ).rejects.toThrow('member write failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaUserAdminRepository(prisma as never);

    await expect(
      repository.updateWithMember(userId, tenantId, {
        role: UserRole.DIRECTIVA,
        isActive: false,
      }),
    ).resolves.toEqual(updated);

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: userId, tenantId },
      data: { role: UserRole.DIRECTIVA, isActive: false },
    });
    expect(tx.member.update).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId, userId } },
      data: { role: UserRole.DIRECTIVA, isActive: false },
    });
  });
});
