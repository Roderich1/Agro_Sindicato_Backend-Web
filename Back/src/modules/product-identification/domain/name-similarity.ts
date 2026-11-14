import type { SyncV1BaseUnit } from "@prisma/client";
import { baseUnitForCentralUnit } from "@/modules/sync-v1/domain/units";

/**
 * E1-D7: candidates for a reported product, computed by the server on the
 * normalised name. A suggestion only: nothing here writes, links or groups
 * products, and the Directiva decides (RF-33, RN-29).
 */

export type SimilarityLevel = "ALTA" | "MEDIA" | "BAJA";
export type MatchedOn = "name" | "active_ingredient";

export const SIMILARITY_THRESHOLDS = { ALTA: 0.75, MEDIA: 0.45, BAJA: 0.25 } as const;
export const MAX_CANDIDATES = 5;
/** Score of a name whose words are all contained in the other name. */
const CONTAINMENT_SCORE = 0.85;
/** Equal active ingredient: at least MEDIA, and a boost on top of the name. */
const INGREDIENT_FLOOR = 0.5;
const INGREDIENT_BOOST = 0.15;

/** Lowercase, without accents or punctuation, single spaces. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter((token) => token.length > 0));
}

function bigrams(normalized: string): Map<string, number> {
  const compact = normalized.replaceAll(" ", "");
  const counts = new Map<string, number>();
  if (compact.length === 0) return counts;
  if (compact.length === 1) {
    counts.set(compact, 1);
    return counts;
  }
  for (let i = 0; i < compact.length - 1; i += 1) {
    const pair = compact.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/** Jaccard index of the word sets. */
export function tokenJaccard(a: string, b: string): number {
  const left = tokens(normalizeName(a));
  const right = tokens(normalizeName(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Sørensen–Dice coefficient of the character bigrams (multiset, spaces removed). */
export function bigramDice(a: string, b: string): number {
  const left = bigrams(normalizeName(a));
  const right = bigrams(normalizeName(b));
  let total = 0;
  for (const count of left.values()) total += count;
  for (const count of right.values()) total += count;
  if (total === 0) return 0;
  let shared = 0;
  for (const [pair, count] of left) shared += Math.min(count, right.get(pair) ?? 0);
  return (2 * shared) / total;
}

/**
 * Every word of the shorter name appears in the longer one (and the shorter
 * one has a word of three or more characters, so "48" alone never matches).
 */
export function containment(a: string, b: string): number {
  const left = tokens(normalizeName(a));
  const right = tokens(normalizeName(b));
  const [shorter, longer] = left.size <= right.size ? [left, right] : [right, left];
  if (shorter.size === 0) return 0;
  if (![...shorter].some((token) => token.length >= 3)) return 0;
  for (const token of shorter) if (!longer.has(token)) return 0;
  return CONTAINMENT_SCORE;
}

/** Name score in [0, 1]: 1 for equal normalised names. */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;
  return Math.max(tokenJaccard(a, b), bigramDice(a, b), containment(a, b));
}

export function sameActiveIngredient(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = normalizeName(a);
  return left.length > 0 && left === normalizeName(b);
}

export function similarityLevel(score: number): SimilarityLevel | null {
  if (score >= SIMILARITY_THRESHOLDS.ALTA) return "ALTA";
  if (score >= SIMILARITY_THRESHOLDS.MEDIA) return "MEDIA";
  if (score >= SIMILARITY_THRESHOLDS.BAJA) return "BAJA";
  return null;
}

/** What was reported: name, optional ingredient and its base unit. */
export interface SimilarityTarget {
  localName: string;
  activeIngredient: string | null;
  baseUnit: SyncV1BaseUnit;
}

/** A catalogue product of the same tenant, with its current association. */
export interface CatalogCandidate {
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
  activeIngredient: string | null;
  /** Canonical product of its current association; null if it is its own canonical. */
  canonicalProductId: string | null;
}

export interface CandidateView {
  product_ref: string;
  product_name: string;
  unit: string;
  base_unit: SyncV1BaseUnit;
  is_active: boolean;
  is_alias: boolean;
  canonical_product_ref: string | null;
  similarity: SimilarityLevel;
  matched_on: MatchedOn[];
}

/**
 * Up to five candidates of the same dimension (L↔ML, KG↔G), best first.
 * Inactive products are left out: they cannot be linked (PRODUCT_INACTIVE).
 * Pure: it reads the given rows and returns views, nothing else.
 */
export function similarity(
  target: SimilarityTarget,
  catalog: readonly CatalogCandidate[],
  limit = MAX_CANDIDATES,
): CandidateView[] {
  const scored: { score: number; sortName: string; view: CandidateView }[] = [];
  for (const product of catalog) {
    if (!product.isActive) continue;
    const baseUnit = baseUnitForCentralUnit(product.unit);
    if (baseUnit === null || baseUnit !== target.baseUnit) continue;
    const byName = nameSimilarity(target.localName, product.name);
    const byIngredient = sameActiveIngredient(target.activeIngredient, product.activeIngredient);
    const score = byIngredient
      ? Math.min(1, Math.max(byName, INGREDIENT_FLOOR) + INGREDIENT_BOOST)
      : byName;
    const level = similarityLevel(score);
    if (level === null) continue;
    const matchedOn: MatchedOn[] = [];
    if (byName >= SIMILARITY_THRESHOLDS.BAJA) matchedOn.push("name");
    if (byIngredient) matchedOn.push("active_ingredient");
    scored.push({
      score,
      sortName: normalizeName(product.name),
      view: {
        product_ref: product.id,
        product_name: product.name,
        unit: product.unit,
        base_unit: baseUnit,
        is_active: product.isActive,
        is_alias: product.canonicalProductId !== null,
        canonical_product_ref: product.canonicalProductId,
        similarity: level,
        matched_on: matchedOn,
      },
    });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.sortName.localeCompare(b.sortName) ||
      a.view.product_ref.localeCompare(b.view.product_ref),
  );
  return scored.slice(0, limit).map((entry) => entry.view);
}
