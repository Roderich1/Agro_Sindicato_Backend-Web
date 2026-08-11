import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AgrochemicalApplicationStatus,
  CalendarEventStatus,
  CalendarEventType,
  CampaignStatus,
  CropAssignmentStatus,
  Prisma,
  StockMovementReasonType,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { ApplicationsUseCase } from './applications.use-case';

describe('ApplicationsUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const campaignId = 'campaign-1';
  const plotId = 'plot-1';
  const cropId = 'crop-1';
  const productId = 'product-1';
  const lotId = 'lot-1';
  const applicationId = 'application-1';

  function createUseCase(tx: Record<string, unknown>, context: Record<string, unknown> = {}) {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
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
      useCase: new ApplicationsUseCase(prisma as never, campaignContext as never),
    };
  }

  function assignment() {
    return {
      id: 'assignment-1',
      tenantId,
      campaignId,
      plotId,
      cropId,
      ownerUserId: userId,
      status: CropAssignmentStatus.ACTIVO,
      plot: { id: plotId, name: 'Campo Norte', ownerUserId: userId },
      crop: { id: cropId, name: 'Soya' },
    };
  }

  function application(overrides: Record<string, unknown> = {}) {
    return {
      id: applicationId,
      tenantId,
      campaignId,
      ownerUserId: userId,
      appliedById: userId,
      plotId,
      cropId,
      plotCropAssignmentId: 'assignment-1',
      productId,
      inventoryLotId: null,
      quantity: new Prisma.Decimal(2),
      dose: null,
      targetPest: null,
      weatherConditions: null,
      responsibleName: null,
      notes: null,
      status: AgrochemicalApplicationStatus.REGISTRADA,
      appliedAt: new Date('2026-05-10T08:00:00.000Z'),
      createdAt: new Date('2026-05-10T08:00:00.000Z'),
      updatedAt: new Date('2026-05-10T08:00:00.000Z'),
      campaign: { id: campaignId, name: 'Invierno 2026', status: CampaignStatus.ABIERTA, isActive: true },
      plot: { id: plotId, name: 'Campo Norte', location: null },
      crop: { id: cropId, name: 'Soya', variety: null },
      product: { id: productId, name: 'Glifosato', unit: 'L', toxicologicalCategory: null },
      inventoryLot: null,
      owner: { id: userId, name: 'Agricultor', email: 'agri@example.com' },
      appliedBy: { id: userId, name: 'Agricultor', email: 'agri@example.com' },
      ...overrides,
    };
  }

  it('registers an application, discounts stock and creates a stock exit movement', async () => {
    const quantity = new Prisma.Decimal(2);
    const lot = {
      id: lotId,
      warehouseId: null,
      currentQuantity: new Prisma.Decimal(5),
      product: { id: productId, name: 'Glifosato', unit: 'L' },
      warehouse: null,
    };
    const movement = {
      id: 'movement-1',
      ownerUserId: userId,
      campaignId,
      type: StockMovementType.SALIDA,
      reasonType: StockMovementReasonType.APLICACION,
      quantity,
      reason: 'Aplicacion en parcela Campo Norte',
      occurredAt: new Date('2026-05-10T08:00:00.000Z'),
      createdAt: new Date('2026-05-10T08:00:00.000Z'),
      product: { id: productId, name: 'Glifosato', unit: 'L' },
      inventoryLot: { id: lotId, lotNumber: 'LOTE-1', expirationDate: null },
      warehouse: null,
      user: { id: userId, name: 'Agricultor', email: 'agri@example.com' },
    };
    const tx = {
      plotCropAssignment: { findFirst: jest.fn().mockResolvedValue(assignment()) },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: productId, name: 'Glifosato', unit: 'L', isActive: true }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryLot: {
        findMany: jest.fn().mockResolvedValue([lot]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      agrochemicalApplication: {
        create: jest.fn().mockResolvedValue(application()),
      },
      stockMovement: { create: jest.fn().mockResolvedValue(movement) },
      calendarEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const { campaignContext, useCase } = createUseCase(tx);

    await expect(
      useCase.create(tenantId, { userId, role: UserRole.AGRICULTOR }, {
        campaignId,
        plotId,
        productId,
        quantity: 2,
        appliedAt: '2026-05-10T08:00:00.000Z',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        application: expect.objectContaining({ id: applicationId, campaignId }),
        movements: [expect.objectContaining({ type: StockMovementType.SALIDA, reasonType: StockMovementReasonType.APLICACION })],
      }),
    );

    expect(campaignContext.resolveCampaignForOperation).toHaveBeenCalledWith(tenantId, campaignId, tx);
    expect(tx.inventoryLot.updateMany).toHaveBeenCalledWith({
      where: {
        id: lotId,
        tenantId,
        ownerUserId: userId,
        currentQuantity: { gte: quantity },
      },
      data: { currentQuantity: { decrement: quantity } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId,
        applicationId,
        type: StockMovementType.SALIDA,
        reasonType: StockMovementReasonType.APLICACION,
      }),
      include: { product: true, inventoryLot: true, warehouse: true, user: true },
    });
    expect(tx.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: CalendarEventType.APLICACION,
        status: CalendarEventStatus.COMPLETADO,
        sourceEntityId: applicationId,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('does not apply agrochemical over another agriculturist plot', async () => {
    const tx = {
      plotCropAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      product: { findFirst: jest.fn() },
      inventoryLot: { findMany: jest.fn() },
      agrochemicalApplication: { create: jest.fn() },
    };
    const { useCase } = createUseCase(tx);

    await expect(
      useCase.create(tenantId, { userId, role: UserRole.AGRICULTOR }, {
        campaignId,
        plotId,
        productId,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.product.findFirst).not.toHaveBeenCalled();
    expect(tx.agrochemicalApplication.create).not.toHaveBeenCalled();
  });

  it('does not apply agrochemical in a closed campaign', async () => {
    const tx = {
      plotCropAssignment: { findFirst: jest.fn() },
      product: { findFirst: jest.fn() },
      agrochemicalApplication: { create: jest.fn() },
    };
    const { useCase } = createUseCase(tx, {
      resolveCampaignForOperation: jest
        .fn()
        .mockRejectedValue(new BadRequestException('La campana no esta abierta para registrar operaciones.')),
    });

    await expect(
      useCase.create(tenantId, { userId, role: UserRole.AGRICULTOR }, {
        campaignId,
        plotId,
        productId,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.plotCropAssignment.findFirst).not.toHaveBeenCalled();
    expect(tx.agrochemicalApplication.create).not.toHaveBeenCalled();
  });

  it('requires a cancellation reason', async () => {
    const { useCase } = createUseCase({});

    await expect(
      useCase.cancel(tenantId, { userId, role: UserRole.AGRICULTOR }, applicationId, '  '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
