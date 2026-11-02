import { Prisma } from "@prisma/client";
import { estimateSesNaive, ReadySpan, roundHalfUp, SES_NAIVE_PARAMETERS, SesNaiveInputError } from "./ses-naive";

/** A READY span as F12-EST-03 delivers it; the positions only identify it. */
function ready(values: bigint[], firstPosition = 1): ReadySpan {
  return {
    status: "READY",
    span: { firstPosition, lastPosition: firstPosition + values.length - 1, length: values.length, values },
    coverage: values.map((_, i) => ({ campaignId: `c${i + 1}`, coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3, linkedMembers: 5 } })),
    exclusions: [],
  };
}
const n = (...values: number[]) => values.map((v) => BigInt(v));

/**
 * Independent reference written from 3.12.4.8 and EST-D-07, not from the
 * engine: decimal arithmetic with 1000 significant digits (exact for these
 * spans, because k/20 has a finite decimal expansion), the grid as decimals,
 * and the tie rule as a relative comparison. Only the final figures are rounded.
 */
const Exact = Prisma.Decimal.clone({ precision: 1000 });
function reference(values: number[]) {
  const alphas = Array.from({ length: 21 }, (_, k) => new Exact(k).div(20));
  const fits = alphas.map((alpha) => {
    let level = new Exact(values[0]!);
    let sse = new Exact(0);
    values.slice(1).forEach((y, i) => {
      if (i + 1 >= 2) sse = sse.plus(new Exact(y).minus(level).pow(2));
      level = alpha.times(y).plus(new Exact(1).minus(alpha).times(level));
    });
    return { alpha, level, sse };
  });
  const min = Exact.min(...fits.map((f) => f.sse));
  const tied = fits.filter((f) => f.sse.minus(min).lte(min.times("1e-9")));
  const chosen = tied[tied.length - 1]!;
  return {
    alpha: chosen.alpha.toFixed(2),
    fitInformative: tied.length < fits.length,
    estimateBase: chosen.level.toDecimalPlaces(6, Exact.ROUND_HALF_UP).toFixed(6),
    fitCriterion: chosen.sse.toDecimalPlaces(6, Exact.ROUND_HALF_UP).toFixed(6),
    naiveFitCriterion: fits[20]!.sse.toDecimalPlaces(6, Exact.ROUND_HALF_UP).toFixed(6),
  };
}

function pick(values: number[]) {
  const r = estimateSesNaive(ready(n(...values)));
  return { alpha: r.alpha, fitInformative: r.fitInformative, estimateBase: r.estimateBase, fitCriterion: r.fitCriterion, naiveFitCriterion: r.naiveFitCriterion };
}

describe("estimateSesNaive (F12-EST-04)", () => {
  it("reproduces the example of 3.12.5: 96, 120, 104 and 116 L give α = 0.50, SES 111 L and naive 116 L", () => {
    // By hand, α = 0.50: L1 = 96; L2 = 108; e3 = 104 − 108 = −4; L3 = 106; e4 = 116 − 106 = 10;
    // criterion 16 + 100 = 116; L4 = 0.5·116 + 0.5·106 = 111. The naive criterion (α = 1) is 16² + 12² = 400.
    const litres = estimateSesNaive(ready(n(96, 120, 104, 116)));
    expect(litres).toEqual({
      method: "SES_NAIVE",
      methodVersion: "F12-EST-04/1",
      parameters: SES_NAIVE_PARAMETERS,
      horizon: 1,
      span: { firstPosition: 1, lastPosition: 4, length: 4 },
      alpha: "0.50",
      fitInformative: true,
      fitCriterion: "116.000000",
      naiveFitCriterion: "400.000000",
      estimateBase: "111.000000",
      naiveBase: 116n,
    });
    // In the base unit (mL) the choice is the same and the figures scale.
    const millilitres = estimateSesNaive(ready(n(96000, 120000, 104000, 116000), 9));
    expect(millilitres).toMatchObject({ alpha: "0.50", estimateBase: "111000.000000", naiveBase: 116000n, fitCriterion: "116000000.000000" });
    expect(millilitres.span).toEqual({ firstPosition: 9, lastPosition: 12, length: 4 });
  });

  it("keeps the parameters and the method version needed to repeat the calculation", () => {
    expect(SES_NAIVE_PARAMETERS).toEqual({
      alpha_min: "0.00",
      alpha_max: "1.00",
      alpha_step: "0.05",
      tie_tolerance: "1e-9",
      tie_break: "LARGEST_ALPHA",
      minimum_span: 3,
      horizon: 1,
      arithmetic: "EXACT_RATIONAL",
      result_scale: 6,
      rounding: "ROUND_HALF_UP",
    });
  });

  it("is deterministic and does not touch its input", () => {
    const span = ready(n(0, 0, 2, 1, 0, 0, 7, 3));
    const before = JSON.stringify(span, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    const first = estimateSesNaive(span);
    for (let i = 0; i < 50; i += 1) expect(estimateSesNaive(span)).toEqual(first);
    expect(estimateSesNaive(ready(n(0, 0, 2, 1, 0, 0, 7, 3)))).toEqual(first);
    expect(JSON.stringify(span, (_, v) => (typeof v === "bigint" ? v.toString() : v))).toBe(before);
  });

  it("gives α = 1 and a non-informative fit for a constant series and for verified zeros", () => {
    expect(pick([500, 500, 500, 500])).toEqual({ alpha: "1.00", fitInformative: false, estimateBase: "500.000000", fitCriterion: "0.000000", naiveFitCriterion: "0.000000" });
    expect(pick([0, 0, 0])).toEqual({ alpha: "1.00", fitInformative: false, estimateBase: "0.000000", fitCriterion: "0.000000", naiveFitCriterion: "0.000000" });
    // Two verified zeros first: L2 = 0 for every α, so e3 = 900 for all of them.
    expect(pick([0, 0, 900])).toEqual({ alpha: "1.00", fitInformative: false, estimateBase: "900.000000", fitCriterion: "810000.000000", naiveFitCriterion: "810000.000000" });
    // y1 = y2: the criterion is constant, so α = 1 and the estimate is the last value.
    expect(pick([700, 700, 50])).toMatchObject({ alpha: "1.00", fitInformative: false, estimateBase: "50.000000" });
  });

  it("reaches both ends of the grid", () => {
    // α = 0 keeps the first level (100): e3 = e4 = 0, and every α > 0 moves L2 away from 100.
    expect(pick([100, 1000, 100, 100])).toEqual({ alpha: "0.00", fitInformative: true, estimateBase: "100.000000", fitCriterion: "0.000000", naiveFitCriterion: "810000.000000" });
    // A steady trend: the least lag is α = 1, which is the naive forecast.
    expect(pick([100, 200, 300, 400])).toEqual({ alpha: "1.00", fitInformative: true, estimateBase: "400.000000", fitCriterion: "20000.000000", naiveFitCriterion: "20000.000000" });
  });

  it("breaks ties with the largest α, with a relative tolerance of 10⁻⁹", () => {
    // e3 = 21 − 40α: α = 0.50 and 0.55 both give e3² = 1 exactly.
    expect(pick([0, 40, 21])).toMatchObject({ alpha: "0.55", estimateBase: "21.450000", fitCriterion: "1.000000" });
    // M = 10¹⁰: the minimum is (M − 1)² at 0.50 and (M + 1)² at 0.55 is within 10⁻⁹ of it, so 0.55.
    const m10 = 10_000_000_000;
    expect(pick([0, 40 * m10, 21 * m10 - 1])).toMatchObject({ alpha: "0.55", fitCriterion: "100000000020000000001.000000" });
    // M = 10⁸: the gap is 4·10⁻⁸ relative, beyond the tolerance, so the strict minimum 0.50 stays.
    const m8 = 100_000_000;
    expect(pick([0, 40 * m8, 21 * m8 - 1])).toMatchObject({ alpha: "0.50", estimateBase: "2049999999.500000", fitCriterion: "9999999800000001.000000" });
  });

  it("rounds only the final figures to 6 decimals with ROUND_HALF_UP", () => {
    expect(roundHalfUp(23_409n, 80_000n, 6)).toBe("0.292613"); // 0.2926125: up, where HALF_EVEN would give 0.292612
    expect(roundHalfUp(26_739n, 80_000n, 6)).toBe("0.334238"); // 0.3342375: up, where HALF_DOWN would give 0.334237
    expect(roundHalfUp(1n, 3n, 6)).toBe("0.333333");
    expect(roundHalfUp(2n, 3n, 6)).toBe("0.666667");
    expect(roundHalfUp(0n, 7n, 6)).toBe("0.000000");
    expect(roundHalfUp(111n, 1n, 6)).toBe("111.000000");
    expect(() => roundHalfUp(-1n, 2n, 6)).toThrow(RangeError);
    // End to end: the exact SES of 0, 0, 2, 1, 0, 0 at α = 0.15 is 23409/80000 = 0.2926125.
    expect(pick([0, 0, 2, 1, 0, 0])).toMatchObject({ alpha: "0.15", estimateBase: "0.292613", fitCriterion: "4.772533" });
    // The rounded level is never fed back: rounding each step would give 0.420726 here, exact gives 0.420725.
    expect(pick([0, 0, 1, 0, 0, 8, 0])).toMatchObject({ alpha: "0.05", estimateBase: "0.420725" });
  });

  it("matches the independent decimal reference on varied spans", () => {
    const spans = [
      [96, 120, 104, 116],
      [2400, 3300, 900],
      [0, 0, 2, 1, 0, 0],
      [0, 0, 1, 0, 0, 8, 0],
      [5, 3, 9, 1, 0, 0, 4, 7, 2, 8, 6, 3],
      [1500, 0, 2400, 3300, 900, 0, 0, 1200],
      [123456789, 987654321, 555555555, 111111111, 999999999],
      Array.from({ length: 30 }, (_, i) => (i * 7919) % 1000),
    ];
    for (const values of spans) expect(pick(values)).toEqual(reference(values));
  });

  it("does not let a period reserved for evaluation take part in the choice of α", () => {
    // The engine only sees the span it is given. Reserving the 5th campaign for
    // evaluation and estimating on the first four gives α = 0.50 whatever that
    // campaign holds; feeding it in would change α, so the check is sensitive.
    const training = n(96, 120, 104, 116);
    for (const reserved of [0n, 116n, 1_000_000_000n]) {
      const series = [...training, reserved];
      expect(estimateSesNaive(ready(series.slice(0, -1))).alpha).toBe("0.50");
    }
    expect(estimateSesNaive(ready([...training, 0n])).alpha).toBe("0.00");
    expect(estimateSesNaive(ready([...training, 1_000_000_000n])).alpha).toBe("1.00");
  });

  it("delivers SES and naive even when SES does not beat naive, without switching method", () => {
    // In-sample: a steady trend chooses α = 1, so SES equals naive and neither criterion is lower.
    const trend = estimateSesNaive(ready(n(100, 200, 300, 400)));
    expect(trend).toMatchObject({ method: "SES_NAIVE", alpha: "1.00", estimateBase: "400.000000", naiveBase: 400n });
    expect(trend.fitCriterion).toBe(trend.naiveFitCriterion);
    // Out of sample: if the next campaign turned out to be 116 L, naive (116) would be exact and SES (111) 5 L off.
    // The result is still the same valid pair; nothing in it depends on that later figure.
    const thesis = estimateSesNaive(ready(n(96, 120, 104, 116)));
    expect([thesis.estimateBase, thesis.naiveBase]).toEqual(["111.000000", 116n]);
  });

  it("rejects what is not a READY span of non-negative integers of at least three campaigns", () => {
    const problem = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof SesNaiveInputError ? error.problem : String(error);
      }
      return "accepted";
    };
    expect(problem(() => estimateSesNaive(ready(n(1, -1, 3).map((v, i) => (i === 1 ? -1n : v)))))).toBe("NEGATIVE_VALUE");
    expect(problem(() => estimateSesNaive(ready([1n, Number.NaN as unknown as bigint, 3n])))).toBe("NOT_AN_INTEGER");
    expect(problem(() => estimateSesNaive(ready([1n, Number.POSITIVE_INFINITY as unknown as bigint, 3n])))).toBe("NOT_AN_INTEGER");
    expect(problem(() => estimateSesNaive(ready([1n, 2.5 as unknown as bigint, 3n])))).toBe("NOT_AN_INTEGER");
    expect(problem(() => estimateSesNaive(ready([1n, 2 as unknown as bigint, 3n])))).toBe("NOT_AN_INTEGER");
    expect(problem(() => estimateSesNaive(ready(n(1, 2))))).toBe("SPAN_TOO_SHORT");
    const gap = ready(n(1, 2, 3));
    gap.span.lastPosition = 5;
    expect(problem(() => estimateSesNaive(gap))).toBe("SPAN_MISMATCH");
    const insufficient = { status: "INSUFFICIENT_DATA", reason: "SPAN_TOO_SHORT", span: null, exclusions: [] } as unknown as ReadySpan;
    expect(problem(() => estimateSesNaive(insufficient))).toBe("NOT_READY");
  });
});
