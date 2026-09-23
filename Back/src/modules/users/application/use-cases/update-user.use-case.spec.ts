import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UserAdminRepositoryPort } from '../../domain/ports/user-admin.repository.port';
import { UpdateUserUseCase } from './update-user.use-case';

describe('UpdateUserUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  function repository(): jest.Mocked<UserAdminRepositoryPort> {
    return {
      findByEmail: jest.fn(),
      findByIdInTenant: jest.fn(),
      listByTenant: jest.fn(),
      createWithMember: jest.fn(),
      updateWithMember: jest.fn(),
      updatePasswordHash: jest.fn(),
    };
  }

  function user(role: UserRole = UserRole.AGRICULTOR, isActive = true) {
    return {
      id: userId,
      tenantId,
      name: 'Juan Perez',
      email: 'juan@example.test',
      role,
      isActive,
      lastLoginAt: null,
      createdAt: new Date('2026-09-23T00:00:00.000Z'),
      updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    };
  }

  it('dual-writes role and active state through a tenant-scoped repository operation', async () => {
    const repo = repository();
    repo.findByIdInTenant.mockResolvedValue(user());
    repo.updateWithMember.mockResolvedValue(user(UserRole.DIRECTIVA, false));
    const useCase = new UpdateUserUseCase(repo);

    await expect(
      useCase.execute(tenantId, 'admin-1', userId, {
        role: UserRole.DIRECTIVA,
        isActive: false,
      }),
    ).resolves.toMatchObject({ role: UserRole.DIRECTIVA, isActive: false });

    expect(repo.updateWithMember).toHaveBeenCalledWith(userId, tenantId, {
      name: undefined,
      role: UserRole.DIRECTIVA,
      isActive: false,
    });
  });

  it('does not mutate a target that is absent from the authenticated tenant', async () => {
    const repo = repository();
    repo.findByIdInTenant.mockResolvedValue(null);
    const useCase = new UpdateUserUseCase(repo);

    await expect(
      useCase.execute(tenantId, 'admin-1', 'other-tenant-user', {
        role: UserRole.DIRECTIVA,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.updateWithMember).not.toHaveBeenCalled();
  });
});
