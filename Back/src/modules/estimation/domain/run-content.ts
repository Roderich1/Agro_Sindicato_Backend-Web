import { createHash } from "node:crypto";

/**
 * F12-EST-05 (#178; contract §5): `EstimationRun.contentHash`, the SHA-256 of
 * a run and all its results serialised canonically, so that a stored run can
 * be checked against its hash. The fields and their order are fixed here:
 * - the run: every column but `contentHash`, with figures as text and dates
 *   in ISO 8601;
 * - its results sorted by product and unit, every column but `runId`, with
 *   the estimate and the criterion with 6 decimals, α with 2 and the naive as
 *   an integer;
 * - every object with its keys sorted, recursively (so JSON read back from
 *   jsonb, which reorders keys, hashes the same).
 */
export interface RunContent {
  run_ref: string;
  job_ref: string;
  job_attempt: number;
  tenant_ref: string;
  requested_by_user_ref: string;
  requested_by_role: string;
  target_campaign_ref: string;
  target_classification_ref: string;
  season_ref: string;
  contract_version: number;
  method: string;
  method_version: string;
  parameters: unknown;
  horizon: number;
  disclosure_mode: string;
  policy: string;
  threshold: number;
  outcome: string;
  failure_code: string | null;
  previous_run_ref: string | null;
  generated_at: string;
}

export interface ResultContent {
  product_ref: string;
  base_unit: string;
  series_ref: string | null;
  status: string;
  reason_code: string | null;
  estimate_base: string | null;
  naive_base: string | null;
  alpha: string | null;
  fit_informative: boolean | null;
  fit_criterion: string | null;
  span_first_position: number | null;
  span_last_position: number | null;
  exclusions: unknown;
  validations: unknown;
  metrics: unknown;
}

/**
 * Order of identifiers by UTF-16 code units, as `Array.prototype.sort` does
 * by default: independent of locale, so hashes and queues stay reproducible.
 */
export function byCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return JSON.stringify(value.toString());
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function runContentHash(run: RunContent, results: readonly ResultContent[]): string {
  const sorted = [...results].sort((a, b) => (a.product_ref + a.base_unit < b.product_ref + b.base_unit ? -1 : 1));
  return createHash("sha256").update(canonicalJson({ run, results: sorted })).digest("hex");
}
