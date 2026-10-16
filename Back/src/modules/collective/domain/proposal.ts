import { createHash } from "node:crypto";

/** Line state as decided by the collective summary (F07-POL-01). */
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
    v: 1,
    basis: "DECLARED_NEED",
    campaign_ref: inputs.campaign_ref,
    coverage: [inputs.coverage.linked_members, inputs.coverage.members_with_contribution],
    cells,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * One CSV field. Quotes separators and line breaks and neutralises text that a
 * spreadsheet would run as a formula (`=`, `+`, `-`, `@`, tab, CR), because
 * product and campaign names are typed by users.
 */
export function csvField(value: string | number | boolean | null): string {
  let text = value === null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
