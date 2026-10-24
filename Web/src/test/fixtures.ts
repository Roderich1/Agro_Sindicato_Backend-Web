import type {
  CollectiveSummary,
  CollectiveTrends,
  Proposal,
  ProposalLine,
  SealRef,
  SealState,
  SummaryCell,
  TrendPoint,
} from '../types/collective';
import { CAMPAIGN } from './render';

/** Respuestas sintéticas con la forma exacta del contrato del servidor. */
export function cell(overrides: Partial<SummaryCell>): SummaryCell {
  return {
    projection_type: 'DECLARED_NEED',
    product_ref: `p-${overrides.product_name ?? 'x'}`,
    product_name: 'Producto',
    base_unit: 'ML',
    presentation_unit: overrides.base_unit === 'G' ? 'KG' : 'L',
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

export function summaryWith(cells: SummaryCell[], mode: 'PROVISIONAL_SYNTHETIC' | 'POLICY_PENDING' = 'PROVISIONAL_SYNTHETIC'): CollectiveSummary {
  return {
    contractVersion: 1,
    campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
    seal: null,
    disclosure: { mode, policy: 'F07-POL-01', approved: false, threshold: mode === 'POLICY_PENDING' ? null : 3 },
    coverage: mode === 'POLICY_PENDING' ? null : { linked_members: 4, members_with_contribution: 3, suppressed_cells: true },
    cells: mode === 'POLICY_PENDING' ? [] : cells,
  };
}

export function line(overrides: Partial<ProposalLine>): ProposalLine {
  return {
    position: 0,
    product_ref: `p-${overrides.product_name ?? 'x'}`,
    product_name: 'Producto',
    base_unit: 'ML',
    presentation_unit: overrides.base_unit === 'G' ? 'KG' : 'L',
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

export function proposalWith(lines: ProposalLine[], overrides: Partial<Proposal> = {}): Proposal {
  return {
    contractVersion: 1,
    proposal_ref: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'DRAFT',
    basis: 'DECLARED_NEED',
    campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
    seal: null,
    generated_at: '2026-10-16T12:00:00.000Z',
    generated_by: { user_ref: 'u-1', name: 'Directiva sintética' },
    inputs_fingerprint: 'f'.repeat(64),
    disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', approved: false },
    coverage: { linked_members: 4, members_with_contribution: 3, basis: 'PUBLISHED_FIGURES' },
    lines,
    notice: 'Borrador para revisión humana. Usa la necesidad declarada, no resta stock y no es necesidad neta. No crea compras, lotes, movimientos, deudas ni pagos.',
    ...overrides,
  };
}

export const SEAL: SealRef = {
  seal_ref: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  version: 1,
  sealed_at: '2026-10-23T15:00:00.000Z',
  accepted_until: '2026-10-23T15:00:00.000Z',
  sealed_by: { user_ref: 'u-2', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
};

/** Estado del sellado; por defecto, sellable con una revisión sin avisos. */
export function sealStateWith(overrides: Partial<SealState> = {}): SealState {
  return {
    contractVersion: 1,
    campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'CERRADA' },
    state: 'NOT_SEALED',
    seal: null,
    can_seal: true,
    blocked_by: [],
    review: {
      review_ref: 'c'.repeat(64),
      accepted_until: '2026-10-23T14:00:00.000Z',
      coverage: { linked_members: 7, members_with_contribution: 4, suppressed_cells: true },
      open_disputes: false,
      pending_changes: false,
      cells_without_figure: true,
    },
    ...overrides,
  };
}

export function point(campaign: string, overrides: Partial<TrendPoint> = {}): TrendPoint {
  return {
    campaign_ref: campaign,
    status: 'DISCLOSED',
    total_base: null,
    total_presentation: null,
    contributors: null,
    data_as_of: null,
    pending_changes: false,
    ...overrides,
  };
}

/** Tres campañas sintéticas: dos selladas y una sin sellar. */
export function trendsWith(series: CollectiveTrends['series'], mode: 'PROVISIONAL_SYNTHETIC' | 'POLICY_PENDING' = 'PROVISIONAL_SYNTHETIC'): CollectiveTrends {
  return {
    contractVersion: 1,
    disclosure: { mode, policy: 'F07-POL-01', approved: false, threshold: mode === 'POLICY_PENDING' ? null : 3 },
    projection_type: 'DECLARED_NEED',
    campaigns: [
      { campaign_ref: 'c-2024', name: 'Campaña 2024', status: 'CERRADA', start_date: '2024-09-01T00:00:00.000Z', seal: SEAL, coverage: { linked_members: 7, members_with_contribution: 4, suppressed_cells: true } },
      { campaign_ref: 'c-2025', name: 'Campaña 2025', status: 'CERRADA', start_date: '2025-09-01T00:00:00.000Z', seal: { ...SEAL, seal_ref: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }, coverage: { linked_members: 9, members_with_contribution: 6, suppressed_cells: false } },
      { campaign_ref: 'c-2026', name: 'Campaña 2026', status: 'ABIERTA', start_date: '2026-09-01T00:00:00.000Z', seal: null, coverage: null },
    ],
    series: mode === 'POLICY_PENDING' ? [] : series,
    notice: 'Sólo versiones selladas, celda por celda. No suma, resta ni promedia entre campañas, productos, unidades o tipos. Una ausencia o una cifra oculta no es cero.',
  };
}
