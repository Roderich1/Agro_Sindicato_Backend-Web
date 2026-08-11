import { NotFoundException } from '@nestjs/common';
import { CampaignStatus, Prisma, StockMovementReasonType, StockMovementType } from '@prisma/client';
import { InventoryAdjustmentUseCase } from './inventory-adjustment.use-case';
import { StockAdjustmentDirection } from '../dto/register-stock-adjustment.dto';

describe('InventoryAdjustmentUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const productId = 'product-1';
  const lotId = 'lot-1';
  const campaignId = 'campaign-1';

  function createUseCase(tx: Record<string, unknown>) {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    };
    const campaignContext = {
      resolveCampaignForOperation: jest.fn().mockResolvedValue({
        id: campaignId,
        status: CampaignStatus.ABIERTA,
        isActive: true,
      }),
    };

    return {
      prisma,
      campaignContext,
      useCase: new InventoryAdjustmentUseCase(prisma as never, campaignContext as never),
    };
  }

  it('rejects an increment for a lot that does not belong to the product and does not mutate stock', async () => {
    const tx = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: productId, unit: 'L' }),
        update: jest.fn(),
      },
      inventoryLot: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
    };
    const { useCase } = createUseCase(tx);

    await expect(
      useCase.execute(tenantId, userId, {
        productId,
        inventoryLotId: lotId,
        direction: StockAdjustmentDirection.INCREMENTO,
        reasonType: StockMovementReasonType.AJUSTE,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.inventoryLot.findFirst).toHaveBeenCalledWith({
      where: {
        id: lotId,
        tenantId,
        ownerUserId: userId,
        productId,
      },
    });
    expect(tx.inventoryLot.update).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('increments an existing lot only after validating tenant, owner and product', async () => {
    const quantity = new Prisma.Decimal(2);
    const lot = {
      id: lotId,
      lotNumber: 'LOTE-1',
      expirationDate: null,
      currentQuantity: new Prisma.Decimal(7),
      warehouseId: null,
      product: { id: productId, name: 'Glifosato', unit: 'L' },
      warehouse: null,
    };
    const movement = {
      id: 'movement-1',
      campaignId,
      type: StockMovementType.AJUSTE,
      reasonType: StockMovementReasonType.AJUSTE,
      quantity,
      reason: 'AJUSTE: INCREMENTO: Conteo fisico',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      product: lot.product,
      inventoryLot: { id: lotId, lotNumber: 'LOTE-1' },
      warehouse: null,
    };
    const tx = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: productId, unit: 'L' }),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryLot: {
        findFirst: jest.fn().mockResolvedValue({ id: lotId }),
        update: jest.fn().mockResolvedValue(lot),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue(movement),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const { campaignContext, useCase } = createUseCase(tx);

    const result = await useCase.execute(tenantId, userId, {
      productId,
      inventoryLotId: lotId,
      direction: StockAdjustmentDirection.INCREMENTO,
      reasonType: StockMovementReasonType.AJUSTE,
      quantity: 2,
      reason: 'Conteo fisico',
    });

    expect(campaignContext.resolveCampaignForOperation).toHaveBeenCalledWith(tenantId, undefined, tx);
    expect(tx.inventoryLot.findFirst).toHaveBeenCalledWith({
      where: {
        id: lotId,
        tenantId,
        ownerUserId: userId,
        productId,
      },
    });
    expect(tx.inventoryLot.update).toHaveBeenCalledWith({
      where: { id: lotId },
      data: { currentQuantity: { increment: quantity } },
      include: { product: true, warehouse: true },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId,
        reasonType: StockMovementReasonType.AJUSTE,
      }),
      include: { product: true, inventoryLot: true, warehouse: true, user: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId,
        action: 'AJUSTAR_STOCK',
      }),
    });
    expect(result.message).toBe('Ajuste de incremento registrado correctamente.');
    expect('lot' in result).toBe(true);
    if (!('lot' in result)) return;
    expect(result.lot.id).toBe(lotId);
  });
});
