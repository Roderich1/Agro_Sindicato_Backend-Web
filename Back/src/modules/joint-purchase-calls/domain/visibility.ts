import { PROVISIONAL_THRESHOLD } from "@/modules/collective/domain/disclosure-policy";

/** E2-P1: today the provisional threshold of F07 (k = 3). */
export const CALL_TOTALS_THRESHOLD = PROVISIONAL_THRESHOLD;

export type TotalVisibility = "VISIBLE" | "UNDER_THRESHOLD" | "RESPONSIBLE_ONLY";

export interface ProductTotalView {
  participant_count: number;
  total_quantity_base: string | null;
  visibility: TotalVisibility;
}

/**
 * E2-D7: whoever holds the specific permission (the responsible, E2-D6) sees
 * every total. Anyone else sees a product's total only when at least k
 * persons asked for that product, so that a total never reveals one person's
 * quantity; below k the total is withheld (never shown as zero). The number
 * of persons is a count, not a quantity, and is always shown.
 *
 * E2-P1 (resolved 2026-11-11, privacy first): while the call is OPEN the
 * totals are LIVE and change with each confirmation; comparing two readings
 * (3 → 4 persons) would reveal the newcomer's quantity even above k. So, for
 * anyone without the permission, live totals are withheld altogether
 * (`RESPONSIBLE_ONLY`); the threshold applies only to the immutable closing.
 */
export function productTotalView(
  total: bigint,
  participantCount: number,
  canViewParticipants: boolean,
  threshold = CALL_TOTALS_THRESHOLD,
  live = false,
): ProductTotalView {
  if (canViewParticipants) {
    return { participant_count: participantCount, total_quantity_base: total.toString(), visibility: "VISIBLE" };
  }
  if (live) {
    return { participant_count: participantCount, total_quantity_base: null, visibility: "RESPONSIBLE_ONLY" };
  }
  const visible = participantCount >= threshold;
  return {
    participant_count: participantCount,
    total_quantity_base: visible ? total.toString() : null,
    visibility: visible ? "VISIBLE" : "UNDER_THRESHOLD",
  };
}
