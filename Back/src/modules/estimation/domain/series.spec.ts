import { assessSpan, canonicalSources, PointCoverage, SeriesScope, SourcePoint } from "./series";

const KNOWN: PointCoverage = { status: "IDENTIFIED", membersInPublishedFigures: 3, linkedMembers: 5 };
const year = (y: number) => new Date(`${y}-09-01T00:00:00.000Z`);

/** One position per year, in order; `spec` is V<amount>, Z (verified zero), N (no record) or H (hidden). */
function series(spec: string[], coverage: (index: number) => PointCoverage = () => KNOWN): SourcePoint[] {
  return spec.map((s, i) => {
    const verified = s.startsWith("V") || s === "Z";
    return {
      position: i + 1,
      campaignId: `c${i + 1}`,
      classificationId: `k${i + 1}`,
      startDate: year(2015 + i),
      campaignStatus: "CERRADA",
      kind: verified ? "VERIFIED_CONSUMPTION" : s === "H" ? "HIDDEN" : "NO_RECORD",
      quantityBase: s === "Z" ? 0n : verified ? BigInt(s.slice(1)) : null,
      sealId: `s${i + 1}`,
      releaseId: verified ? `r${i + 1}` : null,
      entryStatus: verified ? "DISCLOSED" : s === "H" ? "SUPPRESSED_UNDER_THRESHOLD" : null,
      visibilityWithdrawn: false,
      coverage: coverage(i),
    } satisfies SourcePoint;
  });
}
/** The target starts the year after the last position, unless given. */
const target = (points: SourcePoint[], startYear = 2015 + points.length) => ({ campaignId: "target", startDate: year(startYear) });

describe("assessSpan (F12-EST-03)", () => {
  it("uses the final run of consecutive verified campaigns, including a verified zero, and gives each exclusion its reason", () => {
    const points = series(["V100", "N", "V200", "H", "V300", "Z", "V500"]);
    const assessment = assessSpan(points, target(points));
    expect(assessment).toEqual({
      status: "READY",
      span: { firstPosition: 5, lastPosition: 7, length: 3, values: [300n, 0n, 500n] },
      coverage: [
        { campaignId: "c5", coverage: KNOWN },
        { campaignId: "c6", coverage: KNOWN },
        { campaignId: "c7", coverage: KNOWN },
      ],
      exclusions: [
        { position: 1, campaignId: "c1", reason: "BEFORE_GAP" },
        { position: 2, campaignId: "c2", reason: "NO_RECORD" },
        { position: 3, campaignId: "c3", reason: "BEFORE_GAP" },
        { position: 4, campaignId: "c4", reason: "HIDDEN" },
      ],
    });
  });

  it("never fills nor compresses a gap: an absence or a hidden figure ends the span", () => {
    for (const gap of ["N", "H"]) {
      const points = series(["V100", "V200", "V300", gap, "V400", "V500"]);
      const assessment = assessSpan(points, target(points));
      expect(assessment).toMatchObject({ status: "INSUFFICIENT_DATA", reason: "SPAN_TOO_SHORT", span: { firstPosition: 5, lastPosition: 6, length: 2 } });
      expect("values" in (assessment.span ?? {})).toBe(false);
    }
  });

  it("reports insufficient data without figures when the last relevant campaign is not verified", () => {
    for (const last of ["N", "H"]) {
      const points = series(["V100", "V200", "V300", last]);
      expect(assessSpan(points, target(points))).toMatchObject({ status: "INSUFFICIENT_DATA", reason: "LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED", span: null });
    }
  });

  it("only reads campaigns before the target: the target and later ones are excluded", () => {
    const points = series(["V100", "V200", "V300", "N", "V900"]);
    // The target is the fourth campaign (2018): positions 4 and 5 do not count.
    const assessment = assessSpan(points, { campaignId: "c4", startDate: year(2018) });
    expect(assessment).toMatchObject({ status: "READY", span: { firstPosition: 1, lastPosition: 3, values: [100n, 200n, 300n] } });
    expect(assessment.exclusions).toEqual([
      { position: 4, campaignId: "c4", reason: "NOT_BEFORE_TARGET" },
      { position: 5, campaignId: "c5", reason: "NOT_BEFORE_TARGET" },
    ]);
  });

  it("is incompatible without figures when a span position has unknown coverage, for any reason; earlier positions do not matter", () => {
    for (const reason of ["SEALED_BEFORE_COVERAGE", "POPULATION_MISMATCH", "NOT_SEALED"] as const) {
      const unknownAt = (index: number): PointCoverage => (index === 3 ? { status: "UNKNOWN", reason } : KNOWN);
      const points = series(["V1", "N", "V100", "V200", "V300"], unknownAt);
      expect(assessSpan(points, target(points))).toMatchObject({ status: "INCOMPATIBLE_DATA", reason: "COVERAGE_UNKNOWN", span: { length: 3 } });
    }
    const unknownBeforeGap = (index: number): PointCoverage => (index === 0 ? { status: "UNKNOWN", reason: "SEALED_BEFORE_COVERAGE" } : KNOWN);
    const points = series(["V1", "N", "V100", "V200", "V300"], unknownBeforeGap);
    expect(assessSpan(points, target(points)).status).toBe("READY");
  });

  it("applies no minimum share: a small identified participation is still identified", () => {
    const tiny = (): PointCoverage => ({ status: "IDENTIFIED", membersInPublishedFigures: 3, linkedMembers: 74 });
    const points = series(["V100", "V200", "V300"], tiny);
    expect(assessSpan(points, target(points)).status).toBe("READY");
  });

  it("is incompatible when no comparable campaign precedes the target", () => {
    const points = series(["V100", "V200", "V300"]);
    expect(assessSpan(points, { campaignId: "x", startDate: year(2014) })).toMatchObject({ status: "INCOMPATIBLE_DATA", reason: "NO_COMPARABLE_CAMPAIGNS", span: null });
    expect(assessSpan([], { campaignId: "x", startDate: year(2030) })).toMatchObject({ reason: "NO_COMPARABLE_CAMPAIGNS" });
  });
});

describe("canonicalSources (F12-EST-02)", () => {
  const scope: SeriesScope = {
    seasonId: "season",
    canonicalProductId: "product",
    baseUnit: "ML",
    associations: [
      { productId: "b", validFrom: new Date("2026-01-02T00:00:00.000Z") },
      { productId: "a", validFrom: new Date("2026-01-01T00:00:00.000Z") },
    ],
  };
  const points = series(["V100", "Z", "N"]);

  it("is deterministic and keeps the scope and every position, with quantities as text", () => {
    const first = canonicalSources(scope, points);
    const again = canonicalSources({ ...scope, associations: [...scope.associations].reverse() }, points);
    expect(again.sourceHash).toBe(first.sourceHash);
    expect(first.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.sources).toHaveLength(4);
    expect(first.sources[0]).toMatchObject({ type: "SCOPE", base_unit: "ML", associations: [{ product_ref: "a" }, { product_ref: "b" }] });
    expect(first.sources[2]).toMatchObject({ type: "POSITION", kind: "VERIFIED_CONSUMPTION", quantity_base: "0", classification_ref: "k2" });
    expect(first.sources[3]).toMatchObject({ kind: "NO_RECORD", quantity_base: null });
  });

  it("changes with a classification version, a coverage, a visibility or an association", () => {
    const base = canonicalSources(scope, points).sourceHash;
    const changed = [
      canonicalSources(scope, points.map((p, i) => (i === 0 ? { ...p, classificationId: "k1-v2" } : p))),
      canonicalSources(scope, points.map((p, i) => (i === 0 ? { ...p, coverage: { status: "UNKNOWN", reason: "POPULATION_MISMATCH" } as const } : p))),
      canonicalSources(scope, points.map((p, i) => (i === 0 ? { ...p, kind: "HIDDEN" as const, quantityBase: null, visibilityWithdrawn: true } : p))),
      canonicalSources({ ...scope, associations: [] }, points),
    ];
    for (const { sourceHash } of changed) expect(sourceHash).not.toBe(base);
  });
});
