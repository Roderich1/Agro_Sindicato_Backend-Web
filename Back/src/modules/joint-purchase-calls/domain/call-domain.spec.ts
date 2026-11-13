import { CallHttpError } from "./call-error";
import { canTransition, closingCutoff, isEditable, isFinal, notOpenReason } from "./call-state";
import { computeClosing } from "./closing";
import {
  CONSENT_HELP,
  CONSENT_TEXT,
  CONSENT_V1_TEXT,
  CONSENT_V1_VERSION,
  CONSENT_V2_TEXT,
  CONSENT_V2_VERSION,
  CONSENT_V3_TEXT,
  CONSENT_V3_VERSION,
  CONSENT_V4_HELP,
  CONSENT_V4_TEXT,
  CONSENT_VERSION,
  coversDetail,
  coversTotals,
  initialScopeOf,
  isAcceptedConsent,
  isNewScope,
} from "./consent";
import { normalizeConfirm, normalizeConsentDecision, normalizeWithdraw, parseQuantity } from "./participation-input";
import { CallVisibility } from "./visibility";
import { closeIntervalFrom } from "../application/joint-purchase-config";

const OP = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OP2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof CallHttpError ? `${error.status} ${error.errorCode}` : String(error);
  }
}

describe("E2 state machine (E2-D2)", () => {
  it("allows only DRAFT→OPEN|CANCELLED and OPEN→CLOSED|CANCELLED", () => {
    const all = ["DRAFT", "OPEN", "CLOSED", "CANCELLED"] as const;
    const allowed = all.flatMap((from) => all.filter((to) => canTransition(from, to)).map((to) => `${from}->${to}`));
    expect(allowed).toEqual(["DRAFT->OPEN", "DRAFT->CANCELLED", "OPEN->CLOSED", "OPEN->CANCELLED"]);
    expect(isFinal("CLOSED")).toBe(true);
    expect(isFinal("CANCELLED")).toBe(true);
    expect(isFinal("OPEN")).toBe(false);
  });

  it("keeps name, deadline, responsible and products immutable after opening", () => {
    expect(isEditable("DRAFT")).toBe(true);
    for (const status of ["OPEN", "CLOSED", "CANCELLED"] as const) expect(isEditable(status)).toBe(false);
  });

  it("decides the deadline with the server clock (E2-D11)", () => {
    const deadlineAt = new Date("2026-11-20T12:00:00.000Z");
    expect(notOpenReason({ status: "OPEN", deadlineAt }, new Date("2026-11-20T11:59:59.999Z"))).toBeNull();
    expect(notOpenReason({ status: "OPEN", deadlineAt }, deadlineAt)).toBe("DEADLINE_PASSED");
    expect(notOpenReason({ status: "DRAFT", deadlineAt }, new Date(0))).toBe("DRAFT");
    expect(notOpenReason({ status: "CLOSED", deadlineAt }, new Date(0))).toBe("CLOSED");
    expect(notOpenReason({ status: "CANCELLED", deadlineAt }, new Date(0))).toBe("CANCELLED");
  });

  it("never moves the closing cutoff past the deadline (E2-D12)", () => {
    const deadline = new Date("2026-11-20T12:00:00.000Z");
    const early = new Date("2026-11-19T08:00:00.000Z");
    expect(closingCutoff(early, deadline)).toBe(early);
    expect(closingCutoff(new Date("2026-11-21T00:00:00.000Z"), deadline)).toBe(deadline);
  });
});

describe("E2 consent (E2-D9, E2-P3 §10.2, P-C §10.6)", () => {
  it("keeps the exact CONV-1 text, still accepted from phones not yet updated, for the responsible only", () => {
    expect(CONSENT_V1_VERSION).toBe("CONV-1");
    expect(CONSENT_V1_TEXT).toBe(
      "El responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas para coordinar la compra y la entrega. Esta confirmación no genera una deuda.",
    );
    expect(isAcceptedConsent("CONV-1")).toBe(true);
    expect(initialScopeOf("CONV-1")).toBe("RESPONSIBLE_ONLY");
  });

  it("keeps CONV-2 with its exact text and meaning (it covered collaborators)", () => {
    expect(CONSENT_V2_VERSION).toBe("CONV-2");
    expect(CONSENT_V2_TEXT).toBe(
      "La persona responsable de esta compra conjunta y quienes ella autorice para coordinarla podrán ver tu nombre y las cantidades que solicitas, para coordinar la compra y la entrega. Esta confirmación no genera una deuda.",
    );
    expect(isAcceptedConsent("CONV-2")).toBe(true);
    expect(initialScopeOf("CONV-2")).toBe("COLLABORATORS");
  });

  // Rewritten for E4 (declared): CONV-3 is no longer the current version; it
  // is kept with its exact text as an earlier one, still accepted.
  it("keeps CONV-3 (N5) with its exact text as an earlier version: a first confirmation with it gives RESPONSIBLE_ONLY", () => {
    expect(CONSENT_V3_VERSION).toBe("CONV-3");
    expect(CONSENT_V3_TEXT).toBe(
      "La persona responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas. Si tú lo autorizas, también podrán verlos las personas de la Directiva o la Administración que ella autorice para esta convocatoria. Los datos se usan para coordinar la compra y la entrega. Esta confirmación no genera una deuda.",
    );
    expect(isAcceptedConsent("CONV-3")).toBe(true);
    expect(initialScopeOf("CONV-3")).toBe("RESPONSIBLE_ONLY");
  });

  it("E4 §4.1: publishes CONV-4 with its exact text and help; a first confirmation with it gives ADMINISTRATION", () => {
    expect(CONSENT_VERSION).toBe("CONV-4");
    expect(CONSENT_TEXT).toBe(CONSENT_V4_TEXT);
    expect(CONSENT_HELP).toBe(CONSENT_V4_HELP);
    expect(CONSENT_V4_TEXT).toBe(
      "Las personas de Administración habilitadas de su sindicato podrán ver su nombre y las cantidades que solicita para coordinar esta compra conjunta y su entrega. La Directiva podrá consultar los totales por producto, sin el detalle identificado de su participación. Los totales pueden mostrarse aunque participe una sola persona. Esta participación no genera una deuda.",
    );
    expect(CONSENT_V4_HELP).toBe("Aunque el total no muestre nombres, con pocas participaciones podría deducirse cuánto solicitó una persona.");
    expect(initialScopeOf("CONV-4")).toBe("ADMINISTRATION");
    expect(isAcceptedConsent("CONV-4")).toBe(true);
    for (const other of ["CONV-0", "CONV-5", "conv-4", "", undefined, null, 4]) expect(isAcceptedConsent(other)).toBe(false);
  });

  // Rewritten for E4 (declared): `decisionVersionAccepted` and
  // `scopeCoversCollaborators` were replaced by `coversDetail`/`coversTotals`.
  it("E4 §4.2: only ADMINISTRATION covers the identified detail; ADMINISTRATION and TOTALS_ONLY cover the totals", () => {
    expect(["RESPONSIBLE_ONLY", "COLLABORATORS", "ADMINISTRATION", "TOTALS_ONLY", "CONV-4", ""].map(coversDetail)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(["RESPONSIBLE_ONLY", "COLLABORATORS", "ADMINISTRATION", "TOTALS_ONLY", ""].map(coversTotals)).toEqual([false, false, true, true, false]);
    expect(["RESPONSIBLE_ONLY", "COLLABORATORS", "ADMINISTRATION", "TOTALS_ONLY"].map(isNewScope)).toEqual([false, false, true, true]);
  });
});

describe("E2 consent decision input (P-C §10.6)", () => {
  const base = { operation_id: "3b241101-e2bb-4255-8caf-4136c566a962", sequence: 1, scope: "COLLABORATORS", consent: { version: "CONV-3", decided_at: "2026-11-12T10:00:00-04:00" } };

  it("normalizes a decision and fingerprints its scope", () => {
    const widen = normalizeConsentDecision(base);
    expect(widen).toMatchObject({ kind: "CONSENT", scope: "COLLABORATORS", consent: { version: "CONV-3" } });
    expect(widen.consent?.acceptedAt.toISOString()).toBe("2026-11-12T14:00:00.000Z");
    const reduce = normalizeConsentDecision({ ...base, scope: "RESPONSIBLE_ONLY" });
    expect(reduce.fingerprint).not.toBe(widen.fingerprint);
  });

  it("refuses an unknown scope or a decision without its text", () => {
    expect(() => normalizeConsentDecision({ ...base, scope: "EVERYONE" })).toThrow();
    expect(() => normalizeConsentDecision({ ...base, consent: undefined as never })).toThrow();
    expect(() => normalizeConsentDecision({ ...base, consent: { version: "CONV-3", decided_at: "ayer" } })).toThrow();
  });

  it("E4 §4.2: accepts ADMINISTRATION and TOTALS_ONLY with their own fingerprints; ADMINISTRATION never names a responsible (400)", () => {
    const admin = normalizeConsentDecision({ ...base, scope: "ADMINISTRATION", consent: { version: "CONV-4", decided_at: "2026-11-13T10:00:00Z" } });
    const totals = normalizeConsentDecision({ ...base, scope: "TOTALS_ONLY", consent: { version: "CONV-4", decided_at: "2026-11-13T10:00:00Z" } });
    expect(admin.scope).toBe("ADMINISTRATION");
    expect(totals.scope).toBe("TOTALS_ONLY");
    expect(admin.fingerprint).not.toBe(totals.fingerprint);
    expect(
      codeOf(() =>
        normalizeConsentDecision({ ...base, scope: "ADMINISTRATION", consent: { version: "CONV-4", decided_at: "2026-11-13T10:00:00Z" }, authorize_responsible: false }),
      ),
    ).toBe("400 PAYLOAD_INVALID");
    expect(
      codeOf(() =>
        normalizeConsentDecision({
          ...base,
          scope: "ADMINISTRATION",
          consent: { version: "CONV-4", decided_at: "2026-11-13T10:00:00Z" },
          responsible_version: 1,
          authorize_responsible: true,
        }),
      ),
    ).toBe("400 PAYLOAD_INVALID");
  });
});

describe("E2 quantities (E2-D8, as Sync v1)", () => {
  it("parses a decimal integer string > 0 within int64 into a BigInt", () => {
    expect(parseQuantity("1")).toBe(1n);
    expect(parseQuantity("9223372036854775807")).toBe(9223372036854775807n);
  });

  it.each(["0", "-1", "01", "1.5", "1e3", " 1", "", "9223372036854775808", "abc"])("refuses %p with 422", (raw) => {
    expect(codeOf(() => parseQuantity(raw))).toBe("422 QUANTITY_INVALID");
  });

  it("refuses a non-string with 400", () => {
    expect(codeOf(() => parseQuantity(5))).toBe("400 PAYLOAD_INVALID");
    expect(codeOf(() => parseQuantity(null))).toBe("400 PAYLOAD_INVALID");
  });
});

describe("E2 operation normalization and fingerprint (E2-D10)", () => {
  const consent = { version: "CONV-1", accepted_at: "2026-11-11T18:20:00.000Z" };

  it("is independent of line order and of the date's spelling", () => {
    const a = normalizeConfirm({
      operation_id: OP,
      sequence: 2,
      consent,
      lines: [
        { product_ref: "b", quantity_base: "20" },
        { product_ref: "a", quantity_base: "10" },
      ],
    });
    const b = normalizeConfirm({
      operation_id: OP,
      sequence: 2,
      consent: { version: "CONV-1", accepted_at: "2026-11-11T14:20:00-04:00" },
      lines: [
        { product_ref: "a", quantity_base: "10" },
        { product_ref: "b", quantity_base: "20" },
      ],
    });
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.lines.map((l) => l.productRef)).toEqual(["a", "b"]);
  });

  it("changes with any quantity, product, sequence, consent, kind or id", () => {
    const base = { operation_id: OP, sequence: 2, consent, lines: [{ product_ref: "a", quantity_base: "10" }] };
    const reference = normalizeConfirm(base).fingerprint;
    const variants = [
      normalizeConfirm({ ...base, lines: [{ product_ref: "a", quantity_base: "11" }] }),
      normalizeConfirm({ ...base, lines: [{ product_ref: "c", quantity_base: "10" }] }),
      normalizeConfirm({ ...base, sequence: 3 }),
      normalizeConfirm({ ...base, consent: null }),
      normalizeConfirm({ ...base, operation_id: OP2 }),
      normalizeConfirm({ ...base, lines: [] }),
      normalizeWithdraw({ operation_id: OP, sequence: 2 }),
    ].map((op) => op.fingerprint);
    expect(new Set([reference, ...variants]).size).toBe(variants.length + 1);
  });

  it("refuses malformed envelopes and repeated products with 400", () => {
    const line = [{ product_ref: "a", quantity_base: "1" }];
    expect(codeOf(() => normalizeConfirm({ operation_id: OP.toUpperCase(), sequence: 1, consent, lines: line }))).toBe(
      "400 PAYLOAD_INVALID",
    );
    expect(codeOf(() => normalizeConfirm({ operation_id: "not-a-uuid", sequence: 1, consent, lines: line }))).toBe(
      "400 PAYLOAD_INVALID",
    );
    expect(codeOf(() => normalizeConfirm({ operation_id: OP, sequence: 0, consent, lines: line }))).toBe(
      "400 PAYLOAD_INVALID",
    );
    expect(codeOf(() => normalizeConfirm({ operation_id: OP, sequence: 1.5, consent, lines: line }))).toBe(
      "400 PAYLOAD_INVALID",
    );
    expect(
      codeOf(() => normalizeConfirm({ operation_id: OP, sequence: 1, consent, lines: [...line, ...line] })),
    ).toBe("400 PAYLOAD_INVALID");
    expect(codeOf(() => normalizeWithdraw({ operation_id: OP, sequence: 2_147_483_648 }))).toBe("400 PAYLOAD_INVALID");
  });

  it("keeps an absent consent for the decision under the lock", () => {
    const op = normalizeConfirm({ operation_id: OP, sequence: 1, lines: [{ product_ref: "a", quantity_base: "1" }] });
    expect(op.consent).toBeNull();
    expect(op.kind).toBe("CONFIRM");
  });
});

describe("E2 closing computation (E2-D13)", () => {
  const products = [
    { productId: "p1", baseUnit: "ML" as const },
    { productId: "p2", baseUnit: "G" as const },
  ];
  const at = new Date("2026-11-20T10:00:00.000Z");
  const cutoff = new Date("2026-11-20T12:00:00.000Z");

  it("counts a person once overall and once per product", () => {
    const result = computeClosing(
      products,
      [
        { id: "x1", memberId: "m1", status: "ACTIVE", acceptedAt: at, lines: [{ productId: "p1", quantityBase: 1000n }, { productId: "p2", quantityBase: 500n }] },
        { id: "x2", memberId: "m2", status: "ACTIVE", acceptedAt: at, lines: [{ productId: "p1", quantityBase: 250n }] },
      ],
      cutoff,
    );
    expect(result.participantCount).toBe(2);
    expect(result.lines).toEqual([
      { productId: "p1", baseUnit: "ML", totalQuantityBase: 1250n, participantCount: 2 },
      { productId: "p2", baseUnit: "G", totalQuantityBase: 500n, participantCount: 1 },
    ]);
    expect(result.participants.map((p) => p.participationId)).toEqual(["x1", "x2"]);
  });

  it("leaves out withdrawn, empty, late and foreign-product lines; keeps a zero line per product", () => {
    const result = computeClosing(
      products,
      [
        { id: "w", memberId: "m1", status: "WITHDRAWN", acceptedAt: at, lines: [] },
        { id: "e", memberId: "m2", status: "ACTIVE", acceptedAt: at, lines: [] },
        { id: "l", memberId: "m3", status: "ACTIVE", acceptedAt: new Date(cutoff.getTime() + 1), lines: [{ productId: "p1", quantityBase: 9n }] },
        { id: "f", memberId: "m4", status: "ACTIVE", acceptedAt: at, lines: [{ productId: "other", quantityBase: 9n }] },
      ],
      cutoff,
    );
    expect(result.participantCount).toBe(0);
    expect(result.participants).toEqual([]);
    expect(result.lines.map((l) => [l.productId, l.totalQuantityBase, l.participantCount])).toEqual([
      ["p1", 0n, 0],
      ["p2", 0n, 0],
    ]);
  });

  it("is exact with BigInt totals", () => {
    const result = computeClosing(
      [products[0]],
      [
        { id: "a", memberId: "m1", status: "ACTIVE", acceptedAt: at, lines: [{ productId: "p1", quantityBase: 9007199254740993n }] },
        { id: "b", memberId: "m2", status: "ACTIVE", acceptedAt: at, lines: [{ productId: "p1", quantityBase: 2n }] },
      ],
      cutoff,
    );
    expect(result.lines[0].totalQuantityBase).toBe(9007199254740995n);
  });
});

// Rewritten for E4 (declared): the E2-D7/E2-P1 threshold view
// (`productTotalView`) and the E2-P3 viewers (RESPONSIBLE/COLLABORATOR/NONE)
// were retired. The full matrix of rule T is in visibility-matrix.spec.ts.
describe("E4 §2 and §5.2: one decision by role for detail, participants and closing", () => {
  const admin = new CallVisibility(true);
  const directiva = new CallVisibility(false);
  const p = (consentScope: string) => ({ consentScope, productIds: ["p"] });

  it("identified participants: only an eligible Administración, only ADMINISTRATION participations", () => {
    expect(["ADMINISTRATION", "TOTALS_ONLY", "RESPONSIBLE_ONLY", "COLLABORATORS"].map((scope) => admin.canSeeParticipation(p(scope)))).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(["ADMINISTRATION", "TOTALS_ONLY", "RESPONSIBLE_ONLY", "COLLABORATORS"].map((scope) => directiva.canSeeParticipation(p(scope)))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("pending consent is a count of the participations not covering ADMINISTRATION, the same for both roles", () => {
    const all = [p("ADMINISTRATION"), p("TOTALS_ONLY"), p("RESPONSIBLE_ONLY"), p("COLLABORATORS")];
    expect(admin.pendingConsentCount(all)).toBe(3);
    expect(directiva.pendingConsentCount(all)).toBe(3);
  });

  it("rule T: one ADMINISTRATION or TOTALS_ONLY person is VISIBLE live and closed; an earlier consent makes it PENDING_CONSENT live", () => {
    for (const viewer of [admin, directiva]) {
      expect(viewer.productTotal(700n, 1, [p("ADMINISTRATION")], "LIVE")).toEqual({
        participant_count: 1,
        total_quantity_base: "700",
        visibility: "VISIBLE",
        totals_basis: "ROLE_CONSENT",
      });
      expect(viewer.productTotal(700n, 1, [p("TOTALS_ONLY")], "CLOSING").totals_basis).toBe("ROLE_CONSENT");
      expect(viewer.productTotal(900n, 2, [p("ADMINISTRATION"), p("RESPONSIBLE_ONLY")], "LIVE")).toEqual({
        participant_count: 2,
        total_quantity_base: null,
        visibility: "PENDING_CONSENT",
        totals_basis: null,
      });
    }
  });

  it("rule T in a closing: 3 or more with an earlier consent → PREVIOUS_POLICY_K3 for whoever sees nobody by name, PENDING_CONSENT for an Administración who sees some", () => {
    const mixed = [p("RESPONSIBLE_ONLY"), p("COLLABORATORS"), p("ADMINISTRATION")];
    expect(directiva.productTotal(900n, 3, mixed, "CLOSING")).toEqual({
      participant_count: 3,
      total_quantity_base: "900",
      visibility: "VISIBLE",
      totals_basis: "PREVIOUS_POLICY_K3",
    });
    expect(admin.productTotal(900n, 3, mixed, "CLOSING").visibility).toBe("PENDING_CONSENT");
    // Without anyone visible by name the Administración gets the earlier rule too.
    expect(admin.productTotal(900n, 3, [p("RESPONSIBLE_ONLY"), p("RESPONSIBLE_ONLY"), p("TOTALS_ONLY")], "CLOSING").totals_basis).toBe(
      "PREVIOUS_POLICY_K3",
    );
    // Two earlier persons at the closing: PENDING_CONSENT for both.
    expect(directiva.productTotal(900n, 2, [p("RESPONSIBLE_ONLY"), p("RESPONSIBLE_ONLY")], "CLOSING").visibility).toBe("PENDING_CONSENT");
    expect(admin.productTotal(900n, 2, [p("RESPONSIBLE_ONLY"), p("RESPONSIBLE_ONLY")], "CLOSING").visibility).toBe("PENDING_CONSENT");
    // The earlier rule never applies live.
    expect(directiva.productTotal(900n, 5, Array.from({ length: 5 }, () => p("RESPONSIBLE_ONLY")), "LIVE").visibility).toBe("PENDING_CONSENT");
  });
});

describe("E2 automatic close interval", () => {
  it("defaults to 60000 ms; 0 or disabled turn it off", () => {
    expect(closeIntervalFrom(undefined)).toBe(60000);
    expect(closeIntervalFrom("")).toBe(60000);
    expect(closeIntervalFrom("0")).toBeNull();
    expect(closeIntervalFrom("disabled")).toBeNull();
    expect(closeIntervalFrom("5000")).toBe(5000);
  });
});
