import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import {
  RegisterStockAdjustmentDto,
  StockAdjustmentDirection,
} from '../dto/register-stock-adjustment.dto';

@Injectable()
export class InventoryAdjustmentUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(tenantId: string, userId: string, dto: RegisterStockAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: dto.productId, tenantId },
      });
      if (!product) throw new NotFoundException('El producto no existe en este sindicato.');

      const quantity = new Prisma.Decimal(dto.quantity.toString());
      if (dto.direction === StockAdjustmentDirection.INCREMENTO) {
        return this.increment(tx, tenantId, userId, dto, quantity);
      }

      return this.decrement(tx, tenantId, userId, dto, quantity, product.unit);
    });
  }

  private async increment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: RegisterStockAdjustmentDto,
    quantity: Prisma.Decimal,
  ) {
    const lot = dto.inventoryLotId
      ? await tx.inventoryLot.update({
          where: { id: dto.inventoryLotId },
          data: { currentQuantity: { increment: quantity } },
          include: { product: true, warehouse: true },
        })
      : await tx.inventoryLot.create({
          data: {
            tenantId,
            ownerUserId: userId,
            productId: dto.productId,
            lotNumber: dto.lotNumber,
            expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null,
            initialQuantity: quantity,
            currentQuantity: quantity,
            warehouseId: dto.warehouseName
              ? (await tx.warehouse.create({
                  data: { tenantId, ownerUserId: userId, name: dto.warehouseName.trim() },
                })).id
              : undefined,
          },
          include: { product: true, warehouse: true },
        });

    if (lot.tenantId !== tenantId || lot.ownerUserId !== userId) {
      throw new NotFoundException('El lote no existe para este agricultor.');
    }

    await tx.product.update({
      where: { id: dto.productId },
      data: { currentStock: { increment: quantity } },
    });

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        ownerUserId: userId,
        productId: dto.productId,
        inventoryLotId: lot.id,
        warehouseId: lot.warehouseId,
        userId,
        type: StockMovementType.AJUSTE,
        quantity,
        reason: this.reason(dto),
      },
      include: { product: true, inventoryLot: true, warehouse: true, user: true },
    });

    return {
      message: 'Ajuste de incremento registrado correctamente.',
      lot: this.mapLot(lot),
      movement: this.mapMovement(movement),
    };
  }

  private async decrement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: RegisterStockAdjustmentDto,
    quantity: Prisma.Decimal,
    unit: string,
  ) {
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

    const available = lots.reduce((total, lot) => total.plus(lot.currentQuantity), new Prisma.Decimal(0));
    if (available.lessThan(quantity)) {
      throw new BadRequestException(`Stock insuficiente para ajustar. Disponible: ${available.toString()} ${unit}.`);
    }

    let remaining = quantity;
    const movements = [];
    for (const lot of lots) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const deducted = lot.currentQuantity.lessThan(remaining) ? lot.currentQuantity : remaining;
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
          type: StockMovementType.AJUSTE,
          quantity: deducted,
          reason: this.reason(dto),
        },
        include: { product: true, inventoryLot: true, warehouse: true, user: true },
      });
      movements.push({ lot: this.mapLot(updatedLot), movement: this.mapMovement(movement) });
      remaining = remaining.minus(deducted);
    }

    await tx.product.update({
      where: { id: dto.productId },
      data: { currentStock: { decrement: quantity } },
    });

    return {
      message: 'Ajuste de decremento registrado correctamente.',
      movements,
    };
  }

  private reason(dto: RegisterStockAdjustmentDto) {
    return [dto.reasonType, dto.direction, dto.reason].filter(Boolean).join(': ');
  }

  private mapLot(lot: {
    id: string;
    lotNumber: string | null;
    expirationDate: Date | null;
    currentQuantity: Prisma.Decimal;
    product: { id: string; name: string; unit: string };
    warehouse: { id: string; name: string } | null;
  }) {
    return {
      id: lot.id,
      product: lot.product,
      warehouse: lot.warehouse,
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate?.toISOString() ?? null,
      currentQuantity: lot.currentQuantity.toString(),
    };
  }

  private mapMovement(movement: {
    id: string;
    type: StockMovementType;
    quantity: Prisma.Decimal;
    reason: string | null;
    occurredAt: Date;
    product: { id: string; name: string; unit: string };
    inventoryLot: { id: string; lotNumber: string | null } | null;
    warehouse: { id: string; name: string } | null;
  }) {
    return {
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity.toString(),
      reason: movement.reason,
      occurredAt: movement.occurredAt.toISOString(),
      product: movement.product,
      lot: movement.inventoryLot,
      warehouse: movement.warehouse,
    };
  }
}
