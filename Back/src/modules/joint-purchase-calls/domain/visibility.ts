import { PROVISIONAL_THRESHOLD } from "@/modules/collective/domain/disclosure-policy";

/** E2-P1: today the provisional threshold of F07 (k = 3). */
export const CALL_TOTALS_THRESHOLD = PROVISIONAL_THRESHOLD;

/**
 * `RESTRICTED` (P-A C1, §12): the product has a participation whose farmer
 * has not authorized the current responsible yet; neither she nor her
 * collaborators get its total (it would be derived from data she may not see).
 */
export type TotalVisibility = "VISIBLE" | "UNDER_THRESHOLD" | "RESPONSIBLE_ONLY" | "RESTRICTED";

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

/**
 * One participation as the rule needs it: its consent scope in force (§10.6),
 * whether its farmer authorized the CURRENT responsible version (P-A C1:
 * `consentResponsibleVersion === call.responsibleVersion`) and the products
 * it asks for.
 */
export interface ParticipationForVisibility {
  consentScope: string;
  authorizedForResponsible: boolean;
  productIds: readonly string[];
}

/**
 * The only decision of §10.3, shared by the detail, `/participants` and
 * `/closing` (and nowhere else: the list carries neither totals nor names).
 * `coversCollaborators` says whether the consent scope in force reaches
 * collaborators (only `COLLABORATORS`, §10.6): a participation authorized
 * only for the responsible is hidden from them, and so is any total it is
 * part of, because subtracting the visible ones would reveal it. The scope
 * read is always the current one: a reduction applies from the next request,
 * also to the closing.
 *
 * N3 (accepted 2026-11-12, scope precised): the protection is per call
 * (permission and its history are per call) and per product (only the
 * products with a hidden participation lose their total); it is never a
 * global or permanent prohibition. The full matrix is in the contract §10.3
 * and in `visibility-matrix.spec.ts`.
 */
export class CallVisibility {
  constructor(
    readonly viewer: CallViewer,
    private readonly coversCollaborators: (consentScope: string) => boolean,
    private readonly threshold = CALL_TOTALS_THRESHOLD,
  ) {}

  /**
   * Identified participants. P-A C1: nobody sees a participation whose farmer
   * has not authorized the current responsible. Among the authorized ones:
   * all for the responsible, `COLLABORATORS` ones for a collaborator, none
   * otherwise.
   */
  canSeeParticipation(p: Pick<ParticipationForVisibility, "consentScope" | "authorizedForResponsible">): boolean {
    if (!p.authorizedForResponsible) return false;
    if (this.viewer.kind === "RESPONSIBLE") return true;
    if (this.viewer.kind === "COLLABORATOR") return this.coversCollaborators(p.consentScope);
    return false;
  }

  /** Authorized participations a collaborator may not see by name (scope `RESPONSIBLE_ONLY`; 0 for the responsible). */
  hiddenCount(participations: readonly Pick<ParticipationForVisibility, "consentScope" | "authorizedForResponsible">[]): number {
    if (this.viewer.kind !== "COLLABORATOR") return 0;
    return participations.filter((p) => p.authorizedForResponsible && !this.coversCollaborators(p.consentScope)).length;
  }

  /**
   * P-A C1: participations still waiting for their farmer to authorize the
   * current responsible, as a count for whoever holds PARTICIPANTS (the
   * responsible and her collaborators); 0 for anyone else, who sees no
   * identified participant anyway.
   */
  pendingAuthorizationCount(participations: readonly Pick<ParticipationForVisibility, "authorizedForResponsible">[]): number {
    if (this.viewer.kind === "NONE") return 0;
    return participations.filter((p) => !p.authorizedForResponsible).length;
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
   * P-A C1: for the responsible and her collaborators, a product with a
   * participation not yet authorized for the current responsible is
   * RESTRICTED (its total would be derived from data she may not see).
   */
  productTotal(
    total: bigint,
    participantCount: number,
    participations: readonly ParticipationForVisibility[],
    source: "LIVE" | "CLOSING",
  ): ProductTotalView {
    const anyHidden = participations.some((p) => !this.coversCollaborators(p.consentScope));
    const anyPending = participations.some((p) => !p.authorizedForResponsible);
    const restricted: ProductTotalView = { participant_count: participantCount, total_quantity_base: null, visibility: "RESTRICTED" };
    switch (this.viewer.kind) {
      case "RESPONSIBLE":
        return anyPending ? restricted : productTotalView(total, participantCount, true, this.threshold, source === "LIVE");
      case "COLLABORATOR":
        if (anyPending) return restricted;
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
