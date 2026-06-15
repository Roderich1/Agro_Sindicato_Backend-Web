import { NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { InventoryAdjustmentUseCase } from './inventory-adjustment.use-case';
import {
  StockAdjustmentDirection,
  StockAdjustmentReason,
} from '../dto/register-stock-adjustment.dto';

describe('InventoryAdjustmentUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const productId = 'product-1';
  const lotId = 'lot-1';

  function createUseCase(tx: Record<string, unknown>) {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    };

    return {
      prisma,
      useCase: new InventoryAdjustmentUseCase(prisma as never),
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
        reasonType: StockAdjustmentReason.CORRECCION,
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
      type: StockMovementType.AJUSTE,
      quantity,
      reason: 'CORRECCION: INCREMENTO: Conteo fisico',
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
    };
    const { useCase } = createUseCase(tx);

    const result = await useCase.execute(tenantId, userId, {
      productId,
      inventoryLotId: lotId,
      direction: StockAdjustmentDirection.INCREMENTO,
      reasonType: StockAdjustmentReason.CORRECCION,
      quantity: 2,
      reason: 'Conteo fisico',
    });

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
    expect(result.message).toBe('Ajuste de incremento registrado correctamente.');
    expect('lot' in result).toBe(true);
    if (!('lot' in result)) return;
    expect(result.lot.id).toBe(lotId);
  });
});
