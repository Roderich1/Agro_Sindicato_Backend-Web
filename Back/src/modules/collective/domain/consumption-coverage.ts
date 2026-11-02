/**
 * Participation coverage of the consumption figures of a seal (F07, extended
 * for F12 estimation, F07_SEALED_HISTORY_CONTRACT §5.3).
 *
 * - `linkedMembers` (M): active AGRICULTOR Members with an active account of
 *   the tenant, read in the sealing decision.
 * - `membersInPublishedFigures` (N): distinct Members with a contribution
 *   inside a CONSUMPTION_TOTAL figure shown in that decision (a new release or
 *   a prior figure still shown). Never the contributors of a suppressed cell,
 *   never declared needs.
 *
 * N is a part of M only if every such Member is linked. F07 rule 3 withdraws a
 * figure whose Member left, so a shown figure only holds current Members; but
 * the two reads run under READ COMMITTED and may see different states. If a
 * published Member is not linked the fraction would mix two populations, so
 * no fraction is recorded: POPULATION_MISMATCH. Its figures stay in the seal.
 *
 * It measures participation, not completeness: a Member inside a figure may
 * not have recorded all its consumption, and a Member outside every figure
 * consumed an unknown amount, never zero. No minimum is implied.
 */
export type ConsumptionCoverage =
  | { status: "IDENTIFIED"; linkedMembers: number; membersInPublishedFigures: number }
  | { status: "POPULATION_MISMATCH"; linkedMembers: null; membersInPublishedFigures: null };

export function consumptionCoverage(published: ReadonlySet<string>, linked: ReadonlySet<string>): ConsumptionCoverage {
  for (const member of published) {
    if (!linked.has(member)) return { status: "POPULATION_MISMATCH", linkedMembers: null, membersInPublishedFigures: null };
  }
  return { status: "IDENTIFIED", linkedMembers: linked.size, membersInPublishedFigures: published.size };
}
