import { SyncOperationStatus } from '@prisma/client';
import { SyncOperationsUseCase } from './sync-operations.use-case';
import { OfflineOperationType } from '../dto/sync-operations.dto';

describe('SyncOperationsUseCase', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const clientId = 'device-1';
  const clientOperationId = 'op-1';

  function createUseCase(
    prisma: Record<string, unknown>,
    inventoryStockUseCase = {},
    plotFlowUseCase = {},
    applicationsUseCase = {},
    accountsPayableUseCase = {},
  ) {
    return new SyncOperationsUseCase(
      prisma as never,
      inventoryStockUseCase as never,
      plotFlowUseCase as never,
      applicationsUseCase as never,
      accountsPayableUseCase as never,
    );
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
          payload: { productId: 'product-1', quantity: 1, reasonType: 'OTRO', reason: 'Uso' },
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

  it('does not discount twice when an offline application is resent', async () => {
    const prisma = {
      syncOperation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sync-application-1',
          status: SyncOperationStatus.APLICADA,
          errorMessage: null,
        }),
      },
    };
    const applicationsUseCase = {
      create: jest.fn(),
    };
    const useCase = createUseCase(prisma, {}, {}, applicationsUseCase);

    const result = await useCase.sync(tenantId, userId, {
      clientId,
      operations: [
        {
          clientOperationId: 'application-op-1',
          operation: OfflineOperationType.AGROCHEMICAL_APPLICATION,
          payload: {
            campaignId: 'campaign-1',
            plotId: '11111111-1111-1111-1111-111111111111',
            productId: '22222222-2222-2222-2222-222222222222',
            quantity: 1,
          },
        },
      ],
    });

    expect(applicationsUseCase.create).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      clientOperationId: 'application-op-1',
      duplicate: true,
      status: SyncOperationStatus.APLICADA,
    });
  });

  it('applies new offline plot creation and stores campaign when provided', async () => {
    const prisma = {
      syncOperation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sync-plot-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const plotFlowUseCase = {
      createPlot: jest.fn().mockResolvedValue({ id: 'plot-1' }),
    };
    const useCase = createUseCase(prisma, {}, plotFlowUseCase);

    await useCase.sync(tenantId, userId, {
      clientId,
      operations: [
        {
          clientOperationId: 'plot-op-1',
          operation: OfflineOperationType.PLOT_CREATE,
          payload: { name: 'Campo Norte', area: 10 },
        },
      ],
    });

    expect(plotFlowUseCase.createPlot).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ userId }),
      expect.objectContaining({ name: 'Campo Norte' }),
    );
    expect(prisma.syncOperation.update).toHaveBeenCalledWith({
      where: { id: 'sync-plot-1' },
      data: expect.objectContaining({
        status: SyncOperationStatus.APLICADA,
      }),
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

  it('keeps conflict snapshots consultable when campaign is closed', async () => {
    const prisma = {
      syncOperation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sync-closed-campaign' }),
        update: jest.fn().mockResolvedValue({}),
      },
      syncConflict: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const inventoryStockUseCase = {
      registerEntry: jest.fn().mockRejectedValue({
        status: 400,
        message: 'La campana no esta abierta para registrar operaciones.',
      }),
    };
    const useCase = createUseCase(prisma, inventoryStockUseCase);

    const payload = {
      campaignId: '33333333-3333-4333-8333-333333333333',
      product: { productId: '11111111-1111-4111-8111-111111111111' },
      entryReason: 'ENTRADA_SIMPLE',
      quantity: 1,
      notes: 'Compra offline',
    };

    const result = await useCase.sync(tenantId, userId, {
      clientId,
      operations: [
        {
          clientOperationId: 'entry-closed-campaign',
          operation: OfflineOperationType.STOCK_ENTRY,
          payload,
        },
      ],
    });

    expect(prisma.syncOperation.update).toHaveBeenCalledWith({
      where: { id: 'sync-closed-campaign' },
      data: expect.objectContaining({
        status: SyncOperationStatus.CONFLICTO,
        errorMessage: 'La campana no esta abierta para registrar operaciones.',
      }),
    });
    expect(prisma.syncConflict.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        syncOperationId: 'sync-closed-campaign',
        clientSnapshot: payload,
        serverSnapshot: expect.objectContaining({
          campaignId: '33333333-3333-4333-8333-333333333333',
          clientOperationId: 'entry-closed-campaign',
        }),
      }),
    });
    expect(result.results[0]).toMatchObject({
      status: SyncOperationStatus.CONFLICTO,
      errorMessage: 'La campana no esta abierta para registrar operaciones.',
    });
  });
});
