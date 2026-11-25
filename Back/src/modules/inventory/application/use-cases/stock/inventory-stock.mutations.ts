import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementReasonType, StockMovementType } from '@prisma/client';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { UpdateProductInventorySettingsDto } from '../../dto/list-stock-query.dto';
import { ProductReferenceDto } from '../../dto/product-reference.dto';
import { RegisterInitialStockDto } from '../../dto/register-initial-stock.dto';
import {
  RegisterStockEntryDto,
  StockEntryReason,
} from '../../dto/register-stock-entry.dto';
import { RegisterStockExitDto } from '../../dto/register-stock-exit.dto';
import {
  entryReasonType,
  mapLot,
  mapMovement,
  toDecimal,
  TxClient,
  withPrefix,
} from './inventory-stock.helpers';

export interface StockMutationDeps {
  readonly prisma: PrismaService;
  readonly campaignContext: CampaignContextService;
}

export async function registerInitialStock(
  deps: StockMutationDeps,
  tenantId: string,
  userId: string,
  dto: RegisterInitialStockDto,
) {
  return deps.prisma.$transaction(async (tx) => {
    const campaign = await deps.campaignContext.requireActiveCampaign(tenantId, tx);
    const product = await resolveProduct(tx, tenantId, dto.product);
    const warehouse = await resolveWarehouse(tx, tenantId, userId, {
      warehouseId: dto.warehouseId,
      warehouseName: dto.warehouseName,
    });
    const quantity = toDecimal(dto.quantity);
    const expirationDate = dto.expirationDate ? new Date(dto.expirationDate) : null;

    const lot = await tx.inventoryLot.create({
      data: {
        tenantId,
        ownerUserId: userId,
        campaignId: campaign.id,
        productId: product.id,
        warehouseId: warehouse?.id,
        lotNumber: dto.lotNumber,
        expirationDate,
        initialQuantity: quantity,
        currentQuantity: quantity,
      },
      include: { product: true, warehouse: true },
    });

    await incrementProductStock(tx, product.id, quantity);

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        ownerUserId: userId,
        campaignId: campaign.id,
        productId: product.id,
        inventoryLotId: lot.id,
        warehouseId: warehouse?.id,
        userId,
        type: StockMovementType.ENTRADA,
        reasonType: StockMovementReasonType.ENTRADA_SIMPLE,
        quantity,
        reason: withPrefix('INVENTARIO_INICIAL', dto.notes),
      },
      include: { product: true, inventoryLot: true, warehouse: true, user: true },
    });

    return {
      message: 'Inventario inicial registrado correctamente.',
      lot: mapLot(lot),
      movement: mapMovement(movement),
    };
  });
}

export async function registerEntry(
  deps: StockMutationDeps,
  tenantId: string,
  userId: string,
  dto: RegisterStockEntryDto,
) {
  return deps.prisma.$transaction(async (tx) => {
    if (dto.entryReason === StockEntryReason.ENTRADA_SIMPLE && !dto.notes?.trim()) {
      throw new BadRequestException('La entrada simple debe incluir un motivo.');
    }

    const campaign = await deps.campaignContext.resolveCampaignForOperation(
      tenantId,
      dto.campaignId,
      tx,
    );
    const product = await resolveProduct(tx, tenantId, dto.product);
    const warehouse = await resolveWarehouse(tx, tenantId, userId, {
      warehouseId: dto.warehouseId,
      warehouseName: dto.warehouseName,
    });
    const quantity = toDecimal(dto.quantity);
    const expirationDate = dto.expirationDate ? new Date(dto.expirationDate) : null;
    const movementType =
      dto.entryReason === StockEntryReason.AJUSTE
        ? StockMovementType.AJUSTE
        : StockMovementType.ENTRADA;

    const lot = await tx.inventoryLot.create({
      data: {
        tenantId,
        ownerUserId: userId,
        campaignId: campaign.id,
        productId: product.id,
        warehouseId: warehouse?.id,
        lotNumber: dto.lotNumber,
        expirationDate,
        initialQuantity: quantity,
        currentQuantity: quantity,
      },
      include: { product: true, warehouse: true },
    });

    await incrementProductStock(tx, product.id, quantity);

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        ownerUserId: userId,
        campaignId: campaign.id,
        productId: product.id,
        inventoryLotId: lot.id,
        warehouseId: warehouse?.id,
        userId,
        type: movementType,
        reasonType: entryReasonType(dto.entryReason),
        quantity,
        reason: withPrefix(dto.entryReason, dto.notes),
      },
      include: { product: true, inventoryLot: true, warehouse: true, user: true },
    });

    return {
      message: 'Entrada de agroquimico registrada correctamente.',
      lot: mapLot(lot),
      movement: mapMovement(movement),
    };
  });
}

export async function registerExit(
  deps: StockMutationDeps,
  tenantId: string,
  userId: string,
  dto: RegisterStockExitDto,
) {
  return deps.prisma.$transaction(async (tx) => {
    const campaign = await deps.campaignContext.resolveCampaignForOperation(
      tenantId,
      dto.campaignId,
      tx,
    );
    const quantity = toDecimal(dto.quantity);
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

      const updatedLot = await decrementLotQuantity(
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
          campaignId: campaign.id,
          productId: dto.productId,
          inventoryLotId: lot.id,
          warehouseId: lot.warehouseId,
          userId,
          type: StockMovementType.SALIDA,
          reasonType: dto.reasonType,
          quantity: deducted,
          reason: dto.reason,
        },
        include: { product: true, inventoryLot: true, warehouse: true, user: true },
      });

      movements.push({
        lot: mapLot(updatedLot),
        movement: mapMovement(movement),
      });
      remaining = remaining.minus(deducted);
    }

    await decrementProductStock(tx, tenantId, dto.productId, quantity);

    return {
      message: 'Salida de agroquimico registrada correctamente.',
      movements,
    };
  });
}

export async function updateProductSettings(
  prisma: PrismaService,
  tenantId: string,
  productId: string,
  dto: UpdateProductInventorySettingsDto,
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
  });

  if (!product) {
    throw new NotFoundException('El producto no existe en este sindicato.');
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.minimumStock !== undefined
        ? { minimumStock: toDecimal(dto.minimumStock) }
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

async function resolveProduct(tx: TxClient, tenantId: string, dto: ProductReferenceDto) {
  if (dto.productId) {
    const product = await tx.product.findFirst({
      where: { id: dto.productId, tenantId, isActive: true },
    });
    if (!product) throw new NotFoundException('El producto no existe en este sindicato.');
    return product;
  }

  if (!dto.productName?.trim()) {
    throw new BadRequestException('Debe enviar productId o productName.');
  }

  const product = await tx.product.findFirst({
    where: { tenantId, name: dto.productName.trim(), isActive: true },
  });
  if (!product) throw new NotFoundException('El producto no existe en este sindicato.');
  return product;
}

async function resolveWarehouse(
  tx: TxClient,
  tenantId: string,
  userId: string,
  data: { warehouseId?: string; warehouseName?: string },
) {
  if (data.warehouseId) {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: data.warehouseId, tenantId, ownerUserId: userId },
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

async function incrementProductStock(tx: TxClient, productId: string, quantity: Prisma.Decimal) {
  await tx.product.update({
    where: { id: productId },
    data: { currentStock: { increment: quantity } },
  });
}

async function decrementLotQuantity(
  tx: TxClient,
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

async function decrementProductStock(
  tx: TxClient,
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
