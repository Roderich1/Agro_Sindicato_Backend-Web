import { fireEvent, screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { campaignsService } from '../services/campaigns.service';
import { line, proposalWith } from '../test/fixtures';
import { CAMPAIGN, renderAt } from '../test/render';
import { JointProposalPage } from './joint-proposal.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { proposals: vi.fn(), generateProposal: vi.fn(), proposal: vi.fn(), proposalCsv: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));

const PATH = `/colectivo/propuestas?campaign=${CAMPAIGN.id}`;

function conflict() {
  const error = new AxiosError('conflict', '409');
  error.response = { status: 409, data: { message: 'POLICY_PENDING' }, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

const DRAFT = proposalWith([
  line({ position: 0, product_name: 'Belator', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
  line({ position: 1, product_name: 'Urea', base_unit: 'G', quantity_base: '25000', quantity_presentation: '25', contributors: 3 }),
  line({ position: 2, product_name: 'Glifosato', status: 'WITHDRAWN' }),
  line({ position: 3, product_name: 'Mancozeb', base_unit: 'G', quantity_base: '11500', quantity_presentation: '11.5', contributors: 3, pending_changes: true }),
]);

describe('Propuesta de compra conjunta (borrador)', () => {
  beforeEach(() => {
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(collectiveService.proposals).mockResolvedValue([]);
  });

  it('genera un borrador y muestra sólo lo que el servidor publicó', async () => {
    vi.mocked(collectiveService.generateProposal).mockResolvedValue(DRAFT);
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click(await screen.findByRole('button', { name: 'Generar propuesta (borrador)' }));
    const urea = await screen.findByTestId('line-Urea-G');
    expect(collectiveService.generateProposal).toHaveBeenCalledWith(CAMPAIGN.id);
    expect(within(urea).getByText('25 KG')).toBeTruthy();
    expect(within(screen.getByTestId('line-Mancozeb-G')).getByText('11,5 KG')).toBeTruthy();
    expect(screen.getByTestId('line-Mancozeb-G').textContent).toMatch(/aún no alcanzan el umbral/);
    const belator = screen.getByTestId('line-Belator-ML');
    expect(belator.textContent).toMatch(/umbral/);
    expect(belator.textContent).not.toMatch(/\d+ L/);
    const withdrawn = screen.getByTestId('line-Glifosato-ML');
    expect(withdrawn.textContent).toMatch(/Genere uno nuevo/);
    expect(withdrawn.textContent).not.toMatch(/\d+ L/);
    // Ninguna suma propia: no aparece 25 + 11,5.
    expect(document.body.textContent).not.toMatch(/36,5/);
    expect(document.body.textContent).toMatch(/no es una necesidad neta/);
    expect(document.body.textContent).toMatch(/No crea compras, lotes, movimientos, deudas ni pagos/);
    expect(screen.getByTestId('coverage').textContent).toMatch(/3 de 4/);
  });

  it('POLICY_PENDING al generar: lo explica y no muestra ninguna línea', async () => {
    vi.mocked(collectiveService.generateProposal).mockRejectedValue(conflict());
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click(await screen.findByRole('button', { name: 'Generar propuesta (borrador)' }));
    expect(await screen.findByText(/no se genera ni se guarda ninguna propuesta con cifras/)).toBeTruthy();
    expect(screen.queryByLabelText('Detalle del borrador')).toBeNull();
  });

  it('un borrador abierto bajo POLICY_PENDING no muestra cifras ni cobertura', async () => {
    vi.mocked(collectiveService.proposals).mockResolvedValue([
      { proposal_ref: DRAFT.proposal_ref, status: 'DRAFT', generated_at: DRAFT.generated_at, generated_by: DRAFT.generated_by, inputs_fingerprint: DRAFT.inputs_fingerprint, line_count: 4 },
    ]);
    vi.mocked(collectiveService.proposal).mockResolvedValue(
      proposalWith(DRAFT.lines.map((l) => line({ ...l, status: 'POLICY_PENDING', quantity_base: null, quantity_presentation: null, contributors: null })), {
        disclosure: { mode: 'POLICY_PENDING', policy: 'F07-POL-01', approved: false },
        coverage: null,
      }),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver' }));
    const detail = await screen.findByLabelText('Detalle del borrador');
    expect(detail.textContent).toMatch(/no se muestran cifras/);
    expect(detail.textContent).not.toMatch(/\d[\d.,]* (KG|L)\b/);
    expect(screen.queryByTestId('coverage')).toBeNull();
  });

  it('el historial muestra huella y autor, sin cantidades', async () => {
    vi.mocked(collectiveService.proposals).mockResolvedValue([
      { proposal_ref: 'p2', status: 'DRAFT', generated_at: '2026-10-16T13:00:00.000Z', generated_by: { user_ref: 'u', name: 'Presidente sintético' }, inputs_fingerprint: 'abc123def456' + '0'.repeat(52), line_count: 3 },
    ]);
    renderAt(<JointProposalPage />, { path: PATH });
    const history = await screen.findByLabelText('Historial de borradores');
    expect(await within(history).findByText('Presidente sintético')).toBeTruthy();
    expect(within(history).getByText('abc123def456')).toBeTruthy();
    expect(history.textContent).not.toMatch(/\d[\d.,]* (KG|L)\b/);
  });

  it('el CSV se pide al servidor (misma política), no se arma en el navegador', async () => {
    vi.mocked(collectiveService.generateProposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.proposalCsv).mockResolvedValue(new Blob(['x']));
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click(await screen.findByRole('button', { name: 'Generar propuesta (borrador)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    await vi.waitFor(() => expect(collectiveService.proposalCsv).toHaveBeenCalledWith(DRAFT.proposal_ref));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });
});
