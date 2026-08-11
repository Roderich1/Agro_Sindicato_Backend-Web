import { BadRequestException } from '@nestjs/common';
import { CampaignStatus, PayableStatus, Prisma, PurchasePaymentMode, PurchaseStatus, StockMovementReasonType, StockMovementType } from '@prisma/client';
import { CreatePurchaseUseCase } from './create-purchase.use-case';

describe('CreatePurchaseUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const campaignId = 'campaign-1';
  const productId = 'product-1';

  function createUseCase(prisma: Record<string, unknown>) {
    const campaignContext = {
      resolveCampaignForOperation: jest.fn().mockResolvedValue({
        id: campaignId,
        status: CampaignStatus.ABIERTA,
        isActive: true,
      }),
    };
    return {
      campaignContext,
      useCase: new CreatePurchaseUseCase(prisma as never, campaignContext as never),
    };
  }

  it('rejects discounts greater than item gross subtotal before opening a transaction', async () => {
    const prisma = {
      $transaction: jest.fn(),
    };
    const { useCase } = createUseCase(prisma);

    await expect(
      useCase.execute('tenant-1', 'user-1', {
        supplier: { supplierName: 'Proveedor' },
        paymentMode: PurchasePaymentMode.CONTADO,
        items: [
          {
            product: { productName: 'Glifosato', unit: 'L' },
            quantity: 1,
            unitCost: 10,
            discountAmount: 11,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates an individual received credit purchase with active campaign and payable campaign', async () => {
    const quantity = new Prisma.Decimal(2);
    const unitCost = new Prisma.Decimal(50);
    const subtotal = new Prisma.Decimal(100);
    const supplier = { id: 'supplier-1', name: 'Proveedor' };
    const product = { id: productId, name: 'Glifosato', unit: 'L' };
    const purchase = {
      id: 'purchase-1',
      campaignId,
      supplierId: supplier.id,
      paymentMode: PurchasePaymentMode.CREDITO,
      status: PurchaseStatus.RECIBIDA,
      totalAmount: subtotal,
      discountAmount: new Prisma.Decimal(0),
      purchasedAt: new Date('2026-05-01T00:00:00.000Z'),
      expectedAt: null,
      receivedAt: new Date('2026-05-01T00:00:00.000Z'),
    };
    const tx = {
      supplier: { upsert: jest.fn().mockResolvedValue(supplier) },
      warehouse: { create: jest.fn() },
      purchase: { create: jest.fn().mockResolvedValue(purchase) },
      product: {
        upsert: jest.fn().mockResolvedValue(product),
        update: jest.fn(),
      },
      purchaseItem: {
        create: jest.fn().mockResolvedValue({
          id: 'item-1',
          quantity,
          unitCost,
          discountAmount: new Prisma.Decimal(0),
          subtotal,
          product,
        }),
      },
      inventoryLot: {
        create: jest.fn().mockResolvedValue({
          id: 'lot-1',
          campaignId,
          lotNumber: null,
          expirationDate: null,
          currentQuantity: quantity,
          product,
          warehouse: null,
        }),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({
          id: 'movement-1',
          campaignId,
          type: StockMovementType.ENTRADA,
          reasonType: StockMovementReasonType.COMPRA,
          quantity,
          reason: 'COMPRA_CREDITO',
          occurredAt: new Date('2026-05-01T00:00:00.000Z'),
          product,
          inventoryLot: { id: 'lot-1', lotNumber: null },
          warehouse: null,
        }),
      },
      payableAccount: {
        create: jest.fn().mockResolvedValue({
          id: 'payable-1',
          campaignId,
          dueDate: new Date('2026-06-01T00:00:00.000Z'),
          totalAmount: subtotal,
          paidAmount: new Prisma.Decimal(0),
          status: PayableStatus.PENDIENTE,
        }),
      },
      calendarEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    };
    const { campaignContext, useCase } = createUseCase(prisma);

    const result = await useCase.execute(tenantId, userId, {
      supplier: { supplierName: 'Proveedor' },
      paymentMode: PurchasePaymentMode.CREDITO,
      dueDate: '2026-06-01',
      items: [{ product: { productName: 'Glifosato', unit: 'L' }, quantity: 2, unitCost: 50 }],
    });

    expect(campaignContext.resolveCampaignForOperation).toHaveBeenCalledWith(tenantId, undefined, tx);
    expect(tx.purchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ campaignId, status: PurchaseStatus.RECIBIDA }),
      include: { supplier: true },
    });
    expect(tx.inventoryLot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ campaignId }),
      include: { product: true, warehouse: true },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId,
        reasonType: StockMovementReasonType.COMPRA,
      }),
      include: { product: true, inventoryLot: true, warehouse: true },
    });
    expect(tx.payableAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ campaignId }),
      include: { purchase: { include: { supplier: true } } },
    });
    expect(result.purchase.campaignId).toBe(campaignId);
    expect(result.payable?.campaignId).toBe(campaignId);
  });

  it('creates a calendar event for programmed purchase without receiving stock', async () => {
    const supplier = { id: 'supplier-1', name: 'Proveedor' };
    const product = { id: productId, name: 'Glifosato', unit: 'L' };
    const tx = {
      supplier: { upsert: jest.fn().mockResolvedValue(supplier) },
      warehouse: { create: jest.fn() },
      purchase: {
        create: jest.fn().mockResolvedValue({
          id: 'purchase-1',
          campaignId,
          supplierId: supplier.id,
          paymentMode: PurchasePaymentMode.CONTADO,
          status: PurchaseStatus.PROGRAMADA,
          totalAmount: new Prisma.Decimal(100),
          discountAmount: new Prisma.Decimal(0),
          purchasedAt: new Date('2026-05-01T00:00:00.000Z'),
          expectedAt: new Date('2026-05-10T00:00:00.000Z'),
          receivedAt: null,
        }),
      },
      product: { upsert: jest.fn().mockResolvedValue(product), update: jest.fn() },
      purchaseItem: {
        create: jest.fn().mockResolvedValue({
          id: 'item-1',
          quantity: new Prisma.Decimal(2),
          unitCost: new Prisma.Decimal(50),
          discountAmount: new Prisma.Decimal(0),
          subtotal: new Prisma.Decimal(100),
          product,
        }),
      },
      inventoryLot: { create: jest.fn() },
      stockMovement: { create: jest.fn() },
      calendarEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)) };
    const { useCase } = createUseCase(prisma);

    await useCase.execute(tenantId, userId, {
      supplier: { supplierName: 'Proveedor' },
      paymentMode: PurchasePaymentMode.CONTADO,
      status: PurchaseStatus.PROGRAMADA,
      expectedAt: '2026-05-10',
      items: [{ product: { productName: 'Glifosato', unit: 'L' }, quantity: 2, unitCost: 50 }],
    });

    expect(tx.inventoryLot.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId,
        type: 'COMPRA_PROGRAMADA',
        sourceEntityId: 'purchase-1',
      }),
    });
  });
});
