import { ReviewInputs, reviewFingerprint, sealedCellStatus, sealLockKey } from "./seal";

/**
 * F07 sealed history (F07_SEALED_HISTORY_CONTRACT §3.5, §5.2): the policy in
 * force may withdraw a sealed figure, never add one; the review fingerprint
 * covers states and shown disclosures, never a hidden quantity.
 */
describe("sealed cell visibility (contract §5.2)", () => {
  const disclosed = { status: "DISCLOSED" as const, contributors: 3, visibilityWithdrawnAt: null };

  it("serves a sealed figure only while the policy in force allows it", () => {
    expect(sealedCellStatus(disclosed, 3)).toBe("DISCLOSED");
    // A higher threshold in force hides figures sealed under a lower one.
    expect(sealedCellStatus(disclosed, 5)).toBe("SUPPRESSED_UNDER_THRESHOLD");
    // The contributor withdrew after the seal: hidden, data unchanged.
    expect(sealedCellStatus({ ...disclosed, visibilityWithdrawnAt: new Date() }, 3)).toBe("WITHDRAWN_AFTER_SEAL");
    // Without a known count the figure is never served.
    expect(sealedCellStatus({ ...disclosed, contributors: null }, 3)).toBe("SUPPRESSED_UNDER_THRESHOLD");
  });

  it("never brings back a cell hidden at seal time, whatever the threshold", () => {
    for (const status of ["SUPPRESSED_UNDER_THRESHOLD", "SUPPRESSED_REVISION", "OVERFLOW"] as const) {
      expect(sealedCellStatus({ status, contributors: null, visibilityWithdrawnAt: null }, 1)).toBe(status);
    }
  });
});

describe("review fingerprint (contract §3.5)", () => {
  const inputs: ReviewInputs = {
    campaign_ref: "camp",
    mode: "PROVISIONAL_SYNTHETIC",
    threshold: 3,
    coverage: { linked_members: 5, members_with_contribution: 3, suppressed_cells: true },
    open_disputes: false,
    pending_changes: false,
    cells: [
      { projection_type: "DECLARED_NEED", product_ref: "a", base_unit: "ML", status: "DISCLOSED", pending_changes: false, release_ref: "r1" },
      { projection_type: "DECLARED_NEED", product_ref: "b", base_unit: "G", status: "SUPPRESSED_UNDER_THRESHOLD", pending_changes: false, release_ref: null },
    ],
  };

  it("is stable whatever the order of the cells", () => {
    expect(reviewFingerprint({ ...inputs, cells: [...inputs.cells].reverse() })).toBe(reviewFingerprint(inputs));
    expect(reviewFingerprint(inputs)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with every reviewed fact: states, shown disclosure, coverage and flags", () => {
    const base = reviewFingerprint(inputs);
    const changed: ReviewInputs[] = [
      { ...inputs, cells: [{ ...inputs.cells[0]!, release_ref: "r2" }, inputs.cells[1]!] },
      { ...inputs, cells: [{ ...inputs.cells[0]!, pending_changes: true }, inputs.cells[1]!] },
      { ...inputs, cells: [inputs.cells[0]!, { ...inputs.cells[1]!, status: "SUPPRESSED_REVISION" }] },
      { ...inputs, coverage: { ...inputs.coverage, members_with_contribution: 4 } },
      { ...inputs, open_disputes: true },
      { ...inputs, pending_changes: true },
      { ...inputs, threshold: 5 },
    ];
    for (const variant of changed) expect(reviewFingerprint(variant)).not.toBe(base);
  });

  it("ignores a reference given to a cell that is not disclosed", () => {
    const leaked = { ...inputs, cells: [inputs.cells[0]!, { ...inputs.cells[1]!, release_ref: "hidden" }] };
    expect(reviewFingerprint(leaked)).toBe(reviewFingerprint(inputs));
  });
});

it("one seal lock per tenant and campaign", () => {
  expect(sealLockKey("t", "c")).toBe("collective-seal:t:c");
  expect(sealLockKey("t", "c")).not.toBe(sealLockKey("t2", "c"));
});
