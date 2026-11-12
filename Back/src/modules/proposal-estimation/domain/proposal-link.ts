import { createHash } from "node:crypto";

/**
 * E3 (docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md): pure rules of
 * the estimation reference fixed in a draft proposal. No I/O here.
 */

// ------------------------------------------------------------ job request id

/**
 * E3-D5: the `request_id` of the F12 job queued by `prepare`, derived
 * deterministically from (draft, `request_id` of prepare): the first 128 bits
 * of SHA-256("E3-PREP|proposalId|requestId"), formatted as a UUID (version 8,
 * RFC 9562 variant). A retried prepare asks F12 with the same identifier, so
 * F12's own idempotency returns the same job.
 */
export function derivedJobRequestId(proposalId: string, requestId: string): string {
  const hex = createHash("sha256").update(`E3-PREP|${proposalId}|${requestId}`, "utf8").digest("hex").slice(0, 32).split("");
  hex[12] = "8";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// --------------------------------------------------------------- line state

export type LinkState = "NONE" | "CALCULATING" | "LINKED" | "UNAVAILABLE" | "RESTRICTED";

export type LineEstimationState =
  | "NONE"
  | "CALCULATING"
  | "AVAILABLE"
  | "OUTDATED"
  | "INSUFFICIENT_DATA"
  | "ERROR"
  | "NO_RESULT"
  | "RESTRICTED";

export interface LineResult {
  status: "ESTIMATED" | "INSUFFICIENT_DATA" | "INCOMPATIBLE_DATA" | "CALCULATION_FAILED";
  validity: "NOT_USABLE" | "SUPERSEDED" | "OUTDATED" | "CURRENT";
  validityReason: string | null;
}

/**
 * E3 §4, state of one line. A figure is shown only for AVAILABLE and
 * OUTDATED; a withdrawn source or a pending policy is RESTRICTED (the link
 * stays visible, the figure does not).
 */
export function lineEstimationState(linkState: LinkState, result: LineResult | null): LineEstimationState {
  switch (linkState) {
    case "NONE":
      return "NONE";
    case "CALCULATING":
      return "CALCULATING";
    case "UNAVAILABLE":
      return "ERROR";
    case "RESTRICTED":
      return "RESTRICTED";
    case "LINKED":
      break;
  }
  if (!result) return "NO_RESULT";
  if (result.status === "CALCULATION_FAILED") return "ERROR";
  if (result.status === "INSUFFICIENT_DATA" || result.status === "INCOMPATIBLE_DATA") return "INSUFFICIENT_DATA";
  if (result.validityReason === "SOURCES_WITHDRAWN") return "RESTRICTED";
  if (result.validity === "CURRENT") return "AVAILABLE";
  return "OUTDATED";
}

// -------------------------------------------------------------- comparison

export type ComparisonBlocker =
  | "NEED_NOT_DISCLOSED"
  | "ESTIMATE_NOT_AVAILABLE"
  | "ESTIMATE_NOT_CURRENT"
  | "PRODUCT_MISMATCH"
  | "UNIT_MISMATCH"
  | "PERIOD_MISMATCH"
  | "POPULATION_NOT_VERIFIED";

export const BLOCKER_MESSAGE: Record<ComparisonBlocker, string> = {
  NEED_NOT_DISCLOSED: "No se calcula la diferencia: la necesidad declarada no tiene una cifra divulgada.",
  ESTIMATE_NOT_AVAILABLE: "No se calcula la diferencia: no hay una estimación con cifra.",
  ESTIMATE_NOT_CURRENT: "No se calcula la diferencia: la estimación no está vigente.",
  PRODUCT_MISMATCH: "No se calcula la diferencia: no es el mismo producto.",
  UNIT_MISMATCH: "No se calcula la diferencia: no es la misma unidad.",
  PERIOD_MISMATCH: "No se calcula la diferencia: la estimación no es para la campaña del borrador.",
  // E3-P1 (opción 1 + 1b): the view shows the known scope of each figure instead.
  POPULATION_NOT_VERIFIED:
    "No se calcula la diferencia: la necesidad y la estimación provienen de grupos de agricultores distintos (ver el alcance de cada cifra).",
};

export interface ComparisonInput {
  need: {
    productRef: string;
    baseUnit: "ML" | "G";
    campaignRef: string;
    /** The disclosed figure in the base unit (integer string), or null: never a zero. */
    quantityBase: string | null;
  };
  estimate: {
    productRef: string;
    baseUnit: "ML" | "G";
    targetCampaignRef: string;
    /** Decimal string with up to 6 decimals, or null when there is no figure. */
    estimateBase: string | null;
    /** Validity CURRENT and a policy in force that publishes it. */
    current: boolean;
  } | null;
  /**
   * E3-P1: whether need and estimate are known to cover the same population.
   * Decided (option 1 + 1b): not checked; callers pass false and the view
   * shows the known scope of each figure.
   */
  populationVerified: boolean;
}

export interface Difference {
  /** Need − estimate, in the base unit, exact (6 decimals, signed). */
  difference_base: string;
  /** (Need − estimate) / estimate × 100 with 4 decimals; null when the estimate is 0. */
  difference_percent: string | null;
  percent_undefined: "ESTIMATE_ZERO" | null;
  direction: "ABOVE" | "BELOW" | "EQUAL";
  /** Descriptive sentence; rounded only here, in the presentation unit. */
  observation: string;
}

export interface Comparison {
  comparable: boolean;
  blockers: ComparisonBlocker[];
  message: string | null;
  difference: Difference | null;
}

/**
 * E3 §5: checks, in this order, every condition before a difference; each
 * failure is a blocker. Checks that need the estimate are skipped without
 * one. The difference is computed only without blockers, exactly, with
 * integers (millionths of the base unit); an absent figure is never taken as
 * zero.
 */
export function compare(input: ComparisonInput): Comparison {
  const blockers: ComparisonBlocker[] = [];
  const need = input.need;
  const estimate = input.estimate;
  const needValue = need.quantityBase === null ? null : parseNeed(need.quantityBase);
  if (needValue === null) blockers.push("NEED_NOT_DISCLOSED");
  const estimateValue = estimate?.estimateBase == null ? null : parseEstimate(estimate.estimateBase);
  if (estimateValue === null) blockers.push("ESTIMATE_NOT_AVAILABLE");
  if (estimate) {
    if (estimateValue !== null && !estimate.current) blockers.push("ESTIMATE_NOT_CURRENT");
    if (estimate.productRef !== need.productRef) blockers.push("PRODUCT_MISMATCH");
    if (estimate.baseUnit !== need.baseUnit) blockers.push("UNIT_MISMATCH");
    if (estimate.targetCampaignRef !== need.campaignRef) blockers.push("PERIOD_MISMATCH");
  }
  if (!input.populationVerified) blockers.push("POPULATION_NOT_VERIFIED");
  if (blockers.length > 0 || needValue === null || estimateValue === null) {
    return { comparable: false, blockers, message: BLOCKER_MESSAGE[blockers[0] ?? "ESTIMATE_NOT_AVAILABLE"], difference: null };
  }
  return { comparable: true, blockers: [], message: null, difference: exactDifference(needValue, estimateValue, need.baseUnit) };
}

const MICRO = 1_000_000n;

/** The need: a decimal integer ≥ 0 in the base unit, as millionths. */
function parseNeed(text: string): bigint | null {
  return /^(0|[1-9][0-9]*)$/.test(text) ? BigInt(text) * MICRO : null;
}

/** The estimate: a decimal ≥ 0 with up to 6 decimals, as millionths. */
function parseEstimate(text: string): bigint | null {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]!) * MICRO + BigInt((match[2] ?? "").padEnd(6, "0"));
}

/** Rounds n / d to an integer, half away from zero (d > 0). */
function divRound(n: bigint, d: bigint): bigint {
  const negative = n < 0n;
  const a = negative ? -n : n;
  const q = (2n * a + d) / (2n * d);
  return negative ? -q : q;
}

function fixed(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const negative = value < 0n;
  const a = negative ? -value : value;
  const whole = a / scale;
  const fraction = (a % scale).toString().padStart(decimals, "0");
  return `${negative ? "-" : ""}${whole}${decimals > 0 ? `.${fraction}` : ""}`;
}

/** Exact difference in millionths of the base unit (need and estimate ≥ 0). */
export function exactDifference(needMicro: bigint, estimateMicro: bigint, baseUnit: "ML" | "G"): Difference {
  const diff = needMicro - estimateMicro;
  const percent = estimateMicro === 0n ? null : fixed(divRound(diff * 100n * 10_000n, estimateMicro), 4);
  const direction = diff > 0n ? "ABOVE" : diff < 0n ? "BELOW" : "EQUAL";
  return {
    difference_base: fixed(diff, 6),
    difference_percent: percent,
    percent_undefined: estimateMicro === 0n ? "ESTIMATE_ZERO" : null,
    direction,
    observation: observationOf(diff, baseUnit),
  };
}

/**
 * The sentence shown next to the line: descriptive only (never «compra
 * recomendada», «demanda excesiva» nor ranges), in the presentation unit (L
 * or KG), rounded to thousandths only here.
 */
function observationOf(diffMicro: bigint, baseUnit: "ML" | "G"): string {
  const unit = baseUnit === "ML" ? "L" : "KG";
  const tail = "la estimación de consumo para el mismo período y alcance.";
  if (diffMicro === 0n) return `La necesidad declarada coincide con ${tail}`;
  const magnitude = diffMicro < 0n ? -diffMicro : diffMicro;
  // millionths of mL (or g) → thousandths of L (or kg): divide by 10^6.
  const thousandths = divRound(magnitude, MICRO);
  const amount = thousandths === 0n ? `menos de 0,001 ${unit}` : `${presentation(thousandths)} ${unit}`;
  return diffMicro > 0n ? `La necesidad declarada supera en ${amount} ${tail}` : `La necesidad declarada es inferior en ${amount} a ${tail}`;
}

/** Thousandths as «139» or «0,5» (decimal comma, no trailing zeros). */
function presentation(thousandths: bigint): string {
  const whole = thousandths / 1000n;
  const fraction = (thousandths % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : whole.toString();
}

// ------------------------------------------------------------ known scope

/**
 * E3-P1 (option 1 + 1b): the known scope of the consumption figures behind a
 * fixed estimate: how many campaigns its span has and the fewest and most
 * contributors of the published consumption figure of one campaign. No
 * identity and nothing per campaign.
 */
export interface EstimateScope {
  span_campaigns: number;
  contributors_min: number;
  contributors_max: number;
}

/** E3-P1: the scope goes with the estimate figure only (AVAILABLE or OUTDATED with a figure). */
export function showsEstimateScope(state: LineEstimationState, estimateBase: string | null): boolean {
  return (state === "AVAILABLE" || state === "OUTDATED") && estimateBase !== null;
}

/**
 * The scope of the span [first, last] of a result: every position of the
 * span must have its point with the contributors of its source figure;
 * otherwise the scope is unknown (null), never guessed.
 */
export function estimateScope(
  span: { first: number | null; last: number | null },
  points: { position: number; contributors: number | null }[],
): EstimateScope | null {
  const { first, last } = span;
  if (first === null || last === null || last < first) return null;
  const counts: number[] = [];
  for (let position = first; position <= last; position += 1) {
    const point = points.find((p) => p.position === position);
    if (!point || point.contributors === null || !Number.isInteger(point.contributors) || point.contributors < 0) return null;
    counts.push(point.contributors);
  }
  return { span_campaigns: counts.length, contributors_min: Math.min(...counts), contributors_max: Math.max(...counts) };
}

/** The parsers, for the use case and the tests. */
export const parse = { need: parseNeed, estimate: parseEstimate };
