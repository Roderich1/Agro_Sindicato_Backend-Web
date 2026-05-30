import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ListLotsQueryDto, UpdateInventoryLotDto } from '../dto/inventory-lot.dto';

@Injectable()
export class InventoryLotUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string, query: ListLotsQueryDto) {
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        ...(query.productId ? { productId: query.productId } : {}),
      },
      orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'desc' }],
      include: { product: true, warehouse: true },
    });

    return lots.map((lot) => this.map(lot));
  }

  async update(tenantId: string, userId: string, lotId: string, dto: UpdateInventoryLotDto) {
    const lot = await this.prisma.inventoryLot.findFirst({
      where: { id: lotId, tenantId, ownerUserId: userId },
    });

    if (!lot) throw new NotFoundException('El lote no existe para este agricultor.');

    const warehouse = await this.resolveWarehouse(tenantId, userId, dto);
    const updated = await this.prisma.inventoryLot.update({
      where: { id: lotId },
      data: {
        ...(dto.lotNumber !== undefined ? { lotNumber: dto.lotNumber || null } : {}),
        ...(dto.expirationDate !== undefined
          ? { expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null }
          : {}),
        ...(warehouse !== undefined ? { warehouseId: warehouse?.id ?? null } : {}),
      },
      include: { product: true, warehouse: true },
    });

    return this.map(updated);
  }

  private async resolveWarehouse(tenantId: string, userId: string, dto: UpdateInventoryLotDto) {
    if (dto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId },
      });
      if (!warehouse) throw new NotFoundException('El almacen no existe en este sindicato.');
      return warehouse;
    }

    if (dto.warehouseName?.trim()) {
      return this.prisma.warehouse.create({
        data: { tenantId, ownerUserId: userId, name: dto.warehouseName.trim() },
      });
    }

    return undefined;
  }

  private map(lot: {
    id: string;
    ownerUserId: string;
    lotNumber: string | null;
    expirationDate: Date | null;
    initialQuantity: Prisma.Decimal;
    currentQuantity: Prisma.Decimal;
    receivedAt: Date;
    product: { id: string; name: string; unit: string; activeIngredient: string | null; category: string | null };
    warehouse: { id: string; name: string; location: string | null } | null;
  }) {
    return {
      id: lot.id,
      ownerUserId: lot.ownerUserId,
      product: lot.product,
      warehouse: lot.warehouse,
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate?.toISOString() ?? null,
      initialQuantity: lot.initialQuantity.toString(),
      currentQuantity: lot.currentQuantity.toString(),
      receivedAt: lot.receivedAt.toISOString(),
    };
  }
}
