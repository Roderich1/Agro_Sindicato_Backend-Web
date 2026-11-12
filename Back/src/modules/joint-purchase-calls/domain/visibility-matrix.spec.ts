import { scopeCoversCollaborators } from "./consent";
import { CallViewer, CallVisibility, ParticipationForVisibility, TotalVisibility } from "./visibility";

/**
 * N3 (accepted 2026-11-12, scope precised): the matrix of §10.3 / §10.6 for
 * one product's total, crossing
 * - the consent scope of the participations counted in that product (all
 *   `COLLABORATORS`, or at least one `RESPONSIBLE_ONLY`),
 * - the viewer's permission now (responsible, collaborator, none),
 * - whether the viewer held «Consultar participantes» on THIS call before
 *   (revoked, or suspended with the responsible, m6),
 * - the state of the call (live totals: OPEN or CANCELLED; frozen: CLOSED),
 * - the number of persons (3 = the provisional threshold; 2 = below it).
 *
 * What it shows: the protection after a revocation withholds only the total
 * of a product that has a participation hidden from that viewer, and only in
 * that call; it never becomes a global or permanent prohibition, and it never
 * weakens the protection that exists (live totals stay withheld from anyone
 * without the permission).
 */
type Row = [CallViewer["kind"], boolean, "LIVE" | "CLOSING", "ALL_COLLABORATORS" | "SOME_RESPONSIBLE_ONLY", number, TotalVisibility];

const MATRIX: Row[] = [
  // viewer        held before  totals     scopes in the product     persons  result
  ["RESPONSIBLE", false, "LIVE", "ALL_COLLABORATORS", 3, "VISIBLE"],
  ["RESPONSIBLE", false, "LIVE", "SOME_RESPONSIBLE_ONLY", 2, "VISIBLE"],
  ["RESPONSIBLE", false, "CLOSING", "SOME_RESPONSIBLE_ONLY", 1, "VISIBLE"],
  ["COLLABORATOR", true, "LIVE", "ALL_COLLABORATORS", 2, "VISIBLE"],
  ["COLLABORATOR", true, "LIVE", "SOME_RESPONSIBLE_ONLY", 3, "RESPONSIBLE_ONLY"],
  ["COLLABORATOR", true, "CLOSING", "ALL_COLLABORATORS", 1, "VISIBLE"],
  ["COLLABORATOR", true, "CLOSING", "SOME_RESPONSIBLE_ONLY", 3, "RESPONSIBLE_ONLY"],
  ["NONE", false, "LIVE", "ALL_COLLABORATORS", 5, "RESPONSIBLE_ONLY"],
  ["NONE", false, "CLOSING", "ALL_COLLABORATORS", 3, "VISIBLE"],
  ["NONE", false, "CLOSING", "ALL_COLLABORATORS", 2, "UNDER_THRESHOLD"],
  ["NONE", false, "CLOSING", "SOME_RESPONSIBLE_ONLY", 3, "VISIBLE"],
  ["NONE", false, "CLOSING", "SOME_RESPONSIBLE_ONLY", 2, "UNDER_THRESHOLD"],
  ["NONE", true, "LIVE", "ALL_COLLABORATORS", 5, "RESPONSIBLE_ONLY"],
  ["NONE", true, "LIVE", "SOME_RESPONSIBLE_ONLY", 5, "RESPONSIBLE_ONLY"],
  ["NONE", true, "CLOSING", "ALL_COLLABORATORS", 3, "VISIBLE"],
  ["NONE", true, "CLOSING", "ALL_COLLABORATORS", 2, "UNDER_THRESHOLD"],
  ["NONE", true, "CLOSING", "SOME_RESPONSIBLE_ONLY", 3, "RESPONSIBLE_ONLY"],
  ["NONE", true, "CLOSING", "SOME_RESPONSIBLE_ONLY", 2, "RESPONSIBLE_ONLY"],
];

function participations(scopes: Row[3], persons: number): ParticipationForVisibility[] {
  return Array.from({ length: persons }, (_, index) => ({
    consentScope: scopes === "SOME_RESPONSIBLE_ONLY" && index === 0 ? "RESPONSIBLE_ONLY" : "COLLABORATORS",
    productIds: ["p"],
  }));
}

describe("N3 / §10.3 matrix: consent × permission now × access before × state", () => {
  it.each(MATRIX)("%s, held before=%s, %s, %s, %d persons → %s", (kind, formerParticipantsHolder, source, scopes, persons, expected) => {
    const visibility = new CallVisibility({ kind, formerParticipantsHolder }, scopeCoversCollaborators);
    const total = visibility.productTotal(1000n, persons, participations(scopes, persons), source);
    expect(total.visibility).toBe(expected);
    expect(total.participant_count).toBe(persons);
    expect(total.total_quantity_base).toBe(expected === "VISIBLE" ? "1000" : null);
  });

  it("is per product: in the same closing, a former collaborator keeps the total of the product without hidden participations", () => {
    const visibility = new CallVisibility({ kind: "NONE", formerParticipantsHolder: true }, scopeCoversCollaborators);
    const hiddenInA: ParticipationForVisibility[] = [
      { consentScope: "RESPONSIBLE_ONLY", productIds: ["A"] },
      { consentScope: "COLLABORATORS", productIds: ["A", "B"] },
      { consentScope: "COLLABORATORS", productIds: ["A", "B"] },
      { consentScope: "COLLABORATORS", productIds: ["B"] },
    ];
    const of = (product: string) => hiddenInA.filter((p) => p.productIds.includes(product));
    expect(visibility.productTotal(900n, 3, of("A"), "CLOSING").visibility).toBe("RESPONSIBLE_ONLY");
    expect(visibility.productTotal(600n, 3, of("B"), "CLOSING").visibility).toBe("VISIBLE");
  });

  it("is per call: a viewer who never held the permission on this call gets the threshold, whatever they held elsewhere", () => {
    // `formerParticipantsHolder` is read from this call's access events only (call-access.ts).
    const elsewhere = new CallVisibility({ kind: "NONE", formerParticipantsHolder: false }, scopeCoversCollaborators);
    expect(elsewhere.productTotal(900n, 3, participations("SOME_RESPONSIBLE_ONLY", 3), "CLOSING").visibility).toBe("VISIBLE");
  });

  it("identified participants follow the scope in force: a reduction hides the farmer from collaborators from the next reading", () => {
    const collaborator = new CallVisibility({ kind: "COLLABORATOR", formerParticipantsHolder: true }, scopeCoversCollaborators);
    expect(collaborator.canSeeParticipation("COLLABORATORS")).toBe(true);
    expect(collaborator.canSeeParticipation("RESPONSIBLE_ONLY")).toBe(false);
    const responsible = new CallVisibility({ kind: "RESPONSIBLE", formerParticipantsHolder: false }, scopeCoversCollaborators);
    expect(responsible.canSeeParticipation("RESPONSIBLE_ONLY")).toBe(true);
  });
});
