import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserAdminRepositoryPort } from '../../domain/ports/user-admin.repository.port';
import { ResetUserPasswordUseCase } from './reset-user-password.use-case';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

describe('ResetUserPasswordUseCase', () => {
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

  it('records only the fact of the reset, with its actor, never the value (RF-02, RF-25)', async () => {
    const repo = repository();
    repo.findByIdInTenant.mockResolvedValue({
      id: userId,
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
    const useCase = new ResetUserPasswordUseCase(repo);

    await useCase.execute(tenantId, 'admin-1', userId, { password: 'Secreta-Sintetica-2' });

    expect(repo.updatePasswordHash).toHaveBeenCalledWith(userId, tenantId, 'password-hash', {
      actorUserId: 'admin-1',
      entries: [
        {
          action: 'OTRO',
          event: 'USER_PASSWORD_RESET',
          summary: 'Contraseña de la cuenta de «Juan Perez» restablecida.',
        },
      ],
    });
    const audit = JSON.stringify(repo.updatePasswordHash.mock.calls[0]![3]);
    expect(audit).not.toContain('Secreta-Sintetica-2');
    expect(audit).not.toContain('password-hash');
    expect(audit).not.toContain('juan@example.test');
  });

  it('writes nothing for an account outside the tenant', async () => {
    const repo = repository();
    repo.findByIdInTenant.mockResolvedValue(null);
    const useCase = new ResetUserPasswordUseCase(repo);

    await expect(
      useCase.execute(tenantId, 'admin-1', 'other-tenant-user', { password: 'Secreta-Sintetica-2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.updatePasswordHash).not.toHaveBeenCalled();
  });
});
