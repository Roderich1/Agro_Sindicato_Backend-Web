import { PROVISIONAL_THRESHOLD } from "@/modules/collective/domain/disclosure-policy";

/** E2-P1: today the provisional threshold of F07 (k = 3). */
export const CALL_TOTALS_THRESHOLD = PROVISIONAL_THRESHOLD;

export type TotalVisibility = "VISIBLE" | "UNDER_THRESHOLD";

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
 */
export function productTotalView(
  total: bigint,
  participantCount: number,
  canViewParticipants: boolean,
  threshold = CALL_TOTALS_THRESHOLD,
): ProductTotalView {
  const visible = canViewParticipants || participantCount >= threshold;
  return {
    participant_count: participantCount,
    total_quantity_base: visible ? total.toString() : null,
    visibility: visible ? "VISIBLE" : "UNDER_THRESHOLD",
  };
}
