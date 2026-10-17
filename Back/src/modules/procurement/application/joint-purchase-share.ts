import { Prisma, PurchaseType } from '@prisma/client';

/**
 * F10-SEC-02 (#45): a farmer who took part in a legacy joint purchase sees
 * only their own share of it. The group quantities and totals would let a
 * participant subtract their own part and learn the others' (two
 * participants are enough). The share comes from the farmer's own
 * `PurchaseItemAllocation` rows, as the purchase created them; the item
 * discount is prorated with the same rule as the allocation subtotal and
 * rounded to 4 decimals, so the shares may differ from the group discount in
 * the last decimal.
 */
export interface ShareableItem {
  quantity: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  allocations: Array<{ userId: string; quantity: Prisma.Decimal; subtotal: Prisma.Decimal }>;
}

export function isOwnShareView(type: PurchaseType, viewerId: string | null): viewerId is string {
  return viewerId !== null && type === PurchaseType.CONJUNTA;
}

/** The viewer's part of one item, or null when nothing was allocated to them. */
export function itemShare<T extends ShareableItem>(item: T, viewerId: string) {
  const own = item.allocations.filter((allocation) => allocation.userId === viewerId);
  if (own.length === 0) return null;
  const quantity = own.reduce((total, allocation) => total.plus(allocation.quantity), new Prisma.Decimal(0));
  const subtotal = own.reduce((total, allocation) => total.plus(allocation.subtotal), new Prisma.Decimal(0));
  // The prorated discount is shown with 4 decimals (the precision of the
  // amounts this API accepts); an exact division can be periodic.
  const discountAmount = item.quantity.isZero()
    ? new Prisma.Decimal(0)
    : item.discountAmount.mul(quantity).div(item.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  return { item, quantity, subtotal, discountAmount };
}

/** The viewer's items and totals of a joint purchase. */
export function purchaseShare<T extends ShareableItem>(items: T[], viewerId: string) {
  const shares = items
    .map((item) => itemShare(item, viewerId))
    .filter((share): share is NonNullable<ReturnType<typeof itemShare<T>>> => share !== null);
  return {
    items: shares,
    totalAmount: shares.reduce((total, share) => total.plus(share.subtotal), new Prisma.Decimal(0)),
    discountAmount: shares.reduce((total, share) => total.plus(share.discountAmount), new Prisma.Decimal(0)),
  };
}
