import { Prisma } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ListGlobalStockQueryDto } from '../../dto/list-global-stock-query.dto';
import { ListStockMovementsQueryDto } from '../../dto/list-stock-movements-query.dto';
import { InventoryCriticality, ListStockQueryDto } from '../../dto/list-stock-query.dto';
import {
  expirationCriticality,
  mapGlobalLot,
  mapLot,
  mapMovement,
  orderLots,
  totalsByOwnerProduct,
  totalsByProduct,
} from './inventory-stock.helpers';

export async function listStock(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
  query: ListStockQueryDto = {},
) {
  const lots = await prisma.inventoryLot.findMany({
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

  const totals = totalsByProduct(lots);
  const mapped = lots
    .map((lot) => mapLot(lot, totals.get(lot.productId)))
    .filter((lot) => !query.criticality || lot.alerts.includes(query.criticality));

  return orderLots(mapped, query);
}

export async function listGlobalStock(
  prisma: PrismaService,
  tenantId: string,
  query: ListGlobalStockQueryDto = {},
) {
  const lots = await prisma.inventoryLot.findMany({
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

  const ownerTotals = totalsByOwnerProduct(lots);
  const mapped = lots
    .map((lot) =>
      mapGlobalLot(lot, ownerTotals.get(`${lot.ownerUserId}:${lot.productId}`)),
    )
    .filter((lot) => !query.criticality || lot.alerts.includes(query.criticality));

  return orderLots(mapped, query);
}

export async function listAlerts(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
) {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      tenantId,
      ownerUserId: userId,
      currentQuantity: { gt: new Prisma.Decimal(0) },
    },
    include: { product: true, warehouse: true },
    orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }],
  });

  const totals = totalsByProduct(lots);
  const stockAlerts = new Map<string, unknown>();
  const expirationAlerts = [];

  for (const lot of lots) {
    const total = totals.get(lot.productId) ?? new Prisma.Decimal(0);
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

    const expCriticality = expirationCriticality(
      lot.expirationDate,
      lot.product.expirationWarningDays,
    );

    if (
      expCriticality === InventoryCriticality.VENCIDO ||
      expCriticality === InventoryCriticality.POR_VENCER
    ) {
      expirationAlerts.push({
        type: expCriticality,
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
          expCriticality === InventoryCriticality.VENCIDO
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

export async function listMovements(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
  query: ListStockMovementsQueryDto,
) {
  const movements = await prisma.stockMovement.findMany({
    where: {
      tenantId,
      ownerUserId: userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.reasonType ? { reasonType: query.reasonType } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
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

  return movements.map((movement) => mapMovement(movement));
}
