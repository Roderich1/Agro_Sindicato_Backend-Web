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

/**
 * E2-P3 (§10.3): who looks at a call.
 * - RESPONSIBLE: the responsible, holding the PARTICIPANTS row the system
 *   creates at opening;
 * - COLLABORATOR: holds PARTICIPANTS granted by the responsible now;
 * - NONE: anyone else (MANAGE only, the rest of the Directiva or
 *   Administración, or a former collaborator).
 * `formerParticipantsHolder`: held PARTICIPANTS as a collaborator at some
 * moment (JointPurchaseCallAccessEvent), whatever they hold now.
 */
export type ViewerKind = "RESPONSIBLE" | "COLLABORATOR" | "NONE";

export interface CallViewer {
  kind: ViewerKind;
  formerParticipantsHolder: boolean;
}

/** One participation as the rule needs it: its consent and the products it asks for. */
export interface ParticipationForVisibility {
  consentVersion: string;
  productIds: readonly string[];
}

/**
 * The only decision of §10.3, shared by the detail, `/participants` and
 * `/closing` (and nowhere else: the list carries neither totals nor names).
 * `coversCollaborators` says whether a consent version reaches collaborators
 * (only CONV-2): a CONV-1 participation is hidden from them, and so is any
 * total it is part of, because subtracting the visible ones would reveal it.
 */
export class CallVisibility {
  constructor(
    readonly viewer: CallViewer,
    private readonly coversCollaborators: (consentVersion: string) => boolean,
    private readonly threshold = CALL_TOTALS_THRESHOLD,
  ) {}

  /** Identified participants: all for the responsible, CONV-2 ones for a collaborator, none otherwise. */
  canSeeParticipation(consentVersion: string): boolean {
    if (this.viewer.kind === "RESPONSIBLE") return true;
    if (this.viewer.kind === "COLLABORATOR") return this.coversCollaborators(consentVersion);
    return false;
  }

  /** How many of these participations this viewer may not see by name (0 for the responsible). */
  hiddenCount(participations: readonly ParticipationForVisibility[]): number {
    if (this.viewer.kind !== "COLLABORATOR") return 0;
    return participations.filter((p) => !this.canSeeParticipation(p.consentVersion)).length;
  }

  /**
   * The total of one product. `participations` are those counted in that
   * product (live: ACTIVE; closing: the frozen ones), with their consent.
   * - RESPONSIBLE: always;
   * - COLLABORATOR: live or closed, only if none of them is hidden from them,
   *   else RESPONSIBLE_ONLY;
   * - NONE: never live (E2-P1); in the closing, the threshold k, except that a
   *   former collaborator never gets the total of a product with a
   *   participation that was hidden from them ("después de una revocación").
   */
  productTotal(
    total: bigint,
    participantCount: number,
    participations: readonly ParticipationForVisibility[],
    source: "LIVE" | "CLOSING",
  ): ProductTotalView {
    const anyHidden = participations.some((p) => !this.coversCollaborators(p.consentVersion));
    switch (this.viewer.kind) {
      case "RESPONSIBLE":
        return productTotalView(total, participantCount, true, this.threshold, source === "LIVE");
      case "COLLABORATOR":
        return anyHidden
          ? { participant_count: participantCount, total_quantity_base: null, visibility: "RESPONSIBLE_ONLY" }
          : productTotalView(total, participantCount, true, this.threshold, source === "LIVE");
      case "NONE":
        if (source === "CLOSING" && this.viewer.formerParticipantsHolder && anyHidden) {
          return { participant_count: participantCount, total_quantity_base: null, visibility: "RESPONSIBLE_ONLY" };
        }
        return productTotalView(total, participantCount, false, this.threshold, source === "LIVE");
    }
  }
}
