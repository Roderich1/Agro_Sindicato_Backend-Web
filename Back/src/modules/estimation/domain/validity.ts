/**
 * F12-EST-05 (#178; contract §8): validity of a result, derived when it is
 * read and never stored. In this order:
 * 1. NOT_USABLE: the run FAILED (RUN_FAILED) or the result has no figure (NO_FIGURE);
 * 2. SUPERSEDED: a later CALCULATED run of the same target includes the same
 *    product and unit (LATER_RUN); a later FAILED run never supersedes;
 * 3. OUTDATED: something it rests on changed in a known way —
 *    SOURCES_WITHDRAWN (a figure it used is no longer disclosed), then
 *    CLASSIFICATION_CORRECTED (the target's or a series campaign's
 *    classification is no longer the version used), then SOURCES_CHANGED
 *    (the sources of its series, rebuilt now, have another hash; EST-D-12);
 * 4. CURRENT otherwise.
 * Whether its figures may be delivered is a separate question
 * (`figuresWithheld`): a withdrawn source hides them whatever the validity.
 */
export type Validity = "NOT_USABLE" | "SUPERSEDED" | "OUTDATED" | "CURRENT";
export type ValidityReason = "RUN_FAILED" | "NO_FIGURE" | "LATER_RUN" | "SOURCES_CHANGED" | "CLASSIFICATION_CORRECTED" | "SOURCES_WITHDRAWN";

export interface ValidityFacts {
  runFailed: boolean;
  hasFigure: boolean;
  laterCalculatedRunIncludesIt: boolean;
  sourcesWithdrawn: boolean;
  classificationCorrected: boolean;
  sourcesChanged: boolean;
}

export function deriveValidity(facts: ValidityFacts): { validity: Validity; reason: ValidityReason | null } {
  if (facts.runFailed) return { validity: "NOT_USABLE", reason: "RUN_FAILED" };
  if (!facts.hasFigure) return { validity: "NOT_USABLE", reason: "NO_FIGURE" };
  if (facts.laterCalculatedRunIncludesIt) return { validity: "SUPERSEDED", reason: "LATER_RUN" };
  if (facts.sourcesWithdrawn) return { validity: "OUTDATED", reason: "SOURCES_WITHDRAWN" };
  if (facts.classificationCorrected) return { validity: "OUTDATED", reason: "CLASSIFICATION_CORRECTED" };
  if (facts.sourcesChanged) return { validity: "OUTDATED", reason: "SOURCES_CHANGED" };
  return { validity: "CURRENT", reason: null };
}

/** A result that used a figure no longer disclosed is delivered without figures (§4.3, 3.12.6.3). */
export function figuresWithheld(facts: Pick<ValidityFacts, "sourcesWithdrawn">): boolean {
  return facts.sourcesWithdrawn;
}
