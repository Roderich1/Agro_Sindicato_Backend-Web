import { coversDetail, coversTotals } from "./consent";

/**
 * E4 §5.2 (rule T): `VISIBLE` (with its basis) or `PENDING_CONSENT` (no
 * figure). `UNDER_THRESHOLD`, `RESPONSIBLE_ONLY` and `RESTRICTED` (E2 §10.3,
 * P-A C1) are no longer produced.
 */
export type TotalVisibility = "VISIBLE" | "PENDING_CONSENT";

/**
 * - `ROLE_CONSENT`: every counted participation covers the totals;
 * - `PREVIOUS_POLICY_K3`: only in a closing, the earlier rule as evidence.
 */
export type TotalsBasis = "ROLE_CONSENT" | "PREVIOUS_POLICY_K3";

export interface ProductTotalView {
  participant_count: number;
  total_quantity_base: string | null;
  visibility: TotalVisibility;
  totals_basis: TotalsBasis | null;
}

/**
 * E2-D7 as it was before E4: the closing total of a product was visible to
 * anyone without the permission when at least this many persons asked for
 * it. Kept only as the evidence of rule T, point 2 (D-02); it is not a
 * threshold of the new policy.
 */
export const PREVIOUS_CALL_TOTALS_THRESHOLD = 3;

/** One counted participation as the rule needs it: its scope in force and the products it asks for. */
export interface ParticipationForVisibility {
  consentScope: string;
  productIds: readonly string[];
}

/**
 * E4 §2 and §5.2: the only decision of who sees what in a call, shared by
 * the detail, `/participants` and `/closing` (the list carries neither totals
 * nor names). It depends on the viewer's ROLE read at this request (an
 * eligible ADMINISTRADOR or not) and on each participation's scope in force;
 * never on the responsible, the delegations or the stored view permissions.
 *
 * The scope read is always the current one: a decision of the farmer applies
 * from the next request, also to the closing.
 */
export class CallVisibility {
  constructor(readonly viewerIsAdministration: boolean) {}

  /** Identified detail: only an eligible Administración, only `ADMINISTRATION` participations. */
  canSeeParticipation(p: Pick<ParticipationForVisibility, "consentScope">): boolean {
    return this.viewerIsAdministration && coversDetail(p.consentScope);
  }

  /** Counted participations whose consent does not cover the new scope (a count, for any viewer). */
  pendingConsentCount(participations: readonly Pick<ParticipationForVisibility, "consentScope">[]): number {
    return participations.filter((p) => !coversDetail(p.consentScope)).length;
  }

  /**
   * Rule T for one product. `participations` are those counted in it (live:
   * ACTIVE with a line in the product; closing: the frozen ones).
   * 1. All of them cover the totals → VISIBLE (`ROLE_CONSENT`), with any
   *    number of persons, live and closed.
   * 2. Some do not, the source is the closing, this viewer sees none of them
   *    by name, and the total was visible under the earlier rule (3 or more
   *    persons) → VISIBLE (`PREVIOUS_POLICY_K3`). A viewer who sees some by
   *    name would subtract them and learn the earlier ones' sum.
   * 3. Otherwise → PENDING_CONSENT, without a figure.
   */
  productTotal(
    total: bigint,
    participantCount: number,
    participations: readonly ParticipationForVisibility[],
    source: "LIVE" | "CLOSING",
  ): ProductTotalView {
    if (participations.every((p) => coversTotals(p.consentScope))) {
      return { participant_count: participantCount, total_quantity_base: total.toString(), visibility: "VISIBLE", totals_basis: "ROLE_CONSENT" };
    }
    if (
      source === "CLOSING" &&
      participantCount >= PREVIOUS_CALL_TOTALS_THRESHOLD &&
      !participations.some((p) => this.canSeeParticipation(p))
    ) {
      return {
        participant_count: participantCount,
        total_quantity_base: total.toString(),
        visibility: "VISIBLE",
        totals_basis: "PREVIOUS_POLICY_K3",
      };
    }
    return { participant_count: participantCount, total_quantity_base: null, visibility: "PENDING_CONSENT", totals_basis: null };
  }
}
