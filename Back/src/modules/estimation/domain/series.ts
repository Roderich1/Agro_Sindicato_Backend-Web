import type { SeriesPointKind, SyncV1BaseUnit } from "@prisma/client";
import { createHash } from "node:crypto";

/**
 * F12-EST-02 and F12-EST-03 (#175, #176; F12_EST_01_ESTIMATION_CONTRACT §3,
 * §3.1, §5): the positions of a consumption series and how they are read for
 * a target campaign. Pure: no database, no calculation of SES or naive.
 */

/** Coverage of a position, read from its seal (F07 §5.3), never copied. */
export type PointCoverage =
  | { status: "IDENTIFIED"; membersInPublishedFigures: number; linkedMembers: number }
  | { status: "UNKNOWN"; reason: "SEALED_BEFORE_COVERAGE" | "POPULATION_MISMATCH" | "NOT_SEALED" };

/** One comparable campaign of the series, in chronological order. */
export interface SourcePoint {
  position: number;
  campaignId: string;
  /** Version of the campaign's classification used (EST-D-14). */
  classificationId: string;
  startDate: Date;
  campaignStatus: string;
  kind: SeriesPointKind;
  /** Only for VERIFIED_CONSUMPTION; 0 is a verified zero. */
  quantityBase: bigint | null;
  sealId: string | null;
  releaseId: string | null;
  /** Sealed entry status of the cell, or null when the seal has none or there is no seal. */
  entryStatus: string | null;
  visibilityWithdrawn: boolean;
  coverage: PointCoverage;
}

export interface SeriesScope {
  seasonId: string;
  canonicalProductId: string;
  baseUnit: SyncV1BaseUnit;
  /** Current denominations of the canonical product, with their start. */
  associations: { productId: string; validFrom: Date }[];
}

/**
 * The audited list of sources (`ConsumptionSeries.sources`) and its SHA-256
 * (`sourceHash`): the scope first, then every position with its campaign,
 * classification version, seal, release, sealed state and coverage. Any
 * change of figures, visibility, classification, association or coverage
 * changes the hash and so the version of the series.
 */
export function canonicalSources(scope: SeriesScope, points: readonly SourcePoint[]): { sources: unknown[]; sourceHash: string } {
  const sources: unknown[] = [
    {
      type: "SCOPE",
      season_ref: scope.seasonId,
      product_ref: scope.canonicalProductId,
      base_unit: scope.baseUnit,
      associations: [...scope.associations]
        .sort((a, b) => a.productId.localeCompare(b.productId))
        .map((a) => ({ product_ref: a.productId, valid_from: a.validFrom.toISOString() })),
    },
    ...points.map((p) => ({
      type: "POSITION",
      position: p.position,
      campaign_ref: p.campaignId,
      classification_ref: p.classificationId,
      start_date: p.startDate.toISOString(),
      campaign_status: p.campaignStatus,
      kind: p.kind,
      quantity_base: p.quantityBase === null ? null : p.quantityBase.toString(),
      seal_ref: p.sealId,
      release_ref: p.releaseId,
      entry_status: p.entryStatus,
      visibility_withdrawn: p.visibilityWithdrawn,
      coverage: p.coverage,
    })),
  ];
  return { sources, sourceHash: createHash("sha256").update(JSON.stringify(sources)).digest("hex") };
}

/** Why a position does not enter the span (exclusions of the result). */
export type ExclusionReason = "NO_RECORD" | "HIDDEN" | "BEFORE_GAP" | "NOT_BEFORE_TARGET";

export interface Exclusion {
  position: number;
  campaignId: string;
  reason: ExclusionReason;
}

/**
 * Reading of a series for a target campaign (F12-EST-03, 3.12.4.8):
 * - the relevant campaigns are those that start before the target; the last
 *   relevant one is the campaign immediately before it;
 * - the span is the run of consecutive verified positions that ends at the
 *   last relevant campaign; positions are never filled, interpolated nor
 *   skipped, so an absence or a hidden figure ends the span;
 * - with fewer than three positions, or the last one not verified, there are
 *   no figures (RN-28); with a span whose coverage is not identified at every
 *   position, neither (RN-25), and no minimum share is applied.
 */
export type SpanAssessment =
  | {
      status: "READY";
      span: { firstPosition: number; lastPosition: number; length: number; values: bigint[] };
      coverage: { campaignId: string; coverage: PointCoverage }[];
      exclusions: Exclusion[];
    }
  | {
      status: "INSUFFICIENT_DATA";
      reason: "LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED" | "SPAN_TOO_SHORT";
      span: { firstPosition: number; lastPosition: number; length: number } | null;
      exclusions: Exclusion[];
    }
  | {
      status: "INCOMPATIBLE_DATA";
      reason: "NO_COMPARABLE_CAMPAIGNS" | "COVERAGE_UNKNOWN";
      span: { firstPosition: number; lastPosition: number; length: number } | null;
      coverage: { campaignId: string; coverage: PointCoverage }[];
      exclusions: Exclusion[];
    };

export const MINIMUM_SPAN = 3;

export function assessSpan(points: readonly SourcePoint[], target: { campaignId: string; startDate: Date }): SpanAssessment {
  const exclusions: Exclusion[] = [];
  const relevant: SourcePoint[] = [];
  for (const point of points) {
    if (point.campaignId !== target.campaignId && point.startDate < target.startDate) relevant.push(point);
    else exclusions.push({ position: point.position, campaignId: point.campaignId, reason: "NOT_BEFORE_TARGET" });
  }
  if (relevant.length === 0) {
    return { status: "INCOMPATIBLE_DATA", reason: "NO_COMPARABLE_CAMPAIGNS", span: null, coverage: [], exclusions: sortByPosition(exclusions) };
  }
  let first = relevant.length;
  while (first > 0 && relevant[first - 1]!.kind === "VERIFIED_CONSUMPTION") first -= 1;
  const span = relevant.slice(first);
  relevant.slice(0, first).forEach((point) => {
    const reason: ExclusionReason = point.kind === "VERIFIED_CONSUMPTION" ? "BEFORE_GAP" : point.kind === "HIDDEN" ? "HIDDEN" : "NO_RECORD";
    exclusions.push({ position: point.position, campaignId: point.campaignId, reason });
  });
  const sorted = sortByPosition(exclusions);
  if (span.length === 0) {
    return { status: "INSUFFICIENT_DATA", reason: "LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED", span: null, exclusions: sorted };
  }
  const bounds = { firstPosition: span[0]!.position, lastPosition: span[span.length - 1]!.position, length: span.length };
  if (span.length < MINIMUM_SPAN) return { status: "INSUFFICIENT_DATA", reason: "SPAN_TOO_SHORT", span: bounds, exclusions: sorted };
  const coverage = span.map((point) => ({ campaignId: point.campaignId, coverage: point.coverage }));
  if (span.some((point) => point.coverage.status !== "IDENTIFIED")) {
    return { status: "INCOMPATIBLE_DATA", reason: "COVERAGE_UNKNOWN", span: bounds, coverage, exclusions: sorted };
  }
  return { status: "READY", span: { ...bounds, values: span.map((point) => point.quantityBase!) }, coverage, exclusions: sorted };
}

function sortByPosition(exclusions: Exclusion[]): Exclusion[] {
  return [...exclusions].sort((a, b) => a.position - b.position);
}
