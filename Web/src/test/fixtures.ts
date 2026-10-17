import type { CollectiveSummary, Proposal, ProposalLine, SummaryCell } from '../types/collective';
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
