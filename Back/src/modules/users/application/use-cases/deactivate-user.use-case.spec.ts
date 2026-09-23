import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UserAdminRepositoryPort } from '../../domain/ports/user-admin.repository.port';
import { DeactivateUserUseCase } from './deactivate-user.use-case';

describe('DeactivateUserUseCase', () => {
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

  function user(isActive: boolean) {
    return {
      id: userId,
      tenantId,
      name: 'Juan Perez',
      email: 'juan@example.test',
      role: UserRole.AGRICULTOR,
      isActive,
      lastLoginAt: null,
      createdAt: new Date('2026-09-23T00:00:00.000Z'),
      updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    };
  }

  it('deactivates User and Member through the atomic tenant-scoped operation', async () => {
    const repo = repository();
    repo.findByIdInTenant.mockResolvedValue(user(true));
    repo.updateWithMember.mockResolvedValue(user(false));
    const useCase = new DeactivateUserUseCase(repo);

    await expect(useCase.execute(tenantId, 'admin-1', userId)).resolves.toMatchObject({
      id: userId,
      isActive: false,
    });
    expect(repo.updateWithMember).toHaveBeenCalledWith(userId, tenantId, {
      isActive: false,
    });
  });

  it('preserves the self-deactivation guard', async () => {
    const repo = repository();
    const useCase = new DeactivateUserUseCase(repo);

    await expect(useCase.execute(tenantId, userId, userId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.updateWithMember).not.toHaveBeenCalled();
  });

  it('preserves the double-deactivation guard', async () => {
    const repo = repository();
    repo.findByIdInTenant.mockResolvedValue(user(false));
    const useCase = new DeactivateUserUseCase(repo);

    await expect(useCase.execute(tenantId, 'admin-1', userId)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.updateWithMember).not.toHaveBeenCalled();
  });
});
