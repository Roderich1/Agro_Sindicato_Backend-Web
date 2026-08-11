import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CampaignStatus, UserRole } from '@prisma/client';
import { CampaignContextService } from '../services/campaign-context.service';
import { CampaignManagementUseCase } from './campaign-management.use-case';

describe('CampaignManagementUseCase', () => {
  const tenantId = 'tenant-1';
  const actorUserId = 'user-1';
  const campaignId = 'campaign-1';

  function campaign(overrides: Record<string, unknown> = {}) {
    return {
      id: campaignId,
      tenantId,
      name: 'Invierno 2026',
      status: CampaignStatus.PLANIFICADA,
      isActive: false,
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      estimatedEndDate: null,
      closedAt: null,
      notes: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      _count: {
        plotCropAssignments: 0,
        purchases: 0,
        stockMovements: 0,
        agrochemicalApplications: 0,
        payableAccounts: 0,
      },
      ...overrides,
    };
  }

  function createUseCase(
    tx: Record<string, unknown>,
    context?: Partial<CampaignContextService>,
    prismaOverrides: Record<string, unknown> = {},
  ) {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
      ...prismaOverrides,
    };

    const campaignContext = {
      ensureNoOtherActiveCampaign: jest.fn(),
      ...context,
    };

    return {
      prisma,
      campaignContext,
      useCase: new CampaignManagementUseCase(prisma as never, campaignContext as never),
    };
  }

  it('lists tenant campaigns with summary', async () => {
    const prismaOverrides = {
      agriculturalCampaign: {
        findMany: jest.fn().mockResolvedValue([campaign()]),
      },
    };
    const { useCase } = createUseCase({}, undefined, prismaOverrides);

    await expect(useCase.listCampaigns(tenantId, { search: ' invierno ' })).resolves.toEqual([
      expect.objectContaining({
        id: campaignId,
        name: 'Invierno 2026',
        startDate: '2026-04-01T00:00:00.000Z',
        summary: expect.objectContaining({ purchases: 0 }),
      }),
    ]);

    expect(prismaOverrides.agriculturalCampaign.findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        name: { contains: 'invierno', mode: 'insensitive' },
      },
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
      include: expect.any(Object),
    });
  });

  it('returns the active campaign when it exists', async () => {
    const activeCampaign = campaign({
      status: CampaignStatus.ABIERTA,
      isActive: true,
    });
    const prismaOverrides = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(activeCampaign),
      },
    };
    const { useCase } = createUseCase({}, undefined, prismaOverrides);

    await expect(useCase.getActiveCampaign(tenantId)).resolves.toEqual(
      expect.objectContaining({
        id: campaignId,
        status: CampaignStatus.ABIERTA,
        isActive: true,
      }),
    );
  });

  it('creates a planned campaign and records audit', async () => {
    const createdCampaign = campaign();
    const tx = {
      agriculturalCampaign: {
        create: jest.fn().mockResolvedValue(createdCampaign),
      },
      auditLog: {
        create: jest.fn(),
      },
      calendarEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const { useCase } = createUseCase(tx);

    await expect(
      useCase.createCampaign(tenantId, actorUserId, UserRole.DIRECTIVA, {
        name: ' Invierno 2026 ',
        startDate: '2026-04-01',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: campaignId,
        name: 'Invierno 2026',
        status: CampaignStatus.PLANIFICADA,
        startDate: '2026-04-01T00:00:00.000Z',
        summary: expect.objectContaining({ plotCropAssignments: 0 }),
      }),
    );

    expect(tx.agriculturalCampaign.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        name: 'Invierno 2026',
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        estimatedEndDate: null,
        notes: null,
        createdById: actorUserId,
      },
      include: expect.any(Object),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('rejects campaign management for agriculturists', async () => {
    const tx = {};
    const { useCase } = createUseCase(tx);

    await expect(
      useCase.createCampaign(tenantId, actorUserId, UserRole.AGRICULTOR, {
        name: 'Invierno 2026',
        startDate: '2026-04-01',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates an editable campaign and records audit', async () => {
    const existingCampaign = campaign({ _count: undefined });
    const updatedCampaign = campaign({ name: 'Verano 2026', notes: 'Nueva planificacion' });
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(existingCampaign),
        update: jest.fn().mockResolvedValue(updatedCampaign),
      },
      auditLog: {
        create: jest.fn(),
      },
      calendarEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const { useCase } = createUseCase(tx);

    await expect(
      useCase.updateCampaign(tenantId, actorUserId, UserRole.DIRECTIVA, campaignId, {
        name: ' Verano 2026 ',
        notes: ' Nueva planificacion ',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: campaignId,
        name: 'Verano 2026',
        notes: 'Nueva planificacion',
      }),
    );

    expect(tx.agriculturalCampaign.update).toHaveBeenCalledWith({
      where: { id: campaignId },
      data: {
        name: 'Verano 2026',
        notes: 'Nueva planificacion',
      },
      include: expect.any(Object),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ACTUALIZAR',
        entityName: 'AgriculturalCampaign',
      }),
    });
  });

  it('opens a campaign when no other active campaign exists', async () => {
    const existingCampaign = campaign({ _count: undefined });
    const openedCampaign = {
      ...campaign(),
      status: CampaignStatus.ABIERTA,
      isActive: true,
    };
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(existingCampaign),
        update: jest.fn().mockResolvedValue(openedCampaign),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const { campaignContext, useCase } = createUseCase(tx);

    await expect(
      useCase.openCampaign(tenantId, actorUserId, UserRole.ADMINISTRADOR, campaignId),
    ).resolves.toEqual(
      expect.objectContaining({
        id: campaignId,
        status: CampaignStatus.ABIERTA,
        isActive: true,
      }),
    );

    expect(campaignContext.ensureNoOtherActiveCampaign).toHaveBeenCalledWith(
      tenantId,
      campaignId,
      tx,
    );
    expect(tx.agriculturalCampaign.update).toHaveBeenCalledWith({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.ABIERTA,
        isActive: true,
      },
      include: expect.any(Object),
    });
  });

  it('rejects opening a second active campaign', async () => {
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(campaign({ _count: undefined })),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const { useCase } = createUseCase(tx, {
      ensureNoOtherActiveCampaign: jest
        .fn()
        .mockRejectedValue(new BadRequestException('Ya existe una campana activa.')),
    });

    await expect(
      useCase.openCampaign(tenantId, actorUserId, UserRole.ADMINISTRADOR, campaignId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.agriculturalCampaign.update).not.toHaveBeenCalled();
  });

  it('closes an open active campaign', async () => {
    const openCampaign = campaign({
      status: CampaignStatus.ABIERTA,
      isActive: true,
      _count: undefined,
    });
    const closedCampaign = {
      ...campaign(),
      status: CampaignStatus.CERRADA,
      isActive: false,
      closedAt: new Date('2026-08-31T00:00:00.000Z'),
      closedById: actorUserId,
    };
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(openCampaign),
        update: jest.fn().mockResolvedValue(closedCampaign),
      },
      auditLog: {
        create: jest.fn(),
      },
      calendarEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const { useCase } = createUseCase(tx);

    await expect(
      useCase.closeCampaign(tenantId, actorUserId, UserRole.DIRECTIVA, campaignId),
    ).resolves.toEqual(
      expect.objectContaining({
        id: campaignId,
        status: CampaignStatus.CERRADA,
        isActive: false,
        closedAt: '2026-08-31T00:00:00.000Z',
      }),
    );

    expect(tx.agriculturalCampaign.update).toHaveBeenCalledWith({
      where: { id: campaignId },
      data: expect.objectContaining({
        status: CampaignStatus.CERRADA,
        isActive: false,
        closedById: actorUserId,
      }),
      include: expect.any(Object),
    });
    expect(tx.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        campaignId,
        type: 'CIERRE_CAMPANA',
        status: 'COMPLETADO',
        sourceEntity: 'AgriculturalCampaign',
        sourceEntityId: campaignId,
      }),
    });
  });

  it('rejects closing a campaign that is not open and active', async () => {
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(campaign({
          status: CampaignStatus.CERRADA,
          isActive: false,
          _count: undefined,
        })),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const { useCase } = createUseCase(tx);

    await expect(
      useCase.closeCampaign(tenantId, actorUserId, UserRole.DIRECTIVA, campaignId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.agriculturalCampaign.update).not.toHaveBeenCalled();
  });
});
