import { Prisma, StockMovementReasonType } from '@prisma/client';
import {
  InventoryCriticality,
  ListStockQueryDto,
} from '../../dto/list-stock-query.dto';
import { StockEntryReason } from '../../dto/register-stock-entry.dto';

export type TxClient = Prisma.TransactionClient;

export function toDecimal(value: number) {
  return new Prisma.Decimal(value.toString());
}

export function withPrefix(prefix: string, notes?: string) {
  return notes?.trim() ? `${prefix}: ${notes.trim()}` : prefix;
}

export function entryReasonType(reason: StockEntryReason) {
  const map: Record<StockEntryReason, StockMovementReasonType> = {
    [StockEntryReason.COMPRA]: StockMovementReasonType.COMPRA,
    [StockEntryReason.ENTRADA_SIMPLE]: StockMovementReasonType.ENTRADA_SIMPLE,
    [StockEntryReason.DEVOLUCION]: StockMovementReasonType.DEVOLUCION,
    [StockEntryReason.AJUSTE]: StockMovementReasonType.AJUSTE,
  };

  return map[reason];
}

export function totalsByProduct(
  lots: { productId: string; currentQuantity: Prisma.Decimal }[],
) {
  const totals = new Map<string, Prisma.Decimal>();
  for (const lot of lots) {
    const current = totals.get(lot.productId) ?? new Prisma.Decimal(0);
    totals.set(lot.productId, current.plus(lot.currentQuantity));
  }
  return totals;
}

export function totalsByOwnerProduct(
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

export function orderLots<
  T extends { product: { name: string }; currentQuantity: string; expirationDate: string | null },
>(lots: T[], query: ListStockQueryDto) {
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

export function expirationCriticality(expirationDate: Date | null, warningDays: number) {
  if (!expirationDate) return InventoryCriticality.OK;

  const now = new Date();
  const limit = new Date(now);
  limit.setDate(limit.getDate() + warningDays);

  if (expirationDate.getTime() < now.getTime()) return InventoryCriticality.VENCIDO;
  if (expirationDate.getTime() <= limit.getTime()) return InventoryCriticality.POR_VENCER;
  return InventoryCriticality.OK;
}

export function mapLot(
  lot: {
    id: string;
    productId: string;
    campaignId?: string | null;
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
  },
  productTotal?: Prisma.Decimal,
) {
  const total = productTotal ?? lot.currentQuantity;
  const lowStock = lot.product.minimumStock
    ? total.lessThanOrEqualTo(lot.product.minimumStock)
    : false;
  const expirationStatus = expirationCriticality(
    lot.expirationDate,
    lot.product.expirationWarningDays ?? 90,
  );
  const criticality = lowStock ? InventoryCriticality.BAJO_MINIMO : expirationStatus;

  return {
    id: lot.id,
    campaignId: lot.campaignId ?? null,
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

export function mapGlobalLot(
  lot: {
    id: string;
    productId: string;
    campaignId?: string | null;
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
  },
  ownerProductTotal?: Prisma.Decimal,
) {
  return {
    ...mapLot(lot, ownerProductTotal),
    owner: {
      id: lot.owner.id,
      name: lot.owner.name,
      email: lot.owner.email,
      role: lot.owner.role,
    },
  };
}

export function mapMovement(movement: {
  id: string;
  ownerUserId: string;
  campaignId?: string | null;
  type: string;
  reasonType?: StockMovementReasonType | null;
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
    campaignId: movement.campaignId ?? null,
    type: movement.type,
    reasonType: movement.reasonType ?? null,
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
