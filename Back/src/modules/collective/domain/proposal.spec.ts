import { ProposalInputs, proposalFingerprint } from "./proposal";

/** F07 #26/#27: determinism of the draft (pure function). */
describe("joint purchase proposal fingerprint", () => {
  const inputs: ProposalInputs = {
    campaign_ref: "c1",
    coverage: { linked_members: 4, members_with_contribution: 3 },
    cells: [
      { product_ref: "p-urea", base_unit: "G", status: "DISCLOSED", total_base: "25000", pending_changes: false },
      { product_ref: "p-belator", base_unit: "ML", status: "SUPPRESSED_UNDER_THRESHOLD", total_base: null, pending_changes: false },
    ],
  };

  it("is the same for the same inputs, whatever their order", () => {
    const reversed = { ...inputs, cells: [...inputs.cells].reverse() };
    expect(proposalFingerprint(reversed)).toBe(proposalFingerprint(inputs));
    expect(proposalFingerprint(inputs)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when a disclosed figure, a state, a pending flag or the coverage change", () => {
    const base = proposalFingerprint(inputs);
    const variants: ProposalInputs[] = [
      { ...inputs, cells: [{ ...inputs.cells[0], total_base: "25001" }, inputs.cells[1]] },
      { ...inputs, cells: [inputs.cells[0], { ...inputs.cells[1], status: "SUPPRESSED_REVISION" }] },
      { ...inputs, cells: [{ ...inputs.cells[0], pending_changes: true }, inputs.cells[1]] },
      { ...inputs, coverage: { linked_members: 5, members_with_contribution: 3 } },
      { ...inputs, campaign_ref: "c2" },
    ];
    for (const variant of variants) expect(proposalFingerprint(variant)).not.toBe(base);
  });

  it("never depends on a hidden total: a suppressed cell contributes only its state", () => {
    const leaked = { ...inputs, cells: [inputs.cells[0], { ...inputs.cells[1], total_base: "7000" }] };
    expect(proposalFingerprint(leaked)).toBe(proposalFingerprint(inputs));
  });
});

describe("E4 §4.4: fingerprint v2 of new drafts includes the policy", () => {
  const inputs: ProposalInputs = {
    campaign_ref: "camp",
    coverage: { linked_members: 5, members_with_contribution: 1 },
    cells: [{ product_ref: "a", base_unit: "ML", status: "DISCLOSED", total_base: "10", pending_changes: false }],
  };

  it("differs between the policies and from the earlier v1 fingerprint", () => {
    const v1 = proposalFingerprint(inputs);
    const pol01 = proposalFingerprint({ ...inputs, policy: "F07-POL-01" });
    const pol02 = proposalFingerprint({ ...inputs, policy: "F07-POL-02" });
    expect(new Set([v1, pol01, pol02]).size).toBe(3);
    expect(proposalFingerprint({ ...inputs, policy: "F07-POL-02" })).toBe(pol02);
  });
});
