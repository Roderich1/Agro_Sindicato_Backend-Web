import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserAdminRepositoryPort } from '../../domain/ports/user-admin.repository.port';
import { CreateUserUseCase } from './create-user.use-case';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

describe('CreateUserUseCase', () => {
  const tenantId = 'tenant-1';

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

  it('creates the compatible User and its Member through the atomic port operation', async () => {
    const repo = repository();
    repo.findByEmail.mockResolvedValue(null);
    repo.createWithMember.mockResolvedValue({
      id: 'user-1',
      tenantId,
      name: 'Juan Perez',
      email: 'juan@example.test',
      role: UserRole.AGRICULTOR,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-09-23T00:00:00.000Z'),
      updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    });
    jest.mocked(bcrypt.hash).mockResolvedValue('password-hash' as never);
    const useCase = new CreateUserUseCase(repo);

    await expect(
      useCase.execute(tenantId, {
        name: 'Juan Perez',
        email: 'juan@example.test',
        password: 'Password123!',
        role: UserRole.AGRICULTOR,
      }),
    ).resolves.toMatchObject({
      id: 'user-1',
      tenantId,
      role: UserRole.AGRICULTOR,
    });

    expect(repo.createWithMember).toHaveBeenCalledWith({
      tenantId,
      name: 'Juan Perez',
      email: 'juan@example.test',
      passwordHash: 'password-hash',
      role: UserRole.AGRICULTOR,
    });
  });

  it('does not hide a Member write failure', async () => {
    const repo = repository();
    repo.findByEmail.mockResolvedValue(null);
    repo.createWithMember.mockRejectedValue(new Error('member write failed'));
    jest.mocked(bcrypt.hash).mockResolvedValue('password-hash' as never);
    const useCase = new CreateUserUseCase(repo);

    await expect(
      useCase.execute(tenantId, {
        name: 'Juan Perez',
        email: 'juan@example.test',
        password: 'Password123!',
        role: UserRole.AGRICULTOR,
      }),
    ).rejects.toThrow('member write failed');
  });
});
