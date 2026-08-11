import { BadRequestException, ConflictException } from '@nestjs/common';
import { CampaignStatus, CropAssignmentStatus, PlotStatus, UserRole } from '@prisma/client';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PlotFlowUseCase } from './plot-flow.use-case';

describe('PlotFlowUseCase', () => {
  const tenantId = 'tenant-1';
  const ownerUserId = 'user-1';
  const otherUserId = 'user-2';
  const plotId = 'plot-1';
  const cropId = 'crop-1';
  const campaignId = 'campaign-1';

  function plot(overrides: Record<string, unknown> = {}) {
    return {
      id: plotId,
      tenantId,
      ownerUserId,
      name: 'Campo Norte',
      location: null,
      area: 10,
      areaUnit: 'ha',
      status: PlotStatus.ACTIVA,
      notes: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      owner: { id: ownerUserId, name: 'Agricultor Uno', email: 'agri@example.com' },
      _count: { cropAssignments: 0, agrochemicalApplications: 0 },
      ...overrides,
    };
  }

  function crop(overrides: Record<string, unknown> = {}) {
    return {
      id: cropId,
      tenantId,
      name: 'Soya',
      variety: null,
      isActive: true,
      notes: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: { cropAssignments: 0, agrochemicalApplications: 0 },
      ...overrides,
    };
  }

  function assignment(overrides: Record<string, unknown> = {}) {
    return {
      id: 'assignment-1',
      tenantId,
      campaignId,
      plotId,
      cropId,
      ownerUserId,
      status: CropAssignmentStatus.ACTIVO,
      plantedArea: 10,
      plantedAt: null,
      changedAt: null,
      notes: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      campaign: { id: campaignId, name: 'Invierno 2026', status: CampaignStatus.ABIERTA, isActive: true },
      plot: { id: plotId, name: 'Campo Norte', status: PlotStatus.ACTIVA, area: 10, areaUnit: 'ha' },
      crop: { id: cropId, name: 'Soya', variety: null, isActive: true },
      owner: { id: ownerUserId, name: 'Agricultor Uno', email: 'agri@example.com' },
      ...overrides,
    };
  }

  function createUseCase(tx: Record<string, unknown>, prismaOverrides: Record<string, unknown> = {}, context = {}) {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
      ...prismaOverrides,
    };
    const campaignContext = {
      resolveCampaignForOperation: jest.fn().mockResolvedValue({
        id: campaignId,
        status: CampaignStatus.ABIERTA,
        isActive: true,
      }),
      ensureCampaignIsOpen: jest.fn((campaign) => {
        if (campaign.status !== CampaignStatus.ABIERTA || !campaign.isActive) {
          throw new BadRequestException('La campana no esta abierta para registrar operaciones.');
        }
      }),
      ...context,
    };

    return {
      prisma,
      campaignContext,
      useCase: new PlotFlowUseCase(prisma as never, campaignContext as never),
    };
  }

  it('only lists own plots for agriculturists', async () => {
    const prismaOverrides = {
      plot: {
        findMany: jest.fn().mockResolvedValue([plot()]),
      },
    };
    const { useCase } = createUseCase({}, prismaOverrides);

    await expect(
      useCase.listPlots(
        tenantId,
        { userId: ownerUserId, role: UserRole.AGRICULTOR },
        { ownerUserId: otherUserId },
      ),
    ).resolves.toEqual([expect.objectContaining({ id: plotId, ownerUserId })]);

    expect(prismaOverrides.plot.findMany).toHaveBeenCalledWith({
      where: { tenantId, ownerUserId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: expect.any(Object),
    });
  });

  it('allows directiva to list plots by tenant and owner filter', async () => {
    const prismaOverrides = {
      plot: {
        findMany: jest.fn().mockResolvedValue([plot()]),
      },
    };
    const { useCase } = createUseCase({}, prismaOverrides);

    await useCase.listPlots(
      tenantId,
      { userId: 'directiva-1', role: UserRole.DIRECTIVA },
      { ownerUserId },
    );

    expect(prismaOverrides.plot.findMany).toHaveBeenCalledWith({
      where: { tenantId, ownerUserId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: expect.any(Object),
    });
  });

  it('rejects duplicated plot name for the same agriculturist', async () => {
    const tx = {
      plot: {
        findFirst: jest.fn().mockResolvedValue(plot()),
        create: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const { useCase } = createUseCase(tx);

    await expect(
      useCase.createPlot(tenantId, { userId: ownerUserId, role: UserRole.AGRICULTOR }, {
        name: 'Campo Norte',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.plot.create).not.toHaveBeenCalled();
  });

  it('rejects assigning a crop when campaign is closed', async () => {
    const tx = {
      plot: { findFirst: jest.fn() },
      crop: { findFirst: jest.fn() },
      plotCropAssignment: { findUnique: jest.fn(), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const { useCase } = createUseCase(tx, {}, {
      resolveCampaignForOperation: jest
        .fn()
        .mockRejectedValue(new BadRequestException('La campana no esta abierta para registrar operaciones.')),
    });

    await expect(
      useCase.createAssignment(tenantId, { userId: ownerUserId, role: UserRole.AGRICULTOR }, {
        campaignId,
        plotId,
        cropId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.plotCropAssignment.create).not.toHaveBeenCalled();
  });

  it('creates one crop assignment for an active own plot and open campaign', async () => {
    const tx = {
      plot: { findFirst: jest.fn().mockResolvedValue(plot({ _count: undefined, owner: undefined })) },
      crop: { findFirst: jest.fn().mockResolvedValue(crop({ _count: undefined })) },
      plotCropAssignment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(assignment()),
      },
      auditLog: { create: jest.fn() },
    };
    const { campaignContext, useCase } = createUseCase(tx);

    await expect(
      useCase.createAssignment(tenantId, { userId: ownerUserId, role: UserRole.AGRICULTOR }, {
        campaignId,
        plotId,
        cropId,
        plantedArea: 10,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'assignment-1', plotId, cropId, campaignId }));

    expect(campaignContext.resolveCampaignForOperation).toHaveBeenCalledWith(tenantId, campaignId, tx);
    expect(tx.plotCropAssignment.findUnique).toHaveBeenCalledWith({
      where: { campaignId_plotId: { campaignId, plotId } },
    });
    expect(tx.plotCropAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        campaignId,
        plotId,
        cropId,
        ownerUserId,
        status: CropAssignmentStatus.ACTIVO,
      }),
      include: expect.any(Object),
    });
  });
});
