import { AuditAction, UserRole } from '@prisma/client';
import { ListAuditLogsUseCase } from './list-audit-logs.use-case';

describe('ListAuditLogsUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  function createUseCase(prismaOverrides: Record<string, unknown>) {
    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      ...prismaOverrides,
    };

    return {
      prisma,
      useCase: new ListAuditLogsUseCase(prisma as never),
    };
  }

  it('limits agriculturist audit query to own actor or owner logs', async () => {
    const { prisma, useCase } = createUseCase({});

    await useCase.execute(tenantId, userId, UserRole.AGRICULTOR, { ownerUserId: 'other-user' });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        OR: [{ ownerUserId: userId }, { actorUserId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: expect.any(Object),
    });
  });

  // F10-SEC-02 (#45): replaces "lets directiva filter by campaign, owner,
  // entity and action"; the owner filter exposed farmers' private entries.
  it('lets directiva filter institutional entries by campaign, entity and action, never by owner', async () => {
    const { prisma, useCase } = createUseCase({});

    await useCase.execute(tenantId, 'directiva-1', UserRole.DIRECTIVA, {
      campaignId: 'campaign-1',
      ownerUserId: userId,
      entityName: 'Plot',
      action: AuditAction.ACTUALIZAR,
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        ownerUserId: null,
        campaignId: 'campaign-1',
        action: AuditAction.ACTUALIZAR,
        entityName: 'Plot',
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: expect.any(Object),
    });
  });
});
