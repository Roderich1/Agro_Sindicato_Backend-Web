import { CallVisibility, ParticipationForVisibility, TotalsBasis, TotalVisibility } from "./visibility";

/**
 * E4 §5.2 (rule T) — replaces the N3 / §10.3 matrix of E2 (declared: the
 * viewers RESPONSIBLE/COLLABORATOR/NONE, the protection of former
 * collaborators and the threshold for anyone without the permission were
 * retired by E4 §2 and §6.1). One product's total, crossing:
 * - the viewer's ROLE now (an eligible Administración, or the Directiva);
 * - the scopes of the participations counted in that product;
 * - the source (LIVE: OPEN or CANCELLED; CLOSING: the frozen ones);
 * - the number of persons (3 = the earlier rule of point 2; 1 and 2 below).
 *
 * Every expected value is written by hand from E4 §5.2, not computed.
 */
type Mix =
  | "ALL_ADMINISTRATION"
  | "ALL_TOTALS_ONLY"
  | "ADMINISTRATION_AND_TOTALS"
  | "ONE_EARLIER_REST_ADMINISTRATION"
  | "ALL_EARLIER"
  | "ONE_EARLIER_REST_TOTALS";
type Viewer = "ADMINISTRACION" | "DIRECTIVA";
type Expected = [TotalVisibility, TotalsBasis | null];
type Row = [Viewer, "LIVE" | "CLOSING", Mix, number, ...Expected];

const VISIBLE_ROLE: Expected = ["VISIBLE", "ROLE_CONSENT"];
const VISIBLE_K3: Expected = ["VISIBLE", "PREVIOUS_POLICY_K3"];
const PENDING: Expected = ["PENDING_CONSENT", null];

const MATRIX: Row[] = [
  // Point 1: every counted participation covers the totals → visible with any number of persons.
  ["ADMINISTRACION", "LIVE", "ALL_ADMINISTRATION", 1, ...VISIBLE_ROLE],
  ["DIRECTIVA", "LIVE", "ALL_ADMINISTRATION", 1, ...VISIBLE_ROLE],
  ["ADMINISTRACION", "CLOSING", "ALL_ADMINISTRATION", 1, ...VISIBLE_ROLE],
  ["DIRECTIVA", "CLOSING", "ALL_ADMINISTRATION", 1, ...VISIBLE_ROLE],
  ["DIRECTIVA", "LIVE", "ALL_ADMINISTRATION", 2, ...VISIBLE_ROLE],
  ["ADMINISTRACION", "LIVE", "ALL_TOTALS_ONLY", 1, ...VISIBLE_ROLE],
  ["DIRECTIVA", "CLOSING", "ALL_TOTALS_ONLY", 2, ...VISIBLE_ROLE],
  ["ADMINISTRACION", "CLOSING", "ADMINISTRATION_AND_TOTALS", 2, ...VISIBLE_ROLE],
  ["DIRECTIVA", "LIVE", "ADMINISTRATION_AND_TOTALS", 3, ...VISIBLE_ROLE],
  // Point 3 live: any participation that does not cover the totals → pending, whatever the number.
  ["ADMINISTRACION", "LIVE", "ONE_EARLIER_REST_ADMINISTRATION", 2, ...PENDING],
  ["DIRECTIVA", "LIVE", "ONE_EARLIER_REST_ADMINISTRATION", 3, ...PENDING],
  ["ADMINISTRACION", "LIVE", "ALL_EARLIER", 1, ...PENDING],
  ["DIRECTIVA", "LIVE", "ALL_EARLIER", 5, ...PENDING],
  ["ADMINISTRACION", "LIVE", "ONE_EARLIER_REST_TOTALS", 3, ...PENDING],
  // Point 2: closing, 3 or more persons, the viewer sees none of them by name → the earlier rule.
  ["DIRECTIVA", "CLOSING", "ONE_EARLIER_REST_ADMINISTRATION", 3, ...VISIBLE_K3],
  ["DIRECTIVA", "CLOSING", "ALL_EARLIER", 3, ...VISIBLE_K3],
  ["ADMINISTRACION", "CLOSING", "ALL_EARLIER", 3, ...VISIBLE_K3],
  ["DIRECTIVA", "CLOSING", "ONE_EARLIER_REST_TOTALS", 3, ...VISIBLE_K3],
  ["ADMINISTRACION", "CLOSING", "ONE_EARLIER_REST_TOTALS", 4, ...VISIBLE_K3],
  // Point 2 does not apply to an Administración who sees some by name (subtracting would reveal the others).
  ["ADMINISTRACION", "CLOSING", "ONE_EARLIER_REST_ADMINISTRATION", 3, ...PENDING],
  ["ADMINISTRACION", "CLOSING", "ONE_EARLIER_REST_ADMINISTRATION", 5, ...PENDING],
  // Point 2 needs 3 or more: below, pending for both roles.
  ["DIRECTIVA", "CLOSING", "ONE_EARLIER_REST_ADMINISTRATION", 2, ...PENDING],
  ["DIRECTIVA", "CLOSING", "ALL_EARLIER", 2, ...PENDING],
  ["ADMINISTRACION", "CLOSING", "ALL_EARLIER", 2, ...PENDING],
  ["DIRECTIVA", "CLOSING", "ALL_EARLIER", 1, ...PENDING],
  ["DIRECTIVA", "CLOSING", "ONE_EARLIER_REST_TOTALS", 2, ...PENDING],
];

const EARLIER = ["RESPONSIBLE_ONLY", "COLLABORATORS"];

function participations(mix: Mix, persons: number): ParticipationForVisibility[] {
  return Array.from({ length: persons }, (_, index) => {
    const earlier = EARLIER[index % 2]!;
    const scope = (() => {
      switch (mix) {
        case "ALL_ADMINISTRATION":
          return "ADMINISTRATION";
        case "ALL_TOTALS_ONLY":
          return "TOTALS_ONLY";
        case "ADMINISTRATION_AND_TOTALS":
          return index % 2 === 0 ? "ADMINISTRATION" : "TOTALS_ONLY";
        case "ONE_EARLIER_REST_ADMINISTRATION":
          return index === 0 ? earlier : "ADMINISTRATION";
        case "ALL_EARLIER":
          return earlier;
        case "ONE_EARLIER_REST_TOTALS":
          return index === 0 ? earlier : "TOTALS_ONLY";
      }
    })();
    return { consentScope: scope, productIds: ["p"] };
  });
}

describe("E4 §5.2 rule T matrix: role × scopes × source × persons", () => {
  it.each(MATRIX)("%s, %s, %s, %d persons → %s (%s)", (viewer, source, mix, persons, visibility, basis) => {
    const total = new CallVisibility(viewer === "ADMINISTRACION").productTotal(1000n, persons, participations(mix, persons), source);
    expect(total).toEqual({
      participant_count: persons,
      total_quantity_base: visibility === "VISIBLE" ? "1000" : null,
      visibility,
      totals_basis: basis,
    });
  });

  it("never emits the retired states of E2 (UNDER_THRESHOLD, RESPONSIBLE_ONLY, RESTRICTED)", () => {
    const seen = new Set<string>();
    for (const viewer of [true, false]) {
      for (const source of ["LIVE", "CLOSING"] as const) {
        for (const mix of [
          "ALL_ADMINISTRATION",
          "ALL_TOTALS_ONLY",
          "ADMINISTRATION_AND_TOTALS",
          "ONE_EARLIER_REST_ADMINISTRATION",
          "ALL_EARLIER",
          "ONE_EARLIER_REST_TOTALS",
        ] as const) {
          for (const persons of [1, 2, 3, 4, 10]) {
            seen.add(new CallVisibility(viewer).productTotal(7n, persons, participations(mix, persons), source).visibility);
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(["PENDING_CONSENT", "VISIBLE"]);
  });

  it("a product without any participation (a draft, or nobody asked for it) is a real zero, not withheld", () => {
    for (const viewer of [true, false]) {
      expect(new CallVisibility(viewer).productTotal(0n, 0, [], "LIVE")).toEqual({
        participant_count: 0,
        total_quantity_base: "0",
        visibility: "VISIBLE",
        totals_basis: "ROLE_CONSENT",
      });
    }
  });

  it("the protection is per product: a pending product does not withhold another one's total", () => {
    const viewer = new CallVisibility(false);
    expect(viewer.productTotal(500n, 1, participations("ALL_ADMINISTRATION", 1), "LIVE").visibility).toBe("VISIBLE");
    expect(viewer.productTotal(500n, 2, participations("ONE_EARLIER_REST_ADMINISTRATION", 2), "LIVE").visibility).toBe("PENDING_CONSENT");
  });
});
