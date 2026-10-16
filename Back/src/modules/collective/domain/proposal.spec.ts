import { csvField, ProposalInputs, proposalFingerprint } from "./proposal";
import { PROPOSAL_NOTICE, proposalCsv, ProposalView } from "../application/joint-purchase-proposal.use-case";

/** F07 #26/#27: determinism of the draft and safe CSV (pure functions). */
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

describe("proposal CSV", () => {
  it("neutralises formulas and quotes separators in user text", () => {
    expect(csvField("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-2")).toBe("'-2");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField("Urea, 46%")).toBe(`"Urea, 46%"`);
    expect(csvField("línea\nnueva")).toBe(`"línea\nnueva"`);
    expect(csvField(null)).toBe("");
    expect(csvField(25000)).toBe("25000");
    expect(csvField(false)).toBe("false");
  });

  it("carries exactly the view: no figure for a hidden line", () => {
    const view: ProposalView = {
      contractVersion: 1,
      proposal_ref: "p",
      status: "DRAFT",
      basis: "DECLARED_NEED",
      campaign: { campaign_ref: "c", name: "=Campana", status: "ABIERTA" },
      generated_at: "2026-10-16T00:00:00.000Z",
      generated_by: { user_ref: "u", name: "Directiva" },
      inputs_fingerprint: "f".repeat(64),
      disclosure: { mode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", approved: false },
      coverage: { linked_members: 4, members_with_contribution: 3 },
      lines: [
        { position: 0, product_ref: "a", product_name: "Belator", base_unit: "ML", presentation_unit: "L", status: "SUPPRESSED_UNDER_THRESHOLD", quantity_base: null, quantity_presentation: null, contributors: null, data_as_of: null, released_at: null, pending_changes: false },
        { position: 1, product_ref: "b", product_name: "Urea", base_unit: "G", presentation_unit: "KG", status: "DISCLOSED", quantity_base: "25000", quantity_presentation: "25", contributors: 3, data_as_of: null, released_at: null, pending_changes: false },
      ],
      notice: PROPOSAL_NOTICE,
    };
    const text = proposalCsv(view);
    expect(text).toContain(",'=Campana,");
    expect(text).toContain("0,a,Belator,ML,L,SUPPRESSED_UNDER_THRESHOLD,,,,,,false");
    expect(text).toContain("1,b,Urea,G,KG,DISCLOSED,25000,25,3,,,false");
    expect(text.trim().split("\n")).toHaveLength(7);
  });
});
