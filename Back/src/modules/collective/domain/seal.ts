import { createHash } from "node:crypto";
import type { SyncV1BaseUnit, SyncV1ProjectionType } from "@prisma/client";

/**
 * Advisory lock of a campaign's collective seal (F07_SEALED_HISTORY_CONTRACT
 * §3.5). Sealing takes it exclusively; every Sync v1 push that reaches a
 * decision takes it shared, so each operation lands clearly before or after
 * the seal. Lock order: push = operation → seal (shared) → contribution row;
 * seal = seal (exclusive) → `collective:` summary lock. No path inverts it.
 */
export function sealLockKey(tenantId: string, campaignId: string): string {
  return `collective-seal:${tenantId}:${campaignId}`;
}

/** State of a cell when a sealed version is served. */
export type SealedCellStatus =
  | "DISCLOSED"
  | "SUPPRESSED_UNDER_THRESHOLD"
  | "SUPPRESSED_REVISION"
  | "OVERFLOW"
  | "WITHDRAWN_AFTER_SEAL";

/** What the seal fixed for one cell. */
export interface SealedEntry {
  status: "DISCLOSED" | "SUPPRESSED_UNDER_THRESHOLD" | "SUPPRESSED_REVISION" | "OVERFLOW";
  /** Contributors of the referenced disclosure; null unless DISCLOSED. */
  contributors: number | null;
  visibilityWithdrawnAt: Date | null;
}

/**
 * Visibility of a sealed cell under the policy in force now (contract §5.2):
 * the policy may withdraw a sealed figure, never add one. A figure whose
 * contributor withdrew after the seal, or below the threshold in force, is
 * not served; nothing hidden at seal time comes back. The caller handles
 * `POLICY_PENDING` (no cells at all).
 */
export function sealedCellStatus(entry: SealedEntry, threshold: number): SealedCellStatus {
  if (entry.status !== "DISCLOSED") return entry.status;
  if (entry.visibilityWithdrawnAt !== null) return "WITHDRAWN_AFTER_SEAL";
  if (entry.contributors === null || entry.contributors < threshold) return "SUPPRESSED_UNDER_THRESHOLD";
  return "DISCLOSED";
}

export interface ReviewCell {
  projection_type: SyncV1ProjectionType;
  product_ref: string;
  base_unit: SyncV1BaseUnit;
  status: string;
  pending_changes: boolean;
  /** Internal reference of the disclosure shown; null unless DISCLOSED. */
  release_ref: string | null;
}

export interface ReviewInputs {
  campaign_ref: string;
  mode: string;
  threshold: number | null;
  coverage: { linked_members: number; members_with_contribution: number; suppressed_cells: boolean };
  open_disputes: boolean;
  pending_changes: boolean;
  cells: readonly ReviewCell[];
}

/**
 * `review_ref` (contract §3.5): SHA-256 of a canonical serialisation of what
 * the Directiva reviewed before sealing. It covers states, flags and the
 * internal reference of each shown disclosure, never a quantity of a hidden
 * cell nor an identity; the same inputs give the same value in any order.
 */
export function reviewFingerprint(inputs: ReviewInputs): string {
  const cells = [...inputs.cells]
    .map((cell) => [
      cell.projection_type,
      cell.product_ref,
      cell.base_unit,
      cell.status,
      cell.pending_changes,
      cell.status === "DISCLOSED" ? cell.release_ref : null,
    ])
    .sort((a, b) => `${a[0]}|${a[1]}|${a[2]}`.localeCompare(`${b[0]}|${b[1]}|${b[2]}`));
  const canonical = JSON.stringify({
    v: 1,
    campaign_ref: inputs.campaign_ref,
    mode: inputs.mode,
    threshold: inputs.threshold,
    coverage: [inputs.coverage.linked_members, inputs.coverage.members_with_contribution, inputs.coverage.suppressed_cells],
    flags: [inputs.open_disputes, inputs.pending_changes],
    cells,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
