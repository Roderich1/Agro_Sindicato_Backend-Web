import type { Campaign } from '../../types/campaigns';
import type { CollectiveSummary, ProposalSummary, SealRef, SealState, SummaryCell } from '../../types/collective';
import * as campaignsFixtures from './campaigns-fixtures';
import { CAMPAIGN_IDS } from './campaigns-fixtures';

/**
 * Escenarios sintéticos del Resumen, del detalle de campaña y de la Cobertura,
 * con la forma exacta de `CollectiveSummary`, `SealState`, `ProposalSummary[]`
 * (`types/collective.ts`) y `Campaign[]` (`types/campaigns.ts`). Sólo para
 * pruebas y el arnés de desarrollo (contrato §7): nunca se envían a un servidor.
 *
 * Las cantidades son enteros en unidad base (ML/G) dentro de un string y su
 * `total_presentation` coincide con `toPresentation` (`lib/quantity.ts`): si no
 * coincidiera, la interfaz mostraría «Dato no válido».
 */
export interface SummaryFixture {
  /** Respuesta de `GET /campaigns`. */
  campaigns: Campaign[];
  /** Respuesta de `GET /campaigns/active`. */
  active: Campaign | null;
  /** Campaña consultada (`?campaign=` o `/campaigns/:id`). */
  selected: string;
  /** Respuesta de `GET /collective/campaigns/:id/summary`. */
  summary: CollectiveSummary;
  /** Respuesta de `GET …/seal`; `null` cuando la campaña está sellada (la Web no la pide). */
  sealState: SealState | null;
  /** Respuesta de `GET …/proposals`. */
  proposals: ProposalSummary[];
}

function cell(overrides: Partial<SummaryCell> & Pick<SummaryCell, 'product_name'>): SummaryCell {
  const base_unit = overrides.base_unit ?? 'ML';
  return {
    projection_type: 'DECLARED_NEED',
    product_ref: `p-${overrides.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
    base_unit,
    presentation_unit: base_unit === 'G' ? 'KG' : 'L',
    status: 'DISCLOSED',
    total_base: null,
    total_presentation: null,
    contributors: null,
    data_as_of: null,
    released_at: null,
    pending_changes: false,
    ...overrides,
  };
}

function campaignRef(list: Campaign[], id: string): CollectiveSummary['campaign'] {
  const found = list.find((entry) => entry.id === id)!;
  return { campaign_ref: found.id, name: found.name, status: found.status };
}

function sealState(campaign: CollectiveSummary['campaign'], overrides: Partial<SealState> = {}): SealState {
  return {
    contractVersion: 1,
    campaign,
    state: 'NOT_SEALED',
    seal: null,
    can_seal: false,
    blocked_by: ['CAMPAIGN_NOT_CLOSED'],
    review: null,
    ...overrides,
  };
}

const SYNTHETIC = { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', approved: false, threshold: 3 } as const;

export const LONG_PRODUCT = 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L';
export const LONG_AUTHOR = 'María José de la Cruz y Fernández Wiśniewska-Kowalczyk';

/* ── demo: parecido a la DEMO ─────────────────────────────────────────── */

export const demo: SummaryFixture = {
  campaigns: campaignsFixtures.demo,
  active: campaignsFixtures.activeOf(campaignsFixtures.demo),
  selected: CAMPAIGN_IDS.demoActive,
  summary: {
    contractVersion: 1,
    campaign: campaignRef(campaignsFixtures.demo, CAMPAIGN_IDS.demoActive),
    seal: null,
    disclosure: SYNTHETIC,
    coverage: { linked_members: 9, members_with_contribution: 6, suppressed_cells: true },
    cells: [
      cell({ product_name: 'Glifosato 480 SL', total_base: '42500', total_presentation: '42.5', contributors: 5, data_as_of: '2026-11-08T14:20:00.000Z', released_at: '2026-11-08T14:21:00.000Z' }),
      cell({ product_name: 'Urea 46 %', base_unit: 'G', total_base: '350000', total_presentation: '350', contributors: 6, data_as_of: '2026-11-09T18:05:00.000Z', released_at: '2026-11-09T18:06:00.000Z' }),
      cell({ product_name: 'Mancozeb 80 WP', base_unit: 'G', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
      cell({ projection_type: 'CONSUMPTION_TOTAL', product_name: 'Glifosato 480 SL', total_base: '18000', total_presentation: '18', contributors: 4, data_as_of: '2026-11-07T11:00:00.000Z', released_at: '2026-11-07T11:01:00.000Z' }),
    ],
  },
  sealState: null,
  proposals: [
    { proposal_ref: 'a0000001-0000-4000-8000-000000000001', status: 'DRAFT', generated_at: '2026-11-09T19:00:00.000Z', generated_by: { user_ref: 'u-dir', name: 'Directiva DEMO' }, inputs_fingerprint: 'e'.repeat(64), line_count: 2 },
  ],
};
demo.sealState = sealState(demo.summary.campaign);

/* ── worst: catálogo break-ui ─────────────────────────────────────────── */

const worstCampaign = campaignRef(campaignsFixtures.worst, CAMPAIGN_IDS.worstActive);

/**
 * Campaña `ABIERTA` activa, sin sellar, con fin estimado vencido: nombres de
 * producto largos, cantidades `"123456789012"` y `"25"`, L y KG a la vez, un
 * cero divulgado, celdas `SUPPRESSED_UNDER_THRESHOLD`, `SUPPRESSED_REVISION` y
 * `OVERFLOW`, `pending_changes`, consumo aparte y tres borradores (uno con
 * huella oculta y autor de nombre largo).
 */
export const worst: SummaryFixture = {
  campaigns: campaignsFixtures.worst,
  active: campaignsFixtures.activeOf(campaignsFixtures.worst),
  selected: CAMPAIGN_IDS.worstActive,
  summary: {
    contractVersion: 1,
    campaign: worstCampaign,
    seal: null,
    disclosure: SYNTHETIC,
    coverage: { linked_members: 1284, members_with_contribution: 51, suppressed_cells: true },
    cells: [
      cell({ product_name: LONG_PRODUCT, total_base: '123456789012', total_presentation: '123456789.012', contributors: 47, data_as_of: '2026-11-09T22:47:00.000Z', released_at: '2026-11-09T22:48:00.000Z', pending_changes: true }),
      cell({ product_name: 'Urea granulada 46 % N', base_unit: 'G', total_base: '25', total_presentation: '0.025', contributors: 3, data_as_of: '2026-10-02T09:15:00.000Z', released_at: '2026-10-02T09:16:00.000Z' }),
      cell({ product_name: 'Glifosato 480 SL', total_base: '25', total_presentation: '0.025', contributors: 3, data_as_of: '2026-10-28T16:40:00.000Z', released_at: '2026-10-28T16:41:00.000Z' }),
      cell({ product_name: 'Adherente agrícola no iónico', total_base: '0', total_presentation: '0', contributors: 4, data_as_of: '2026-11-01T12:00:00.000Z', released_at: '2026-11-01T12:01:00.000Z' }),
      cell({ product_name: 'Fungicida protectante Mancozeb 80 % WP en bolsa de 25 kg', base_unit: 'G', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
      cell({ product_name: 'Insecticida Clorpirifos 48 % EC', status: 'SUPPRESSED_REVISION' }),
      cell({ product_name: 'Fertilizante foliar quelatado con micronutrientes (Zn, B, Mn)', base_unit: 'G', status: 'OVERFLOW' }),
      cell({ product_name: 'Q', base_unit: 'G', total_base: '123456789012', total_presentation: '123456789.012', contributors: 51, data_as_of: '2026-11-05T08:00:00.000Z', released_at: '2026-11-05T08:01:00.000Z' }),
      cell({ projection_type: 'CONSUMPTION_TOTAL', product_name: LONG_PRODUCT, total_base: '98765432109', total_presentation: '98765432.109', contributors: 12, data_as_of: '2026-11-08T07:30:00.000Z', released_at: '2026-11-08T07:31:00.000Z', pending_changes: true }),
      cell({ projection_type: 'CONSUMPTION_TOTAL', product_name: 'Urea granulada 46 % N', base_unit: 'G', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
    ],
  },
  sealState: sealState(worstCampaign),
  proposals: [
    { proposal_ref: 'a0000002-0000-4000-8000-000000000003', status: 'DRAFT', generated_at: '2026-11-09T23:10:00.000Z', generated_by: { user_ref: 'u-long', name: LONG_AUTHOR }, inputs_fingerprint: null, line_count: 12 },
    { proposal_ref: 'a0000002-0000-4000-8000-000000000002', status: 'DRAFT', generated_at: '2026-10-30T15:00:00.000Z', generated_by: { user_ref: 'u-jo', name: 'Jo' }, inputs_fingerprint: 'f'.repeat(64), line_count: 1 },
    { proposal_ref: 'a0000002-0000-4000-8000-000000000001', status: 'DRAFT', generated_at: '2026-10-30T14:59:00.000Z', generated_by: { user_ref: 'u-jo', name: 'Jo' }, inputs_fingerprint: 'f'.repeat(64), line_count: 1 },
  ],
};

const SEALED: SealRef = {
  seal_ref: 'b0000002-0000-4000-8000-000000000004',
  version: 1,
  sealed_at: '2025-05-20T16:30:00.000Z',
  accepted_until: '2025-05-20T16:30:00.000Z',
  sealed_by: { user_ref: 'u-long', name: LONG_AUTHOR, role: 'DIRECTIVA' },
};

/**
 * Peor caso sellado: `CERRADA` con `closedAt`, versión sellada, una cifra
 * `WITHDRAWN_AFTER_SEAL`, una cifra con cambios pendientes y cobertura «1 de 1».
 * «1 de 1» no lo produce el servidor con k = 3 (quien está en una cifra
 * publicada son al menos 3): está para probar los singulares de la interfaz.
 */
export const worstSealed: SummaryFixture = {
  campaigns: campaignsFixtures.worst,
  active: campaignsFixtures.activeOf(campaignsFixtures.worst),
  selected: CAMPAIGN_IDS.worstClosedSealed,
  summary: {
    contractVersion: 1,
    campaign: campaignRef(campaignsFixtures.worst, CAMPAIGN_IDS.worstClosedSealed),
    seal: SEALED,
    disclosure: SYNTHETIC,
    coverage: { linked_members: 1, members_with_contribution: 1, suppressed_cells: true },
    cells: [
      cell({ product_name: LONG_PRODUCT, status: 'WITHDRAWN_AFTER_SEAL', total_base: '6000', contributors: 3 }),
      cell({ product_name: 'Urea granulada 46 % N', base_unit: 'G', total_base: '25', total_presentation: '0.025', contributors: 3, data_as_of: '2025-05-18T10:00:00.000Z', released_at: '2025-05-18T10:01:00.000Z', pending_changes: true }),
    ],
  },
  sealState: null,
  proposals: [],
};

/**
 * `CERRADA` sin sellar con cobertura «0 de 0»: nadie vinculado hoy y una celda
 * sin cifra. El servidor permitiría sellar (revisión sintética).
 */
export const worstClosedUnsealed: SummaryFixture = {
  campaigns: campaignsFixtures.worst,
  active: campaignsFixtures.activeOf(campaignsFixtures.worst),
  selected: CAMPAIGN_IDS.worstClosedUnsealed,
  summary: {
    contractVersion: 1,
    campaign: campaignRef(campaignsFixtures.worst, CAMPAIGN_IDS.worstClosedUnsealed),
    seal: null,
    disclosure: SYNTHETIC,
    coverage: { linked_members: 0, members_with_contribution: 0, suppressed_cells: true },
    cells: [cell({ product_name: 'Urea granulada 46 % N', base_unit: 'G', status: 'SUPPRESSED_UNDER_THRESHOLD' })],
  },
  sealState: null,
  proposals: [],
};
worstClosedUnsealed.sealState = sealState(worstClosedUnsealed.summary.campaign, {
  can_seal: true,
  blocked_by: [],
  review: {
    review_ref: 'd'.repeat(64),
    accepted_until: '2025-11-03T22:41:00.000Z',
    coverage: { linked_members: 0, members_with_contribution: 0, suppressed_cells: true },
    open_disputes: false,
    pending_changes: false,
    cells_without_figure: true,
  },
});

/** Política pendiente: sin cifras ni cobertura. */
export const worstPolicyPending: SummaryFixture = {
  ...worst,
  summary: { ...worst.summary, disclosure: { ...SYNTHETIC, mode: 'POLICY_PENDING', threshold: null }, coverage: null, cells: [] },
  sealState: sealState(worstCampaign, { blocked_by: ['POLICY_PENDING', 'CAMPAIGN_NOT_CLOSED'] }),
};

/* ── empty y one ──────────────────────────────────────────────────────── */

/** Campaña sin ninguna cifra: ni necesidad ni consumo, cobertura «0 de 7», sin borradores. */
export const empty: SummaryFixture = {
  campaigns: campaignsFixtures.one,
  active: campaignsFixtures.activeOf(campaignsFixtures.one),
  selected: CAMPAIGN_IDS.one,
  summary: {
    contractVersion: 1,
    campaign: campaignRef(campaignsFixtures.one, CAMPAIGN_IDS.one),
    seal: null,
    disclosure: SYNTHETIC,
    coverage: { linked_members: 7, members_with_contribution: 0, suppressed_cells: false },
    cells: [],
  },
  sealState: null,
  proposals: [],
};
empty.sealState = sealState(empty.summary.campaign);

/**
 * Todo en uno: una campaña, una cifra, un borrador de una línea, cobertura
 * «1 de 1» y «1 aportante». Con k = 3 el servidor no produce «1 de 1» ni
 * «1 aportante» publicados: el escenario sólo prueba los singulares.
 */
export const one: SummaryFixture = {
  campaigns: campaignsFixtures.one,
  active: campaignsFixtures.activeOf(campaignsFixtures.one),
  selected: CAMPAIGN_IDS.one,
  summary: {
    contractVersion: 1,
    campaign: campaignRef(campaignsFixtures.one, CAMPAIGN_IDS.one),
    seal: null,
    disclosure: SYNTHETIC,
    coverage: { linked_members: 1, members_with_contribution: 1, suppressed_cells: false },
    cells: [cell({ product_name: 'Glifosato 480 SL', total_base: '1000', total_presentation: '1', contributors: 1, data_as_of: '2026-11-10T12:00:00.000Z', released_at: '2026-11-10T12:01:00.000Z' })],
  },
  sealState: null,
  proposals: [
    { proposal_ref: 'a0000003-0000-4000-8000-000000000001', status: 'DRAFT', generated_at: '2026-11-10T12:30:00.000Z', generated_by: { user_ref: 'u-dir', name: 'Directiva' }, inputs_fingerprint: 'e'.repeat(64), line_count: 1 },
  ],
};
one.sealState = sealState(one.summary.campaign);
