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
