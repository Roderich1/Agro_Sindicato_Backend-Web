import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PayableStatus,
  Prisma,
  PurchasePaymentMode,
  PurchaseStatus,
  PurchaseType,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import {
  CreatePurchaseDto,
  CreatePurchaseItemDto,
  SupplierReferenceDto,
} from '../dto/create-purchase.dto';
import { ProductReferenceDto } from '../../../inventory/application/dto/product-reference.dto';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class CreatePurchaseUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(tenantId: string, userId: string, dto: CreatePurchaseDto) {
    if (dto.paymentMode === PurchasePaymentMode.CREDITO && !dto.dueDate) {
      throw new BadRequestException('La fecha de vencimiento es obligatoria para compras a credito.');
    }
    this.validateItems(dto.items);

    return this.prisma.$transaction(async (tx) => {
      const supplier = await this.resolveSupplier(tx, tenantId, dto.supplier);
      const warehouse = await this.resolveWarehouse(tx, tenantId, userId, {
        warehouseId: dto.warehouseId,
        warehouseName: dto.warehouseName,
      });

      const totalAmount = this.calculateTotal(dto.items);
      const discountAmount = dto.items.reduce(
        (total, item) => total.plus(this.toDecimal(item.discountAmount ?? 0)),
        new Prisma.Decimal(0),
      );

      const purchase = await tx.purchase.create({
        data: {
          tenantId,
          supplierId: supplier.id,
          createdById: userId,
          type: PurchaseType.INDIVIDUAL,
          paymentMode: dto.paymentMode,
          status: PurchaseStatus.RECIBIDA,
          purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : new Date(),
          receivedAt: new Date(),
          totalAmount,
          discountAmount,
          notes: dto.notes,
        },
        include: { supplier: true },
      });

      const createdItems = [];
      const createdLots = [];
      const createdMovements = [];

      for (const item of dto.items) {
        const product = await this.resolveProduct(tx, tenantId, item.product);
        const quantity = this.toDecimal(item.quantity);
        const unitCost = this.toDecimal(item.unitCost);
        const itemDiscount = this.toDecimal(item.discountAmount ?? 0);
        const subtotal = this.calculateSubtotal(quantity, unitCost, itemDiscount);

        const purchaseItem = await tx.purchaseItem.create({
          data: {
            tenantId,
            purchaseId: purchase.id,
            productId: product.id,
            quantity,
            unitCost,
            discountAmount: itemDiscount,
            subtotal,
          },
          include: { product: true },
        });

        const lot = await tx.inventoryLot.create({
          data: {
            tenantId,
            ownerUserId: userId,
            productId: product.id,
            warehouseId: warehouse?.id,
            purchaseItemId: purchaseItem.id,
            lotNumber: item.lotNumber,
            expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
            initialQuantity: quantity,
            currentQuantity: quantity,
            unitCost,
          },
          include: { product: true, warehouse: true },
        });

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
            reason: `COMPRA_${dto.paymentMode}`,
          },
          include: { product: true, inventoryLot: true, warehouse: true },
        });

        await tx.product.update({
          where: { id: product.id },
          data: { currentStock: { increment: quantity } },
        });

        createdItems.push(this.mapPurchaseItem(purchaseItem));
        createdLots.push(this.mapLot(lot));
        createdMovements.push(this.mapMovement(movement));
      }

      const payable =
        dto.paymentMode === PurchasePaymentMode.CREDITO
          ? await tx.payableAccount.create({
              data: {
                tenantId,
                purchaseId: purchase.id,
                responsibleUserId: userId,
                dueDate: new Date(dto.dueDate as string),
                totalAmount,
                paidAmount: new Prisma.Decimal(0),
                status: PayableStatus.PENDIENTE,
              },
              include: { purchase: { include: { supplier: true } } },
            })
          : null;

      return {
        message: 'Compra registrada correctamente.',
        purchase: {
          id: purchase.id,
          supplier: { id: supplier.id, name: supplier.name },
          paymentMode: purchase.paymentMode,
          status: purchase.status,
          totalAmount: purchase.totalAmount.toString(),
          discountAmount: purchase.discountAmount.toString(),
          purchasedAt: purchase.purchasedAt.toISOString(),
          receivedAt: purchase.receivedAt?.toISOString() ?? null,
        },
        items: createdItems,
        lots: createdLots,
        movements: createdMovements,
        payable: payable
          ? {
              id: payable.id,
              dueDate: payable.dueDate.toISOString(),
              totalAmount: payable.totalAmount.toString(),
              paidAmount: payable.paidAmount.toString(),
              status: payable.status,
            }
          : null,
      };
    });
  }

  private async resolveSupplier(tx: TxClient, tenantId: string, dto: SupplierReferenceDto) {
    if (dto.supplierId) {
      const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId, tenantId } });
      if (!supplier) throw new NotFoundException('El proveedor no existe en este sindicato.');
      return supplier;
    }

    if (!dto.supplierName?.trim()) {
      throw new BadRequestException('Debe enviar supplierId o supplierName.');
    }

    return tx.supplier.upsert({
      where: { tenantId_name: { tenantId, name: dto.supplierName.trim() } },
      update: {
        phone: dto.phone?.trim() || undefined,
        address: dto.address?.trim() || undefined,
      },
      create: {
        tenantId,
        name: dto.supplierName.trim(),
        phone: dto.phone?.trim(),
        address: dto.address?.trim(),
      },
    });
  }

  private async resolveProduct(tx: TxClient, tenantId: string, dto: ProductReferenceDto) {
    if (dto.productId) {
      const product = await tx.product.findFirst({ where: { id: dto.productId, tenantId } });
      if (!product) throw new NotFoundException('El producto no existe en este sindicato.');
      return product;
    }

    if (!dto.productName?.trim()) {
      throw new BadRequestException('Debe enviar productId o productName.');
    }

    return tx.product.upsert({
      where: { tenantId_name: { tenantId, name: dto.productName.trim() } },
      update: {
        activeIngredient: dto.activeIngredient?.trim() || undefined,
        category: dto.category?.trim() || undefined,
        unit: dto.unit?.trim() || undefined,
        ...(dto.minimumStock !== undefined ? { minimumStock: this.toDecimal(dto.minimumStock) } : {}),
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
        ...(dto.minimumStock !== undefined ? { minimumStock: this.toDecimal(dto.minimumStock) } : {}),
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
      const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, tenantId } });
      if (!warehouse) throw new NotFoundException('El almacen no existe en este sindicato.');
      return warehouse;
    }

    if (!data.warehouseName?.trim()) return null;

    return tx.warehouse.create({
      data: { tenantId, ownerUserId: userId, name: data.warehouseName.trim() },
    });
  }

  private calculateTotal(items: CreatePurchaseItemDto[]) {
    return items.reduce((total, item) => {
      const quantity = this.toDecimal(item.quantity);
      const unitCost = this.toDecimal(item.unitCost);
      const discount = this.toDecimal(item.discountAmount ?? 0);
      return total.plus(this.calculateSubtotal(quantity, unitCost, discount));
    }, new Prisma.Decimal(0));
  }

  private validateItems(items: CreatePurchaseItemDto[]) {
    for (const item of items) {
      const quantity = this.toDecimal(item.quantity);
      const unitCost = this.toDecimal(item.unitCost);
      const discount = this.toDecimal(item.discountAmount ?? 0);
      this.calculateSubtotal(quantity, unitCost, discount);
    }
  }

  private calculateSubtotal(
    quantity: Prisma.Decimal,
    unitCost: Prisma.Decimal,
    discount: Prisma.Decimal,
  ) {
    const gross = quantity.mul(unitCost);
    if (discount.greaterThan(gross)) {
      throw new BadRequestException(
        `El descuento (${discount.toString()}) no puede ser mayor al subtotal bruto (${gross.toString()}).`,
      );
    }

    return gross.minus(discount);
  }

  private toDecimal(value: number) {
    return new Prisma.Decimal(value.toString());
  }

  private mapPurchaseItem(item: {
    id: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    product: { id: string; name: string; unit: string };
  }) {
    return {
      id: item.id,
      product: item.product,
      quantity: item.quantity.toString(),
      unitCost: item.unitCost.toString(),
      discountAmount: item.discountAmount.toString(),
      subtotal: item.subtotal.toString(),
    };
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
