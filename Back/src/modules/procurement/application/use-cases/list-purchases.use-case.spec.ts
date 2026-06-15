import { UserRole } from '@prisma/client';
import { ListPurchasesUseCase } from './list-purchases.use-case';

describe('ListPurchasesUseCase', () => {
  it('filters farmer purchases by creator or joint purchase participation', async () => {
    const prisma = {
      purchase: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const useCase = new ListPurchasesUseCase(prisma as never);

    await useCase.list('tenant-1', 'farmer-1', UserRole.AGRICULTOR, {});

    expect(prisma.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          OR: [
            { createdById: 'farmer-1' },
            { participants: { some: { userId: 'farmer-1' } } },
          ],
        }),
      }),
    );
  });
});
