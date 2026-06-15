import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryStockUseCase } from './inventory-stock.use-case';

describe('InventoryStockUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const productId = 'product-1';
  const lotId = 'lot-1';

  function createUseCase(tx: Record<string, unknown>) {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    };

    return new InventoryStockUseCase(prisma as never);
  }

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
    const useCase = createUseCase(tx);

    await expect(
      useCase.registerExit(tenantId, userId, {
        productId,
        inventoryLotId: lotId,
        quantity: 5,
        reason: 'Aplicacion en parcela',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

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
