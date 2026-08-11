import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CalendarEventStatus,
  CalendarEventType,
  PayableStatus,
  Prisma,
  PurchaseParticipantStatus,
  PurchasePaymentMode,
  PurchaseStatus,
  PurchaseType,
  StockMovementReasonType,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ProductReferenceDto } from '../../../inventory/application/dto/product-reference.dto';
import { SupplierReferenceDto } from '../dto/create-purchase.dto';
import {
  CreateJointPurchaseDto,
  CreateJointPurchaseItemDto,
} from '../dto/create-joint-purchase.dto';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class CreateJointPurchaseUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignContext: CampaignContextService,
  ) {}

  async execute(tenantId: string, createdById: string, dto: CreateJointPurchaseDto) {
    if (dto.paymentMode === PurchasePaymentMode.CREDITO && !dto.dueDate) {
      throw new BadRequestException('La fecha de vencimiento es obligatoria para compras a credito.');
    }

    return this.prisma.$transaction(async (tx) => {
      this.validateItems(dto.items);
      const campaign = await this.campaignContext.resolveCampaignForOperation(
        tenantId,
        dto.campaignId,
        tx,
      );

      const participantIds = this.uniqueParticipantIds(dto);
      const participants = await tx.user.findMany({
        where: {
          tenantId,
          id: { in: participantIds },
          role: UserRole.AGRICULTOR,
          isActive: true,
        },
      });

      if (participants.length !== participantIds.length) {
        throw new BadRequestException('Uno o mas agricultores no existen, no estan activos o no pertenecen al sindicato.');
      }

      const supplier = await this.resolveSupplier(tx, tenantId, dto.supplier);
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
          createdById,
          type: PurchaseType.CONJUNTA,
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

      const participantTotals = new Map<string, { quantity: Prisma.Decimal; amount: Prisma.Decimal }>();
      for (const userId of participantIds) {
        participantTotals.set(userId, {
          quantity: new Prisma.Decimal(0),
          amount: new Prisma.Decimal(0),
        });
      }

      const items = [];
      const lots = [];
      const movements = [];
      const allocations = [];

      for (const item of dto.items) {
        const product = await this.resolveProduct(tx, tenantId, item.product);
        const quantity = this.toDecimal(item.quantity);
        const receivedQuantity = this.toDecimal(item.receivedQuantity ?? item.quantity);
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

        items.push({
          id: purchaseItem.id,
          product: purchaseItem.product,
          quantity: purchaseItem.quantity.toString(),
          unitCost: purchaseItem.unitCost.toString(),
          discountAmount: purchaseItem.discountAmount.toString(),
          subtotal: purchaseItem.subtotal.toString(),
        });

        for (const allocation of item.allocations) {
          const farmerQuantity = this.toDecimal(allocation.quantity);
          const farmerSubtotal = subtotal.mul(farmerQuantity).div(quantity);
          const farmerReceivedQuantity = quantity.equals(0)
            ? new Prisma.Decimal(0)
            : receivedQuantity.mul(farmerQuantity).div(quantity);
          const warehouse = await this.resolveWarehouse(tx, tenantId, allocation.userId, {
            warehouseId: dto.warehouseId,
            warehouseName: dto.warehouseName,
          });

          const purchaseItemAllocation = await tx.purchaseItemAllocation.create({
            data: {
              tenantId,
              purchaseItemId: purchaseItem.id,
              userId: allocation.userId,
              quantity: farmerQuantity,
              subtotal: farmerSubtotal,
            },
            include: { user: true },
          });

          if (receivesStock && farmerReceivedQuantity.greaterThan(0)) {
            const lot = await tx.inventoryLot.create({
              data: {
                tenantId,
                ownerUserId: allocation.userId,
                campaignId: campaign.id,
                productId: product.id,
                warehouseId: warehouse?.id,
                purchaseItemId: purchaseItem.id,
                lotNumber: item.lotNumber,
                expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
                initialQuantity: farmerReceivedQuantity,
                currentQuantity: farmerReceivedQuantity,
                unitCost,
              },
              include: { product: true, warehouse: true, owner: true },
            });

            const movement = await tx.stockMovement.create({
              data: {
                tenantId,
                ownerUserId: allocation.userId,
                campaignId: campaign.id,
                productId: product.id,
                inventoryLotId: lot.id,
                warehouseId: warehouse?.id,
                userId: createdById,
                type: StockMovementType.ENTRADA,
                reasonType: StockMovementReasonType.COMPRA,
                quantity: farmerReceivedQuantity,
                reason: 'COMPRA_CONJUNTA',
              },
              include: { product: true, inventoryLot: true, warehouse: true, owner: true },
            });

            await tx.product.update({
              where: { id: product.id },
              data: { currentStock: { increment: farmerReceivedQuantity } },
            });

            lots.push({
              id: lot.id,
              campaignId: lot.campaignId,
              owner: { id: lot.owner.id, name: lot.owner.name },
              product: lot.product,
              warehouse: lot.warehouse,
              lotNumber: lot.lotNumber,
              expirationDate: lot.expirationDate?.toISOString() ?? null,
              currentQuantity: lot.currentQuantity.toString(),
            });
            movements.push({
              id: movement.id,
              campaignId: movement.campaignId,
              owner: { id: movement.owner.id, name: movement.owner.name },
              product: movement.product,
              quantity: movement.quantity.toString(),
              reasonType: movement.reasonType,
              reason: movement.reason,
            });
          }

          const totals = participantTotals.get(allocation.userId);
          if (totals) {
            participantTotals.set(allocation.userId, {
              quantity: totals.quantity.plus(farmerQuantity),
              amount: totals.amount.plus(farmerSubtotal),
            });
          }

          allocations.push({
            id: purchaseItemAllocation.id,
            user: {
              id: purchaseItemAllocation.user.id,
              name: purchaseItemAllocation.user.name,
              email: purchaseItemAllocation.user.email,
            },
            purchaseItemId: purchaseItem.id,
            product: { id: product.id, name: product.name, unit: product.unit },
            quantity: farmerQuantity.toString(),
            subtotal: farmerSubtotal.toString(),
          });
        }
      }

      const createdParticipants = [];
      const payables = [];

      for (const [userId, totals] of participantTotals.entries()) {
        const participant = await tx.purchaseParticipant.create({
          data: {
            tenantId,
            purchaseId: purchase.id,
            userId,
            status: PurchaseParticipantStatus.ENTREGADO,
            requestedAmount: totals.quantity,
            allocatedAmount: totals.amount,
          },
          include: { user: true },
        });

        createdParticipants.push({
          id: participant.id,
          user: { id: participant.user.id, name: participant.user.name, email: participant.user.email },
          requestedAmount: participant.requestedAmount.toString(),
          allocatedAmount: participant.allocatedAmount.toString(),
          status: participant.status,
        });

        if (dto.paymentMode === PurchasePaymentMode.CREDITO && totals.amount.greaterThan(0)) {
          const payable = await tx.payableAccount.create({
            data: {
              tenantId,
              campaignId: campaign.id,
              purchaseId: purchase.id,
              responsibleUserId: userId,
              dueDate: new Date(dto.dueDate as string),
              totalAmount: totals.amount,
              paidAmount: new Prisma.Decimal(0),
              status: PayableStatus.PENDIENTE,
            },
            include: { responsibleUser: true },
          });

          payables.push({
            id: payable.id,
            campaignId: payable.campaignId,
            responsibleUser: payable.responsibleUser
              ? {
                  id: payable.responsibleUser.id,
                  name: payable.responsibleUser.name,
                  email: payable.responsibleUser.email,
                }
              : null,
            dueDate: payable.dueDate.toISOString(),
            totalAmount: payable.totalAmount.toString(),
            paidAmount: payable.paidAmount.toString(),
            status: payable.status,
          });

          await tx.calendarEvent.create({
            data: {
              tenantId,
              campaignId: campaign.id,
              ownerUserId: userId,
              type: CalendarEventType.PAGO_PROXIMO,
              status: CalendarEventStatus.PENDIENTE,
              title: `Pago pendiente a ${supplier.name}`,
              description: `Cuenta por pagar de compra conjunta ${purchase.id}.`,
              eventDate: payable.dueDate,
              sourceEntity: 'PayableAccount',
              sourceEntityId: payable.id,
              metadata: { purchaseId: purchase.id, totalAmount: payable.totalAmount.toString() },
            },
          });
        }
      }

      if (status === PurchaseStatus.PROGRAMADA) {
        await tx.calendarEvent.create({
          data: {
            tenantId,
            campaignId: campaign.id,
            type: CalendarEventType.COMPRA_PROGRAMADA,
            status: CalendarEventStatus.PENDIENTE,
            title: `Compra conjunta programada con ${supplier.name}`,
            description: dto.notes ?? null,
            eventDate: expectedAt ?? purchasedAt,
            sourceEntity: 'Purchase',
            sourceEntityId: purchase.id,
            metadata: { paymentMode: dto.paymentMode, totalAmount: totalAmount.toString() },
          },
        });
      }

      return {
        message: 'Compra conjunta registrada y distribuida correctamente.',
        purchase: {
          id: purchase.id,
          campaignId: purchase.campaignId,
          supplier: { id: supplier.id, name: supplier.name },
          type: purchase.type,
          paymentMode: purchase.paymentMode,
          status: purchase.status,
          totalAmount: purchase.totalAmount.toString(),
          discountAmount: purchase.discountAmount.toString(),
          purchasedAt: purchase.purchasedAt.toISOString(),
          expectedAt: purchase.expectedAt?.toISOString() ?? null,
          receivedAt: purchase.receivedAt?.toISOString() ?? null,
        },
        participants: createdParticipants,
        items,
        allocations,
        lots,
        movements,
        payables,
      };
    });
  }

  private validateItems(items: CreateJointPurchaseItemDto[]) {
    for (const item of items) {
      const quantity = this.toDecimal(item.quantity);
      const receivedQuantity = this.toDecimal(item.receivedQuantity ?? item.quantity);
      const unitCost = this.toDecimal(item.unitCost);
      const discount = this.toDecimal(item.discountAmount ?? 0);
      if (receivedQuantity.greaterThan(quantity)) {
        throw new BadRequestException('La cantidad recibida no puede superar la cantidad comprada.');
      }
      this.calculateSubtotal(quantity, unitCost, discount);

      const participantIds = item.allocations.map((allocation) => allocation.userId);
      if (new Set(participantIds).size !== participantIds.length) {
        throw new BadRequestException(
          'Un agricultor no puede tener mas de una asignacion para el mismo producto.',
        );
      }

      const allocated = item.allocations.reduce(
        (total, allocation) => total.plus(this.toDecimal(allocation.quantity)),
        new Prisma.Decimal(0),
      );

      if (!allocated.equals(quantity)) {
        throw new BadRequestException(
          `Las asignaciones del producto deben sumar ${quantity.toString()}. Actualmente suman ${allocated.toString()}.`,
        );
      }
    }
  }

  private uniqueParticipantIds(dto: CreateJointPurchaseDto) {
    return Array.from(
      new Set(dto.items.flatMap((item) => item.allocations.map((allocation) => allocation.userId))),
    );
  }

  private calculateTotal(items: CreateJointPurchaseItemDto[]) {
    return items.reduce((total, item) => {
      const quantity = this.toDecimal(item.quantity);
      const unitCost = this.toDecimal(item.unitCost);
      const discount = this.toDecimal(item.discountAmount ?? 0);
      return total.plus(this.calculateSubtotal(quantity, unitCost, discount));
    }, new Prisma.Decimal(0));
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
    ownerUserId: string,
    data: { warehouseId?: string; warehouseName?: string },
  ) {
    if (data.warehouseId) {
      const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, tenantId } });
      if (!warehouse) throw new NotFoundException('El almacen no existe en este sindicato.');
      return warehouse;
    }

    if (!data.warehouseName?.trim()) return null;

    return tx.warehouse.create({
      data: { tenantId, ownerUserId, name: data.warehouseName.trim() },
    });
  }

  private toDecimal(value: number) {
    return new Prisma.Decimal(value.toString());
  }
}
