import { BadRequestException } from '@nestjs/common';
import { PayableStatus, Prisma } from '@prisma/client';
import { AccountsPayableUseCase } from './accounts-payable.use-case';

describe('AccountsPayableUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const payableId = 'payable-1';

  function createUseCase(tx: Record<string, unknown>) {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    };

    return new AccountsPayableUseCase(prisma as never);
  }

  it('does not create a payment when another operation consumed the pending balance', async () => {
    const payable = {
      id: payableId,
      tenantId,
      responsibleUserId: userId,
      totalAmount: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(90),
      status: PayableStatus.PARCIAL,
      dueDate: new Date('2026-12-31T00:00:00.000Z'),
      purchase: {
        supplier: { id: 'supplier-1', name: 'Proveedor', phone: null },
      },
    };
    const tx = {
      payableAccount: {
        findFirst: jest.fn().mockResolvedValue(payable),
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
      useCase.registerPayment(tenantId, userId, payableId, {
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
});
