import { CallHttpError } from "./call-error";
import { canTransition, closingCutoff, isEditable, isFinal, notOpenReason } from "./call-state";
import { computeClosing } from "./closing";
import {
  CONSENT_TEXT,
  CONSENT_V1_TEXT,
  CONSENT_V1_VERSION,
  CONSENT_V2_TEXT,
  CONSENT_V2_VERSION,
  CONSENT_VERSION,
  decisionVersionAccepted,
  initialScopeOf,
  isAcceptedConsent,
  scopeCoversCollaborators,
} from "./consent";
import { normalizeConfirm, normalizeConsentDecision, normalizeWithdraw, parseQuantity } from "./participation-input";
import { CallViewer, CallVisibility, productTotalView } from "./visibility";
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

  it("publishes CONV-3 (N5): responsible, and only if the farmer authorizes it, the Directiva/Administración she authorizes; purpose; no debt", () => {
    expect(CONSENT_VERSION).toBe("CONV-3");
    expect(CONSENT_TEXT).toBe(
      "La persona responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas. Si tú lo autorizas, también podrán verlos las personas de la Directiva o la Administración que ella autorice para esta convocatoria. Los datos se usan para coordinar la compra y la entrega. Esta confirmación no genera una deuda.",
    );
    // Accepting it gives only the responsible: widening is a decision of its own.
    expect(initialScopeOf("CONV-3")).toBe("RESPONSIBLE_ONLY");
    for (const other of ["CONV-0", "CONV-4", "conv-3", "", undefined, null, 3]) expect(isAcceptedConsent(other)).toBe(false);
  });

  it("widening cites the current text; a reduction is respected with any known text", () => {
    expect(decisionVersionAccepted("COLLABORATORS", "CONV-3")).toBe(true);
    expect(decisionVersionAccepted("COLLABORATORS", "CONV-2")).toBe(false);
    expect(decisionVersionAccepted("COLLABORATORS", "CONV-1")).toBe(false);
    for (const version of ["CONV-1", "CONV-2", "CONV-3"]) expect(decisionVersionAccepted("RESPONSIBLE_ONLY", version)).toBe(true);
    expect(decisionVersionAccepted("RESPONSIBLE_ONLY", "CONV-9")).toBe(false);
  });

  it("only the COLLABORATORS scope reaches collaborators", () => {
    expect(scopeCoversCollaborators("COLLABORATORS")).toBe(true);
    expect(scopeCoversCollaborators("RESPONSIBLE_ONLY")).toBe(false);
    expect(scopeCoversCollaborators("CONV-2")).toBe(false);
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

describe("E2 visibility (E2-D7)", () => {
  it("withholds a product total under k persons for anyone without the permission", () => {
    expect(productTotalView(1500n, 2, false)).toEqual({
      participant_count: 2,
      total_quantity_base: null,
      visibility: "UNDER_THRESHOLD",
    });
    expect(productTotalView(1500n, 3, false)).toEqual({
      participant_count: 3,
      total_quantity_base: "1500",
      visibility: "VISIBLE",
    });
  });

  it("E2-P1: live totals of an OPEN call are withheld from anyone without the permission, even at or above k", () => {
    for (const persons of [1, 3, 10]) {
      expect(productTotalView(1500n, persons, false, 3, true)).toEqual({
        participant_count: persons,
        total_quantity_base: null,
        visibility: "RESPONSIBLE_ONLY",
      });
    }
    expect(productTotalView(1500n, 1, true, 3, true)).toEqual({ participant_count: 1, total_quantity_base: "1500", visibility: "VISIBLE" });
  });

  it("shows every total to the holder of the permission", () => {
    expect(productTotalView(700n, 1, true)).toEqual({ participant_count: 1, total_quantity_base: "700", visibility: "VISIBLE" });
  });
});

describe("E2-P3 visibility (§10.3): one decision for detail, participants and closing", () => {
  const visibility = (kind: CallViewer["kind"], formerParticipantsHolder = false) =>
    new CallVisibility({ kind, formerParticipantsHolder }, scopeCoversCollaborators);
  const v1 = { consentScope: "RESPONSIBLE_ONLY", authorizedForResponsible: true, productIds: ["p"] };
  const v2 = { consentScope: "COLLABORATORS", authorizedForResponsible: true, productIds: ["p"] };

  it("identified participants: all for the responsible, COLLABORATORS ones for a collaborator, none otherwise", () => {
    expect([visibility("RESPONSIBLE").canSeeParticipation({ consentScope: "RESPONSIBLE_ONLY", authorizedForResponsible: true }), visibility("RESPONSIBLE").canSeeParticipation({ consentScope: "COLLABORATORS", authorizedForResponsible: true })]).toEqual([true, true]);
    expect([visibility("COLLABORATOR").canSeeParticipation({ consentScope: "RESPONSIBLE_ONLY", authorizedForResponsible: true }), visibility("COLLABORATOR").canSeeParticipation({ consentScope: "COLLABORATORS", authorizedForResponsible: true })]).toEqual([false, true]);
    expect([visibility("NONE").canSeeParticipation({ consentScope: "RESPONSIBLE_ONLY", authorizedForResponsible: true }), visibility("NONE", true).canSeeParticipation({ consentScope: "COLLABORATORS", authorizedForResponsible: true })]).toEqual([false, false]);
    expect(visibility("COLLABORATOR").hiddenCount([v1, v2, v1])).toBe(2);
    expect(visibility("RESPONSIBLE").hiddenCount([v1, v2])).toBe(0);
  });

  it("totals of an open call: the responsible always; a collaborator only without hidden participations; nobody else", () => {
    expect(visibility("RESPONSIBLE").productTotal(900n, 2, [v1, v2], "LIVE")).toEqual({ participant_count: 2, total_quantity_base: "900", visibility: "VISIBLE" });
    expect(visibility("COLLABORATOR").productTotal(900n, 2, [v2, v2], "LIVE")).toEqual({ participant_count: 2, total_quantity_base: "900", visibility: "VISIBLE" });
    expect(visibility("COLLABORATOR").productTotal(900n, 2, [v1, v2], "LIVE")).toEqual({ participant_count: 2, total_quantity_base: null, visibility: "RESPONSIBLE_ONLY" });
    expect(visibility("NONE").productTotal(900n, 5, [v2, v2, v2, v2, v2], "LIVE")).toEqual({ participant_count: 5, total_quantity_base: null, visibility: "RESPONSIBLE_ONLY" });
  });

  it("closing: a collaborator gets no total with a hidden participation (subtracting would reveal it); others get the threshold", () => {
    const three = [v1, v2, v2];
    expect(visibility("COLLABORATOR").productTotal(900n, 3, three, "CLOSING").visibility).toBe("RESPONSIBLE_ONLY");
    expect(visibility("COLLABORATOR").productTotal(900n, 2, [v2, v2], "CLOSING").visibility).toBe("VISIBLE");
    expect(visibility("NONE").productTotal(900n, 3, three, "CLOSING")).toEqual({ participant_count: 3, total_quantity_base: "900", visibility: "VISIBLE" });
    expect(visibility("NONE").productTotal(900n, 2, [v2, v2], "CLOSING").visibility).toBe("UNDER_THRESHOLD");
    expect(visibility("RESPONSIBLE").productTotal(900n, 1, [v1], "CLOSING").visibility).toBe("VISIBLE");
  });

  it("after a revocation, a former collaborator never gets the total of a product with a participation hidden from them", () => {
    const three = [v1, v2, v2];
    expect(visibility("NONE", true).productTotal(900n, 3, three, "CLOSING")).toEqual({ participant_count: 3, total_quantity_base: null, visibility: "RESPONSIBLE_ONLY" });
    // Without hidden participations the threshold applies as to anyone else.
    expect(visibility("NONE", true).productTotal(900n, 3, [v2, v2, v2], "CLOSING").visibility).toBe("VISIBLE");
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
