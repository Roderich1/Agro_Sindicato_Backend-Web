import { Injectable } from '@nestjs/common';
import { Prisma, SyncOperationStatus } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { RegisterInitialStockDto } from '../../../inventory/application/dto/register-initial-stock.dto';
import { RegisterStockEntryDto } from '../../../inventory/application/dto/register-stock-entry.dto';
import { RegisterStockExitDto } from '../../../inventory/application/dto/register-stock-exit.dto';
import { InventoryStockUseCase } from '../../../inventory/application/use-cases/inventory-stock.use-case';
import {
  ListSyncOperationsQueryDto,
  OfflineOperationDto,
  OfflineOperationType,
  SyncOperationsDto,
} from '../dto/sync-operations.dto';

@Injectable()
export class SyncOperationsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryStockUseCase: InventoryStockUseCase,
  ) {}

  async sync(tenantId: string, userId: string, dto: SyncOperationsDto) {
    const results = [];

    for (const operation of dto.operations) {
      const previous = await this.prisma.syncOperation.findFirst({
        where: {
          tenantId,
          userId,
          clientId: dto.clientId,
          entityId: operation.clientOperationId,
          status: SyncOperationStatus.APLICADA,
        },
      });

      if (previous) {
        results.push({
          clientOperationId: operation.clientOperationId,
          operation: operation.operation,
          status: SyncOperationStatus.APLICADA,
          duplicate: true,
          syncOperationId: previous.id,
        });
        continue;
      }

      const syncOperation = await this.prisma.syncOperation.create({
        data: {
          tenantId,
          userId,
          clientId: dto.clientId,
          entityName: operation.operation,
          entityId: operation.clientOperationId,
          operation: operation.operation,
          payload: operation.payload as Prisma.InputJsonValue,
          status: SyncOperationStatus.PENDIENTE,
        },
      });

      try {
        const appliedResult = await this.applyOperation(tenantId, userId, operation);
        await this.prisma.syncOperation.update({
          where: { id: syncOperation.id },
          data: {
            status: SyncOperationStatus.APLICADA,
            appliedAt: new Date(),
          },
        });

        results.push({
          clientOperationId: operation.clientOperationId,
          operation: operation.operation,
          status: SyncOperationStatus.APLICADA,
          syncOperationId: syncOperation.id,
          result: appliedResult,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        const status = this.isBusinessConflict(error)
          ? SyncOperationStatus.CONFLICTO
          : SyncOperationStatus.RECHAZADA;

        await this.prisma.syncOperation.update({
          where: { id: syncOperation.id },
          data: {
            status,
            errorMessage: message,
          },
        });

        if (status === SyncOperationStatus.CONFLICTO) {
          await this.prisma.syncConflict.create({
            data: {
              syncOperationId: syncOperation.id,
              clientSnapshot: operation.payload as Prisma.InputJsonValue,
              serverSnapshot: {
                message,
                operation: operation.operation,
              },
            },
          });
        }

        results.push({
          clientOperationId: operation.clientOperationId,
          operation: operation.operation,
          status,
          syncOperationId: syncOperation.id,
          errorMessage: message,
        });
      }
    }

    return {
      message: 'Sincronizacion procesada.',
      clientId: dto.clientId,
      total: results.length,
      applied: results.filter((result) => result.status === SyncOperationStatus.APLICADA).length,
      conflicts: results.filter((result) => result.status === SyncOperationStatus.CONFLICTO).length,
      rejected: results.filter((result) => result.status === SyncOperationStatus.RECHAZADA).length,
      results,
    };
  }

  async list(tenantId: string, userId: string, query: ListSyncOperationsQueryDto) {
    const operations = await this.prisma.syncOperation.findMany({
      where: {
        tenantId,
        userId,
        ...(query.clientId ? { clientId: query.clientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { conflicts: true },
      take: 100,
    });

    return operations.map((operation) => ({
      id: operation.id,
      clientId: operation.clientId,
      clientOperationId: operation.entityId,
      operation: operation.operation,
      status: operation.status,
      errorMessage: operation.errorMessage,
      createdAt: operation.createdAt.toISOString(),
      appliedAt: operation.appliedAt?.toISOString() ?? null,
      conflicts: operation.conflicts.map((conflict) => ({
        id: conflict.id,
        serverSnapshot: conflict.serverSnapshot,
        clientSnapshot: conflict.clientSnapshot,
        resolvedAt: conflict.resolvedAt?.toISOString() ?? null,
      })),
    }));
  }

  private applyOperation(tenantId: string, userId: string, operation: OfflineOperationDto) {
    switch (operation.operation) {
      case OfflineOperationType.INITIAL_STOCK:
        return this.inventoryStockUseCase.registerInitialStock(
          tenantId,
          userId,
          operation.payload as unknown as RegisterInitialStockDto,
        );
      case OfflineOperationType.STOCK_ENTRY:
        return this.inventoryStockUseCase.registerEntry(
          tenantId,
          userId,
          operation.payload as unknown as RegisterStockEntryDto,
        );
      case OfflineOperationType.STOCK_EXIT:
        return this.inventoryStockUseCase.registerExit(
          tenantId,
          userId,
          operation.payload as unknown as RegisterStockExitDto,
        );
    }
  }

  private isBusinessConflict(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const status = (error as { status?: number }).status;
    return status === 400 || status === 404 || status === 409;
  }
}
