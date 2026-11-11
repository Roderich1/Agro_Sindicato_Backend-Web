import { compare, ComparisonInput, derivedJobRequestId, exactDifference, lineEstimationState, parse } from "./proposal-link";

/** E3 §5 and §4 (lines), pure functions: comparability, exact difference, line state. */
const base = (overrides: Partial<{ need: Partial<ComparisonInput["need"]>; estimate: Partial<NonNullable<ComparisonInput["estimate"]>> | null; populationVerified: boolean }> = {}): ComparisonInput => ({
  need: { productRef: "p1", baseUnit: "ML", campaignRef: "c1", quantityBase: "120000", ...overrides.need },
  estimate:
    overrides.estimate === null
      ? null
      : { productRef: "p1", baseUnit: "ML", targetCampaignRef: "c1", estimateBase: "111000.000000", current: true, ...overrides.estimate },
  populationVerified: overrides.populationVerified ?? true,
});

describe("E3 comparability (§5)", () => {
  it("today never computes a difference: the population is not verified (E3-P1)", () => {
    const result = compare(base({ populationVerified: false }));
    expect(result).toEqual({
      comparable: false,
      blockers: ["POPULATION_NOT_VERIFIED"],
      message: "No se calcula la diferencia: no hay datos para comprobar que la necesidad y la estimación cubran a las mismas personas.",
      difference: null,
    });
  });

  it("checks product, unit and period, in order, and reports every failure", () => {
    expect(compare(base({ estimate: { productRef: "p2" } })).blockers).toEqual(["PRODUCT_MISMATCH"]);
    expect(compare(base({ estimate: { baseUnit: "G" } })).blockers).toEqual(["UNIT_MISMATCH"]);
    expect(compare(base({ estimate: { targetCampaignRef: "c0" } })).blockers).toEqual(["PERIOD_MISMATCH"]);
    expect(compare(base({ estimate: { baseUnit: "G", targetCampaignRef: "c0" }, populationVerified: false })).blockers).toEqual([
      "UNIT_MISMATCH",
      "PERIOD_MISMATCH",
      "POPULATION_NOT_VERIFIED",
    ]);
    expect(compare(base({ estimate: { targetCampaignRef: "c0" } })).message).toBe("No se calcula la diferencia: la estimación no es para la campaña del borrador.");
  });

  it("an absent figure is never taken as zero", () => {
    const noNeed = compare(base({ need: { quantityBase: null } }));
    expect(noNeed).toMatchObject({ comparable: false, blockers: ["NEED_NOT_DISCLOSED"], difference: null });
    const noEstimate = compare(base({ estimate: { estimateBase: null } }));
    expect(noEstimate).toMatchObject({ comparable: false, blockers: ["ESTIMATE_NOT_AVAILABLE"], difference: null });
    expect(compare(base({ estimate: null })).blockers).toEqual(["ESTIMATE_NOT_AVAILABLE"]);
    // A malformed figure is not a figure either.
    expect(compare(base({ need: { quantityBase: "-5" } })).blockers).toEqual(["NEED_NOT_DISCLOSED"]);
    expect(compare(base({ estimate: { estimateBase: "1.1234567" } })).blockers).toEqual(["ESTIMATE_NOT_AVAILABLE"]);
  });

  it("an estimate that is not current is not compared", () => {
    expect(compare(base({ estimate: { current: false } })).blockers).toEqual(["ESTIMATE_NOT_CURRENT"]);
  });

  it("with everything verified, computes the exact difference and a descriptive observation", () => {
    const result = compare(base({ need: { quantityBase: "250000" } }));
    expect(result.comparable).toBe(true);
    expect(result.difference).toEqual({
      difference_base: "139000.000000",
      difference_percent: "125.2252",
      percent_undefined: null,
      direction: "ABOVE",
      observation: "La necesidad declarada supera en 139 L la estimación de consumo para el mismo período y alcance.",
    });
    expect(compare(base({ need: { quantityBase: "111000" } })).difference).toMatchObject({
      difference_base: "0.000000",
      difference_percent: "0.0000",
      direction: "EQUAL",
      observation: "La necesidad declarada coincide con la estimación de consumo para el mismo período y alcance.",
    });
    const below = compare(base({ need: { quantityBase: "500" }, estimate: { estimateBase: "1000.25", baseUnit: "ML" } })).difference!;
    expect(below).toMatchObject({ difference_base: "-500.250000", direction: "BELOW" });
    expect(below.observation).toBe("La necesidad declarada es inferior en 0,5 L a la estimación de consumo para el mismo período y alcance.");
    expect(below.observation).not.toMatch(/recomend|excesiv|incorrect/i);
  });
});

describe("E3 exact difference (BigInt, millionths)", () => {
  it("leaves the percentage undefined when the estimate is zero", () => {
    expect(exactDifference(parse.need("10")!, parse.estimate("0.000000")!, "G")).toEqual({
      difference_base: "10.000000",
      difference_percent: null,
      percent_undefined: "ESTIMATE_ZERO",
      direction: "ABOVE",
      observation: "La necesidad declarada supera en 0,01 KG la estimación de consumo para el mismo período y alcance.",
    });
  });

  it("is exact beyond Number precision and rounds the percentage half away from zero only at 4 decimals", () => {
    const need = parse.need("9223372036854775807")!;
    const estimate = parse.estimate("9223372036854775806.999999")!;
    expect(exactDifference(need, estimate, "ML").difference_base).toBe("0.000001");
    // 1/3 → 33.3333…; 2/3 → 66.6667; -2/3 → -66.6667.
    expect(exactDifference(parse.need("4")!, parse.estimate("3")!, "ML").difference_percent).toBe("33.3333");
    expect(exactDifference(parse.need("5")!, parse.estimate("3")!, "ML").difference_percent).toBe("66.6667");
    expect(exactDifference(parse.need("1")!, parse.estimate("3")!, "ML").difference_percent).toBe("-66.6667");
    // 0.00005 % exactly: half away from zero.
    expect(exactDifference(parse.need("2000001")!, parse.estimate("2000000")!, "ML").difference_percent).toBe("0.0001");
    expect(exactDifference(parse.need("1999999")!, parse.estimate("2000000")!, "ML").difference_percent).toBe("-0.0001");
    // A difference under a thousandth of the presentation unit is said as such, not as 0.
    expect(exactDifference(parse.need("0")!, parse.estimate("0.4")!, "ML").observation).toBe(
      "La necesidad declarada es inferior en menos de 0,001 L a la estimación de consumo para el mismo período y alcance.",
    );
  });
});

describe("E3 line state (§4)", () => {
  const estimated = { status: "ESTIMATED" as const, validity: "CURRENT" as const, validityReason: null };
  it("follows the link state when there is no linked run", () => {
    expect(lineEstimationState("NONE", null)).toBe("NONE");
    expect(lineEstimationState("CALCULATING", null)).toBe("CALCULATING");
    expect(lineEstimationState("UNAVAILABLE", estimated)).toBe("ERROR");
    expect(lineEstimationState("RESTRICTED", estimated)).toBe("RESTRICTED");
  });

  it("classifies a linked result", () => {
    expect(lineEstimationState("LINKED", null)).toBe("NO_RESULT");
    expect(lineEstimationState("LINKED", estimated)).toBe("AVAILABLE");
    expect(lineEstimationState("LINKED", { status: "ESTIMATED", validity: "SUPERSEDED", validityReason: "LATER_RUN" })).toBe("OUTDATED");
    expect(lineEstimationState("LINKED", { status: "ESTIMATED", validity: "OUTDATED", validityReason: "SOURCES_CHANGED" })).toBe("OUTDATED");
    expect(lineEstimationState("LINKED", { status: "ESTIMATED", validity: "OUTDATED", validityReason: "SOURCES_WITHDRAWN" })).toBe("RESTRICTED");
    expect(lineEstimationState("LINKED", { status: "INSUFFICIENT_DATA", validity: "NOT_USABLE", validityReason: "NO_FIGURE" })).toBe("INSUFFICIENT_DATA");
    expect(lineEstimationState("LINKED", { status: "INCOMPATIBLE_DATA", validity: "NOT_USABLE", validityReason: "NO_FIGURE" })).toBe("INSUFFICIENT_DATA");
    expect(lineEstimationState("LINKED", { status: "CALCULATION_FAILED", validity: "NOT_USABLE", validityReason: "NO_FIGURE" })).toBe("ERROR");
  });
});

describe("E3 derived job request id (E3-D5)", () => {
  it("is a deterministic UUID from SHA-256 of E3-PREP|proposal|request", () => {
    const a = derivedJobRequestId("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(derivedJobRequestId("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222")).toBe(a);
    expect(derivedJobRequestId("11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333")).not.toBe(a);
    expect(derivedJobRequestId("44444444-4444-4444-8444-444444444444", "22222222-2222-4222-8222-222222222222")).not.toBe(a);
  });
});
