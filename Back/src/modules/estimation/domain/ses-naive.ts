import { MINIMUM_SPAN, SpanAssessment } from "./series";

/**
 * F12-EST-04 (#177; 3.12.4.8; F12_EST_01_ESTIMATION_CONTRACT §3.3): simple
 * exponential smoothing (SES) against the naive baseline, one campaign ahead,
 * over the span that F12-EST-03 declared READY. Pure: no database, no HTTP,
 * no worker; it never selects campaigns nor fills gaps.
 *
 * Arithmetic (EST-D-07): every α of the grid is k/20, so with integer inputs
 * the level after t updates is an integer over 20^t. The whole calculation is
 * done on those exact fractions with bigint, with no intermediate rounding:
 * α is chosen and the errors are compared before rounding, and only the final
 * SES and naive figures are rounded, to 6 decimals of the base unit with
 * ROUND_HALF_UP (the mode of Prisma.Decimal used elsewhere). Six decimals are
 * a representation, not a promise of accuracy.
 */

export const SES_NAIVE_METHOD = "SES_NAIVE";
export const SES_NAIVE_METHOD_VERSION = "F12-EST-04/1";

/** Everything needed to repeat the calculation (OpenAPI `Parameters`). */
export const SES_NAIVE_PARAMETERS = {
  alpha_min: "0.00",
  alpha_max: "1.00",
  alpha_step: "0.05",
  tie_tolerance: "1e-9",
  tie_break: "LARGEST_ALPHA",
  minimum_span: MINIMUM_SPAN,
  horizon: 1,
  arithmetic: "EXACT_RATIONAL",
  result_scale: 6,
  rounding: "ROUND_HALF_UP",
} as const;

const GRID = 20n;
/** Relative tie tolerance 10⁻⁹, as the exact fraction 1 / 10⁹. */
const TIE_DENOMINATOR = 1_000_000_000n;
const SCALE = 6;

export type ReadySpan = Extract<SpanAssessment, { status: "READY" }>;

export interface SesNaiveEstimate {
  method: typeof SES_NAIVE_METHOD;
  methodVersion: typeof SES_NAIVE_METHOD_VERSION;
  parameters: typeof SES_NAIVE_PARAMETERS;
  horizon: 1;
  span: { firstPosition: number; lastPosition: number; length: number };
  /** Chosen α, with two decimals ("0.50"). */
  alpha: string;
  /** False when the criterion is the same for the whole grid (α = 1 then). */
  fitInformative: boolean;
  /** Sum of squared one-step errors from the third observation at α, rounded for representation. */
  fitCriterion: string;
  /** The same criterion for the naive baseline (α = 1), rounded for representation. */
  naiveFitCriterion: string;
  /** SES estimate for the next campaign, in the base unit, 6 decimals. */
  estimateBase: string;
  /** Naive baseline: the last observation of the same span. */
  naiveBase: bigint;
}

export type SesNaiveInputProblem = "NOT_READY" | "SPAN_TOO_SHORT" | "SPAN_MISMATCH" | "NOT_AN_INTEGER" | "NEGATIVE_VALUE";

/** The engine only accepts a READY span; anything else is a broken contract, not a result. */
export class SesNaiveInputError extends Error {
  constructor(readonly problem: SesNaiveInputProblem) {
    super(`SES/naive: entrada no admitida (${problem})`);
    this.name = "SesNaiveInputError";
  }
}

export function estimateSesNaive(assessment: ReadySpan): SesNaiveEstimate {
  const values = readySpanValues(assessment);
  const n = values.length;
  const grid = Array.from({ length: Number(GRID) + 1 }, (_, k) => ({ k: BigInt(k), ...smooth(values, BigInt(k)) }));

  // Every criterion shares the denominator 20^(2(n-2)), so the numerators compare exactly.
  const minimum = grid.reduce((min, g) => (g.sse < min ? g.sse : min), grid[0]!.sse);
  const tied = grid.filter((g) => (g.sse - minimum) * TIE_DENOMINATOR <= minimum);
  const chosen = tied[tied.length - 1]!;
  const naive = grid[grid.length - 1]!;
  const criterionDenominator = GRID ** BigInt(2 * (n - 2));

  return {
    method: SES_NAIVE_METHOD,
    methodVersion: SES_NAIVE_METHOD_VERSION,
    parameters: SES_NAIVE_PARAMETERS,
    horizon: 1,
    span: { firstPosition: assessment.span.firstPosition, lastPosition: assessment.span.lastPosition, length: n },
    alpha: formatAlpha(chosen.k),
    fitInformative: tied.length !== grid.length,
    fitCriterion: roundHalfUp(chosen.sse, criterionDenominator, SCALE),
    naiveFitCriterion: roundHalfUp(naive.sse, criterionDenominator, SCALE),
    estimateBase: roundHalfUp(chosen.level, GRID ** BigInt(n - 1), SCALE),
    naiveBase: values[n - 1]!,
  };
}

/**
 * SES with α = k/20 and the initial level equal to the first observation.
 * Returns the final level as a numerator over 20^(n-1) and the sum of squared
 * one-step errors from the third observation as a numerator over 20^(2(n-2)).
 */
function smooth(values: readonly bigint[], k: bigint): { level: bigint; sse: bigint } {
  const n = values.length;
  let level = values[0]!;
  let scale = 1n;
  let sse = 0n;
  for (let t = 1; t < n; t += 1) {
    const y = values[t]!;
    if (t >= 2) {
      const error = y * scale - level;
      sse += error * error * GRID ** BigInt(2 * (n - 1 - t));
    }
    level = k * y * scale + (GRID - k) * level;
    scale *= GRID;
  }
  return { level, sse };
}

function readySpanValues(assessment: ReadySpan): bigint[] {
  if (assessment?.status !== "READY") throw new SesNaiveInputError("NOT_READY");
  const { values, firstPosition, lastPosition, length } = assessment.span;
  if (!Array.isArray(values) || values.length < MINIMUM_SPAN) throw new SesNaiveInputError("SPAN_TOO_SHORT");
  if (values.length !== length || lastPosition - firstPosition + 1 !== length) throw new SesNaiveInputError("SPAN_MISMATCH");
  for (const value of values as unknown[]) {
    if (typeof value !== "bigint") throw new SesNaiveInputError("NOT_AN_INTEGER");
    if (value < 0n) throw new SesNaiveInputError("NEGATIVE_VALUE");
  }
  return [...values];
}

function formatAlpha(k: bigint): string {
  const hundredths = k * 5n;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`;
}

/** numerator / denominator (both ≥ 0) with `scale` decimals, ROUND_HALF_UP. */
export function roundHalfUp(numerator: bigint, denominator: bigint, scale: number): string {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("roundHalfUp: solo cantidades no negativas");
  const factor = 10n ** BigInt(scale);
  const scaled = numerator * factor;
  let units = scaled / denominator;
  if ((scaled % denominator) * 2n >= denominator) units += 1n;
  const digits = units.toString().padStart(scale + 1, "0");
  return scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}
