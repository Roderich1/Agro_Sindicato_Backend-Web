/**
 * Datos sintéticos de Necesidades y propuestas (sesión C del rediseño,
 * 2026-11-10). Misma forma que `types/collective.ts` y `types/estimation.ts`;
 * ningún nombre, cifra ni identificador es real. Sólo para pruebas y para
 * revisar casos extremos (`break-ui`); ninguna vista real los importa.
 */
import type { Proposal, ProposalLine, ProposalSummary } from '../../types/collective';
import type { ProposalEstimationReference, ReferenceEstimation, ReferenceLine } from '../../types/estimation';

export interface ProposalFixture {
  /** `GET /collective/campaigns/:id/proposals`, de la más reciente a la más antigua. */
  history: ProposalSummary[];
  /** El último borrador (el que la vista abre por consulta), o `null` si no hay ninguno. */
  proposal: Proposal | null;
  /** `GET /collective/proposals/:id/estimation-reference` del borrador anterior. */
  reference: ProposalEstimationReference | null;
}

export const PROPOSAL_CAMPAIGN_REF = '0c0c0c0c-0000-4000-8000-000000000001';

function proposalLine(overrides: Partial<ProposalLine> & Pick<ProposalLine, 'position' | 'product_name'>): ProposalLine {
  const baseUnit = overrides.base_unit ?? 'ML';
  return {
    product_ref: `prod-${overrides.position}`,
    base_unit: baseUnit,
    presentation_unit: baseUnit === 'G' ? 'KG' : 'L',
    status: 'DISCLOSED',
    quantity_base: null,
    quantity_presentation: null,
    contributors: null,
    data_as_of: null,
    released_at: null,
    pending_changes: false,
    ...overrides,
  };
}

function draft(overrides: Partial<Proposal> & Pick<Proposal, 'proposal_ref' | 'lines'>): Proposal {
  return {
    contractVersion: 1,
    status: 'DRAFT',
    basis: 'DECLARED_NEED',
    campaign: { campaign_ref: PROPOSAL_CAMPAIGN_REF, name: 'Campaña invierno 2026', status: 'ABIERTA' },
    seal: null,
    generated_at: '2026-10-16T12:00:00.000Z',
    generated_by: { user_ref: 'u-dir', name: 'Directiva sintética' },
    inputs_fingerprint: 'a1b2c3d4e5f6'.padEnd(64, '0'),
    disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', approved: false },
    coverage: { linked_members: 9, members_with_contribution: 7, basis: 'PUBLISHED_FIGURES' },
    notice:
      'Borrador para revisión humana. Usa la necesidad declarada, no resta stock y no es necesidad neta. No crea compras, lotes, movimientos, deudas ni pagos.',
    ...overrides,
  };
}

function summaryOf(proposal: Proposal): ProposalSummary {
  return {
    proposal_ref: proposal.proposal_ref,
    status: 'DRAFT',
    generated_at: proposal.generated_at,
    generated_by: proposal.generated_by,
    inputs_fingerprint: proposal.inputs_fingerprint,
    line_count: proposal.lines.length,
  };
}

function estimated(overrides: Partial<ReferenceEstimation> = {}): ReferenceEstimation {
  return {
    status: 'ESTIMATED',
    reason_code: null,
    estimate_base: '295000.000000',
    validity: 'CURRENT',
    validity_reason: null,
    method: 'SES_NAIVE',
    run_ref: 'run-0000-4000-8000-000000000002',
    generated_at: '2026-10-15T10:00:00.000Z',
    span_length: 4,
    run_relation: 'BEFORE_PROPOSAL',
    ...overrides,
  };
}

function referenceFor(proposal: Proposal, perLine: Pick<ReferenceLine, 'absence' | 'estimation'>[], overrides: Partial<ProposalEstimationReference> = {}): ProposalEstimationReference {
  return {
    contract_version: 1,
    kind: 'PROPOSAL_ESTIMATION_REFERENCE',
    label: 'Estimación del consumo',
    proposal_ref: proposal.proposal_ref,
    proposal_generated_at: proposal.generated_at,
    target_campaign_ref: proposal.campaign.campaign_ref,
    availability: 'AVAILABLE',
    evaluated_at: '2026-10-18T09:00:00.000Z',
    season: { season_ref: 'season-1', key: 'INVIERNO', definition: 'Siembra de invierno (sintética)', duration_days: 180 },
    lines: proposal.lines.map((line, index) => ({
      position: line.position,
      product_ref: line.product_ref,
      base_unit: line.base_unit,
      presentation_unit: line.presentation_unit,
      ...(perLine[index] ?? { absence: 'NO_RESULT' as const, estimation: null }),
    })),
    notice:
      'Estimación del consumo: referencia separada. No se suma a la necesidad declarada, no es la cantidad solicitada y no cambia las líneas, los totales ni la huella del borrador.',
    ...overrides,
  };
}

/* ── demo: parecido a la DEMO ─────────────────────────────────────────── */

const demoProposal = draft({
  proposal_ref: 'prop-demo-0000-4000-8000-000000000001',
  lines: [
    proposalLine({ position: 0, product_name: 'Glifosato', quantity_base: '310000', quantity_presentation: '310', contributors: 7, data_as_of: '2026-10-16T11:30:00.000Z' }),
    proposalLine({ position: 1, product_name: 'Cipermetrina', quantity_base: '48000', quantity_presentation: '48', contributors: 4, data_as_of: '2026-10-16T11:30:00.000Z' }),
    proposalLine({ position: 2, product_name: 'Urea', base_unit: 'G', quantity_base: '25000', quantity_presentation: '25', contributors: 3, data_as_of: '2026-10-16T11:30:00.000Z' }),
    proposalLine({ position: 3, product_name: 'Amina', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
  ],
});

export const demo: ProposalFixture = {
  history: [summaryOf(demoProposal), { ...summaryOf(demoProposal), proposal_ref: 'prop-demo-0000-4000-8000-000000000000', generated_at: '2026-10-10T09:00:00.000Z', line_count: 3 }],
  proposal: demoProposal,
  reference: referenceFor(demoProposal, [
    { absence: null, estimation: estimated() },
    { absence: null, estimation: estimated({ status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }) },
    { absence: null, estimation: estimated({ estimate_base: '27500.500000' }) },
    { absence: 'NO_RESULT', estimation: null },
  ]),
};

/* ── worst: catálogo break-ui ─────────────────────────────────────────── */

const LONG_HERBICIDE = 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L';

const worstProposal = draft({
  proposal_ref: 'prop-worst-000-4000-8000-000000000003',
  campaign: {
    campaign_ref: PROPOSAL_CAMPAIGN_REF,
    name: 'Campaña de invierno 2026 – Comunidad Villa Esperanza del Valle Alto (siembra tardía)',
    status: 'ABIERTA',
  },
  generated_by: { user_ref: 'u-long', name: 'María José de la Cruz y Fernández Montaño' },
  inputs_fingerprint: null,
  coverage: { linked_members: 1500, members_with_contribution: 128, basis: 'PUBLISHED_FIGURES' },
  lines: [
    proposalLine({ position: 0, product_name: LONG_HERBICIDE, quantity_base: '123456789012', quantity_presentation: '123456789.012', contributors: 128, data_as_of: '2026-10-16T11:59:00.000Z' }),
    proposalLine({ position: 1, product_name: 'Urea', base_unit: 'G', quantity_base: '25', quantity_presentation: '0.025', contributors: 3, data_as_of: '2026-10-16T11:59:00.000Z', pending_changes: true }),
    proposalLine({ position: 2, product_name: 'Fungicida protectante a base de mancozeb 80 % WP (polvo mojable)', base_unit: 'G', status: 'WITHDRAWN' }),
    proposalLine({ position: 3, product_name: 'Insecticida piretroide Cipermetrina 25 % EC', status: 'SUPERSEDED' }),
    proposalLine({ position: 4, product_name: 'Amina', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
    proposalLine({ position: 5, product_name: 'Coadyuvante siliconado no iónico', status: 'OVERFLOW' }),
    proposalLine({ position: 6, product_name: 'Glifosato', quantity_base: '0', quantity_presentation: '0', contributors: 3, data_as_of: '2026-10-16T11:59:00.000Z' }),
    proposalLine({ position: 7, product_name: 'GLIFÓSATO', quantity_base: '5000', quantity_presentation: '5', contributors: 4, data_as_of: '2026-10-15T08:00:00.000Z' }),
  ],
});

export const worst: ProposalFixture = {
  history: [
    summaryOf(worstProposal),
    { proposal_ref: 'prop-worst-000-4000-8000-000000000002', status: 'DRAFT', generated_at: '2026-10-12T23:30:00.000Z', generated_by: { user_ref: 'u-jo', name: 'Jo' }, inputs_fingerprint: 'ffffffffffff'.padEnd(64, 'e'), line_count: 1 },
    { proposal_ref: 'prop-worst-000-4000-8000-000000000001', status: 'DRAFT', generated_at: '2026-10-01T00:00:00.000Z', generated_by: worstProposal.generated_by, inputs_fingerprint: null, line_count: 0 },
  ],
  proposal: worstProposal,
  reference: referenceFor(
    worstProposal,
    [
      // Comparable: misma línea, ESTIMATED, CURRENT y mayor que cero (6 decimales).
      { absence: null, estimation: estimated({ estimate_base: '123456800000.250000', run_relation: 'AFTER_PROPOSAL', generated_at: '2026-10-17T07:45:00.000Z' }) },
      // No vigente: sin diferencia.
      { absence: null, estimation: estimated({ estimate_base: '30.123456', validity: 'OUTDATED', validity_reason: 'SOURCES_CHANGED' }) },
      { absence: 'NO_RESULT', estimation: null },
      { absence: null, estimation: estimated({ status: 'INSUFFICIENT_DATA', reason_code: 'LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED', estimate_base: null, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }) },
      // Necesidad oculta: la referencia se muestra rotulada, sin diferencia.
      { absence: null, estimation: estimated({ estimate_base: '12000.000000' }) },
      { absence: 'POLICY_PENDING', estimation: null },
      // Fuente retirada: cifra nula.
      { absence: null, estimation: estimated({ estimate_base: null, validity: 'OUTDATED', validity_reason: 'SOURCES_WITHDRAWN' }) },
      // Referencia cero: sin diferencia ni porcentaje.
      { absence: null, estimation: estimated({ estimate_base: '0.000000' }) },
    ],
    { evaluated_at: '2026-10-18T23:59:00.000Z' },
  ),
};

/* ── empty y one ──────────────────────────────────────────────────────── */

export const empty: ProposalFixture = { history: [], proposal: null, reference: null };

const oneProposal = draft({
  proposal_ref: 'prop-one-0000-4000-8000-000000000001',
  coverage: { linked_members: 1, members_with_contribution: 1, basis: 'PUBLISHED_FIGURES' },
  lines: [proposalLine({ position: 0, product_name: 'Urea', base_unit: 'G', quantity_base: '1000', quantity_presentation: '1', contributors: 3, data_as_of: '2026-10-16T11:30:00.000Z' })],
});

export const one: ProposalFixture = {
  history: [summaryOf(oneProposal)],
  proposal: oneProposal,
  reference: referenceFor(oneProposal, [{ absence: null, estimation: estimated({ estimate_base: '1000.000000' }) }]),
};

export const proposalFixtures = { demo, worst, empty, one } as const;
