import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
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
        },
      });

      if (previous) {
        results.push(this.mapDuplicateResult(operation, previous));
        continue;
      }

      const syncOperation = await this.createPendingOperation(
        tenantId,
        userId,
        dto.clientId,
        operation,
      );

      if (syncOperation.duplicate) {
        results.push(this.mapDuplicateResult(operation, syncOperation.operation));
        continue;
      }

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
      case OfflineOperationType.INITIAL_STOCK: {
        const initialStockPayload = this.validatePayload(
          operation.payload,
          RegisterInitialStockDto,
        );
        return this.inventoryStockUseCase.registerInitialStock(
          tenantId,
          userId,
          initialStockPayload,
        );
      }
      case OfflineOperationType.STOCK_ENTRY: {
        const stockEntryPayload = this.validatePayload(
          operation.payload,
          RegisterStockEntryDto,
        );
        return this.inventoryStockUseCase.registerEntry(
          tenantId,
          userId,
          stockEntryPayload,
        );
      }
      case OfflineOperationType.STOCK_EXIT: {
        const stockExitPayload = this.validatePayload(
          operation.payload,
          RegisterStockExitDto,
        );
        return this.inventoryStockUseCase.registerExit(
          tenantId,
          userId,
          stockExitPayload,
        );
      }
    }
  }

  private async createPendingOperation(
    tenantId: string,
    userId: string,
    clientId: string,
    operation: OfflineOperationDto,
  ): Promise<
    | { duplicate: false; id: string }
    | {
        duplicate: true;
        operation: {
          id: string;
          status: SyncOperationStatus;
          errorMessage: string | null;
        };
      }
  > {
    try {
      const created = await this.prisma.syncOperation.create({
        data: {
          tenantId,
          userId,
          clientId,
          entityName: operation.operation,
          entityId: operation.clientOperationId,
          operation: operation.operation,
          payload: operation.payload as Prisma.InputJsonValue,
          status: SyncOperationStatus.PENDIENTE,
        },
        select: { id: true },
      });

      return { duplicate: false, id: created.id };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const existing = await this.prisma.syncOperation.findFirst({
        where: {
          tenantId,
          userId,
          clientId,
          entityId: operation.clientOperationId,
        },
        select: { id: true, status: true, errorMessage: true },
      });

      if (!existing) throw error;
      return { duplicate: true, operation: existing };
    }
  }

  private mapDuplicateResult(
    operation: OfflineOperationDto,
    previous: { id: string; status: SyncOperationStatus; errorMessage: string | null },
  ) {
    return {
      clientOperationId: operation.clientOperationId,
      operation: operation.operation,
      status: previous.status,
      duplicate: true,
      syncOperationId: previous.id,
      errorMessage: previous.errorMessage ?? undefined,
    };
  }

  private validatePayload<T extends object>(
    payload: Record<string, unknown>,
    dto: new () => T,
  ): T {
    const instance = plainToInstance(dto, payload);
    const errors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException(
        `Payload invalido para sincronizacion: ${this.formatValidationErrors(errors).join('; ')}`,
      );
    }

    return instance;
  }

  private formatValidationErrors(errors: ValidationError[], parent = ''): string[] {
    return errors.flatMap((error) => {
      const property = parent ? `${parent}.${error.property}` : error.property;
      const messages = error.constraints ? Object.values(error.constraints).map((message) => `${property}: ${message}`) : [];
      return [
        ...messages,
        ...this.formatValidationErrors(error.children ?? [], property),
      ];
    });
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
  }

  private isBusinessConflict(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const status = (error as { status?: number }).status;
    return status === 400 || status === 404 || status === 409;
  }
}
