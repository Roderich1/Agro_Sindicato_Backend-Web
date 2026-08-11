import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CalendarEventStatus,
  CalendarEventType,
  PayableStatus,
  Prisma,
  PurchasePaymentMode,
  PurchaseStatus,
  PurchaseType,
  StockMovementReasonType,
  StockMovementType,
} from '@prisma/client';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignContext: CampaignContextService,
  ) {}

  async execute(tenantId: string, userId: string, dto: CreatePurchaseDto) {
    if (dto.paymentMode === PurchasePaymentMode.CREDITO && !dto.dueDate) {
      throw new BadRequestException('La fecha de vencimiento es obligatoria para compras a credito.');
    }
    this.validateItems(dto.items);

    return this.prisma.$transaction(async (tx) => {
      const campaign = await this.campaignContext.resolveCampaignForOperation(
        tenantId,
        dto.campaignId,
        tx,
      );
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
      const status = dto.status ?? PurchaseStatus.RECIBIDA;
      const receivesStock = status === PurchaseStatus.RECIBIDA || status === PurchaseStatus.RECIBIDA_PARCIAL;
      const purchasedAt = dto.purchasedAt ? new Date(dto.purchasedAt) : new Date();
      const expectedAt = dto.expectedAt ? new Date(dto.expectedAt) : null;

      const purchase = await tx.purchase.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          supplierId: supplier.id,
          createdById: userId,
          type: PurchaseType.INDIVIDUAL,
          paymentMode: dto.paymentMode,
          status,
          purchasedAt,
          expectedAt,
          receivedAt: receivesStock ? new Date() : null,
          totalAmount,
          discountAmount,
          notes: dto.notes,
        },
        include: { supplier: true },
      });

      const { createdItems, createdLots, createdMovements } = await this.createItemsAndStock(tx, {
        tenantId,
        userId,
        campaignId: campaign.id,
        purchaseId: purchase.id,
        warehouseId: warehouse?.id,
        paymentMode: dto.paymentMode,
        receivesStock,
        items: dto.items,
      });

      const payable = await this.createPayableAccount(tx, {
        tenantId,
        campaignId: campaign.id,
        userId,
        purchaseId: purchase.id,
        paymentMode: dto.paymentMode,
        dueDate: dto.dueDate,
        totalAmount,
      });

      await this.createPayableCalendarEvent(tx, {
        tenantId,
        campaignId: campaign.id,
        userId,
        purchaseId: purchase.id,
        supplierName: supplier.name,
        payable,
      });

      await this.createScheduledPurchaseCalendarEvent(tx, {
        tenantId,
        campaignId: campaign.id,
        userId,
        purchaseId: purchase.id,
        supplierName: supplier.name,
        status,
        notes: dto.notes,
        eventDate: expectedAt ?? purchasedAt,
        paymentMode: dto.paymentMode,
        totalAmount,
      });

      return {
        message: 'Compra registrada correctamente.',
        purchase: {
          id: purchase.id,
          campaignId: purchase.campaignId,
          supplier: { id: supplier.id, name: supplier.name },
          paymentMode: purchase.paymentMode,
          status: purchase.status,
          totalAmount: purchase.totalAmount.toString(),
          discountAmount: purchase.discountAmount.toString(),
          purchasedAt: purchase.purchasedAt.toISOString(),
          expectedAt: purchase.expectedAt?.toISOString() ?? null,
          receivedAt: purchase.receivedAt?.toISOString() ?? null,
        },
        items: createdItems,
        lots: createdLots,
        movements: createdMovements,
        payable: payable
          ? {
              id: payable.id,
              campaignId: payable.campaignId,
              dueDate: payable.dueDate.toISOString(),
              totalAmount: payable.totalAmount.toString(),
              paidAmount: payable.paidAmount.toString(),
              status: payable.status,
            }
          : null,
      };
    });
  }

  private async createItemsAndStock(
    tx: TxClient,
    data: {
      tenantId: string;
      userId: string;
      campaignId: string;
      purchaseId: string;
      warehouseId?: string;
      paymentMode: PurchasePaymentMode;
      receivesStock: boolean;
      items: CreatePurchaseItemDto[];
    },
  ) {
    const createdItems = [];
    const createdLots = [];
    const createdMovements = [];

    for (const item of data.items) {
      const product = await this.resolveProduct(tx, data.tenantId, item.product);
      const quantity = this.toDecimal(item.quantity);
      const receivedQuantity = this.toDecimal(item.receivedQuantity ?? item.quantity);
      const unitCost = this.toDecimal(item.unitCost);
      const itemDiscount = this.toDecimal(item.discountAmount ?? 0);
      const subtotal = this.calculateSubtotal(quantity, unitCost, itemDiscount);

      const purchaseItem = await tx.purchaseItem.create({
        data: {
          tenantId: data.tenantId,
          purchaseId: data.purchaseId,
          productId: product.id,
          quantity,
          unitCost,
          discountAmount: itemDiscount,
          subtotal,
        },
        include: { product: true },
      });

      if (data.receivesStock && receivedQuantity.greaterThan(0)) {
        const stock = await this.registerPurchasedStock(tx, {
          tenantId: data.tenantId,
          userId: data.userId,
          campaignId: data.campaignId,
          warehouseId: data.warehouseId,
          purchaseItemId: purchaseItem.id,
          productId: product.id,
          paymentMode: data.paymentMode,
          receivedQuantity,
          unitCost,
          lotNumber: item.lotNumber,
          expirationDate: item.expirationDate,
        });
        createdLots.push(stock.lot);
        createdMovements.push(stock.movement);
      }

      createdItems.push(this.mapPurchaseItem(purchaseItem));
    }

    return { createdItems, createdLots, createdMovements };
  }

  private async registerPurchasedStock(
    tx: TxClient,
    data: {
      tenantId: string;
      userId: string;
      campaignId: string;
      warehouseId?: string;
      purchaseItemId: string;
      productId: string;
      paymentMode: PurchasePaymentMode;
      receivedQuantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      lotNumber?: string;
      expirationDate?: string;
    },
  ) {
    const lot = await tx.inventoryLot.create({
      data: {
        tenantId: data.tenantId,
        ownerUserId: data.userId,
        campaignId: data.campaignId,
        productId: data.productId,
        warehouseId: data.warehouseId,
        purchaseItemId: data.purchaseItemId,
        lotNumber: data.lotNumber,
        expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
        initialQuantity: data.receivedQuantity,
        currentQuantity: data.receivedQuantity,
        unitCost: data.unitCost,
      },
      include: { product: true, warehouse: true },
    });

    const movement = await tx.stockMovement.create({
      data: {
        tenantId: data.tenantId,
        ownerUserId: data.userId,
        campaignId: data.campaignId,
        productId: data.productId,
        inventoryLotId: lot.id,
        warehouseId: data.warehouseId,
        userId: data.userId,
        type: StockMovementType.ENTRADA,
        reasonType: StockMovementReasonType.COMPRA,
        quantity: data.receivedQuantity,
        reason: `COMPRA_${data.paymentMode}`,
      },
      include: { product: true, inventoryLot: true, warehouse: true },
    });

    await tx.product.update({
      where: { id: data.productId },
      data: { currentStock: { increment: data.receivedQuantity } },
    });

    return {
      lot: this.mapLot(lot),
      movement: this.mapMovement(movement),
    };
  }

  private async createPayableAccount(
    tx: TxClient,
    data: {
      tenantId: string;
      campaignId: string;
      userId: string;
      purchaseId: string;
      paymentMode: PurchasePaymentMode;
      dueDate?: string;
      totalAmount: Prisma.Decimal;
    },
  ) {
    if (data.paymentMode !== PurchasePaymentMode.CREDITO) return null;

    return tx.payableAccount.create({
      data: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        purchaseId: data.purchaseId,
        responsibleUserId: data.userId,
        dueDate: new Date(data.dueDate as string),
        totalAmount: data.totalAmount,
        paidAmount: new Prisma.Decimal(0),
        status: PayableStatus.PENDIENTE,
      },
      include: { purchase: { include: { supplier: true } } },
    });
  }

  private async createPayableCalendarEvent(
    tx: TxClient,
    data: {
      tenantId: string;
      campaignId: string;
      userId: string;
      purchaseId: string;
      supplierName: string;
      payable: Awaited<ReturnType<CreatePurchaseUseCase['createPayableAccount']>>;
    },
  ) {
    if (!data.payable) return;

    await tx.calendarEvent.create({
      data: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        ownerUserId: data.userId,
        type: CalendarEventType.PAGO_PROXIMO,
        status: CalendarEventStatus.PENDIENTE,
        title: `Pago pendiente a ${data.supplierName}`,
        description: `Cuenta por pagar de compra ${data.purchaseId}.`,
        eventDate: data.payable.dueDate,
        sourceEntity: 'PayableAccount',
        sourceEntityId: data.payable.id,
        metadata: { purchaseId: data.purchaseId, totalAmount: data.payable.totalAmount.toString() },
      },
    });
  }

  private async createScheduledPurchaseCalendarEvent(
    tx: TxClient,
    data: {
      tenantId: string;
      campaignId: string;
      userId: string;
      purchaseId: string;
      supplierName: string;
      status: PurchaseStatus;
      notes?: string | null;
      eventDate: Date;
      paymentMode: PurchasePaymentMode;
      totalAmount: Prisma.Decimal;
    },
  ) {
    if (data.status !== PurchaseStatus.PROGRAMADA) return;

    await tx.calendarEvent.create({
      data: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        ownerUserId: data.userId,
        type: CalendarEventType.COMPRA_PROGRAMADA,
        status: CalendarEventStatus.PENDIENTE,
        title: `Compra programada con ${data.supplierName}`,
        description: data.notes ?? null,
        eventDate: data.eventDate,
        sourceEntity: 'Purchase',
        sourceEntityId: data.purchaseId,
        metadata: { paymentMode: data.paymentMode, totalAmount: data.totalAmount.toString() },
      },
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
      const receivedQuantity = this.toDecimal(item.receivedQuantity ?? item.quantity);
      const unitCost = this.toDecimal(item.unitCost);
      const discount = this.toDecimal(item.discountAmount ?? 0);
      if (receivedQuantity.greaterThan(quantity)) {
        throw new BadRequestException('La cantidad recibida no puede superar la cantidad comprada.');
      }
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
    campaignId?: string | null;
    lotNumber: string | null;
    expirationDate: Date | null;
    currentQuantity: Prisma.Decimal;
    product: { id: string; name: string; unit: string };
    warehouse: { id: string; name: string } | null;
  }) {
    return {
      id: lot.id,
      campaignId: lot.campaignId ?? null,
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
    reasonType?: StockMovementReasonType | null;
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
