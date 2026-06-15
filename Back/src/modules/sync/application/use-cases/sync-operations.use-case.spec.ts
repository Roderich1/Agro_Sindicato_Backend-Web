import { SyncOperationStatus } from '@prisma/client';
import { SyncOperationsUseCase } from './sync-operations.use-case';
import { OfflineOperationType } from '../dto/sync-operations.dto';

describe('SyncOperationsUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const clientId = 'device-1';
  const clientOperationId = 'op-1';

  function createUseCase(prisma: Record<string, unknown>, inventoryStockUseCase = {}) {
    return new SyncOperationsUseCase(prisma as never, inventoryStockUseCase as never);
  }

  it('returns an existing operation as duplicate without applying it again', async () => {
    const prisma = {
      syncOperation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sync-1',
          status: SyncOperationStatus.APLICADA,
          errorMessage: null,
        }),
      },
    };
    const inventoryStockUseCase = {
      registerExit: jest.fn(),
    };
    const useCase = createUseCase(prisma, inventoryStockUseCase);

    const result = await useCase.sync(tenantId, userId, {
      clientId,
      operations: [
        {
          clientOperationId,
          operation: OfflineOperationType.STOCK_EXIT,
          payload: { productId: 'product-1', quantity: 1, reason: 'Uso' },
        },
      ],
    });

    expect(inventoryStockUseCase.registerExit).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      clientOperationId,
      status: SyncOperationStatus.APLICADA,
      duplicate: true,
      syncOperationId: 'sync-1',
    });
  });

  it('marks invalid payloads as conflicts before applying inventory operations', async () => {
    const prisma = {
      syncOperation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sync-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      syncConflict: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const inventoryStockUseCase = {
      registerExit: jest.fn(),
    };
    const useCase = createUseCase(prisma, inventoryStockUseCase);

    const result = await useCase.sync(tenantId, userId, {
      clientId,
      operations: [
        {
          clientOperationId,
          operation: OfflineOperationType.STOCK_EXIT,
          payload: { productId: 'no-es-uuid', quantity: -1 },
        },
      ],
    });

    expect(inventoryStockUseCase.registerExit).not.toHaveBeenCalled();
    expect(prisma.syncOperation.update).toHaveBeenCalledWith({
      where: { id: 'sync-1' },
      data: expect.objectContaining({
        status: SyncOperationStatus.CONFLICTO,
      }),
    });
    expect(prisma.syncConflict.create).toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      clientOperationId,
      status: SyncOperationStatus.CONFLICTO,
      syncOperationId: 'sync-1',
    });
  });
});
