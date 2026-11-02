import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluate, estimateAt, metricsOf, type OriginResult } from "./rolling-origin";
import { generateSets, originsOf, sourcePointsOf, type SyntheticSet } from "./synthetic-sets";

/**
 * F12-EST-09 (#182): the rules of the evaluation, fixed before measuring
 * (`docs/evaluation/F12_EST_09_PROTOCOLO_EVALUACION.md`), and the versioned
 * sets and results. The results file is written by
 * `docs/evidence/f12_est_09/evaluar.cjs`; this suite fails if they drift.
 */
const evidence = (name: string) => resolve(process.cwd(), "..", "docs", "evidence", "f12_est_09", name);
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe("F12-EST-09: evaluación sintética con origen móvil", () => {
  const sets = generateSets();

  it("regenerates exactly the versioned sets, twice", () => {
    expect(json(generateSets())).toBe(json(sets));
    expect(json(sets)).toBe(readFileSync(evidence("conjuntos.json"), "utf8").replace(/\r\n/g, "\n"));
  });

  it("gives exactly the versioned results", () => {
    expect(json(evaluate(sets))).toBe(readFileSync(evidence("resultados.json"), "utf8").replace(/\r\n/g, "\n"));
  });

  it("never reads the reserved campaign nor the later ones (no leakage)", () => {
    for (const set of sets) {
      for (const origin of originsOf(set)) {
        const reserved = origin + 1;
        const all = estimateAt(sourcePointsOf(set), set, reserved);
        const past = estimateAt(sourcePointsOf(set).slice(0, origin), set, reserved);
        // The reserved and later values changed (and an absence turned into a figure): nothing may move.
        const altered: SyntheticSet = {
          ...set,
          campaigns: set.campaigns.map((c) =>
            c.position >= reserved ? { ...c, kind: "VERIFIED_CONSUMPTION", quantityBase: String(BigInt(c.quantityBase ?? "0") * 7n + 999999n) } : c,
          ),
        };
        const perturbed = estimateAt(sourcePointsOf(altered), altered, reserved);
        const shape = (r: typeof all) => json({ reading: r.reading, fit: r.fit, estimate: r.estimate ? { ...r.estimate, naiveBase: r.estimate.naiveBase.toString() } : null });
        expect(shape(past)).toBe(shape(all));
        expect(shape(perturbed)).toBe(shape(all));
        expect(all.exclusions.filter((e) => e.position >= reserved).every((e) => e.reason === "NOT_BEFORE_TARGET")).toBe(true);
      }
    }
  });

  it("S6 ends in «datos insuficientes» at every origin and for the next campaign", () => {
    const s6 = evaluate(sets).sets.find((s) => s.id === "S6")!;
    expect(s6.origins.map((o) => [o.status, o.assessment.status])).toEqual(s6.origins.map(() => ["NOT_ESTIMABLE", "INSUFFICIENT_DATA"]));
    expect(s6.next.assessment.status).toBe("INSUFFICIENT_DATA");
    expect([s6.mae.ses.value, s6.wape.ses.value]).toEqual(["SIN ORÍGENES EVALUABLES", "SIN ORÍGENES EVALUABLES"]);
  });

  it("S5: the gap excludes what is before it, the hidden figure is neither used nor zero, the verified zero is a value", () => {
    const s5 = evaluate(sets).sets.find((s) => s.id === "S5")!;
    for (const o of s5.origins) {
      expect(o.fit?.positions ?? []).not.toContain(2);
      expect(o.fit?.positions ?? []).not.toContain(3);
      if (o.status === "NOT_ESTIMABLE") expect([o.errorSes, o.errorNaive]).toEqual([null, null]);
    }
    const withZero = s5.origins.find((o) => o.fit?.positions.includes(8));
    expect(withZero?.fit?.values[withZero.fit.positions.indexOf(8)]).toBe("0");
    const reservedZero = s5.origins.find((o) => o.reservedPosition === 8)!;
    expect([reservedZero.status, reservedZero.reserved]).toEqual(["EVALUATED", "0"]);
    expect(s5.origins.find((o) => o.origin === 3)!.exclusions).toEqual(expect.arrayContaining([{ position: 1, reason: "BEFORE_GAP" }]));
  });

  it("reports WAPE as NO DEFINIDO, never 0, when the reserved values add up to zero (control case, not a protocol set)", () => {
    const origin = (reserved: string, errorSes: string, errorNaive: string): OriginResult => ({
      origin: 3, reservedPosition: 4, status: "EVALUATED", assessment: { status: "READY", reason: null }, fit: null, exclusions: [],
      alpha: "1.00", fitInformative: false, ses: "0.000000", naive: "0", reserved, reservedKind: "VERIFIED_CONSUMPTION", errorSes, errorNaive,
    });
    const zeros = metricsOf([origin("0", "0.000000", "0.000000"), origin("0", "0.000000", "0.000000")]);
    expect(zeros.wape).toEqual({ ses: { value: "NO DEFINIDO" }, naive: { value: "NO DEFINIDO" } });
    expect(zeros.mae.ses).toEqual({ value: "0.000000" });
    expect(metricsOf([]).mae.ses).toEqual({ value: "SIN ORÍGENES EVALUABLES" });
    const mixed = metricsOf([origin("100", "10.500000", "20.000000"), origin("0", "4.500000", "0.000000")]);
    expect(mixed.mae).toEqual({ ses: { value: "7.500000" }, naive: { value: "10.000000" } });
    expect(mixed.wape.ses).toEqual({ value: "0.150000", percent: "15.0000" });
  });
});
