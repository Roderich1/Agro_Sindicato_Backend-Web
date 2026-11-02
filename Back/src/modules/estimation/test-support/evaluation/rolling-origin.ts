import { assessSpan, type SourcePoint } from "../../domain/series";
import { estimateSesNaive, roundHalfUp, SES_NAIVE_METHOD_VERSION } from "../../domain/ses-naive";
import { originsOf, sourcePointsOf, SYNTHETIC_SETS_VERSION, type SyntheticSet } from "./synthetic-sets";

/**
 * F12-EST-09 (#182): rolling-origin evaluation of the integrated engine on the
 * synthetic sets (protocol `docs/evaluation/F12_EST_09_PROTOCOLO_EVALUACION.md`,
 * fixed before measuring). It calls `assessSpan` and `estimateSesNaive` as
 * they are: it neither re-implements nor tunes them.
 *
 * Errors are exact rationals over bigint; only the reported figures are
 * rounded, ROUND_HALF_UP.
 */

export const EVALUATION_VERSION = "F12-EST-09/1";

/** A non-negative rational n/d, with d > 0. */
interface Ratio {
  n: bigint;
  d: bigint;
}

const SCALE = 10n ** 6n;

/** The engine's SES (a decimal with 6 places) as a rational. */
function decimalRatio(value: string): Ratio {
  const [whole, fraction = ""] = value.split(".");
  const padded = (fraction + "000000").slice(0, 6);
  return { n: BigInt(whole!) * SCALE + BigInt(padded), d: SCALE };
}

const add = (a: Ratio, b: Ratio): Ratio => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const absDiff = (a: Ratio, b: Ratio): Ratio => {
  const n = a.n * b.d - b.n * a.d;
  return { n: n < 0n ? -n : n, d: a.d * b.d };
};
const compare = (a: Ratio, b: Ratio): number => {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left === right ? 0 : left < right ? -1 : 1;
};
const show = (r: Ratio, scale = 6) => roundHalfUp(r.n, r.d, scale);
const ZERO: Ratio = { n: 0n, d: 1n };

export type OriginStatus = "EVALUATED" | "NOT_ESTIMABLE" | "NOT_EVALUABLE";

export interface OriginResult {
  origin: number;
  reservedPosition: number | null;
  status: OriginStatus;
  /** Engine reading for the target: READY, INSUFFICIENT_DATA or INCOMPATIBLE_DATA, with its reason. */
  assessment: { status: string; reason: string | null };
  /** What the engine used to fit: positions and values of its span (base unit). */
  fit: { positions: number[]; values: string[] } | null;
  exclusions: { position: number; reason: string }[];
  alpha: string | null;
  fitInformative: boolean | null;
  ses: string | null;
  naive: string | null;
  reserved: string | null;
  /** Why the reserved campaign cannot be compared (no record or hidden). */
  reservedKind: string | null;
  errorSes: string | null;
  errorNaive: string | null;
}

export type Measure = { value: string; percent?: string } | { value: "NO DEFINIDO" | "SIN ORÍGENES EVALUABLES" };

export interface SetResult {
  id: string;
  name: string;
  baseUnit: "ML" | "G";
  presentationUnit: "L" | "KG";
  origins: OriginResult[];
  /** The estimate for the campaign after the last one: no reserved value, not in the metrics. */
  next: { assessment: { status: string; reason: string | null }; ses: string | null; naive: string | null; alpha: string | null };
  evaluated: number;
  notEstimable: number;
  notEvaluable: number;
  mae: { ses: Measure; naive: Measure; sesPresentation: string | null; naivePresentation: string | null };
  wape: { ses: Measure; naive: Measure };
  comparison: "SES menor" | "empate" | "naive menor" | "sin orígenes evaluables";
}

export interface EvaluationReport {
  evaluationVersion: string;
  setsVersion: string;
  methodVersion: string;
  sets: SetResult[];
}

/** The campaigns before the reserved one: what the engine reads at origin t (with or without the later ones). */
export function targetOf(set: SyntheticSet, position: number): { campaignId: string; startDate: Date } {
  const year = 2009 + position;
  return { campaignId: `${set.id}-C${String(position).padStart(2, "0")}`, startDate: new Date(`${year}-03-01T00:00:00.000Z`) };
}

/** One origin, reading `points` for the target `position` (t + 1). */
export function estimateAt(points: readonly SourcePoint[], set: SyntheticSet, position: number) {
  const assessment = assessSpan(points, targetOf(set, position));
  const reading = { status: assessment.status, reason: assessment.status === "READY" ? null : assessment.reason };
  const exclusions = assessment.exclusions.map((e) => ({ position: e.position, reason: e.reason }));
  if (assessment.status !== "READY") return { reading, exclusions, fit: null, estimate: null };
  const estimate = estimateSesNaive(assessment);
  const fit = {
    positions: Array.from({ length: assessment.span.length }, (_, i) => assessment.span.firstPosition + i),
    values: assessment.span.values.map((v) => v.toString()),
  };
  return { reading, exclusions, fit, estimate };
}

function originResult(set: SyntheticSet, origin: number): OriginResult {
  const points = sourcePointsOf(set);
  const reservedPosition = origin + 1;
  const { reading, exclusions, fit, estimate } = estimateAt(points, set, reservedPosition);
  const reservedCampaign = set.campaigns[reservedPosition - 1]!;
  const base = {
    origin,
    reservedPosition,
    assessment: reading,
    fit,
    exclusions,
    alpha: estimate?.alpha ?? null,
    fitInformative: estimate?.fitInformative ?? null,
    ses: estimate?.estimateBase ?? null,
    naive: estimate ? estimate.naiveBase.toString() : null,
  };
  if (!estimate) {
    return { ...base, status: "NOT_ESTIMABLE", reserved: reservedCampaign.quantityBase, reservedKind: reservedCampaign.kind, errorSes: null, errorNaive: null };
  }
  if (reservedCampaign.kind !== "VERIFIED_CONSUMPTION" || reservedCampaign.quantityBase === null) {
    return { ...base, status: "NOT_EVALUABLE", reserved: null, reservedKind: reservedCampaign.kind, errorSes: null, errorNaive: null };
  }
  const reserved: Ratio = { n: BigInt(reservedCampaign.quantityBase), d: 1n };
  const errorSes = absDiff(decimalRatio(estimate.estimateBase), reserved);
  const errorNaive = absDiff({ n: estimate.naiveBase, d: 1n }, reserved);
  return {
    ...base,
    status: "EVALUATED",
    reserved: reservedCampaign.quantityBase,
    reservedKind: reservedCampaign.kind,
    errorSes: show(errorSes),
    errorNaive: show(errorNaive),
  };
}

/** WAPE as a proportion (6 places) and a percentage (4 places); NO DEFINIDO with a zero denominator. */
function wapeOf(errors: Ratio, observed: Ratio, evaluated: number): Measure {
  if (evaluated === 0) return { value: "SIN ORÍGENES EVALUABLES" };
  if (observed.n === 0n) return { value: "NO DEFINIDO" };
  const ratio = { n: errors.n * observed.d, d: errors.d * observed.n };
  return { value: show(ratio), percent: show({ n: ratio.n * 100n, d: ratio.d }, 4) };
}

/** Metrics over the evaluated origins; exported so the reporting rule can be checked on a control case. */
export function metricsOf(origins: readonly OriginResult[]) {
  const evaluated = origins.filter((o) => o.status === "EVALUATED");
  const k = BigInt(evaluated.length);
  let sumSes = ZERO;
  let sumNaive = ZERO;
  let observed = ZERO;
  for (const o of evaluated) {
    sumSes = add(sumSes, decimalRatio(o.errorSes!));
    sumNaive = add(sumNaive, decimalRatio(o.errorNaive!));
    observed = add(observed, { n: BigInt(o.reserved!), d: 1n });
  }
  const maeOf = (sum: Ratio): Measure => (k === 0n ? { value: "SIN ORÍGENES EVALUABLES" } : { value: show({ n: sum.n, d: sum.d * k }) });
  const comparison: SetResult["comparison"] =
    k === 0n ? "sin orígenes evaluables" : compare(sumSes, sumNaive) < 0 ? "SES menor" : compare(sumSes, sumNaive) === 0 ? "empate" : "naive menor";
  return {
    evaluated: evaluated.length,
    mae: { ses: maeOf(sumSes), naive: maeOf(sumNaive) },
    wape: { ses: wapeOf(sumSes, observed, evaluated.length), naive: wapeOf(sumNaive, observed, evaluated.length) },
    comparison,
    exact: { sumSes, sumNaive, k },
  };
}

/** Base-unit figure (6 places) shifted to L or KG, exactly: "11500.000000" → "11.5". */
function presentation(value: Measure): string | null {
  if (!/^[0-9]+\.[0-9]{6}$/.test(value.value)) return null;
  const [whole, fraction] = value.value.split(".");
  const digits = (whole! + fraction!).replace(/^0+(?=\d)/, "");
  const padded = digits.padStart(10, "0");
  const integer = padded.slice(0, padded.length - 9).replace(/^0+(?=\d)/, "");
  const decimals = padded.slice(padded.length - 9).replace(/0+$/, "");
  return decimals ? `${integer}.${decimals}` : integer;
}

export function evaluateSet(set: SyntheticSet): SetResult {
  const origins = originsOf(set).map((t) => originResult(set, t));
  const nextPosition = set.campaigns.length + 1;
  const next = estimateAt(sourcePointsOf(set), set, nextPosition);
  const metrics = metricsOf(origins);
  return {
    id: set.id,
    name: set.name,
    baseUnit: set.baseUnit as "ML" | "G",
    presentationUnit: set.baseUnit === "ML" ? "L" : "KG",
    origins,
    next: {
      assessment: next.reading,
      ses: next.estimate?.estimateBase ?? null,
      naive: next.estimate ? next.estimate.naiveBase.toString() : null,
      alpha: next.estimate?.alpha ?? null,
    },
    evaluated: metrics.evaluated,
    notEstimable: origins.filter((o) => o.status === "NOT_ESTIMABLE").length,
    notEvaluable: origins.filter((o) => o.status === "NOT_EVALUABLE").length,
    mae: { ...metrics.mae, sesPresentation: presentation(metrics.mae.ses), naivePresentation: presentation(metrics.mae.naive) },
    wape: metrics.wape,
    comparison: metrics.comparison,
  };
}

export function evaluate(sets: readonly SyntheticSet[]): EvaluationReport {
  return { evaluationVersion: EVALUATION_VERSION, setsVersion: SYNTHETIC_SETS_VERSION, methodVersion: SES_NAIVE_METHOD_VERSION, sets: sets.map(evaluateSet) };
}
