import { canonicalJson, ResultContent, RunContent, runContentHash } from "./run-content";
import { deriveValidity, figuresWithheld, ValidityFacts } from "./validity";

const none: ValidityFacts = {
  runFailed: false,
  hasFigure: true,
  laterCalculatedRunIncludesIt: false,
  sourcesWithdrawn: false,
  classificationCorrected: false,
  sourcesChanged: false,
};

describe("deriveValidity (F12-EST-05, contract §8)", () => {
  it("is CURRENT when nothing changed", () => {
    expect(deriveValidity(none)).toEqual({ validity: "CURRENT", reason: null });
  });

  it("applies the order NOT_USABLE, SUPERSEDED, OUTDATED, CURRENT", () => {
    const all: ValidityFacts = { runFailed: true, hasFigure: false, laterCalculatedRunIncludesIt: true, sourcesWithdrawn: true, classificationCorrected: true, sourcesChanged: true };
    expect(deriveValidity(all)).toEqual({ validity: "NOT_USABLE", reason: "RUN_FAILED" });
    expect(deriveValidity({ ...all, runFailed: false })).toEqual({ validity: "NOT_USABLE", reason: "NO_FIGURE" });
    expect(deriveValidity({ ...all, runFailed: false, hasFigure: true })).toEqual({ validity: "SUPERSEDED", reason: "LATER_RUN" });
    expect(deriveValidity({ ...none, sourcesWithdrawn: true, classificationCorrected: true, sourcesChanged: true })).toEqual({ validity: "OUTDATED", reason: "SOURCES_WITHDRAWN" });
    expect(deriveValidity({ ...none, classificationCorrected: true, sourcesChanged: true })).toEqual({ validity: "OUTDATED", reason: "CLASSIFICATION_CORRECTED" });
    expect(deriveValidity({ ...none, sourcesChanged: true })).toEqual({ validity: "OUTDATED", reason: "SOURCES_CHANGED" });
  });

  it("withholds the figures of a withdrawn source whatever the validity", () => {
    expect(figuresWithheld({ sourcesWithdrawn: true })).toBe(true);
    expect(deriveValidity({ ...none, laterCalculatedRunIncludesIt: true, sourcesWithdrawn: true }).validity).toBe("SUPERSEDED");
    expect(figuresWithheld({ sourcesWithdrawn: false })).toBe(false);
  });
});

describe("runContentHash (F12-EST-05, contract §5)", () => {
  const run: RunContent = {
    run_ref: "r", job_ref: "j", job_attempt: 1, tenant_ref: "t", requested_by_user_ref: "u", requested_by_role: "DIRECTIVA",
    target_campaign_ref: "c", target_classification_ref: "k", season_ref: "s", contract_version: 1, method: "SES_NAIVE",
    method_version: "F12-EST-04/1", parameters: { horizon: 1, alpha_step: "0.05" }, horizon: 1, disclosure_mode: "PROVISIONAL_SYNTHETIC",
    policy: "F07-POL-01", threshold: 3, outcome: "CALCULATED", failure_code: null, previous_run_ref: null, generated_at: "2026-11-02T00:00:00.000Z",
  };
  const result = (product: string, estimate: string): ResultContent => ({
    product_ref: product, base_unit: "ML", series_ref: "s1", status: "ESTIMATED", reason_code: null, estimate_base: estimate, naive_base: "900",
    alpha: "0.00", fit_informative: true, fit_criterion: "2250000.000000", span_first_position: 9, span_last_position: 11,
    exclusions: [{ position: 1, campaign_ref: "c1", reason: "BEFORE_GAP" }], validations: [{ code: "MINIMUM_SPAN", passed: true }], metrics: null,
  });

  it("does not depend on key order nor on the order of the results", () => {
    const a = runContentHash(run, [result("p1", "2400.000000"), result("p2", "10.000000")]);
    const reordered = { ...run, parameters: { alpha_step: "0.05", horizon: 1 } };
    expect(runContentHash(reordered, [result("p2", "10.000000"), result("p1", "2400.000000")])).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with any figure, field or result", () => {
    const a = runContentHash(run, [result("p1", "2400.000000")]);
    expect(runContentHash(run, [result("p1", "2400.000001")])).not.toBe(a);
    expect(runContentHash({ ...run, job_attempt: 2 }, [result("p1", "2400.000000")])).not.toBe(a);
    expect(runContentHash(run, [])).not.toBe(a);
  });

  it("serialises objects with sorted keys and bigint as text", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2n, c: null }] })).toBe('{"a":[{"c":null,"d":"2"}],"b":1}');
  });
});
