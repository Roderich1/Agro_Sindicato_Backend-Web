import { BadRequestException } from '@nestjs/common';
import { PurchasePaymentMode } from '@prisma/client';
import { CreatePurchaseUseCase } from './create-purchase.use-case';

describe('CreatePurchaseUseCase', () => {
  it('rejects discounts greater than item gross subtotal before opening a transaction', async () => {
    const prisma = {
      $transaction: jest.fn(),
    };
    const useCase = new CreatePurchaseUseCase(prisma as never);

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
});
