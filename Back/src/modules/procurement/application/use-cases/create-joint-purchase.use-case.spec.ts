import { BadRequestException } from '@nestjs/common';
import { PurchasePaymentMode } from '@prisma/client';
import { CreateJointPurchaseUseCase } from './create-joint-purchase.use-case';

describe('CreateJointPurchaseUseCase', () => {
  it('rejects duplicated farmer allocations for the same product', async () => {
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback({})),
    };
    const useCase = new CreateJointPurchaseUseCase(prisma as never);

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
    const useCase = new CreateJointPurchaseUseCase(prisma as never);

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
});
