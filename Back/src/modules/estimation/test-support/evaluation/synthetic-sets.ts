import type { SeriesPointKind, SyncV1BaseUnit } from "@prisma/client";
import type { SourcePoint } from "../../domain/series";

/**
 * F12-EST-09 (#182): the synthetic sets S1–S6 of the estimation protocol
 * (3.13.3), fixed before any measurement. Only synthetic data: no campaign of
 * the Sindicato.
 *
 * Every value is an integer in the base unit (mL or g), drawn with integer
 * arithmetic only (SplitMix64 over BigInt and rejection sampling), so the same
 * seed gives the same set on any machine. Each position draws its value even
 * when it is later masked as an absence or a hidden figure: the mask never
 * changes the draws of the other positions.
 */

export const SYNTHETIC_SETS_VERSION = "F12-EST-09/1";

const MASK_64 = (1n << 64n) - 1n;

/** SplitMix64 (Steele, Lea y Flood, 2014): 64-bit integer generator. */
export class SplitMix64 {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = seed & MASK_64;
  }

  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK_64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    return z ^ (z >> 31n);
  }

  /** Uniform integer in [low, high], without modulo bias (rejection sampling). */
  uniform(low: bigint, high: bigint): bigint {
    const range = high - low + 1n;
    const limit = ((MASK_64 + 1n) / range) * range;
    for (;;) {
      const draw = this.next();
      if (draw < limit) return low + (draw % range);
    }
  }
}

export type SetId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

/** How a position is published: a verified figure (0 included), no record or hidden by the policy. */
export type Mask = "VERIFIED" | "VERIFIED_ZERO" | "NO_RECORD" | "HIDDEN";

export interface SetDefinition {
  id: SetId;
  name: string;
  rule: string;
  seed: bigint;
  campaigns: number;
  baseUnit: SyncV1BaseUnit;
  /** Value of position t (1-based), given the previous drawn value. */
  draw: (t: number, previous: bigint | null, random: SplitMix64) => bigint;
  /** Mask of each position (1-based); VERIFIED when absent. */
  masks: Record<number, Mask>;
}

export const SET_DEFINITIONS: readonly SetDefinition[] = [
  {
    id: "S1",
    name: "Nivel estable",
    rule: "x_t = 100000 + U[-10000, 10000] mL",
    seed: 1001n,
    campaigns: 10,
    baseUnit: "ML",
    draw: (_t, _previous, random) => 100000n + random.uniform(-10000n, 10000n),
    masks: {},
  },
  {
    id: "S2",
    name: "Cambio de nivel",
    rule: "x_t = 80000 + U[-6000, 6000] mL para t ≤ 5; x_t = 140000 + U[-6000, 6000] mL para t ≥ 6",
    seed: 1002n,
    campaigns: 10,
    baseUnit: "ML",
    draw: (t, _previous, random) => (t <= 5 ? 80000n : 140000n) + random.uniform(-6000n, 6000n),
    masks: {},
  },
  {
    id: "S3",
    name: "Tendencia",
    rule: "x_t = 40000 + 6000·t + U[-4000, 4000] g",
    seed: 1003n,
    campaigns: 10,
    baseUnit: "G",
    draw: (t, _previous, random) => 40000n + 6000n * BigInt(t) + random.uniform(-4000n, 4000n),
    masks: {},
  },
  {
    id: "S4",
    name: "Paseo aleatorio",
    rule: "x_1 = 100000 mL; x_t = max(0, x_(t-1) + U[-20000, 20000]) mL",
    seed: 1004n,
    campaigns: 10,
    baseUnit: "ML",
    draw: (_t, previous, random) => {
      if (previous === null) return 100000n;
      const next = previous + random.uniform(-20000n, 20000n);
      return next < 0n ? 0n : next;
    },
    masks: {},
  },
  {
    id: "S5",
    name: "Hueco, dato oculto y cero comprobado",
    rule: "x_t = 60000 + U[-8000, 8000] mL; posición 2 sin registro, 3 oculta por la política y 8 cero comprobado",
    seed: 1005n,
    campaigns: 10,
    baseUnit: "ML",
    draw: (_t, _previous, random) => 60000n + random.uniform(-8000n, 8000n),
    masks: { 2: "NO_RECORD", 3: "HIDDEN", 8: "VERIFIED_ZERO" },
  },
  {
    id: "S6",
    name: "Menos de tres campañas comprobadas",
    rule: "x_t = 30000 + U[-3000, 3000] g; posiciones 1 y 4 sin registro, 3 y 6 ocultas: solo 2 y 5 comprobadas",
    seed: 1006n,
    campaigns: 6,
    baseUnit: "G",
    draw: (_t, _previous, random) => 30000n + random.uniform(-3000n, 3000n),
    masks: { 1: "NO_RECORD", 3: "HIDDEN", 4: "NO_RECORD", 6: "HIDDEN" },
  },
];

const KIND: Record<Mask, SeriesPointKind> = {
  VERIFIED: "VERIFIED_CONSUMPTION",
  VERIFIED_ZERO: "VERIFIED_CONSUMPTION",
  NO_RECORD: "NO_RECORD",
  HIDDEN: "HIDDEN",
};

/** One campaign of a set: what the engine reads (an absence or a hidden figure has no value). */
export interface SyntheticCampaign {
  position: number;
  campaignId: string;
  startDate: string;
  kind: SeriesPointKind;
  quantityBase: string | null;
}

export interface SyntheticSet {
  id: SetId;
  name: string;
  rule: string;
  seed: string;
  baseUnit: SyncV1BaseUnit;
  campaigns: SyntheticCampaign[];
}

/** One campaign per year from 2010, all in the same season; dates only order them. */
const startDateOf = (position: number) => `${2009 + position}-03-01T00:00:00.000Z`;

export function generateSet(definition: SetDefinition): SyntheticSet {
  const random = new SplitMix64(definition.seed);
  const campaigns: SyntheticCampaign[] = [];
  let previous: bigint | null = null;
  for (let t = 1; t <= definition.campaigns; t++) {
    const drawn = definition.draw(t, previous, random);
    previous = drawn;
    const mask = definition.masks[t] ?? "VERIFIED";
    const quantity = mask === "VERIFIED_ZERO" ? 0n : mask === "VERIFIED" ? drawn : null;
    campaigns.push({
      position: t,
      campaignId: `${definition.id}-C${String(t).padStart(2, "0")}`,
      startDate: startDateOf(t),
      kind: KIND[mask],
      quantityBase: quantity === null ? null : quantity.toString(),
    });
  }
  return { id: definition.id, name: definition.name, rule: definition.rule, seed: definition.seed.toString(), baseUnit: definition.baseUnit, campaigns };
}

export function generateSets(): SyntheticSet[] {
  return SET_DEFINITIONS.map(generateSet);
}

/**
 * The points the engine reads (`assessSpan`). Coverage is identified in every
 * campaign (3 of 5 linked Members): the protocol evaluates the calculation,
 * not the coverage rule, which has its own tests (F12-EST-03).
 */
export function sourcePointsOf(set: SyntheticSet): SourcePoint[] {
  return set.campaigns.map((c) => ({
    position: c.position,
    campaignId: c.campaignId,
    classificationId: `${c.campaignId}-K1`,
    startDate: new Date(c.startDate),
    campaignStatus: "CERRADA",
    kind: c.kind,
    quantityBase: c.quantityBase === null ? null : BigInt(c.quantityBase),
    sealId: c.kind === "NO_RECORD" ? null : `${c.campaignId}-SEAL`,
    releaseId: c.kind === "NO_RECORD" ? null : `${c.campaignId}-REL`,
    entryStatus: c.kind === "VERIFIED_CONSUMPTION" ? "DISCLOSED" : c.kind === "HIDDEN" ? "SUPPRESSED" : null,
    visibilityWithdrawn: false,
    coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3, linkedMembers: 5 },
  }));
}

/**
 * Rolling origins (3.12.4.8): for origin t the engine reads campaigns 1..t,
 * selects α with them only, and estimates campaign t + 1, which is reserved.
 * Origins go from 3 (the first that can select α) to n − 1.
 */
export function originsOf(set: SyntheticSet): number[] {
  const origins: number[] = [];
  for (let t = 3; t <= set.campaigns.length - 1; t++) origins.push(t);
  return origins;
}
