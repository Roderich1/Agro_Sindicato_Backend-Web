import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthUser } from '../contexts/auth.context';
import { CampaignContext } from '../contexts/campaign.context';
import { available, linkViewFor, selectionFor } from '../dev/fixtures/proposal-fixtures';
import { fmtDateTime } from '../lib/collective-text';
import { collectiveService } from '../services/collective.service';
import { campaignsService } from '../services/campaigns.service';
import { line, proposalWith } from '../test/fixtures';
import { CAMPAIGN, renderAt, userWith } from '../test/render';
import type { Proposal, ProposalSummary } from '../types/collective';
import type { EstimationLinkView } from '../types/estimation-link';
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

/**
 * F12-EST-08 (#181, prototipo W3) y E3 §8: el consumo estimado como columna
 * separada del borrador. Desde E3 la columna muestra la referencia **fijada**
 * (`GET …/estimation-link`), no la vigente al consultar. Datos sintéticos.
 */
const PATH = `/colectivo/propuestas?campaign=${CAMPAIGN.id}`;
const OTHER = { ...CAMPAIGN, id: '22222222-2222-4222-8222-222222222222', name: 'Otra campaña sintética' };

const DRAFT = proposalWith([
  line({ position: 0, product_name: 'Glifosato', quantity_base: '310000', quantity_presentation: '310', contributors: 7 }),
  line({ position: 1, product_name: 'Cipermetrina', quantity_base: '48000', quantity_presentation: '48', contributors: 4 }),
  line({ position: 2, product_name: 'Amina', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
]);
const LATER = proposalWith(DRAFT.lines, { proposal_ref: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', generated_at: '2026-10-17T12:00:00.000Z' });

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

describe('Propuesta conjunta: consumo estimado como referencia fijada (F12-EST-08, E3)', () => {
  beforeEach(() => {
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN, OTHER]);
    vi.mocked(collectiveService.proposals).mockImplementation(async (id) => (id === CAMPAIGN.id ? [summaryOf(DRAFT), summaryOf(LATER)] : []));
    vi.mocked(collectiveService.proposal).mockReset();
    vi.mocked(collectiveService.estimationLink).mockReset();
    vi.mocked(collectiveService.proposalEstimationReference).mockReset();
    vi.mocked(collectiveService.proposalSelection).mockImplementation(async (id) => ({ ...selectionFor(DRAFT), proposal_ref: id }));
  });

  it('muestra la columna separada e identificada, con su vigencia y su ejecución; la necesidad no cambia y nada se suma', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    const view = linkViewFor(DRAFT, [
      available('295000.000000'),
      { state: 'INSUFFICIENT_DATA', status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' },
      { state: 'NO_RESULT' },
    ]);
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(view);
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await screen.findByText('295 L');
    // Rótulo de E3 §8 (antes «Estimación del consumo (referencia)», F12 §7.1).
    expect(screen.getByTestId('reference-header').textContent).toBe('Consumo estimado');
    expect(cell('Glifosato').textContent).toMatch(/295 L/);
    expect(cell('Glifosato').textContent).toMatch(/Vigente/);
    // Antes «anterior al borrador» (run_relation de F12-EST-08): ahora la ejecución fijada, en la franja.
    expect(screen.getByTestId('link-state').textContent).toBe('Referencia fijada');
    expect(screen.getByTestId('link-detail').textContent).toContain(`Ejecución del ${fmtDateTime(view.run!.generated_at)}`);
    expect(screen.getByTestId('link-detail').textContent).toMatch(/temporada INVIERNO/);
    expect(need('Glifosato').textContent).toMatch(/310 L/);
    expect(need('Glifosato').textContent).not.toMatch(/295/);
    // Datos insuficientes: el motivo, nunca un cero.
    expect(cell('Cipermetrina').textContent).toMatch(/Datos insuficientes/);
    expect(cell('Cipermetrina').textContent).toMatch(/menos de tres campañas/);
    expect(cell('Cipermetrina').textContent).not.toMatch(/\b0\b/);
    // Antes «Sin estimación»: la ejecución fijada no incluye el producto.
    expect(cell('Amina').textContent).toMatch(/Sin resultado/);
    expect(cell('Amina').textContent).not.toMatch(/\b0\b/);
    // Ninguna suma de necesidad y estimación (310 + 295 = 605).
    expect(document.body.textContent).not.toMatch(/605/);
    const note = screen.getByTestId('reference-note').textContent!;
    expect(note).toMatch(/no se suma a la necesidad declarada, no es la cantidad\s+solicitada/);
    expect(note).toMatch(/Detalle en «Estimación del consumo»/);
    expect(screen.getByTestId('reference-evaluated').textContent).toMatch(/Vigencia evaluada el .* Temporada INVIERNO/);
    expect(collectiveService.estimationLink).toHaveBeenCalledWith(DRAFT.proposal_ref);
    // La vista ya no usa la referencia vigente al consultar (F12-EST-08): tampoco la exportación (sólo Excel, con la fijada).
    expect(collectiveService.proposalEstimationReference).not.toHaveBeenCalled();
  });

  it('desactualizada y retirada: la desactualizada se rotula con su cifra; la retirada queda restringida, sin cifra', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(
      linkViewFor(DRAFT, [
        { state: 'OUTDATED', status: 'ESTIMATED', estimate_base: '295000.000000', validity: 'OUTDATED', validity_reason: 'SOURCES_CHANGED' },
        { state: 'RESTRICTED', status: 'ESTIMATED', validity: 'OUTDATED', validity_reason: 'SOURCES_WITHDRAWN' },
        { state: 'NO_RESULT' },
      ]),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await screen.findByText('295 L');
    // Antes «Desactualizado» + «posterior al borrador»: ahora «Desactualizada» con su motivo y sin diferencia.
    expect(cell('Glifosato').textContent).toMatch(/Desactualizada/);
    expect(cell('Glifosato').textContent).toMatch(/cambiaron desde el cálculo/);
    expect(within(cell('Glifosato')).queryByTestId('reference-difference')).toBeNull();
    // Antes «Cifra retirada»: en E3 el estado de la línea es RESTRICTED.
    expect(cell('Cipermetrina').textContent).toMatch(/Restringida/);
    expect(cell('Cipermetrina').textContent).toMatch(/ya no se divulga/);
    expect(cell('Cipermetrina').textContent).not.toMatch(/\d[\d.,]* L\b/);
  });

  it('necesidad oculta con estimación permitida: la necesidad sigue oculta y la cifra se rotula como estimación aparte', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(linkViewFor(DRAFT, [available('295000.000000'), { state: 'NO_RESULT' }, available('12000.000000')]));
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
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(
      linkViewFor(DRAFT, [], { state: 'RESTRICTED', prepare_blocker: 'POLICY_PENDING' }),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toMatch(/política de divulgación no está aprobada/));
    expect(cell('Glifosato').textContent).toMatch(/Restringida/);
    expect(cell('Glifosato').textContent).not.toMatch(/\d[\d.,]* L\b/);
    expect(screen.getByTestId('link-state').textContent).toBe('Referencia restringida');
    expect(screen.queryByRole('button', { name: 'Obtener referencia' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actualizar referencia' })).toBeNull();
    expect(need('Glifosato').textContent).toMatch(/310 L/);
  });

  it('si la referencia falla, el borrador queda intacto y se dice que no está disponible', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    const error = new AxiosError('down', '500');
    error.response = { status: 500, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
    vi.mocked(collectiveService.estimationLink).mockRejectedValue(error);
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toBe('No disponible'));
    expect(need('Glifosato').textContent).toMatch(/310 L/);
    expect(screen.getByRole('alert').textContent).toMatch(/El borrador no cambia/);
    // Reintentar sólo vuelve a leer.
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(linkViewFor(DRAFT, [available('295000.000000')]));
    fireEvent.click(within(screen.getByTestId('link-banner')).getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('295 L');
    expect(collectiveService.prepareEstimationLink).not.toHaveBeenCalled();
  });

  it('descarta la referencia diferida de la campaña anterior al cambiar de campaña', async () => {
    const late = deferred<EstimationLinkView>();
    // El borrador de la otra campaña tiene las mismas posiciones, productos y unidades.
    const otherDraft = proposalWith(DRAFT.lines, {
      proposal_ref: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      campaign: { campaign_ref: OTHER.id, name: OTHER.name, status: 'ABIERTA' },
    });
    vi.mocked(collectiveService.proposals).mockImplementation(async (id) => [summaryOf(id === CAMPAIGN.id ? DRAFT : otherDraft)]);
    vi.mocked(collectiveService.proposal).mockImplementation(async (id) => (id === DRAFT.proposal_ref ? DRAFT : otherDraft));
    vi.mocked(collectiveService.estimationLink).mockImplementation((id) => (id === DRAFT.proposal_ref ? late.promise : new Promise(() => undefined)));
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver' }))[0]!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toBe('Cargando…'));
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: OTHER.id } });
    // El último borrador de la otra campaña se abre solo (defensa, 2026-11-05).
    await screen.findByText(`Borrador · ${OTHER.name}`);
    // La referencia de la campaña anterior llega con el borrador de la otra ya abierto: no se muestra.
    await act(async () => late.resolve(linkViewFor(DRAFT, [available('295000.000000')])));
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
    expect(collectiveService.estimationLink).not.toHaveBeenCalled();
    expect(collectiveService.proposalSelection).not.toHaveBeenCalled();
  });

  it('descarta la referencia diferida de otro borrador abierto antes', async () => {
    const slow = deferred<EstimationLinkView>();
    vi.mocked(collectiveService.proposal).mockImplementation(async (id) => (id === DRAFT.proposal_ref ? DRAFT : LATER));
    vi.mocked(collectiveService.estimationLink).mockImplementation((id) =>
      id === DRAFT.proposal_ref ? slow.promise : Promise.resolve(linkViewFor(LATER, [available('280000.000000')])),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    const [first, second] = await screen.findAllByRole('button', { name: 'Ver' });
    fireEvent.click(first!);
    await vi.waitFor(() => expect(cell('Glifosato').textContent).toBe('Cargando…'));
    fireEvent.click(second!);
    await screen.findByText('280 L');
    await act(async () => slow.resolve(linkViewFor(DRAFT, [available('999000.000000')])));
    expect(cell('Glifosato').textContent).toMatch(/280 L/);
    expect(document.body.textContent).not.toMatch(/999/);
  });

  it('descarta la referencia diferida si cambia la identidad de la sesión', async () => {
    const late = deferred<EstimationLinkView>();
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.estimationLink).mockReturnValue(late.promise);
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
    await act(async () => late.resolve(linkViewFor(DRAFT, [available('295000.000000')])));
    expect(screen.queryByLabelText('Detalle del borrador')).toBeNull();
    expect(document.body.textContent).not.toMatch(/295/);
  });
});
