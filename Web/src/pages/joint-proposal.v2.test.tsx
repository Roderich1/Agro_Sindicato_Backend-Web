import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { available, linkViewFor, selectionFor } from '../dev/fixtures/proposal-fixtures';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { line, proposalWith } from '../test/fixtures';
import { CAMPAIGN, renderAt } from '../test/render';
import type { Proposal, ProposalSummary } from '../types/collective';
import { JointProposalPage } from './joint-proposal.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: {
    proposals: vi.fn(),
    generateProposal: vi.fn(),
    proposal: vi.fn(),
    proposalEstimationReference: vi.fn(),
    estimationLink: vi.fn(),
    prepareEstimationLink: vi.fn(),
    clearEstimationLink: vi.fn(),
    proposalSelection: vi.fn(),
    saveProposalSelection: vi.fn(),
  },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));
vi.mock('../services/estimation.service', () => ({ estimationService: { run: vi.fn() } }));

/** Rediseño v2 (láminas 06, 07, 08, 36 y 51) y unión U.3 (`?borrador=`). Datos sintéticos; HTTP simulado. */
const LATEST = proposalWith(
  [
    line({ position: 0, product_name: 'Glifosato', quantity_base: '310000', quantity_presentation: '310', contributors: 7 }),
    line({ position: 1, product_name: 'Urea', base_unit: 'G', quantity_base: '25000', quantity_presentation: '25', contributors: 3 }),
    line({ position: 2, product_name: 'Amina', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
  ],
  { proposal_ref: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', generated_at: '2026-10-17T12:00:00.000Z' },
);
const OLDER = proposalWith([line({ position: 0, product_name: 'Glifosato', quantity_base: '280000', quantity_presentation: '280', contributors: 6 })], {
  proposal_ref: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  generated_at: '2026-10-15T12:00:00.000Z',
});

const summaryOf = (p: Proposal): ProposalSummary => ({
  proposal_ref: p.proposal_ref,
  status: 'DRAFT',
  generated_at: p.generated_at,
  generated_by: p.generated_by,
  inputs_fingerprint: p.inputs_fingerprint,
  line_count: p.lines.length,
});

const WRITES = () => [collectiveService.generateProposal, collectiveService.prepareEstimationLink, collectiveService.clearEstimationLink, collectiveService.saveProposalSelection];

function serve() {
  vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
  vi.mocked(collectiveService.proposals).mockResolvedValue([LATEST, OLDER].map(summaryOf));
  vi.mocked(collectiveService.proposal).mockImplementation(async (id) => (id === OLDER.proposal_ref ? OLDER : LATEST));
  vi.mocked(collectiveService.estimationLink).mockImplementation(async (id) =>
    id === OLDER.proposal_ref
      ? linkViewFor(OLDER, [available('270000.000000', { scope: { span_campaigns: 9, contributors_min: 4, contributors_max: 6 } })])
      : linkViewFor(LATEST, [
          available('295000.000000', { scope: { span_campaigns: 11, contributors_min: 4, contributors_max: 6 } }),
          available('22000.000000', { scope: { span_campaigns: 7, contributors_min: 3, contributors_max: 5 } }),
          { state: 'INSUFFICIENT_DATA', status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' },
        ]),
  );
  vi.mocked(collectiveService.proposalSelection).mockImplementation(async (id) => selectionFor(id === OLDER.proposal_ref ? OLDER : LATEST));
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.search}</output>;
}

describe('Borrador de compra v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serve();
  });

  it('pestañas: «Borrador actual», «Borradores anteriores (2)» y «Cómo se calculó»; cargar no escribe nada', async () => {
    renderAt(<JointProposalPage />, { path: `/colectivo/propuestas?campaign=${CAMPAIGN.id}` });
    await screen.findByText('295 L');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs[0]).toBe('Borrador actual');
    expect(tabs[1]).toMatch(/Borradores anteriores \(2\)$/);
    expect(tabs[2]).toBe('Cómo se calculó');
    expect(screen.getByRole('heading', { level: 1, name: 'Borrador de compra' })).toBeTruthy();
    expect(screen.getByTestId('proposal-header').textContent).toMatch(/Generado el .* por /);
    for (const write of WRITES()) expect(write).not.toHaveBeenCalled();
  });

  it('U.3: ?borrador= abre ese borrador de la campaña, sin escribir; «Ver el actual» vuelve al último', async () => {
    renderAt(
      <>
        <JointProposalPage />
        <Where />
      </>,
      { path: `/colectivo/propuestas?campaign=${CAMPAIGN.id}&borrador=${OLDER.proposal_ref}` },
    );
    await screen.findByText('280 L');
    expect(collectiveService.proposal).toHaveBeenCalledWith(OLDER.proposal_ref);
    expect(collectiveService.proposal).not.toHaveBeenCalledWith(LATEST.proposal_ref);
    expect(screen.getAllByRole('tab')[0]!.textContent).toBe('Borrador anterior');
    fireEvent.click(screen.getByRole('button', { name: 'Ver el actual' }));
    await screen.findByText('295 L');
    // El parámetro ya no apunta a un borrador anterior.
    expect(screen.getByTestId('where').textContent).not.toMatch(/borrador=/);
    for (const write of WRITES()) expect(write).not.toHaveBeenCalled();
  });

  it('U.3: un ?borrador= que no es de la campaña no abre nada ajeno: muestra el más reciente y lo avisa', async () => {
    renderAt(<JointProposalPage />, { path: `/colectivo/propuestas?campaign=${CAMPAIGN.id}&borrador=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee` });
    await screen.findByText('295 L');
    expect(collectiveService.proposal).toHaveBeenCalledTimes(1);
    expect(collectiveService.proposal).toHaveBeenCalledWith(LATEST.proposal_ref);
    expect(screen.getByText(/El borrador pedido no es de esta campaña o ya no existe/)).toBeTruthy();
  });

  it('«Ver» en «Borradores anteriores» pone ?borrador= en la URL y vuelve a la pestaña del borrador', async () => {
    renderAt(
      <>
        <JointProposalPage />
        <Where />
      </>,
      { path: `/colectivo/propuestas?campaign=${CAMPAIGN.id}` },
    );
    await screen.findByText('295 L');
    fireEvent.click(screen.getByRole('tab', { name: /anteriores/i }));
    const list = screen.getByLabelText('Historial de borradores');
    expect(within(list).getByText('Actual')).toBeTruthy();
    expect(within(list).getByText('Anterior')).toBeTruthy();
    fireEvent.click(within(list).getAllByRole('button', { name: 'Ver' })[1]!);
    await screen.findByText('280 L');
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Borrador anterior');
    expect(screen.getByTestId('where').textContent).toContain(`borrador=${OLDER.proposal_ref}`);
  });

  it('«Cómo se calculó»: rangos mínimo y máximo de los alcances y productos sin estimación por su estado', async () => {
    renderAt(<JointProposalPage />, { path: `/colectivo/propuestas?campaign=${CAMPAIGN.id}` });
    await screen.findByText('295 L');
    fireEvent.click(screen.getByRole('tab', { name: 'Cómo se calculó' }));
    const how = screen.getByTestId('how-calculated');
    expect(within(how).getByText('Entre 7 y 11, según el producto')).toBeTruthy();
    expect(within(how).getByText('Entre 3 y 6, según el producto')).toBeTruthy();
    expect(within(how).getByText('1 producto con datos insuficientes')).toBeTruthy();
    expect(within(how).getByText('Vigente')).toBeTruthy();
    expect(within(how).getByRole('link', { name: 'Ver la estimación completa' }).getAttribute('href')).toBe(
      `/colectivo/historico?vista=estimacion&campaign=${LATEST.campaign.campaign_ref}`,
    );
    // Nada se suma ni se compara en porcentaje (E3-R7, H-09).
    expect(document.body.textContent).not.toMatch(/\d\s?%|605/);
  });

  it('la barra «Preparar convocatoria» lleva el recuento de lo elegido y sólo prepara lo guardado (E3-R6)', async () => {
    renderAt(<JointProposalPage />, { path: `/colectivo/propuestas?campaign=${CAMPAIGN.id}` });
    await screen.findByText('295 L');
    const bar = screen.getByTestId('selection-bar');
    await waitFor(() => expect(within(bar).getByRole('button', { name: 'Preparar convocatoria (0 productos)' })).toBeTruthy());
    fireEvent.click(within(screen.getByTestId('line-Glifosato-ML')).getByTestId('select-product'));
    expect(within(bar).getByTestId('selection-summary').textContent).toMatch(/^1 producto elegido para la convocatoria \(cambios sin guardar\)/);
    expect((within(bar).getByRole('button', { name: 'Preparar convocatoria (0 productos)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(collectiveService.saveProposalSelection).not.toHaveBeenCalled();
  });
});
