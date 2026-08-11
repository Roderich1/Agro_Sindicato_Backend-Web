import { BadRequestException } from '@nestjs/common';
import { CampaignStatus, Prisma, StockMovementReasonType } from '@prisma/client';
import { StockEntryReason } from '../dto/register-stock-entry.dto';
import { InventoryStockUseCase } from './inventory-stock.use-case';

describe('InventoryStockUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const productId = 'product-1';
  const lotId = 'lot-1';
  const campaignId = 'campaign-1';

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
      requireActiveCampaign: jest.fn().mockResolvedValue({
        id: campaignId,
        status: CampaignStatus.ABIERTA,
        isActive: true,
      }),
      ...context,
    };

    return {
      campaignContext,
      useCase: new InventoryStockUseCase(prisma as never, campaignContext as never),
    };
  }

  it('registers a simple entry with the active campaign and reason type', async () => {
    const quantity = new Prisma.Decimal(10);
    const product = {
      id: productId,
      tenantId,
      name: 'Glifosato',
      unit: 'L',
      activeIngredient: null,
      category: null,
    };
    const lot = {
      id: lotId,
      tenantId,
      ownerUserId: userId,
      campaignId,
      productId,
      warehouseId: null,
      lotNumber: 'LOTE-1',
      expirationDate: null,
      initialQuantity: quantity,
      currentQuantity: quantity,
      receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      product: {
        ...product,
        minimumStock: new Prisma.Decimal(0),
        expirationWarningDays: 90,
      },
      warehouse: null,
    };
    const movement = {
      id: 'movement-1',
      ownerUserId: userId,
      campaignId,
      type: 'ENTRADA',
      reasonType: StockMovementReasonType.ENTRADA_SIMPLE,
      quantity,
      reason: 'ENTRADA_SIMPLE: Compra local sin factura',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      product,
      inventoryLot: { id: lotId, lotNumber: 'LOTE-1', expirationDate: null },
      warehouse: null,
      user: { id: userId, name: 'Agricultor', email: 'agri@example.com' },
    };
    const tx = {
      product: {
        findFirst: jest.fn().mockResolvedValue(product),
        update: jest.fn(),
      },
      warehouse: {
        create: jest.fn(),
      },
      inventoryLot: {
        create: jest.fn().mockResolvedValue(lot),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue(movement),
      },
    };
    const { campaignContext, useCase } = createUseCase(tx);

    await expect(
      useCase.registerEntry(tenantId, userId, {
        product: { productId },
        entryReason: StockEntryReason.ENTRADA_SIMPLE,
        quantity: 10,
        lotNumber: 'LOTE-1',
        notes: 'Compra local sin factura',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        message: 'Entrada de agroquimico registrada correctamente.',
        lot: expect.objectContaining({ campaignId }),
        movement: expect.objectContaining({
          campaignId,
          reasonType: StockMovementReasonType.ENTRADA_SIMPLE,
        }),
      }),
    );

    expect(campaignContext.resolveCampaignForOperation).toHaveBeenCalledWith(tenantId, undefined, tx);
    expect(tx.inventoryLot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ campaignId }),
      include: { product: true, warehouse: true },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId,
        reasonType: StockMovementReasonType.ENTRADA_SIMPLE,
      }),
      include: { product: true, inventoryLot: true, warehouse: true, user: true },
    });
  });

  it('rejects normal stock movement when the campaign is closed', async () => {
    const tx = {
      product: { findFirst: jest.fn() },
      inventoryLot: { findMany: jest.fn() },
      stockMovement: { create: jest.fn() },
    };
    const { useCase } = createUseCase(tx, {
      resolveCampaignForOperation: jest
        .fn()
        .mockRejectedValue(new BadRequestException('La campana no esta abierta para registrar operaciones.')),
    });

    await expect(
      useCase.registerExit(tenantId, userId, {
        productId,
        campaignId,
        quantity: 1,
        reasonType: StockMovementReasonType.OTRO,
        reason: 'Salida simple',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.product.findFirst).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a stock exit when the lot quantity changed before decrementing', async () => {
    const lot = {
      id: lotId,
      tenantId,
      ownerUserId: userId,
      productId,
      warehouseId: null,
      lotNumber: 'LOTE-1',
      expirationDate: null,
      initialQuantity: new Prisma.Decimal(5),
      currentQuantity: new Prisma.Decimal(5),
      receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      product: {
        id: productId,
        name: 'Glifosato',
        unit: 'L',
        activeIngredient: null,
        category: null,
        minimumStock: new Prisma.Decimal(0),
        expirationWarningDays: 90,
      },
      warehouse: null,
    };
    const tx = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: productId, unit: 'L' }),
        updateMany: jest.fn(),
      },
      inventoryLot: {
        findMany: jest.fn().mockResolvedValue([lot]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
    };
    const { campaignContext, useCase } = createUseCase(tx);

    await expect(
      useCase.registerExit(tenantId, userId, {
        productId,
        campaignId,
        inventoryLotId: lotId,
        quantity: 5,
        reasonType: StockMovementReasonType.OTRO,
        reason: 'Aplicacion en parcela',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(campaignContext.resolveCampaignForOperation).toHaveBeenCalledWith(tenantId, campaignId, tx);
    expect(tx.inventoryLot.updateMany).toHaveBeenCalledWith({
      where: {
        id: lotId,
        tenantId,
        ownerUserId: userId,
        currentQuantity: { gte: new Prisma.Decimal(5) },
      },
      data: { currentQuantity: { decrement: new Prisma.Decimal(5) } },
    });
    expect(tx.inventoryLot.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
