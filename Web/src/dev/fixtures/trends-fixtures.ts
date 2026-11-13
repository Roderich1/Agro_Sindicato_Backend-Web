/**
 * Datos sintéticos del Histórico sellado (`GET /collective/trends`), sesión C
 * del rediseño (2026-11-10). Misma forma que `CollectiveTrends`; ninguna cifra
 * es real. Sólo para pruebas y casos extremos (`break-ui`).
 */
import type { CollectiveTrends, SealRef, TrendCampaign, TrendPoint, TrendPointStatus, TrendSeries } from '../../types/collective';

const NOTICE =
  'Sólo versiones selladas, celda por celda. No suma, resta ni promedia entre campañas, productos, unidades o tipos. Una ausencia o una cifra oculta no es cero.';

function seal(index: number, sealedAt: string): SealRef {
  return {
    seal_ref: `seal-${String(index).padStart(2, '0')}-0000-4000-8000-000000000000`,
    version: 1,
    sealed_at: sealedAt,
    accepted_until: sealedAt,
    sealed_by: { user_ref: 'u-adm', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
    policy: 'F07-POL-01',
    threshold: 3,
  };
}

function campaign(index: number, name: string, sealed: boolean, status = 'CERRADA', coverage: [number, number] | null = [5, 9]): TrendCampaign {
  const year = 2015 + index;
  return {
    campaign_ref: `c-${String(index).padStart(2, '0')}`,
    name,
    status,
    start_date: `${year}-05-01T00:00:00.000Z`,
    seal: sealed ? seal(index, `${year}-11-30T15:00:00.000Z`) : null,
    coverage: sealed && coverage ? { linked_members: coverage[1], members_with_contribution: coverage[0], suppressed_cells: false } : null,
  };
}

function pt(campaignRef: string, status: TrendPointStatus, base: string | null = null, contributors: number | null = null, pending = false): TrendPoint {
  const shown = status === 'DISCLOSED';
  return {
    campaign_ref: campaignRef,
    status,
    total_base: shown ? base : null,
    total_presentation: shown && base !== null ? presentation(base) : null,
    contributors: shown ? contributors : null,
    data_as_of: shown ? '2025-11-29T18:00:00.000Z' : null,
    pending_changes: shown && pending,
  };
}

/** Base → L/KG exactos (mismo cálculo que el servidor; sólo para armar los fixtures). */
function presentation(base: string): string {
  const value = BigInt(base);
  const fraction = (value % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${value / 1000n}.${fraction}` : (value / 1000n).toString();
}

function trends(campaigns: TrendCampaign[], series: TrendSeries[], overrides: Partial<CollectiveTrends> = {}): CollectiveTrends {
  return {
    contractVersion: 1,
    disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', approved: false, threshold: 3 },
    projection_type: 'CONSUMPTION_TOTAL',
    campaigns,
    series,
    notice: NOTICE,
    ...overrides,
  };
}

/* ── demo ─────────────────────────────────────────────────────────────── */

const demoCampaigns = [
  campaign(9, 'Invierno 2024', true),
  campaign(10, 'Invierno 2025', true, 'CERRADA', [6, 9]),
  campaign(11, 'Invierno 2026', false, 'ABIERTA'),
];

export const demo: CollectiveTrends = trends(demoCampaigns, [
  {
    projection_type: 'CONSUMPTION_TOTAL',
    product_ref: 'p-gli',
    product_name: 'Glifosato',
    base_unit: 'ML',
    presentation_unit: 'L',
    points: [pt('c-09', 'DISCLOSED', '96000', 5), pt('c-10', 'DISCLOSED', '120000', 6), pt('c-11', 'NOT_SEALED')],
  },
  {
    projection_type: 'CONSUMPTION_TOTAL',
    product_ref: 'p-urea',
    product_name: 'Urea',
    base_unit: 'G',
    presentation_unit: 'KG',
    points: [pt('c-09', 'DISCLOSED', '25000', 3), pt('c-10', 'SUPPRESSED_UNDER_THRESHOLD'), pt('c-11', 'NOT_SEALED')],
  },
]);

/* ── worst: 11 campañas con huecos intercalados ───────────────────────── */

const WORST_NAMES = [
  'Invierno 2016',
  'Verano 2016-2017',
  'Invierno 2017 – Valle Alto (siembra tardía)',
  'Verano 2017-2018',
  'Invierno 2018',
  'Campaña de verano 2018-2019 (zona de riego)',
  'Invierno 2019',
  'Verano 2019-2020',
  'Invierno 2020 – Comunidad Villa Esperanza del Valle Alto',
  'Verano 2020-2021',
  'Invierno 2021',
];
/** Campañas 3 y 7 cerradas sin sellar; la 11, abierta. */
const UNSEALED = new Set([3, 7, 11]);
const worstCampaigns = WORST_NAMES.map((name, i) =>
  campaign(i + 1, name, !UNSEALED.has(i + 1), i + 1 === 11 ? 'ABIERTA' : 'CERRADA', i + 1 === 5 ? [1, 1] : [1284, 1500]),
);
const ref = (i: number) => `c-${String(i).padStart(2, '0')}`;

const LONG_STATUSES: [TrendPointStatus, string | null, number | null][] = [
  ['DISCLOSED', '123456789012', 128],
  ['NO_DATA', null, null],
  ['NOT_SEALED', null, null],
  ['DISCLOSED', '25', 3],
  ['WITHDRAWN_AFTER_SEAL', null, null],
  ['SUPPRESSED_UNDER_THRESHOLD', null, null],
  ['NOT_SEALED', null, null],
  ['DISCLOSED', '98765432100', 1284],
  ['SUPPRESSED_REVISION', null, null],
  ['DISCLOSED', '0', 3],
  ['NOT_SEALED', null, null],
];

export const worst: CollectiveTrends = trends(worstCampaigns, [
  {
    projection_type: 'CONSUMPTION_TOTAL',
    product_ref: 'p-long',
    product_name: 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L',
    base_unit: 'ML',
    presentation_unit: 'L',
    points: LONG_STATUSES.map(([status, base, contributors], i) => pt(ref(i + 1), status, base, contributors, i === 7)),
  },
  {
    projection_type: 'CONSUMPTION_TOTAL',
    product_ref: 'p-urea',
    product_name: 'Urea',
    base_unit: 'G',
    presentation_unit: 'KG',
    points: worstCampaigns.map((c, i) =>
      c.seal === null ? pt(c.campaign_ref, 'NOT_SEALED') : i % 4 === 1 ? pt(c.campaign_ref, 'OVERFLOW') : pt(c.campaign_ref, 'DISCLOSED', String(25 + i * 1000), 3 + i),
    ),
  },
  {
    projection_type: 'CONSUMPTION_TOTAL',
    product_ref: 'p-gli-acento',
    product_name: 'GLIFÓSATO',
    base_unit: 'ML',
    presentation_unit: 'L',
    points: worstCampaigns.map((c) => (c.seal === null ? pt(c.campaign_ref, 'NOT_SEALED') : pt(c.campaign_ref, 'NO_DATA'))),
  },
]);

/* ── empty y one ──────────────────────────────────────────────────────── */

export const empty: CollectiveTrends = trends([], []);

export const one: CollectiveTrends = trends(
  [campaign(10, 'Invierno 2025', true, 'CERRADA', [3, 3])],
  [
    {
      projection_type: 'CONSUMPTION_TOTAL',
      product_ref: 'p-urea',
      product_name: 'Urea',
      base_unit: 'G',
      presentation_unit: 'KG',
      points: [pt('c-10', 'DISCLOSED', '1000', 3)],
    },
  ],
);

export const trendsFixtures = { demo, worst, empty, one } as const;
