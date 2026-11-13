import { createHash } from "node:crypto";

/**
 * Line state as decided by the collective summary. `SUPPRESSED_UNDER_THRESHOLD`
 * is only produced by F07-POL-01: under F07-POL-02 (E4 §5.1) it is a
 * historical state of drafts generated with the earlier policy.
 */
export type ProposalCellStatus =
  | "DISCLOSED"
  | "SUPPRESSED_UNDER_THRESHOLD"
  | "SUPPRESSED_REVISION"
  | "OVERFLOW";

/** Authorized input of one line: what the summary itself published. */
export interface ProposalInputCell {
  product_ref: string;
  base_unit: "ML" | "G";
  status: ProposalCellStatus;
  /** Exact base total, only for DISCLOSED; null otherwise. */
  total_base: string | null;
  pending_changes: boolean;
}

export interface ProposalInputs {
  campaign_ref: string;
  /**
   * E4 §4.4: the policy the draft is generated with. Absent for the earlier
   * fingerprint (v1, F07-POL-01 drafts); present, the fingerprint is v2.
   */
  policy?: string;
  coverage: { linked_members: number; members_with_contribution: number };
  cells: readonly ProposalInputCell[];
}

/**
 * Fingerprint of the authorized inputs of a joint purchase proposal (F07 #26
 * JP-01): SHA-256 of a canonical serialisation, ordered by product and unit,
 * so the same inputs always give the same fingerprint whatever their order.
 * It covers only what the summary disclosed: a suppressed cell contributes its
 * state, never a hidden quantity.
 */
export function proposalFingerprint(inputs: ProposalInputs): string {
  const cells = [...inputs.cells]
    .map((cell) => [
      cell.product_ref,
      cell.base_unit,
      cell.status,
      cell.status === "DISCLOSED" ? cell.total_base : null,
      cell.pending_changes,
    ])
    .sort((a, b) => `${a[0]}|${a[1]}`.localeCompare(`${b[0]}|${b[1]}`));
  const canonical = JSON.stringify({
    ...(inputs.policy === undefined ? { v: 1 } : { v: 2, policy: inputs.policy }),
    basis: "DECLARED_NEED",
    campaign_ref: inputs.campaign_ref,
    coverage: [inputs.coverage.linked_members, inputs.coverage.members_with_contribution],
    cells,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
