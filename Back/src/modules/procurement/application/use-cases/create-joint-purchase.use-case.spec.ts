import { BadRequestException } from '@nestjs/common';
import {
  CampaignStatus,
  PayableStatus,
  Prisma,
  PurchasePaymentMode,
  PurchaseStatus,
  StockMovementReasonType,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { CreateJointPurchaseUseCase } from './create-joint-purchase.use-case';

describe('CreateJointPurchaseUseCase', () => {
  const tenantId = 'tenant-1';
  const campaignId = 'campaign-1';
  const directivaId = 'directiva-1';
  const farmerOneId = '11111111-1111-1111-1111-111111111111';
  const farmerTwoId = '22222222-2222-2222-2222-222222222222';

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
      useCase: new CreateJointPurchaseUseCase(prisma as never, campaignContext as never),
    };
  }

  it('rejects duplicated farmer allocations for the same product', async () => {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback({})),
    };
    const { useCase } = createUseCase(prisma);

    await expect(
      useCase.execute('tenant-1', 'directiva-1', {
        supplier: { supplierName: 'Proveedor' },
        paymentMode: PurchasePaymentMode.CONTADO,
        items: [
          {
            product: { productName: 'Glifosato', unit: 'L' },
            quantity: 10,
            unitCost: 5,
            allocations: [
              { userId: '11111111-1111-1111-1111-111111111111', quantity: 5 },
              { userId: '11111111-1111-1111-1111-111111111111', quantity: 5 },
            ],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects discounts greater than joint item gross subtotal', async () => {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback({})),
    };
    const { useCase } = createUseCase(prisma);

    await expect(
      useCase.execute('tenant-1', 'directiva-1', {
        supplier: { supplierName: 'Proveedor' },
        paymentMode: PurchasePaymentMode.CONTADO,
        items: [
          {
            product: { productName: 'Glifosato', unit: 'L' },
            quantity: 10,
            unitCost: 5,
            discountAmount: 51,
            allocations: [
              { userId: '11111111-1111-1111-1111-111111111111', quantity: 10 },
            ],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a joint credit purchase distributing exact quantities by campaign', async () => {
    const supplier = { id: 'supplier-1', name: 'Proveedor' };
    const product = { id: 'product-1', name: 'Glifosato', unit: 'L' };
    const purchase = {
      id: 'purchase-1',
      campaignId,
      type: 'CONJUNTA',
      paymentMode: PurchasePaymentMode.CREDITO,
      status: PurchaseStatus.RECIBIDA,
      totalAmount: new Prisma.Decimal(100),
      discountAmount: new Prisma.Decimal(0),
      purchasedAt: new Date('2026-05-01T00:00:00.000Z'),
      expectedAt: null,
      receivedAt: new Date('2026-05-01T00:00:00.000Z'),
    };
    const farmers = [
      { id: farmerOneId, tenantId, name: 'Agricultor 1', email: 'a1@example.com', role: UserRole.AGRICULTOR, isActive: true },
      { id: farmerTwoId, tenantId, name: 'Agricultor 2', email: 'a2@example.com', role: UserRole.AGRICULTOR, isActive: true },
    ];
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue(farmers) },
      supplier: { upsert: jest.fn().mockResolvedValue(supplier) },
      purchase: { create: jest.fn().mockResolvedValue(purchase) },
      product: {
        upsert: jest.fn().mockResolvedValue(product),
        update: jest.fn(),
      },
      warehouse: { create: jest.fn() },
      purchaseItem: {
        create: jest.fn().mockResolvedValue({
          id: 'item-1',
          quantity: new Prisma.Decimal(10),
          unitCost: new Prisma.Decimal(10),
          discountAmount: new Prisma.Decimal(0),
          subtotal: new Prisma.Decimal(100),
          product,
        }),
      },
      purchaseItemAllocation: {
        create: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'allocation-1',
            user: farmers[0],
          })
          .mockResolvedValueOnce({
            id: 'allocation-2',
            user: farmers[1],
          }),
      },
      inventoryLot: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({
            id: `lot-${data.ownerUserId}`,
            campaignId: data.campaignId,
            owner: farmers.find((farmer) => farmer.id === data.ownerUserId),
            product,
            warehouse: null,
            lotNumber: null,
            expirationDate: null,
            currentQuantity: data.currentQuantity,
          })),
      },
      stockMovement: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({
            id: `movement-${data.ownerUserId}`,
            campaignId: data.campaignId,
            owner: farmers.find((farmer) => farmer.id === data.ownerUserId),
            product,
            quantity: data.quantity,
            reasonType: data.reasonType,
            reason: data.reason,
          })),
      },
      purchaseParticipant: {
        create: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'participant-1',
            user: farmers[0],
            requestedAmount: new Prisma.Decimal(4),
            allocatedAmount: new Prisma.Decimal(40),
            status: 'ENTREGADO',
          })
          .mockResolvedValueOnce({
            id: 'participant-2',
            user: farmers[1],
            requestedAmount: new Prisma.Decimal(6),
            allocatedAmount: new Prisma.Decimal(60),
            status: 'ENTREGADO',
          }),
      },
      payableAccount: {
        create: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'payable-1',
            campaignId,
            responsibleUser: farmers[0],
            dueDate: new Date('2026-06-01T00:00:00.000Z'),
            totalAmount: new Prisma.Decimal(40),
            paidAmount: new Prisma.Decimal(0),
            status: PayableStatus.PENDIENTE,
          })
          .mockResolvedValueOnce({
            id: 'payable-2',
            campaignId,
            responsibleUser: farmers[1],
            dueDate: new Date('2026-06-01T00:00:00.000Z'),
            totalAmount: new Prisma.Decimal(60),
            paidAmount: new Prisma.Decimal(0),
            status: PayableStatus.PENDIENTE,
          }),
      },
      calendarEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)) };
    const { campaignContext, useCase } = createUseCase(prisma);

    const result = await useCase.execute(tenantId, directivaId, {
      supplier: { supplierName: 'Proveedor' },
      paymentMode: PurchasePaymentMode.CREDITO,
      dueDate: '2026-06-01',
      items: [
        {
          product: { productName: 'Glifosato', unit: 'L' },
          quantity: 10,
          unitCost: 10,
          allocations: [
            { userId: farmerOneId, quantity: 4 },
            { userId: farmerTwoId, quantity: 6 },
          ],
        },
      ],
    });

    expect(campaignContext.resolveCampaignForOperation).toHaveBeenCalledWith(tenantId, undefined, tx);
    expect(tx.purchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ campaignId, type: 'CONJUNTA' }),
      include: { supplier: true },
    });
    expect(tx.inventoryLot.create).toHaveBeenCalledTimes(2);
    expect(tx.inventoryLot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ campaignId, ownerUserId: farmerOneId, currentQuantity: new Prisma.Decimal(4) }),
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        campaignId,
        ownerUserId: farmerOneId,
        reasonType: StockMovementReasonType.COMPRA,
        type: StockMovementType.ENTRADA,
      }),
    }));
    expect(tx.payableAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ campaignId, responsibleUserId: farmerOneId }),
      include: { responsibleUser: true },
    });
    expect(result.purchase.campaignId).toBe(campaignId);
    expect(result.payables).toHaveLength(2);
    expect(result.payables[0].campaignId).toBe(campaignId);
  });
});
