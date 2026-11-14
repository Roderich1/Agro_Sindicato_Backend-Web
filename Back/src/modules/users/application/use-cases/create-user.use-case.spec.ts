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
      useCase.execute(tenantId, 'admin-1', {
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

    expect(repo.createWithMember).toHaveBeenCalledWith(
      {
        tenantId,
        name: 'Juan Perez',
        email: 'juan@example.test',
        passwordHash: 'password-hash',
        role: UserRole.AGRICULTOR,
      },
      {
        actorUserId: 'admin-1',
        entries: [
          {
            action: 'CREAR',
            event: 'USER_CREATED',
            summary: 'Cuenta de «Juan Perez» creada con el rol Agricultor.',
            after: { name: 'Juan Perez', role: UserRole.AGRICULTOR, isActive: true },
          },
        ],
      },
    );
  });

  it('records the creation in the Bitácora without the password, its hash or the e-mail (RF-02, RF-25)', async () => {
    const repo = repository();
    repo.findByEmail.mockResolvedValue(null);
    repo.createWithMember.mockResolvedValue({
      id: 'user-2',
      tenantId,
      name: 'Ana Rojas',
      email: 'ana@example.test',
      role: UserRole.DIRECTIVA,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-09-23T00:00:00.000Z'),
      updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    });
    jest.mocked(bcrypt.hash).mockResolvedValue('password-hash' as never);
    const useCase = new CreateUserUseCase(repo);

    await useCase.execute(tenantId, 'admin-1', {
      name: 'Ana Rojas',
      email: 'ana@example.test',
      password: 'Secreta-Sintetica-1',
      role: UserRole.DIRECTIVA,
    });

    const audit = repo.createWithMember.mock.calls[0]![1];
    expect(audit.actorUserId).toBe('admin-1');
    expect(audit.entries.map((entry) => entry.event)).toEqual(['USER_CREATED']);
    const written = JSON.stringify(audit);
    expect(written).not.toContain('Secreta-Sintetica-1');
    expect(written).not.toContain('password-hash');
    expect(written).not.toContain('ana@example.test');
  });

  it('does not hide a Member write failure', async () => {
    const repo = repository();
    repo.findByEmail.mockResolvedValue(null);
    repo.createWithMember.mockRejectedValue(new Error('member write failed'));
    jest.mocked(bcrypt.hash).mockResolvedValue('password-hash' as never);
    const useCase = new CreateUserUseCase(repo);

    await expect(
      useCase.execute(tenantId, 'admin-1', {
        name: 'Juan Perez',
        email: 'juan@example.test',
        password: 'Password123!',
        role: UserRole.AGRICULTOR,
      }),
    ).rejects.toThrow('member write failed');
  });
});
