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

    expect(repo.updateWithMember).toHaveBeenCalledWith(
      userId,
      tenantId,
      { name: undefined, role: UserRole.DIRECTIVA, isActive: false },
      {
        actorUserId: 'admin-1',
        entries: [
          {
            action: 'ACTUALIZAR',
            event: 'USER_ROLE_CHANGED',
            summary: 'Rol de la cuenta de «Juan Perez» cambiado de Agricultor a Directiva.',
            before: { role: UserRole.AGRICULTOR },
            after: { role: UserRole.DIRECTIVA },
          },
          {
            action: 'INACTIVAR',
            event: 'USER_DEACTIVATED',
            summary: 'Cuenta de «Juan Perez» desactivada.',
            before: { isActive: true },
            after: { isActive: false },
          },
        ],
      },
    );
  });

  it('records a rename and a reactivation, and nothing for a value that does not change', async () => {
    const repo = repository();
    repo.findByIdInTenant.mockResolvedValue(user(UserRole.DIRECTIVA, false));
    repo.updateWithMember.mockResolvedValue({ ...user(UserRole.DIRECTIVA, true), name: 'Juan P. Perez' });
    const useCase = new UpdateUserUseCase(repo);

    await useCase.execute(tenantId, 'admin-1', userId, {
      name: 'Juan P. Perez',
      role: UserRole.DIRECTIVA,
      isActive: true,
    });

    const audit = repo.updateWithMember.mock.calls[0]![3];
    expect(audit.actorUserId).toBe('admin-1');
    expect(audit.entries).toEqual([
      {
        action: 'ACTUALIZAR',
        event: 'USER_UPDATED',
        summary: 'Nombre de la cuenta «Juan Perez» cambiado a «Juan P. Perez».',
        before: { name: 'Juan Perez' },
        after: { name: 'Juan P. Perez' },
      },
      {
        action: 'ACTUALIZAR',
        event: 'USER_REACTIVATED',
        summary: 'Cuenta de «Juan P. Perez» reactivada.',
        before: { isActive: false },
        after: { isActive: true },
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain('juan@example.test');
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
