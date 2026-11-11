import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { available, LINK_RUN_REF, linkOf, linkViewFor, selectionFor } from '../dev/fixtures/proposal-fixtures';
import { LINK_POLL_MS } from '../lib/estimation-link-text';
import { prepareCallPath, readPreparedCall } from '../lib/joint-purchase-call-text';
import { STOP_TEXT } from '../lib/estimation-text';
import { collectiveService } from '../services/collective.service';
import { campaignsService } from '../services/campaigns.service';
import { estimationService } from '../services/estimation.service';
import { line, proposalWith } from '../test/fixtures';
import { CAMPAIGN, renderAt } from '../test/render';
import type { Proposal, ProposalSummary } from '../types/collective';
import type { Run } from '../types/estimation';
import type { EstimationLinkActionResult, EstimationLinkView, ProposalSelection } from '../types/estimation-link';
import { JointProposalPage } from './joint-proposal.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: {
    proposals: vi.fn(),
    generateProposal: vi.fn(),
    proposal: vi.fn(),
    proposalCsv: vi.fn(),
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
 * E3 §4, §6 y §8 (docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md):
 * obtener, actualizar y quitar la referencia fijada, el sondeo mientras se
 * calcula, «Ver cálculo», la selección «Llevar a convocatoria» y «Preparar
 * convocatoria». Datos sintéticos; HTTP simulado.
 */
const PATH = `/colectivo/propuestas?campaign=${CAMPAIGN.id}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const DRAFT = proposalWith([
  line({ position: 0, product_name: 'Glifosato', quantity_base: '310000', quantity_presentation: '310', contributors: 7 }),
  line({ position: 1, product_name: 'Urea', base_unit: 'G', quantity_base: '25000', quantity_presentation: '25', contributors: 3 }),
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

const NONE = linkViewFor(DRAFT, [], { state: 'NONE' });
const LINKED = linkViewFor(DRAFT, [available('295000.000000'), available('27500.500000')]);
const CALCULATING = linkViewFor(DRAFT, [], {
  state: 'CALCULATING',
  link: linkOf({ action: 'REQUEST_JOB', run_ref: null, job_ref: 'job-0000-4000-8000-000000000009', job_status: 'QUEUED' }),
});

function httpError(status: number, data: unknown) {
  const error = new AxiosError('error', String(status));
  error.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function serve(view: EstimationLinkView, selection: ProposalSelection = selectionFor(DRAFT), proposals: Proposal[] = [DRAFT]) {
  vi.mocked(collectiveService.proposals).mockResolvedValue(proposals.map(summaryOf));
  vi.mocked(collectiveService.proposal).mockImplementation(async (id) => proposals.find((p) => p.proposal_ref === id)!);
  vi.mocked(collectiveService.estimationLink).mockResolvedValue(view);
  vi.mocked(collectiveService.proposalSelection).mockResolvedValue(selection);
}

const cell = (name: string, unit: 'ML' | 'G' = 'ML') => within(screen.getByTestId(`line-${name}-${unit}`)).getByTestId('reference');
const box = (name: string, unit: 'ML' | 'G' = 'ML') => within(screen.getByTestId(`line-${name}-${unit}`)).getByTestId('select-product') as HTMLInputElement;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

function Probe() {
  const location = useLocation();
  return <p data-testid="probe">{location.pathname + location.search}</p>;
}

describe('Borrador de propuesta: referencia de consumo estimado fijada (E3)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('al montar y al recargar sólo lee: nunca obtiene, quita ni guarda nada', async () => {
    serve(NONE);
    const first = renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByRole('button', { name: 'Obtener referencia' });
    expect(cell('Glifosato').textContent).toBe('Sin referencia');
    first.unmount();
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByRole('button', { name: 'Obtener referencia' });
    expect(collectiveService.estimationLink).toHaveBeenCalledTimes(2);
    expect(collectiveService.proposalSelection).toHaveBeenCalledTimes(2);
    expect(collectiveService.prepareEstimationLink).not.toHaveBeenCalled();
    expect(collectiveService.clearEstimationLink).not.toHaveBeenCalled();
    expect(collectiveService.saveProposalSelection).not.toHaveBeenCalled();
    expect(estimationService.run).not.toHaveBeenCalled();
  });

  it('«Obtener referencia» recupera una ejecución ya calculada (LINKED_EXISTING_RUN), con un request_id nuevo en cada intento', async () => {
    serve(NONE);
    vi.mocked(collectiveService.prepareEstimationLink)
      .mockRejectedValueOnce(new AxiosError('offline'))
      .mockResolvedValueOnce({ outcome: 'LINKED_EXISTING_RUN', view: LINKED });
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click(await screen.findByRole('button', { name: 'Obtener referencia' }));
    // Sin conexión: nada cambia y se puede volver a intentar.
    expect((await screen.findByTestId('link-feedback')).textContent).toMatch(/Sin conexión/);
    fireEvent.click(button('Obtener referencia'));
    await screen.findByText('295 L');
    const calls = vi.mocked(collectiveService.prepareEstimationLink).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([DRAFT.proposal_ref, { request_id: expect.stringMatching(UUID), mode: 'INITIAL' }]);
    expect(calls[1]![1].request_id).toMatch(UUID);
    expect(calls[1]![1].request_id).not.toBe(calls[0]![1].request_id);
    expect(screen.getByTestId('link-feedback').textContent).toMatch(/Referencia recuperada/);
    expect(screen.getByTestId('link-state').textContent).toBe('Referencia fijada');
    // Fijada y al día: ninguna acción principal; sólo la secundaria.
    expect(screen.queryByRole('button', { name: 'Obtener referencia' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actualizar referencia' })).toBeNull();
    expect(button('Quitar referencia')).toBeTruthy();
  });

  it('«Obtener referencia» pide un cálculo (REQUESTED_JOB): consulta cada 3 s sólo con GET y deja de consultar al quedar fijada', async () => {
    serve(NONE);
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByRole('button', { name: 'Obtener referencia' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(collectiveService.prepareEstimationLink).mockResolvedValue({ outcome: 'REQUESTED_JOB', view: CALCULATING });
    vi.mocked(collectiveService.estimationLink)
      .mockResolvedValueOnce({ ...CALCULATING, link: { ...CALCULATING.link!, job_status: 'RUNNING' } })
      .mockResolvedValueOnce(LINKED);
    fireEvent.click(button('Obtener referencia'));
    expect(((await screen.findByRole('button', { name: 'Calculando…' })) as HTMLButtonElement).disabled).toBe(true);
    expect(cell('Glifosato').textContent).toBe('Calculando…');
    expect(screen.getByTestId('link-detail').textContent).toMatch(/^En cola\./);
    expect(screen.getByTestId('link-feedback').textContent).toMatch(/Cálculo solicitado/);
    const reads = vi.mocked(collectiveService.estimationLink).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(LINK_POLL_MS));
    await waitFor(() => expect(screen.getByTestId('link-detail').textContent).toMatch(/^Procesándose\./));
    expect(vi.mocked(collectiveService.estimationLink).mock.calls.length).toBe(reads + 1);
    await act(() => vi.advanceTimersByTimeAsync(LINK_POLL_MS));
    await screen.findByText('295 L');
    expect(screen.getByTestId('link-state').textContent).toBe('Referencia fijada');
    const after = vi.mocked(collectiveService.estimationLink).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(LINK_POLL_MS * 5));
    expect(vi.mocked(collectiveService.estimationLink).mock.calls.length).toBe(after);
    // El sondeo sólo lee: una única escritura, la del botón.
    expect(collectiveService.prepareEstimationLink).toHaveBeenCalledTimes(1);
  });

  it('doble clic: una sola petición y el botón queda deshabilitado mientras está en vuelo', async () => {
    serve(NONE);
    const pending = deferred<EstimationLinkActionResult>();
    vi.mocked(collectiveService.prepareEstimationLink).mockReturnValue(pending.promise);
    renderAt(<JointProposalPage />, { path: PATH });
    const obtain = (await screen.findByRole('button', { name: 'Obtener referencia' })) as HTMLButtonElement;
    fireEvent.click(obtain);
    fireEvent.click(obtain);
    fireEvent.click(obtain);
    expect(collectiveService.prepareEstimationLink).toHaveBeenCalledTimes(1);
    expect(obtain.disabled).toBe(true);
    await act(async () => pending.resolve({ outcome: 'LINKED_EXISTING_RUN', view: LINKED }));
    await screen.findByText('295 L');
    expect(collectiveService.prepareEstimationLink).toHaveBeenCalledTimes(1);
  });

  it('«Actualizar referencia» envía UPDATE citando el vínculo mostrado', async () => {
    const outdated = { ...LINKED, update: { available: true, reason: 'NEWER_RUN' as const } };
    const updated = linkViewFor(DRAFT, [available('300000.000000'), available('25000.000000')], {
      link: linkOf({ link_ref: 'link-000-4000-8000-000000000002', sequence: 2, mode: 'UPDATE' }),
    });
    serve(outdated);
    vi.mocked(collectiveService.prepareEstimationLink).mockResolvedValue({ outcome: 'LINKED_EXISTING_RUN', view: updated });
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText('295 L');
    expect(screen.getByTestId('link-detail').textContent).toMatch(/Hay una ejecución calculada posterior a la fijada/);
    fireEvent.click(button('Actualizar referencia'));
    await screen.findByText('300 L');
    expect(collectiveService.prepareEstimationLink).toHaveBeenCalledWith(DRAFT.proposal_ref, {
      request_id: expect.stringMatching(UUID),
      mode: 'UPDATE',
      expected_link_ref: LINKED.link!.link_ref,
    });
    expect(screen.queryByRole('button', { name: 'Actualizar referencia' })).toBeNull();
  });

  it('REFERENCE_CHANGED: muestra la vista nueva que trae el error y explica que otra persona o pestaña la cambió', async () => {
    serve({ ...LINKED, update: { available: true, reason: 'OUTDATED' } });
    const theirs = linkViewFor(DRAFT, [available('280000.000000'), available('25000.000000')], {
      link: linkOf({ link_ref: 'link-000-4000-8000-000000000003', sequence: 2, mode: 'UPDATE', created_by: { user_ref: 'u-9', name: 'Otra persona sintética', role: 'DIRECTIVA' } }),
    });
    vi.mocked(collectiveService.prepareEstimationLink).mockRejectedValue(httpError(409, { errorCode: 'REFERENCE_CHANGED', view: theirs }));
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText('295 L');
    fireEvent.click(button('Actualizar referencia'));
    await screen.findByText('280 L');
    expect(screen.queryByText('295 L')).toBeNull();
    expect(screen.getByTestId('link-feedback').textContent).toMatch(/cambió mientras tanto: otra persona u otra pestaña/);
    expect(screen.queryByRole('button', { name: 'Actualizar referencia' })).toBeNull();
    // No se reintenta solo.
    expect(collectiveService.prepareEstimationLink).toHaveBeenCalledTimes(1);
  });

  it('«Quitar referencia» es secundaria y cita el vínculo mostrado; el borrador no cambia', async () => {
    serve(LINKED);
    vi.mocked(collectiveService.clearEstimationLink).mockResolvedValue({
      outcome: 'CLEARED',
      view: linkViewFor(DRAFT, [], { state: 'NONE', link: null, history: [{ ...LINKED.link!, current: false }] }),
    });
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText('295 L');
    fireEvent.click(button('Quitar referencia'));
    await waitFor(() => expect(cell('Glifosato').textContent).toBe('Sin referencia'));
    expect(collectiveService.clearEstimationLink).toHaveBeenCalledWith(DRAFT.proposal_ref, {
      request_id: expect.stringMatching(UUID),
      expected_link_ref: LINKED.link!.link_ref,
    });
    expect(screen.getByTestId('link-feedback').textContent).toMatch(/Referencia quitada/);
    expect(button('Obtener referencia')).toBeTruthy();
    expect(within(screen.getByTestId('line-Glifosato-ML')).getByTestId('need').textContent).toMatch(/310 L/);
  });

  it('cálculo no completado: error por línea sin cifra, el motivo en la franja y «Actualizar referencia»', async () => {
    serve(
      linkViewFor(DRAFT, [], {
        state: 'UNAVAILABLE',
        link: linkOf({ action: 'REQUEST_JOB', run_ref: null, job_ref: 'job-0000-4000-8000-000000000009', job_status: 'NOT_EXECUTED', stop_code: 'TARGET_CAMPAIGN_NOT_ELIGIBLE' }),
        update: { available: true, reason: 'NOT_EXECUTED' },
      }),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByRole('button', { name: 'Actualizar referencia' });
    expect(screen.getByTestId('link-state').textContent).toBe('El cálculo de la referencia no se completó');
    expect(screen.getByTestId('link-detail').textContent).toContain(STOP_TEXT.TARGET_CAMPAIGN_NOT_ELIGIBLE);
    expect(screen.getByTestId('link-detail').textContent).toMatch(/El cálculo pedido no se ejecutó/);
    expect(cell('Glifosato').textContent).toMatch(/^Error: sin cifra/);
    expect(cell('Urea', 'G').textContent).not.toMatch(/\d[\d.,]* (KG|L)\b/);
  });

  it('política pendiente y casos no calculables: sin «Obtener referencia», con el motivo; un 409 POLICY_PENDING no escribe y lo explica', async () => {
    serve({ ...NONE, prepare_blocker: 'POLICY_PENDING' });
    const view = renderAt(<JointProposalPage />, { path: PATH });
    await waitFor(() => expect(screen.getByTestId('link-detail').textContent).toMatch(/^Restringida: la política de divulgación no está aprobada/));
    expect(screen.queryByRole('button', { name: 'Obtener referencia' })).toBeNull();
    view.unmount();

    serve(NONE);
    vi.mocked(collectiveService.prepareEstimationLink)
      .mockRejectedValueOnce(httpError(409, { errorCode: 'POLICY_PENDING' }))
      .mockResolvedValueOnce({ outcome: 'NOT_CALCULABLE', reason: 'TARGET_CAMPAIGN_NOT_CLASSIFIED', view: { ...NONE, prepare_blocker: 'TARGET_CAMPAIGN_NOT_CLASSIFIED' } });
    renderAt(<JointProposalPage />, { path: PATH });
    fireEvent.click(await screen.findByRole('button', { name: 'Obtener referencia' }));
    expect((await screen.findByTestId('link-feedback')).textContent).toMatch(/política de divulgación no está aprobada/);
    expect(cell('Glifosato').textContent).toBe('Sin referencia');
    fireEvent.click(button('Obtener referencia'));
    await waitFor(() => expect(screen.getByTestId('link-feedback').textContent).toMatch(/no está clasificada en una temporada/));
    expect(screen.queryByRole('button', { name: 'Obtener referencia' })).toBeNull();
  });

  it('«Ver cálculo» pide el detalle de la ejecución sólo al desplegarlo, una vez', async () => {
    serve({
      ...LINKED,
      history: [
        { ...linkOf({ link_ref: 'link-000-4000-8000-000000000000', sequence: 1, action: 'REQUEST_JOB', run_ref: 'run-0000-4000-8000-000000000001', job_ref: 'job-1', job_status: 'COMPLETED' }), current: false },
        { ...linkOf({ sequence: 2, mode: 'UPDATE' }), current: true },
      ],
    });
    vi.mocked(estimationService.run).mockResolvedValue(RUN);
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText('295 L');
    const details = screen.getByTestId('calculation') as HTMLDetailsElement;
    // Plegado: lo del resumen ya está (sin cifras), el detalle no se pidió.
    expect(within(details).getByTestId('calculation-run').textContent).toMatch(/SES_NAIVE\) · versión 1\.0\.0/);
    expect(estimationService.run).not.toHaveBeenCalled();
    details.open = true;
    fireEvent(details, new Event('toggle'));
    const detail = await within(details).findByTestId('calculation-Glifosato');
    expect(estimationService.run).toHaveBeenCalledTimes(1);
    expect(estimationService.run).toHaveBeenCalledWith(LINK_RUN_REF);
    const run = within(details).getByTestId('calculation-run').textContent!;
    expect(run).toMatch(/INVIERNO · Siembra de invierno \(sintética\)/);
    expect(run).toMatch(/Campaña objetivo \(período\)/);
    expect(run).toMatch(/F07-POL-01 · PROVISIONAL_SYNTHETIC · umbral 3/);
    expect(within(details).getByTestId('calculation-parameters').textContent).toMatch(/min_span: 3/);
    expect(detail.textContent).toMatch(/Línea base naive: 300 L/);
    expect(detail.textContent).toMatch(/α 0,50/);
    expect(detail.textContent).toMatch(/Campaña 2024 sintética: 5 de 9/);
    expect(detail.textContent).toMatch(/versión 2 · huella abcdef123456/);
    // Un producto de la ejecución que no es del borrador no aparece.
    expect(within(details).queryByTestId('calculation-Otro')).toBeNull();
    const history = within(details).getByTestId('link-history').textContent!;
    expect(history).toMatch(/^2\. .* Actualizar \(ejecución existente fijada\).* · vigente/);
    expect(history).toMatch(/1\. .* Obtener \(cálculo solicitado\)/);
    // Plegar y volver a desplegar no repite la petición.
    details.open = false;
    fireEvent(details, new Event('toggle'));
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(estimationService.run).toHaveBeenCalledTimes(1);
    // El enlace a la vista técnica se conserva.
    expect(screen.getByRole('link', { name: 'Detalle en «Estimación del consumo»' })).toBeTruthy();
  });

  it('selección: SELECTION_STALE carga la vigente y avisa; luego se guarda con la revisión nueva', async () => {
    serve(LINKED, selectionFor(DRAFT, ['p-Glifosato'], 1));
    vi.mocked(collectiveService.saveProposalSelection)
      .mockRejectedValueOnce(httpError(409, { errorCode: 'SELECTION_STALE', selection: selectionFor(DRAFT, ['p-Urea'], 2) }))
      .mockResolvedValueOnce(selectionFor(DRAFT, ['p-Glifosato', 'p-Urea'], 3));
    renderAt(<JointProposalPage />, { path: PATH });
    await waitFor(() => expect(box('Glifosato').checked).toBe(true));
    expect(button('Guardar selección').disabled).toBe(true);
    fireEvent.click(box('Urea', 'G'));
    expect(button('Guardar selección').disabled).toBe(false);
    // Con cambios sin guardar no se prepara la convocatoria.
    expect(button('Preparar convocatoria (1 producto)').disabled).toBe(true);
    fireEvent.click(button('Guardar selección'));
    await waitFor(() => expect(screen.getByTestId('selection-feedback').textContent).toMatch(/Otra persona u otra pestaña cambió la selección/));
    expect(collectiveService.saveProposalSelection).toHaveBeenLastCalledWith(DRAFT.proposal_ref, { expected_revision: 1, product_refs: ['p-Glifosato', 'p-Urea'] });
    expect(box('Glifosato').checked).toBe(false);
    expect(box('Urea', 'G').checked).toBe(true);
    expect(button('Guardar selección').disabled).toBe(true);
    fireEvent.click(box('Glifosato'));
    fireEvent.click(button('Guardar selección'));
    await waitFor(() => expect(screen.getByTestId('selection-feedback').textContent).toMatch(/Selección guardada/));
    expect(collectiveService.saveProposalSelection).toHaveBeenLastCalledWith(DRAFT.proposal_ref, { expected_revision: 2, product_refs: ['p-Glifosato', 'p-Urea'] });
    expect(button('Preparar convocatoria (2 productos)').disabled).toBe(false);
  });

  it('un resultado tardío del cálculo no toca lo que se marcó', async () => {
    serve(CALCULATING);
    // El sondeo se arma al montar: el reloj simulado tiene que estar antes.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByRole('button', { name: 'Calculando…' });
    await waitFor(() => expect(box('Glifosato').disabled).toBe(false));
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(LINKED);
    fireEvent.click(box('Glifosato'));
    expect(box('Glifosato').checked).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(LINK_POLL_MS));
    await screen.findByText('295 L');
    expect(box('Glifosato').checked).toBe(true);
    expect(box('Urea', 'G').checked).toBe(false);
    expect(screen.getByTestId('selection-summary').textContent).toMatch(/1 producto marcado .*\(cambios sin guardar\)/);
    expect(collectiveService.saveProposalSelection).not.toHaveBeenCalled();
    expect(collectiveService.proposalSelection).toHaveBeenCalledTimes(1);
  });

  it('«Preparar convocatoria» navega al formulario con la campaña, el borrador y los productos guardados, codificados', async () => {
    const odd = proposalWith(
      [
        line({ position: 0, product_name: 'Glifosato', product_ref: 'prod a/1', quantity_base: '310000', quantity_presentation: '310', contributors: 7 }),
        line({ position: 1, product_name: 'Urea', base_unit: 'G', product_ref: 'prod&b', quantity_base: '25000', quantity_presentation: '25', contributors: 3 }),
        line({ position: 2, product_name: 'Amina', product_ref: 'prod-c', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
      ],
      { proposal_ref: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    );
    serve(linkViewFor(odd, [], { state: 'NONE' }), selectionFor(odd, ['prod a/1', 'prod&b'], 4), [odd]);
    renderAt(<JointProposalPage />, { path: PATH, routes: [{ path: '/colectivo/compras-conjuntas', element: <Probe /> }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar convocatoria (2 productos)' }));
    // La URL la construye y la lee el mismo módulo de convocatorias (una sola fuente); aquí se comprueba el viaje completo.
    const target = (await screen.findByTestId('probe')).textContent ?? '';
    expect(target).toBe(prepareCallPath('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ['prod a/1', 'prod&b']));
    const [path, search] = target.split('?');
    expect(path).toBe('/colectivo/compras-conjuntas');
    expect(readPreparedCall(new URLSearchParams(search))).toEqual({
      campaignId: '11111111-1111-4111-8111-111111111111',
      proposalId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      productRefs: ['prod a/1', 'prod&b'],
    });
    expect(collectiveService.saveProposalSelection).not.toHaveBeenCalled();
    expect(collectiveService.prepareEstimationLink).not.toHaveBeenCalled();
  });

  it('sin productos guardados no se prepara ninguna convocatoria', async () => {
    serve(LINKED);
    renderAt(<JointProposalPage />, { path: PATH });
    expect((await screen.findByRole('button', { name: 'Preparar convocatoria (0 productos)' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('el sondeo se detiene al cambiar de borrador y al salir de la pantalla', async () => {
    serve(CALCULATING, selectionFor(DRAFT), [DRAFT, LATER]);
    vi.mocked(collectiveService.estimationLink).mockImplementation(async (id) => (id === DRAFT.proposal_ref ? CALCULATING : linkViewFor(LATER, [], { state: 'NONE' })));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByRole('button', { name: 'Calculando…' });
    await act(() => vi.advanceTimersByTimeAsync(LINK_POLL_MS));
    const draftReads = () => vi.mocked(collectiveService.estimationLink).mock.calls.filter(([id]) => id === DRAFT.proposal_ref).length;
    await waitFor(() => expect(draftReads()).toBe(2));
    // Abre el otro borrador: el sondeo del anterior se detiene.
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver' })[1]!);
    await screen.findByRole('button', { name: 'Obtener referencia' });
    const reads = draftReads();
    await act(() => vi.advanceTimersByTimeAsync(LINK_POLL_MS * 4));
    expect(draftReads()).toBe(reads);
    // Vuelve al primero (sigue calculando) y sale de la pantalla: tampoco se consulta.
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver' })[0]!);
    await screen.findByRole('button', { name: 'Calculando…' });
    view.unmount();
    const atExit = vi.mocked(collectiveService.estimationLink).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(LINK_POLL_MS * 4));
    expect(vi.mocked(collectiveService.estimationLink).mock.calls.length).toBe(atExit);
  });
});

/** Ejecución sintética para «Ver cálculo» (forma de `GET /estimation/runs/{runId}`). */
const RUN: Run = {
  contract_version: 1,
  run_ref: LINK_RUN_REF,
  job_ref: 'job-0000-4000-8000-000000000002',
  scope: { tenant_ref: 't-1' },
  requested_by_role: 'DIRECTIVA',
  target: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA', start_date: '2026-05-01T00:00:00.000Z', end_date: null },
  season: { season_ref: 'season-1', key: 'INVIERNO', definition: 'Siembra de invierno (sintética)', duration_days: 180 },
  target_classification_ref: 'cls-1',
  method: 'SES_NAIVE',
  method_version: '1.0.0',
  outcome: 'CALCULATED',
  failure_code: null,
  previous_run_ref: null,
  content_hash: 'c'.repeat(64),
  generated_at: '2026-10-15T10:00:00.000Z',
  counts: { estimated: 2, insufficient_data: 0, incompatible_data: 0, calculation_failed: 0 },
  parameters: { alpha_grid: ['0.10', '0.50'], min_span: 3 },
  disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', threshold: 3 },
  results: [
    {
      product: { product_ref: 'p-Glifosato', name: 'Glifosato' },
      base_unit: 'ML',
      presentation_unit: 'L',
      status: 'ESTIMATED',
      reason_code: null,
      method: 'SES_NAIVE',
      run_ref: LINK_RUN_REF,
      generated_at: '2026-10-15T10:00:00.000Z',
      span_length: 3,
      estimate_base: '295000.000000',
      naive_base: '300000',
      alpha: '0.50',
      fit_informative: true,
      fit_criterion: 'SSE',
      span: { first_position: 0, last_position: 2, length: 3, first_campaign_ref: 'c-22', last_campaign_ref: 'c-24' },
      series: { series_ref: 'series-01-4000-8000-000000000001', version: 2, source_hash: 'abcdef123456'.padEnd(64, '0'), built_at: '2026-10-15T09:59:00.000Z' },
      points: [
        {
          position: 2,
          campaign: { campaign_ref: 'c-24', name: 'Campaña 2024 sintética', status: 'CERRADA', start_date: '2024-05-01T00:00:00.000Z', end_date: '2024-10-31T00:00:00.000Z' },
          kind: 'VERIFIED_CONSUMPTION',
          quantity_base: '290000',
          seal_ref: 'seal-24',
          classification_ref: 'cls-24',
          coverage: { status: 'IDENTIFIED', unknown_reason: null, members_in_published_figures: 5, linked_members: 9, measures: 'PARTICIPATION_NOT_COMPLETENESS' },
          in_span: true,
          exclusion_reason: null,
        },
      ],
      validations: [],
      metrics: null,
      validity: 'CURRENT',
      validity_reason: null,
    },
    {
      product: { product_ref: 'p-Otro', name: 'Otro' },
      base_unit: 'ML',
      presentation_unit: 'L',
      status: 'ESTIMATED',
      reason_code: null,
      method: 'SES_NAIVE',
      run_ref: LINK_RUN_REF,
      generated_at: '2026-10-15T10:00:00.000Z',
      span_length: 3,
      estimate_base: '1000.000000',
      naive_base: '1000',
      alpha: '0.10',
      fit_informative: true,
      fit_criterion: 'SSE',
      span: null,
      series: null,
      points: [],
      validations: [],
      metrics: null,
      validity: 'CURRENT',
      validity_reason: null,
    },
  ],
};
