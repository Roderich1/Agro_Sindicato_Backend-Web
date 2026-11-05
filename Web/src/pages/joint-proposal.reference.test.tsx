import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthUser } from '../contexts/auth.context';
import { CampaignContext } from '../contexts/campaign.context';
import { collectiveService } from '../services/collective.service';
import { campaignsService } from '../services/campaigns.service';
import { line, proposalWith } from '../test/fixtures';
import { CAMPAIGN, renderAt, userWith } from '../test/render';
import type { Proposal, ProposalSummary } from '../types/collective';
import type { ProposalEstimationReference, ReferenceEstimation, ReferenceLine } from '../types/estimation';
import { JointProposalPage } from './joint-proposal.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { proposals: vi.fn(), generateProposal: vi.fn(), proposal: vi.fn(), proposalCsv: vi.fn(), proposalEstimationReference: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));

/**
 * F12-EST-08 (#181, prototipo W3): la estimación del consumo como columna de
 * referencia separada del borrador. Datos sintéticos.
 */
const PATH = `/colectivo/propuestas?campaign=${CAMPAIGN.id}`;
const OTHER = { ...CAMPAIGN, id: '22222222-2222-4222-8222-222222222222', name: 'Otra campaña sintética' };

const DRAFT = proposalWith([
  line({ position: 0, product_name: 'Glifosato', quantity_base: '310000', quantity_presentation: '310', contributors: 7 }),
  line({ position: 1, product_name: 'Cipermetrina', quantity_base: '48000', quantity_presentation: '48', contributors: 4 }),
  line({ position: 2, product_name: 'Amina', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
]);
const LATER = proposalWith(DRAFT.lines, { proposal_ref: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', generated_at: '2026-10-17T12:00:00.000Z' });

function estimation(overrides: Partial<ReferenceEstimation> = {}): ReferenceEstimation {
  return {
    status: 'ESTIMATED',
    reason_code: null,
    estimate_base: '295000.000000',
    validity: 'CURRENT',
    validity_reason: null,
    method: 'SES_NAIVE',
    run_ref: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    generated_at: '2026-10-15T10:00:00.000Z',
    span_length: 4,
    run_relation: 'BEFORE_PROPOSAL',
    ...overrides,
  };
}

function referenceFor(proposal: Proposal, perLine: Partial<ReferenceLine>[], overrides: Partial<ProposalEstimationReference> = {}): ProposalEstimationReference {
  return {
    contract_version: 1,
    kind: 'PROPOSAL_ESTIMATION_REFERENCE',
    label: 'Estimación del consumo',
    proposal_ref: proposal.proposal_ref,
    proposal_generated_at: proposal.generated_at,
    target_campaign_ref: proposal.campaign.campaign_ref,
    availability: 'AVAILABLE',
    evaluated_at: '2026-10-18T09:00:00.000Z',
    season: { season_ref: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', key: 'INVIERNO', definition: 'Temporada sintética', duration_days: 180 },
    lines: proposal.lines.map((l, i) => ({
      position: l.position,
      product_ref: l.product_ref,
      base_unit: l.base_unit,
      presentation_unit: l.presentation_unit,
      absence: 'NO_RESULT',
      estimation: null,
      ...perLine[i],
    })),
    notice: 'Estimación del consumo: referencia separada.',
    ...overrides,
  };
}

const summaryOf = (p: Proposal): ProposalSummary => ({
  proposal_ref: p.proposal_ref,
  status: 'DRAFT',
  generated_at: p.generated_at,
  generated_by: p.generated_by,
  inputs_fingerprint: p.inputs_fingerprint,
  line_count: p.lines.length,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const cell = (product: string) => within(screen.getByTestId(`line-${product}-ML`)).getByTestId('reference');
const need = (product: string) => within(screen.getByTestId(`line-${product}-ML`)).getByTestId('need');

describe('Propuesta conjunta: estimación del consumo como referencia (F12-EST-08)', () => {
  beforeEach(() => {
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN, OTHER]);
    vi.mocked(collectiveService.proposals).mockImplementation(async (id) => (id === CAMPAIGN.id ? [summaryOf(DRAFT), summaryOf(LATER)] : []));
    vi.mocked(collectiveService.proposal).mockReset();
    vi.mocked(collectiveService.proposalEstimationReference).mockReset();
  });

  it('muestra la columna separada e identificada, con su vigencia y su ejecución; la necesidad no cambia y nada se suma', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.proposalEstimationReference).mockResolvedValue(
      referenceFor(DRAFT, [
        { absence: null, estimation: estimation() },
        { absence: null, estimation: estimation({ status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }) },
        { absence: 'NO_RESULT', estimation: null },
      ]),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await screen.findByText('295 L');
    expect(screen.getByTestId('reference-header').textContent).toMatch(/^Referencia de consumo/);
    expect(cell('Glifosato').textContent).toMatch(/295 L/);
    expect(cell('Glifosato').textContent).toMatch(/Vigente/);
    expect(cell('Glifosato').textContent).toMatch(/anterior al borrador/);
    expect(need('Glifosato').textContent).toMatch(/310 L/);
    expect(need('Glifosato').textContent).not.toMatch(/295/);
    // Datos insuficientes: el motivo, nunca un cero.
    expect(cell('Cipermetrina').textContent).toMatch(/Datos insuficientes/);
    expect(cell('Cipermetrina').textContent).toMatch(/menos de tres campañas/);
    expect(cell('Cipermetrina').textContent).not.toMatch(/\b0\b/);
    expect(cell('Amina').textContent).toMatch(/Sin estimación/);
    expect(cell('Amina').textContent).not.toMatch(/\b0\b/);
    // Ninguna suma de necesidad y estimación (310 + 295 = 605).
    expect(document.body.textContent).not.toMatch(/605/);
    const note = screen.getByTestId('reference-note').textContent!;
    expect(note).toMatch(/no se\s+suma a la necesidad declarada, no es la cantidad solicitada/);
    expect(note).toMatch(/Detalle en «Estimación del consumo»/);
    expect(screen.getByTestId('reference-evaluated').textContent).toMatch(/Vigencia evaluada el .* Temporada INVIERNO/);
    expect(collectiveService.proposalEstimationReference).toHaveBeenCalledWith(DRAFT.proposal_ref);
  });

  it('desactualizada, retirada, sustituida por una ejecución posterior y política pendiente: lo dice sin cifra fabricada', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.proposalEstimationReference).mockResolvedValue(
      referenceFor(DRAFT, [
        { absence: null, estimation: estimation({ validity: 'OUTDATED', validity_reason: 'SOURCES_CHANGED', run_relation: 'AFTER_PROPOSAL' }) },
        { absence: null, estimation: estimation({ estimate_base: null, validity: 'OUTDATED', validity_reason: 'SOURCES_WITHDRAWN' }) },
        { absence: 'NO_RESULT', estimation: null },
      ]),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await screen.findByText('295 L');
    expect(cell('Glifosato').textContent).toMatch(/Desactualizado/);
    expect(cell('Glifosato').textContent).toMatch(/posterior al borrador/);
    expect(cell('Cipermetrina').textContent).toMatch(/Cifra retirada/);
    expect(cell('Cipermetrina').textContent).toMatch(/ya no se divulga/);
    expect(cell('Cipermetrina').textContent).not.toMatch(/\d[\d.,]* L\b/);
  });

  it('necesidad oculta con estimación permitida: la necesidad sigue oculta y la cifra se rotula como estimación aparte', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.proposalEstimationReference).mockResolvedValue(
      referenceFor(DRAFT, [
        { absence: null, estimation: estimation() },
        { absence: 'NO_RESULT', estimation: null },
        { absence: null, estimation: estimation({ estimate_base: '12000.000000' }) },
      ]),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await screen.findByText('12 L');
    // La necesidad no se rellena con la estimación ni con un cero.
    expect(need('Amina').textContent).toMatch(/umbral/);
    expect(need('Amina').textContent).not.toMatch(/\d[\d.,]* L\b/);
    expect(need('Amina').textContent).not.toMatch(/\b0\b/);
    const hidden = cell('Amina');
    expect(within(hidden).getByTestId('reference-hidden-need').textContent).toMatch(
      /La necesidad de esta fila no está divulgada\. Lo que sigue es la estimación del consumo: no la sustituye ni se\s+suma a la propuesta\./,
    );
    expect(hidden.textContent).toMatch(/12 L/);
    // En una fila con la necesidad publicada no aparece esa advertencia.
    expect(within(cell('Glifosato')).queryByTestId('reference-hidden-need')).toBeNull();
  });

  it('con la política pendiente no hay cifra de estimación y el borrador se sigue viendo', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.proposalEstimationReference).mockResolvedValue(
      referenceFor(DRAFT, DRAFT.lines.map(() => ({ absence: 'POLICY_PENDING' as const, estimation: null })), { availability: 'POLICY_PENDING' }),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toMatch(/política de divulgación no está aprobada/));
    expect(need('Glifosato').textContent).toMatch(/310 L/);
  });

  it('si la referencia falla, el borrador queda intacto y se dice que no está disponible', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    const error = new AxiosError('down', '500');
    error.response = { status: 500, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
    vi.mocked(collectiveService.proposalEstimationReference).mockRejectedValue(error);
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toBe('No disponible'));
    expect(need('Glifosato').textContent).toMatch(/310 L/);
    expect(screen.getByRole('alert').textContent).toMatch(/El borrador no cambia/);
  });

  it('descarta la referencia diferida de la campaña anterior al cambiar de campaña', async () => {
    const late = deferred<ProposalEstimationReference>();
    // El borrador de la otra campaña tiene las mismas posiciones, productos y unidades.
    const otherDraft = proposalWith(DRAFT.lines, {
      proposal_ref: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      campaign: { campaign_ref: OTHER.id, name: OTHER.name, status: 'ABIERTA' },
    });
    vi.mocked(collectiveService.proposals).mockImplementation(async (id) => [summaryOf(id === CAMPAIGN.id ? DRAFT : otherDraft)]);
    vi.mocked(collectiveService.proposal).mockImplementation(async (id) => (id === DRAFT.proposal_ref ? DRAFT : otherDraft));
    vi.mocked(collectiveService.proposalEstimationReference).mockImplementation((id) => (id === DRAFT.proposal_ref ? late.promise : new Promise(() => undefined)));
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toBe('Cargando…'));
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: OTHER.id } });
    // El último borrador de la otra campaña se abre solo (defensa, 2026-11-05).
    await screen.findByText(`Borrador · ${OTHER.name}`);
    // La referencia de la campaña anterior llega con el borrador de la otra ya abierto: no se muestra.
    await act(async () => late.resolve(referenceFor(DRAFT, [{ absence: null, estimation: estimation() }])));
    expect(cell('Glifosato').textContent).toBe('Cargando…');
    expect(document.body.textContent).not.toMatch(/295/);
  });

  it('descarta el borrador diferido de la campaña anterior y no pide su referencia', async () => {
    const late = deferred<Proposal>();
    vi.mocked(collectiveService.proposal).mockReturnValue(late.promise);
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: OTHER.id } });
    await screen.findByText('Todavía no hay borradores para esta campaña');
    await act(async () => late.resolve(DRAFT));
    expect(screen.queryByLabelText('Detalle del borrador')).toBeNull();
    expect(collectiveService.proposalEstimationReference).not.toHaveBeenCalled();
  });

  it('descarta la referencia diferida de otro borrador abierto antes', async () => {
    const slow = deferred<ProposalEstimationReference>();
    vi.mocked(collectiveService.proposal).mockImplementation(async (id) => (id === DRAFT.proposal_ref ? DRAFT : LATER));
    vi.mocked(collectiveService.proposalEstimationReference).mockImplementation((id) =>
      id === DRAFT.proposal_ref ? slow.promise : Promise.resolve(referenceFor(LATER, [{ absence: null, estimation: estimation({ estimate_base: '280000.000000' }) }])),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    const [first, second] = await screen.findAllByRole('button', { name: 'Ver' });
    fireEvent.click(first!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toBe('Cargando…'));
    fireEvent.click(second!);
    await screen.findByText('280 L');
    await act(async () => slow.resolve(referenceFor(DRAFT, [{ absence: null, estimation: estimation({ estimate_base: '999000.000000' }) }])));
    expect(cell('Glifosato').textContent).toMatch(/280 L/);
    expect(document.body.textContent).not.toMatch(/999/);
  });

  it('descarta la referencia diferida si cambia la identidad de la sesión', async () => {
    const late = deferred<ProposalEstimationReference>();
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.proposalEstimationReference).mockReturnValue(late.promise);
    const tree = (user: AuthUser) => (
      <AuthContext.Provider value={{ user, isLoading: false, login: async () => undefined, logout: async () => undefined }}>
        <CampaignContext.Provider value={{ activeCampaign: CAMPAIGN, isLoading: false, error: null, refreshActiveCampaign: async () => undefined, hasActiveCampaign: true }}>
          <MemoryRouter initialEntries={[PATH]}>
            <Routes>
              <Route path="/colectivo/propuestas" element={<JointProposalPage />} />
            </Routes>
          </MemoryRouter>
        </CampaignContext.Provider>
      </AuthContext.Provider>
    );
    const view = render(tree(userWith('DIRECTIVA')));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toBe('Cargando…'));
    // La identidad nueva no tiene borradores: nada se abre solo y la referencia diferida de la anterior se descarta.
    vi.mocked(collectiveService.proposals).mockResolvedValue([]);
    view.rerender(tree({ ...userWith('ADMINISTRADOR'), id: 'u-2' }));
    await vi.waitFor(() => expect(screen.queryByLabelText('Detalle del borrador')).toBeNull());
    await act(async () => late.resolve(referenceFor(DRAFT, [{ absence: null, estimation: estimation() }])));
    expect(screen.queryByLabelText('Detalle del borrador')).toBeNull();
    expect(document.body.textContent).not.toMatch(/295/);
  });
});
