import { BadRequestException } from '@nestjs/common';
import { CalendarEventStatus, PayableStatus, Prisma, PurchaseType, UserRole } from '@prisma/client';
import { AccountsPayableUseCase } from './accounts-payable.use-case';

describe('AccountsPayableUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const payableId = 'payable-1';
  const campaignId = 'campaign-1';

  function createUseCase(tx: Record<string, unknown>, prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
      ...prismaOverrides,
    };

    return new AccountsPayableUseCase(prisma as never);
  }

  function payable(overrides: Record<string, unknown> = {}) {
    return {
      id: payableId,
      tenantId,
      campaignId,
      responsibleUserId: userId,
      totalAmount: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(0),
      status: PayableStatus.PENDIENTE,
      dueDate: new Date('2026-12-31T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      responsibleUser: { id: userId, name: 'Agricultor', email: 'agri@example.com' },
      purchase: {
        id: 'purchase-1',
        type: PurchaseType.INDIVIDUAL,
        supplier: { id: 'supplier-1', name: 'Proveedor', phone: null },
        items: [],
      },
      payments: [],
      ...overrides,
    };
  }

  it('does not create a payment when another operation consumed the pending balance', async () => {
    const existingPayable = payable({
      totalAmount: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(90),
      status: PayableStatus.PARCIAL,
    });
    const tx = {
      payableAccount: {
        findFirst: jest.fn().mockResolvedValue(existingPayable),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
      },
    };
    const useCase = createUseCase(tx);

    await expect(
      useCase.registerPayment(tenantId, userId, UserRole.AGRICULTOR, payableId, {
        amount: 10,
        notes: 'Abono',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.payableAccount.updateMany).toHaveBeenCalledWith({
      where: {
        id: payableId,
        tenantId,
        responsibleUserId: userId,
        status: { not: PayableStatus.PAGADA },
        paidAmount: { lte: new Prisma.Decimal(90) },
      },
      data: {
        paidAmount: { increment: new Prisma.Decimal(10) },
      },
    });
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.payableAccount.update).not.toHaveBeenCalled();
  });

  it('registers a partial payment and updates status to PARCIAL with campaign payment', async () => {
    const existingPayable = payable();
    const updatedPayable = payable({
      paidAmount: new Prisma.Decimal(40),
      status: PayableStatus.PARCIAL,
      payments: [
        {
          id: 'payment-1',
          campaignId,
          amount: new Prisma.Decimal(40),
          paidAt: new Date('2026-05-01T00:00:00.000Z'),
          notes: 'Abono',
        },
      ],
    });
    const tx = {
      payableAccount: {
        findFirst: jest.fn().mockResolvedValue(existingPayable),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          totalAmount: new Prisma.Decimal(100),
          paidAmount: new Prisma.Decimal(40),
          dueDate: new Date('2026-12-31T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue(updatedPayable),
      },
      payment: {
        create: jest.fn().mockResolvedValue({
          id: 'payment-1',
          campaignId,
          amount: new Prisma.Decimal(40),
          paidAt: new Date('2026-05-01T00:00:00.000Z'),
          notes: 'Abono',
        }),
      },
      calendarEvent: { updateMany: jest.fn() },
    };
    const useCase = createUseCase(tx);

    const result = await useCase.registerPayment(tenantId, userId, UserRole.AGRICULTOR, payableId, {
      amount: 40,
      paidAt: '2026-05-01',
      notes: 'Abono',
    });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ campaignId, payableAccountId: payableId, amount: new Prisma.Decimal(40) }),
    });
    expect(tx.payableAccount.update).toHaveBeenCalledWith({
      where: { id: payableId },
      data: { status: PayableStatus.PARCIAL },
      include: expect.any(Object),
    });
    expect(tx.calendarEvent.updateMany).not.toHaveBeenCalled();
    expect(result.payment.campaignId).toBe(campaignId);
    expect(result.payable.status).toBe(PayableStatus.PARCIAL);
  });

  it('registers a total payment and completes pending payment event', async () => {
    const existingPayable = payable({ paidAmount: new Prisma.Decimal(40) });
    const updatedPayable = payable({
      paidAmount: new Prisma.Decimal(100),
      status: PayableStatus.PAGADA,
    });
    const tx = {
      payableAccount: {
        findFirst: jest.fn().mockResolvedValue(existingPayable),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          totalAmount: new Prisma.Decimal(100),
          paidAmount: new Prisma.Decimal(100),
          dueDate: new Date('2026-12-31T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue(updatedPayable),
      },
      payment: {
        create: jest.fn().mockResolvedValue({
          id: 'payment-1',
          campaignId,
          amount: new Prisma.Decimal(60),
          paidAt: new Date('2026-05-01T00:00:00.000Z'),
          notes: null,
        }),
      },
      calendarEvent: { updateMany: jest.fn() },
    };
    const useCase = createUseCase(tx);

    const result = await useCase.registerPayment(tenantId, userId, UserRole.AGRICULTOR, payableId, {
      amount: 60,
    });

    expect(tx.payableAccount.update).toHaveBeenCalledWith({
      where: { id: payableId },
      data: { status: PayableStatus.PAGADA },
      include: expect.any(Object),
    });
    expect(tx.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        sourceEntity: 'PayableAccount',
        sourceEntityId: payableId,
        status: CalendarEventStatus.PENDIENTE,
      },
      data: { status: CalendarEventStatus.COMPLETADO },
    });
    expect(result.payable.status).toBe(PayableStatus.PAGADA);
  });

  it('does not allow paying more than pending balance', async () => {
    const tx = {
      payableAccount: {
        findFirst: jest.fn().mockResolvedValue(payable({ paidAmount: new Prisma.Decimal(80) })),
        updateMany: jest.fn(),
      },
      payment: { create: jest.fn() },
    };
    const useCase = createUseCase(tx);

    await expect(
      useCase.registerPayment(tenantId, userId, UserRole.AGRICULTOR, payableId, { amount: 30 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.payableAccount.updateMany).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('reports debts by farmer and campaign for directiva', async () => {
    const prismaOverrides = {
      payableAccount: {
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([payable()]),
      },
    };
    const useCase = createUseCase({}, prismaOverrides);

    const result = await useCase.list(tenantId, 'directiva-1', UserRole.DIRECTIVA, {
      ownerUserId: userId,
      campaignId,
    });

    expect(prismaOverrides.payableAccount.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        responsibleUserId: userId,
        campaignId,
        status: { in: [PayableStatus.PENDIENTE, PayableStatus.PARCIAL] },
        dueDate: { lt: expect.any(Date) },
      },
      data: { status: PayableStatus.VENCIDA },
    });
    expect(prismaOverrides.payableAccount.findMany).toHaveBeenCalledWith({
      where: { tenantId, responsibleUserId: userId, campaignId },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      include: expect.any(Object),
    });
    expect(result[0]).toEqual(expect.objectContaining({ campaignId, responsibleUserId: userId }));
  });
});
