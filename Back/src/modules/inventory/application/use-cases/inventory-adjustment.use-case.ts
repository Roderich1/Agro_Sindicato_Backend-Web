import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, StockMovementType } from '@prisma/client';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import {
  RegisterStockAdjustmentDto,
  StockAdjustmentDirection,
} from '../dto/register-stock-adjustment.dto';

@Injectable()
export class InventoryAdjustmentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignContext: CampaignContextService,
  ) {}

  async execute(tenantId: string, userId: string, dto: RegisterStockAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await this.campaignContext.resolveCampaignForOperation(
        tenantId,
        dto.campaignId,
        tx,
      );
      const product = await tx.product.findFirst({
        where: { id: dto.productId, tenantId },
      });
      if (!product) throw new NotFoundException('El producto no existe en este sindicato.');

      const quantity = new Prisma.Decimal(dto.quantity.toString());
      if (dto.direction === StockAdjustmentDirection.INCREMENTO) {
        return this.increment(tx, tenantId, userId, campaign.id, dto, quantity);
      }

      return this.decrement(tx, tenantId, userId, campaign.id, dto, quantity, product.unit);
    });
  }

  private async increment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    campaignId: string,
    dto: RegisterStockAdjustmentDto,
    quantity: Prisma.Decimal,
  ) {
    const lot = dto.inventoryLotId
      ? await this.incrementExistingLot(tx, tenantId, userId, dto.productId, dto.inventoryLotId, quantity)
      : await tx.inventoryLot.create({
          data: {
            tenantId,
            ownerUserId: userId,
            campaignId,
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

    await tx.product.update({
      where: { id: dto.productId },
      data: { currentStock: { increment: quantity } },
    });

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        ownerUserId: userId,
        campaignId,
        productId: dto.productId,
        inventoryLotId: lot.id,
        warehouseId: lot.warehouseId,
        userId,
        type: StockMovementType.AJUSTE,
        reasonType: dto.reasonType,
        quantity,
        reason: this.reason(dto),
      },
      include: { product: true, inventoryLot: true, warehouse: true, user: true },
    });

    await this.recordAudit(tx, {
      tenantId,
      campaignId,
      actorUserId: userId,
      ownerUserId: userId,
      summary: `Ajuste de incremento: ${quantity.toString()} ${movement.product.unit}`,
      after: { movementId: movement.id, lotId: lot.id, reasonType: dto.reasonType },
    });

    return {
      message: 'Ajuste de incremento registrado correctamente.',
      lot: this.mapLot(lot),
      movement: this.mapMovement(movement),
    };
  }

  private async incrementExistingLot(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    productId: string,
    lotId: string,
    quantity: Prisma.Decimal,
  ) {
    const existingLot = await tx.inventoryLot.findFirst({
      where: {
        id: lotId,
        tenantId,
        ownerUserId: userId,
        productId,
      },
    });

    if (!existingLot) {
      throw new NotFoundException('El lote no existe para este agricultor y producto.');
    }

    return tx.inventoryLot.update({
      where: { id: lotId },
      data: { currentQuantity: { increment: quantity } },
      include: { product: true, warehouse: true },
    });
  }

  private async decrement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    campaignId: string,
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
      const updatedLot = await this.decrementLotQuantity(
        tx,
        tenantId,
        userId,
        lot.id,
        deducted,
      );
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          ownerUserId: userId,
          campaignId,
          productId: dto.productId,
          inventoryLotId: lot.id,
          warehouseId: lot.warehouseId,
          userId,
          type: StockMovementType.AJUSTE,
          reasonType: dto.reasonType,
          quantity: deducted,
          reason: this.reason(dto),
        },
        include: { product: true, inventoryLot: true, warehouse: true, user: true },
      });
      movements.push({ lot: this.mapLot(updatedLot), movement: this.mapMovement(movement) });
      remaining = remaining.minus(deducted);
    }

    await this.decrementProductStock(tx, tenantId, dto.productId, quantity);

    await this.recordAudit(tx, {
      tenantId,
      campaignId,
      actorUserId: userId,
      ownerUserId: userId,
      summary: `Ajuste de decremento: ${quantity.toString()} ${unit}`,
      after: { movements: movements.map((item) => item.movement.id), reasonType: dto.reasonType },
    });

    return {
      message: 'Ajuste de decremento registrado correctamente.',
      movements,
    };
  }

  private async decrementLotQuantity(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    lotId: string,
    quantity: Prisma.Decimal,
  ) {
    const updated = await tx.inventoryLot.updateMany({
      where: {
        id: lotId,
        tenantId,
        ownerUserId: userId,
        currentQuantity: { gte: quantity },
      },
      data: { currentQuantity: { decrement: quantity } },
    });

    if (updated.count !== 1) {
      throw new BadRequestException(
        'Stock insuficiente. El inventario fue actualizado por otra operacion, vuelve a intentarlo.',
      );
    }

    return tx.inventoryLot.findUniqueOrThrow({
      where: { id: lotId },
      include: { product: true, warehouse: true },
    });
  }

  private async decrementProductStock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    quantity: Prisma.Decimal,
  ) {
    const updated = await tx.product.updateMany({
      where: {
        id: productId,
        tenantId,
        currentStock: { gte: quantity },
      },
      data: { currentStock: { decrement: quantity } },
    });

    if (updated.count !== 1) {
      throw new BadRequestException(
        'Stock global insuficiente. El inventario fue actualizado por otra operacion, vuelve a intentarlo.',
      );
    }
  }

  private reason(dto: RegisterStockAdjustmentDto) {
    return [dto.reasonType, dto.direction, dto.reason].filter(Boolean).join(': ');
  }

  private async recordAudit(
    tx: Prisma.TransactionClient,
    data: {
      tenantId: string;
      campaignId: string;
      actorUserId: string;
      ownerUserId: string;
      summary: string;
      after: unknown;
    },
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        actorUserId: data.actorUserId,
        ownerUserId: data.ownerUserId,
        action: AuditAction.AJUSTAR_STOCK,
        entityName: 'StockMovement',
        summary: data.summary,
        after: JSON.parse(JSON.stringify(data.after)) as Prisma.InputJsonValue,
      },
    });
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
    campaignId?: string | null;
    type: StockMovementType;
    reasonType?: string | null;
    quantity: Prisma.Decimal;
    reason: string | null;
    occurredAt: Date;
    product: { id: string; name: string; unit: string };
    inventoryLot: { id: string; lotNumber: string | null } | null;
    warehouse: { id: string; name: string } | null;
  }) {
    return {
      id: movement.id,
      campaignId: movement.campaignId ?? null,
      type: movement.type,
      reasonType: movement.reasonType ?? null,
      quantity: movement.quantity.toString(),
      reason: movement.reason,
      occurredAt: movement.occurredAt.toISOString(),
      product: movement.product,
      lot: movement.inventoryLot,
      warehouse: movement.warehouse,
    };
  }
}
