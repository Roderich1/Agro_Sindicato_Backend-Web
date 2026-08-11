import { PayableStatus, Prisma, PurchasePaymentMode, PurchaseStatus, PurchaseType, UserRole } from '@prisma/client';
import { ReportsUseCase } from './reports.use-case';

describe('ReportsUseCase', () => {
  const tenantId = 'tenant-1';
  const farmerId = 'farmer-1';
  const otherFarmerId = 'farmer-2';
  const campaignId = 'campaign-1';
  const productId = 'product-1';
  const cropId = 'crop-1';

  function createUseCase(prismaOverrides: Record<string, unknown>) {
    const prisma = {
      inventoryLot: { findMany: jest.fn() },
      purchase: { findMany: jest.fn() },
      agrochemicalApplication: { findMany: jest.fn() },
      payableAccount: { findMany: jest.fn() },
      auditLog: { findMany: jest.fn() },
      ...prismaOverrides,
    };

    return {
      prisma,
      useCase: new ReportsUseCase(prisma as never),
    };
  }

  it('filters current inventory by authenticated farmer, ignoring owner query', async () => {
    const lot = {
      id: 'lot-1',
      campaignId,
      ownerUserId: farmerId,
      lotNumber: 'LOTE-1',
      expirationDate: null,
      currentQuantity: new Prisma.Decimal(5),
      status: 'DISPONIBLE',
      receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      owner: { id: farmerId, name: 'Agricultor', email: 'a@example.com' },
      campaign: { id: campaignId, name: 'Invierno', status: 'ABIERTA' },
      product: { id: productId, name: 'Glifosato', unit: 'L', activeIngredient: null, category: 'Herbicida' },
      warehouse: null,
    };
    const { prisma, useCase } = createUseCase({
      inventoryLot: { findMany: jest.fn().mockResolvedValue([lot]) },
    });

    const result = await useCase.inventoryCurrent(
      tenantId,
      { userId: farmerId, role: UserRole.AGRICULTOR },
      { ownerUserId: otherFarmerId },
    );

    expect(prisma.inventoryLot.findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        currentQuantity: { gt: new Prisma.Decimal(0) },
        ownerUserId: farmerId,
      },
      orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'desc' }],
      include: expect.any(Object),
    });
    expect(result.totals).toEqual({ lots: 1, quantity: '5', products: 1 });
  });

  it('lets directiva filter inventory by farmer and campaign', async () => {
    const { prisma, useCase } = createUseCase({
      inventoryLot: { findMany: jest.fn().mockResolvedValue([]) },
    });

    await useCase.inventoryByFarmer(
      tenantId,
      { userId: 'directiva-1', role: UserRole.DIRECTIVA },
      { ownerUserId: farmerId, campaignId },
    );

    expect(prisma.inventoryLot.findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        currentQuantity: { gt: new Prisma.Decimal(0) },
        ownerUserId: farmerId,
        campaignId,
      },
      include: expect.any(Object),
    });
  });

  it('aggregates purchases by campaign with totals ready for frontend', async () => {
    const purchase = {
      id: 'purchase-1',
      campaignId,
      type: PurchaseType.INDIVIDUAL,
      paymentMode: PurchasePaymentMode.CREDITO,
      status: PurchaseStatus.RECIBIDA,
      totalAmount: new Prisma.Decimal(100),
      discountAmount: new Prisma.Decimal(5),
      purchasedAt: new Date('2026-05-01T00:00:00.000Z'),
      expectedAt: null,
      receivedAt: new Date('2026-05-01T00:00:00.000Z'),
      campaign: { id: campaignId, name: 'Invierno', status: 'ABIERTA' },
      supplier: { id: 'supplier-1', name: 'Proveedor' },
      createdBy: { id: farmerId, name: 'Agricultor', email: 'a@example.com' },
      items: [
        {
          id: 'item-1',
          quantity: new Prisma.Decimal(2),
          subtotal: new Prisma.Decimal(100),
          product: { id: productId, name: 'Glifosato', unit: 'L' },
        },
      ],
    };
    const { useCase } = createUseCase({
      purchase: { findMany: jest.fn().mockResolvedValue([purchase]) },
    });

    const result = await useCase.purchasesByCampaign(
      tenantId,
      { userId: farmerId, role: UserRole.AGRICULTOR },
      { campaignId },
    );

    expect(result.totals).toEqual({ purchases: 1, totalAmount: '100', discountAmount: '5' });
    expect(result.byCampaign).toEqual([{ key: campaignId, total: '100' }]);
  });

  it('aggregates consumption by product from applications', async () => {
    const applications = [
      {
        productId,
        ownerUserId: farmerId,
        quantity: new Prisma.Decimal(2),
        product: { id: productId, name: 'Glifosato', unit: 'L' },
        owner: { id: farmerId, name: 'Agricultor' },
      },
      {
        productId,
        ownerUserId: farmerId,
        quantity: new Prisma.Decimal(3),
        product: { id: productId, name: 'Glifosato', unit: 'L' },
        owner: { id: farmerId, name: 'Agricultor' },
      },
    ];
    const { useCase } = createUseCase({
      agrochemicalApplication: { findMany: jest.fn().mockResolvedValue(applications) },
    });

    const result = await useCase.consumptionByProduct(
      tenantId,
      { userId: farmerId, role: UserRole.AGRICULTOR },
      { cropId },
    );

    expect(result).toEqual([
      expect.objectContaining({
        key: productId,
        quantity: '5',
      }),
    ]);
  });

  it('reports payables and payments by farmer and campaign', async () => {
    const payable = {
      id: 'payable-1',
      campaignId,
      purchaseId: 'purchase-1',
      responsibleUser: { id: farmerId, name: 'Agricultor', email: 'a@example.com' },
      purchase: { supplier: { id: 'supplier-1', name: 'Proveedor' } },
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
      totalAmount: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(40),
      status: PayableStatus.PARCIAL,
      campaign: { id: campaignId, name: 'Invierno' },
      payments: [
        {
          id: 'payment-1',
          campaignId,
          amount: new Prisma.Decimal(40),
          paidAt: new Date('2026-05-15T00:00:00.000Z'),
          notes: null,
        },
      ],
    };
    const { prisma, useCase } = createUseCase({
      payableAccount: { findMany: jest.fn().mockResolvedValue([payable]) },
    });

    const result = await useCase.payablesAndPayments(
      tenantId,
      { userId: 'directiva-1', role: UserRole.DIRECTIVA },
      { ownerUserId: farmerId, campaignId },
    );

    expect(prisma.payableAccount.findMany).toHaveBeenCalledWith({
      where: { tenantId, responsibleUserId: farmerId, campaignId },
      orderBy: { dueDate: 'asc' },
      include: expect.any(Object),
    });
    expect(result.totals).toEqual({
      accounts: 1,
      totalAmount: '100',
      paidAmount: '40',
      balance: '60',
      pending: 1,
    });
    expect(result.byFarmer).toEqual([{ key: farmerId, total: '60' }]);
  });
});
