import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ListStockMovementsQueryDto } from '../dto/list-stock-movements-query.dto';
import { ListGlobalStockQueryDto } from '../dto/list-global-stock-query.dto';
import {
  InventoryCriticality,
  ListStockQueryDto,
  UpdateProductInventorySettingsDto,
} from '../dto/list-stock-query.dto';
import { ProductReferenceDto } from '../dto/product-reference.dto';
import { RegisterInitialStockDto } from '../dto/register-initial-stock.dto';
import {
  RegisterStockEntryDto,
  StockEntryReason,
} from '../dto/register-stock-entry.dto';
import { RegisterStockExitDto } from '../dto/register-stock-exit.dto';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class InventoryStockUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async registerInitialStock(tenantId: string, userId: string, dto: RegisterInitialStockDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await this.resolveProduct(tx, tenantId, dto.product);
      const warehouse = await this.resolveWarehouse(tx, tenantId, userId, {
        warehouseId: dto.warehouseId,
        warehouseName: dto.warehouseName,
      });
      const quantity = this.toDecimal(dto.quantity);
      const expirationDate = dto.expirationDate ? new Date(dto.expirationDate) : null;

      const lot = await tx.inventoryLot.create({
        data: {
          tenantId,
          ownerUserId: userId,
          productId: product.id,
          warehouseId: warehouse?.id,
          lotNumber: dto.lotNumber,
          expirationDate,
          initialQuantity: quantity,
          currentQuantity: quantity,
        },
        include: { product: true, warehouse: true },
      });

      await this.incrementProductStock(tx, product.id, quantity);

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          ownerUserId: userId,
          productId: product.id,
          inventoryLotId: lot.id,
          warehouseId: warehouse?.id,
          userId,
          type: StockMovementType.ENTRADA,
          quantity,
          reason: this.withPrefix('INVENTARIO_INICIAL', dto.notes),
        },
        include: { product: true, inventoryLot: true, warehouse: true, user: true },
      });

      return {
        message: 'Inventario inicial registrado correctamente.',
        lot: this.mapLot(lot),
        movement: this.mapMovement(movement),
      };
    });
  }

  async registerEntry(tenantId: string, userId: string, dto: RegisterStockEntryDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await this.resolveProduct(tx, tenantId, dto.product);
      const warehouse = await this.resolveWarehouse(tx, tenantId, userId, {
        warehouseId: dto.warehouseId,
        warehouseName: dto.warehouseName,
      });
      const quantity = this.toDecimal(dto.quantity);
      const expirationDate = dto.expirationDate ? new Date(dto.expirationDate) : null;
      const movementType =
        dto.entryReason === StockEntryReason.AJUSTE
          ? StockMovementType.AJUSTE
          : StockMovementType.ENTRADA;

      const lot = await tx.inventoryLot.create({
        data: {
          tenantId,
          ownerUserId: userId,
          productId: product.id,
          warehouseId: warehouse?.id,
          lotNumber: dto.lotNumber,
          expirationDate,
          initialQuantity: quantity,
          currentQuantity: quantity,
        },
        include: { product: true, warehouse: true },
      });

      await this.incrementProductStock(tx, product.id, quantity);

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          ownerUserId: userId,
          productId: product.id,
          inventoryLotId: lot.id,
          warehouseId: warehouse?.id,
          userId,
          type: movementType,
          quantity,
          reason: this.withPrefix(dto.entryReason, dto.notes),
        },
        include: { product: true, inventoryLot: true, warehouse: true, user: true },
      });

      return {
        message: 'Entrada de agroquimico registrada correctamente.',
        lot: this.mapLot(lot),
        movement: this.mapMovement(movement),
      };
    });
  }

  async registerExit(tenantId: string, userId: string, dto: RegisterStockExitDto) {
    return this.prisma.$transaction(async (tx) => {
      const quantity = this.toDecimal(dto.quantity);
      const product = await tx.product.findFirst({
        where: { id: dto.productId, tenantId },
      });

      if (!product) {
        throw new NotFoundException('El producto no existe en este sindicato.');
      }

      const lots = await tx.inventoryLot.findMany({
        where: {
          tenantId,
          ownerUserId: userId,
          productId: dto.productId,
          ...(dto.inventoryLotId ? { id: dto.inventoryLotId } : {}),
          currentQuantity: { gt: new Prisma.Decimal(0) },
        },
        orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }],
        include: { product: true, warehouse: true },
      });

      const available = lots.reduce(
        (total, lot) => total.plus(lot.currentQuantity),
        new Prisma.Decimal(0),
      );

      if (available.lessThan(quantity)) {
        throw new BadRequestException(
          `Stock insuficiente. Disponible: ${available.toString()} ${product.unit}.`,
        );
      }

      let remaining = quantity;
      const movements = [];

      for (const lot of lots) {
        if (remaining.lessThanOrEqualTo(0)) break;

        const deducted = lot.currentQuantity.lessThan(remaining)
          ? lot.currentQuantity
          : remaining;

        const updatedLot = await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { currentQuantity: { decrement: deducted } },
          include: { product: true, warehouse: true },
        });

        const movement = await tx.stockMovement.create({
          data: {
            tenantId,
            ownerUserId: userId,
            productId: dto.productId,
            inventoryLotId: lot.id,
            warehouseId: lot.warehouseId,
            userId,
            type: StockMovementType.SALIDA,
            quantity: deducted,
            reason: dto.reason,
          },
          include: { product: true, inventoryLot: true, warehouse: true, user: true },
        });

        movements.push({
          lot: this.mapLot(updatedLot),
          movement: this.mapMovement(movement),
        });
        remaining = remaining.minus(deducted);
      }

      await this.decrementProductStock(tx, dto.productId, quantity);

      return {
        message: 'Salida de agroquimico registrada correctamente.',
        movements,
      };
    });
  }

  async listStock(tenantId: string, userId: string, query: ListStockQueryDto = {}) {
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        currentQuantity: { gt: new Prisma.Decimal(0) },
        ...(query.productId ? { productId: query.productId } : {}),
        product: {
          ...(query.search
            ? {
                name: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              }
            : {}),
          ...(query.category
            ? {
                category: {
                  equals: query.category,
                  mode: Prisma.QueryMode.insensitive,
                },
              }
            : {}),
        },
      },
      orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'desc' }],
      include: {
        product: true,
        warehouse: true,
        purchaseItem: { include: { purchase: { include: { supplier: true } } } },
      },
    });

    const totalsByProduct = this.totalsByProduct(lots);
    const mapped = lots
      .map((lot) => this.mapLot(lot, totalsByProduct.get(lot.productId)))
      .filter((lot) => !query.criticality || lot.alerts.includes(query.criticality));

    return this.orderLots(mapped, query);
  }

  async listGlobalStock(tenantId: string, query: ListGlobalStockQueryDto = {}) {
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        tenantId,
        currentQuantity: { gt: new Prisma.Decimal(0) },
        ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        product: {
          ...(query.search
            ? {
                name: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              }
            : {}),
          ...(query.category
            ? {
                category: {
                  equals: query.category,
                  mode: Prisma.QueryMode.insensitive,
                },
              }
            : {}),
        },
      },
      orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'desc' }],
      include: {
        owner: true,
        product: true,
        warehouse: true,
        purchaseItem: { include: { purchase: { include: { supplier: true } } } },
      },
    });

    const totalsByOwnerProduct = this.totalsByOwnerProduct(lots);
    const mapped = lots
      .map((lot) =>
        this.mapGlobalLot(
          lot,
          totalsByOwnerProduct.get(`${lot.ownerUserId}:${lot.productId}`),
        ),
      )
      .filter((lot) => !query.criticality || lot.alerts.includes(query.criticality));

    return this.orderLots(mapped, query);
  }

  async updateProductSettings(
    tenantId: string,
    productId: string,
    dto: UpdateProductInventorySettingsDto,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
    });

    if (!product) {
      throw new NotFoundException('El producto no existe en este sindicato.');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.minimumStock !== undefined
          ? { minimumStock: this.toDecimal(dto.minimumStock) }
          : {}),
        ...(dto.expirationWarningDays !== undefined
          ? { expirationWarningDays: dto.expirationWarningDays }
          : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        unit: true,
        minimumStock: true,
        expirationWarningDays: true,
      },
    });
  }

  async listAlerts(tenantId: string, userId: string) {
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        currentQuantity: { gt: new Prisma.Decimal(0) },
      },
      include: { product: true, warehouse: true },
      orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }],
    });

    const totalsByProduct = this.totalsByProduct(lots);
    const stockAlerts = new Map<string, unknown>();
    const expirationAlerts = [];

    for (const lot of lots) {
      const total = totalsByProduct.get(lot.productId) ?? new Prisma.Decimal(0);
      const lowStock = total.lessThanOrEqualTo(lot.product.minimumStock);

      if (lowStock && !stockAlerts.has(lot.productId)) {
        stockAlerts.set(lot.productId, {
          type: InventoryCriticality.BAJO_MINIMO,
          product: {
            id: lot.product.id,
            name: lot.product.name,
            unit: lot.product.unit,
            minimumStock: lot.product.minimumStock.toString(),
            currentStock: total.toString(),
          },
          message: `Stock bajo minimo para ${lot.product.name}.`,
        });
      }

      const expirationCriticality = this.expirationCriticality(
        lot.expirationDate,
        lot.product.expirationWarningDays,
      );

      if (
        expirationCriticality === InventoryCriticality.VENCIDO ||
        expirationCriticality === InventoryCriticality.POR_VENCER
      ) {
        expirationAlerts.push({
          type: expirationCriticality,
          product: { id: lot.product.id, name: lot.product.name, unit: lot.product.unit },
          lot: {
            id: lot.id,
            lotNumber: lot.lotNumber,
            expirationDate: lot.expirationDate?.toISOString() ?? null,
            currentQuantity: lot.currentQuantity.toString(),
          },
          warehouse: lot.warehouse
            ? { id: lot.warehouse.id, name: lot.warehouse.name }
            : null,
          message:
            expirationCriticality === InventoryCriticality.VENCIDO
              ? `${lot.product.name} tiene un lote vencido.`
              : `${lot.product.name} tiene un lote proximo a vencer.`,
        });
      }
    }

    return {
      stockMinimum: Array.from(stockAlerts.values()),
      expiration: expirationAlerts,
      total: stockAlerts.size + expirationAlerts.length,
    };
  }

  async listMovements(tenantId: string, userId: string, query: ListStockMovementsQueryDto) {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { occurredAt: 'desc' },
      include: { product: true, inventoryLot: true, warehouse: true, user: true },
    });

    return movements.map((movement) => this.mapMovement(movement));
  }

  private async resolveProduct(tx: TxClient, tenantId: string, dto: ProductReferenceDto) {
    if (dto.productId) {
      const product = await tx.product.findFirst({
        where: { id: dto.productId, tenantId },
      });
      if (!product) throw new NotFoundException('El producto no existe en este sindicato.');
      return product;
    }

    if (!dto.productName?.trim()) {
      throw new BadRequestException('Debe enviar productId o productName.');
    }

    return tx.product.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: dto.productName.trim(),
        },
      },
      update: {
        activeIngredient: dto.activeIngredient?.trim() || undefined,
        category: dto.category?.trim() || undefined,
        unit: dto.unit?.trim() || undefined,
        ...(dto.minimumStock !== undefined
          ? { minimumStock: this.toDecimal(dto.minimumStock) }
          : {}),
        ...(dto.expirationWarningDays !== undefined
          ? { expirationWarningDays: dto.expirationWarningDays }
          : {}),
      },
      create: {
        tenantId,
        name: dto.productName.trim(),
        activeIngredient: dto.activeIngredient?.trim(),
        category: dto.category?.trim(),
        unit: dto.unit?.trim() || 'unidad',
        ...(dto.minimumStock !== undefined
          ? { minimumStock: this.toDecimal(dto.minimumStock) }
          : {}),
        ...(dto.expirationWarningDays !== undefined
          ? { expirationWarningDays: dto.expirationWarningDays }
          : {}),
      },
    });
  }

  private async resolveWarehouse(
    tx: TxClient,
    tenantId: string,
    userId: string,
    data: { warehouseId?: string; warehouseName?: string },
  ) {
    if (data.warehouseId) {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: data.warehouseId, tenantId },
      });
      if (!warehouse) throw new NotFoundException('El almacen no existe en este sindicato.');
      return warehouse;
    }

    if (!data.warehouseName?.trim()) {
      return null;
    }

    return tx.warehouse.create({
      data: {
        tenantId,
        ownerUserId: userId,
        name: data.warehouseName.trim(),
      },
    });
  }

  private async incrementProductStock(tx: TxClient, productId: string, quantity: Prisma.Decimal) {
    await tx.product.update({
      where: { id: productId },
      data: { currentStock: { increment: quantity } },
    });
  }

  private async decrementProductStock(tx: TxClient, productId: string, quantity: Prisma.Decimal) {
    await tx.product.update({
      where: { id: productId },
      data: { currentStock: { decrement: quantity } },
    });
  }

  private toDecimal(value: number) {
    return new Prisma.Decimal(value.toString());
  }

  private withPrefix(prefix: string, notes?: string) {
    return notes?.trim() ? `${prefix}: ${notes.trim()}` : prefix;
  }

  private totalsByProduct(lots: { productId: string; currentQuantity: Prisma.Decimal }[]) {
    const totals = new Map<string, Prisma.Decimal>();
    for (const lot of lots) {
      const current = totals.get(lot.productId) ?? new Prisma.Decimal(0);
      totals.set(lot.productId, current.plus(lot.currentQuantity));
    }
    return totals;
  }

  private totalsByOwnerProduct(
    lots: { ownerUserId: string; productId: string; currentQuantity: Prisma.Decimal }[],
  ) {
    const totals = new Map<string, Prisma.Decimal>();
    for (const lot of lots) {
      const key = `${lot.ownerUserId}:${lot.productId}`;
      const current = totals.get(key) ?? new Prisma.Decimal(0);
      totals.set(key, current.plus(lot.currentQuantity));
    }
    return totals;
  }

  private orderLots<T extends { product: { name: string }; currentQuantity: string; expirationDate: string | null }>(
    lots: T[],
    query: ListStockQueryDto,
  ) {
    const direction = query.orderDirection === 'desc' ? -1 : 1;
    const orderBy = query.orderBy ?? 'expiration';

    return [...lots].sort((a, b) => {
      if (orderBy === 'name') {
        return a.product.name.localeCompare(b.product.name) * direction;
      }
      if (orderBy === 'stock') {
        return (Number(a.currentQuantity) - Number(b.currentQuantity)) * direction;
      }

      const aTime = a.expirationDate ? new Date(a.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.expirationDate ? new Date(b.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
      return (aTime - bTime) * direction;
    });
  }

  private expirationCriticality(expirationDate: Date | null, warningDays: number) {
    if (!expirationDate) return InventoryCriticality.OK;

    const now = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() + warningDays);

    if (expirationDate.getTime() < now.getTime()) return InventoryCriticality.VENCIDO;
    if (expirationDate.getTime() <= limit.getTime()) return InventoryCriticality.POR_VENCER;
    return InventoryCriticality.OK;
  }

  private mapLot(lot: {
    id: string;
    productId: string;
    ownerUserId: string;
    lotNumber: string | null;
    expirationDate: Date | null;
    initialQuantity: Prisma.Decimal;
    currentQuantity: Prisma.Decimal;
    receivedAt: Date;
    product: {
      id: string;
      name: string;
      unit: string;
      activeIngredient: string | null;
      category?: string | null;
      minimumStock?: Prisma.Decimal;
      expirationWarningDays?: number;
    };
    warehouse: { id: string; name: string; location: string | null } | null;
    purchaseItem?: {
      purchase: { supplier: { id: string; name: string } };
    } | null;
  }, productTotal?: Prisma.Decimal) {
    const total = productTotal ?? lot.currentQuantity;
    const lowStock = lot.product.minimumStock
      ? total.lessThanOrEqualTo(lot.product.minimumStock)
      : false;
    const expirationStatus = this.expirationCriticality(
      lot.expirationDate,
      lot.product.expirationWarningDays ?? 90,
    );
    const criticality = lowStock ? InventoryCriticality.BAJO_MINIMO : expirationStatus;

    return {
      id: lot.id,
      ownerUserId: lot.ownerUserId,
      product: {
        id: lot.product.id,
        name: lot.product.name,
        activeIngredient: lot.product.activeIngredient,
        category: lot.product.category ?? null,
        unit: lot.product.unit,
        minimumStock: lot.product.minimumStock?.toString() ?? '0',
        expirationWarningDays: lot.product.expirationWarningDays ?? 90,
      },
      supplier: lot.purchaseItem?.purchase.supplier ?? null,
      warehouse: lot.warehouse
        ? { id: lot.warehouse.id, name: lot.warehouse.name, location: lot.warehouse.location }
        : null,
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate?.toISOString() ?? null,
      initialQuantity: lot.initialQuantity.toString(),
      currentQuantity: lot.currentQuantity.toString(),
      productTotalStock: total.toString(),
      criticality,
      alerts: [
        ...(lowStock ? [InventoryCriticality.BAJO_MINIMO] : []),
        ...(expirationStatus !== InventoryCriticality.OK ? [expirationStatus] : []),
      ],
      receivedAt: lot.receivedAt.toISOString(),
    };
  }

  private mapGlobalLot(lot: {
    id: string;
    productId: string;
    ownerUserId: string;
    lotNumber: string | null;
    expirationDate: Date | null;
    initialQuantity: Prisma.Decimal;
    currentQuantity: Prisma.Decimal;
    receivedAt: Date;
    owner: { id: string; name: string; email: string; role: string };
    product: {
      id: string;
      name: string;
      unit: string;
      activeIngredient: string | null;
      category: string | null;
      minimumStock: Prisma.Decimal;
      expirationWarningDays: number;
    };
    warehouse: { id: string; name: string; location: string | null } | null;
    purchaseItem?: {
      purchase: { supplier: { id: string; name: string } };
    } | null;
  }, ownerProductTotal?: Prisma.Decimal) {
    return {
      ...this.mapLot(lot, ownerProductTotal),
      owner: {
        id: lot.owner.id,
        name: lot.owner.name,
        email: lot.owner.email,
        role: lot.owner.role,
      },
    };
  }

  private mapMovement(movement: {
    id: string;
    ownerUserId: string;
    type: StockMovementType;
    quantity: Prisma.Decimal;
    reason: string | null;
    occurredAt: Date;
    createdAt: Date;
    product: { id: string; name: string; unit: string };
    inventoryLot: { id: string; lotNumber: string | null; expirationDate: Date | null } | null;
    warehouse: { id: string; name: string } | null;
    user: { id: string; name: string; email: string } | null;
  }) {
    return {
      id: movement.id,
      ownerUserId: movement.ownerUserId,
      type: movement.type,
      quantity: movement.quantity.toString(),
      reason: movement.reason,
      occurredAt: movement.occurredAt.toISOString(),
      createdAt: movement.createdAt.toISOString(),
      product: {
        id: movement.product.id,
        name: movement.product.name,
        unit: movement.product.unit,
      },
      lot: movement.inventoryLot
        ? {
            id: movement.inventoryLot.id,
            lotNumber: movement.inventoryLot.lotNumber,
            expirationDate: movement.inventoryLot.expirationDate?.toISOString() ?? null,
          }
        : null,
      warehouse: movement.warehouse
        ? { id: movement.warehouse.id, name: movement.warehouse.name }
        : null,
      registeredBy: movement.user
        ? { id: movement.user.id, name: movement.user.name, email: movement.user.email }
        : null,
    };
  }
}
