import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectiveRoute } from '../components/collective-route';
import {
  closeContext,
  currentContext,
  memoryBackend,
  openContext,
  purgePending,
  readableCopies,
  saveCopy,
  setCopyBackend,
  type CopyBackend,
} from '../lib/estimation-copy';
import { WEB_NOT_FOR_FARMERS_PATH } from '../lib/navigation';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { estimationService } from '../services/estimation.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type { Campaign } from '../types/campaigns';
import type { InstitutionalDownload, InstitutionalResult, InstitutionalResults, Job, ResultDetail, Run, RunSummary } from '../types/estimation';
import { EstimationPage, POLL_MS } from './estimation.page';

vi.mock('../services/estimation.service', () => ({
  estimationService: { request: vi.fn(), job: vi.fn(), results: vi.fn(), runs: vi.fn(), run: vi.fn(), download: vi.fn() },
}));
vi.mock('../services/collective.service', () => ({
  collectiveService: { catalog: vi.fn(), associations: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({
  campaignsService: { list: vi.fn(), active: vi.fn() },
}));

const PATH = '/colectivo/estimacion';
const CLOSED: Campaign = { ...CAMPAIGN, id: '22222222-2222-4222-8222-222222222222', name: 'Campaña cerrada sintética', status: 'CERRADA', isActive: false };
const target = { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' as const, start_date: CAMPAIGN.startDate, end_date: null };
const season = { season_ref: 's-1', key: 'INVIERNO', definition: 'Temporada sintética', duration_days: 180 };

/** Respuestas sintéticas con la forma del contrato INT-09 (perfil institucional). */
function result(name: string, overrides: Partial<InstitutionalResult> = {}): InstitutionalResult {
  return {
    product: { product_ref: `p-${name}`, name },
    base_unit: 'ML',
    presentation_unit: 'L',
    status: 'ESTIMATED',
    reason_code: null,
    method: 'SES_NAIVE',
    run_ref: 'run-1',
    generated_at: '2026-11-02T14:00:00.000Z',
    span_length: 4,
    estimate_base: '111000.000000',
    naive_base: '116000',
    coverage: { status: 'IDENTIFIED', campaigns: [] },
    validity: 'CURRENT',
    validity_reason: null,
    ...overrides,
  };
}
function resultsWith(results: InstitutionalResult[]): InstitutionalResults {
  return { contract_version: 1, profile: 'INSTITUTIONAL', scope: { tenant_ref: 't-1' }, target, season, evaluated_at: '2026-11-02T15:00:00.000Z', results, notice: 'Aviso fijo del servicio.' };
}
const point = (name: string, position: number, quantity: string | null, inSpan: boolean) => ({
  position,
  campaign: { campaign_ref: `c-${name}`, name, status: 'CERRADA' as const, start_date: '2018-09-01T00:00:00.000Z', end_date: null },
  kind: quantity === null ? ('NO_RECORD' as const) : ('VERIFIED_CONSUMPTION' as const),
  quantity_base: quantity,
  seal_ref: null,
  classification_ref: `k-${name}`,
  coverage: { status: 'IDENTIFIED' as const, unknown_reason: null, members_in_published_figures: 3, linked_members: 5, measures: 'PARTICIPATION_NOT_COMPLETENESS' as const },
  in_span: inSpan,
  exclusion_reason: inSpan ? null : ('NOT_BEFORE_TARGET' as const),
});
function detail(name: string, overrides: Partial<ResultDetail> = {}): ResultDetail {
  const base = result(name);
  return {
    ...base,
    alpha: '0.50',
    fit_informative: true,
    fit_criterion: '116000000.000000',
    span: { first_position: 1, last_position: 4, length: 4, first_campaign_ref: 'c-C1', last_campaign_ref: 'c-C4' },
    series: null,
    points: [point('C1', 1, '96000', true), point('C2', 2, '120000', true), point('C3', 3, '104000', true), point('C4', 4, '116000', true), point('T', 5, null, false)],
    validations: [],
    metrics: null,
    ...overrides,
  };
}
function summary(runRef: string, overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    contract_version: 1, run_ref: runRef, job_ref: `job-${runRef}`, scope: { tenant_ref: 't-1' }, requested_by_role: 'DIRECTIVA', target, season,
    target_classification_ref: 'k-T', method: 'SES_NAIVE', method_version: 'F12-EST-04/1', outcome: 'CALCULATED', failure_code: null,
    previous_run_ref: null, content_hash: 'a'.repeat(64), generated_at: '2026-11-02T14:00:00.000Z',
    counts: { estimated: 1, insufficient_data: 1, incompatible_data: 0, calculation_failed: 0 }, ...overrides,
  };
}
function run(runRef: string, results: ResultDetail[], overrides: Partial<RunSummary> = {}): Run {
  return { ...summary(runRef, overrides), parameters: {}, disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', threshold: 3 }, results };
}
function jobWith(status: Job['status'], overrides: Partial<Job> = {}): Job {
  return {
    contract_version: 1, job_ref: 'job-1', request_id: 'req-1', scope: { tenant_ref: 't-1' }, requested_by_role: 'DIRECTIVA', target, product_refs: null,
    status, attempts: status === 'QUEUED' ? 0 : 1, max_attempts: 3, enqueued_at: '2026-11-02T14:00:00.000Z', started_at: null, finished_at: null,
    stop_code: null, stop_evidence: null, run_ref: null, ...overrides,
  };
}
const httpError = (status: number | null, message?: string) =>
  new AxiosError('x', 'ERR', undefined, undefined, status === null ? undefined : { status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: message ? { statusCode: status, message, error: 'x' } : {} });

function serve(results: InstitutionalResults, runs: Run[], list: RunSummary[] = runs) {
  vi.mocked(estimationService.results).mockResolvedValue(results);
  vi.mocked(estimationService.runs).mockResolvedValue({ contract_version: 1, items: list, next_cursor: null });
  vi.mocked(estimationService.run).mockImplementation(async (id: string) => runs.find((r) => r.run_ref === id) ?? Promise.reject(httpError(404, 'RUN_NOT_FOUND')));
}

/** La copia que entregaría `GET /download` para esas respuestas. */
function downloadOf(read: InstitutionalResults, downloadedAt = '2026-11-02T16:00:00.000Z'): InstitutionalDownload {
  return {
    contract_version: 1, kind: 'ESTIMATION_DOWNLOAD', profile: 'INSTITUTIONAL', scope: read.scope, subject: { member_ref: 'm-1', role: 'DIRECTIVA' },
    downloaded_at: downloadedAt, target: read.target, season: read.season,
    results: read.results.map(({ validity, ...rest }) => ({ ...rest, validity_at_download: validity })),
    may_be_outdated: true, notice: read.notice,
    storage: { backup: 'EXCLUDED_FROM_PRIVATE_BACKUP', discard_on: ['IDENTITY_CHANGE', 'SIGN_OUT'], replace_only_with: 'NEWER_SAME_SUBJECT_AND_SCOPE' },
  };
}
const SESSION = { userId: 'u-1', tenantId: 't-1', name: 'Usuario sintético', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };
let memory: CopyBackend;
/** Guarda en el contexto local vigente de la sesión simulada. */
const saveForSession = (body: InstitutionalDownload) => saveCopy(currentContext()!, SESSION, body);

describe('Estimación del consumo (F12-EST-06, #179)', () => {
  beforeEach(() => {
    localStorage.clear();
    memory = memoryBackend();
    setCopyBackend(memory);
    openContext(SESSION);
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN, CLOSED]);
    vi.mocked(collectiveService.catalog).mockResolvedValue([
      { product_ref: 'p-Herbicida', product_name: 'Herbicida', unit: 'L', base_unit: 'ML', is_active: true },
      { product_ref: 'p-Pieza', product_name: 'Pieza', unit: 'unidad', base_unit: null, is_active: true },
    ]);
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [], history: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('un rol sin permiso no ve la pantalla ni puede generar', async () => {
    renderAt(
      <CollectiveRoute>
        <EstimationPage />
      </CollectiveRoute>,
      { role: 'AGRICULTOR', path: PATH, routes: [{ path: WEB_NOT_FOR_FARMERS_PATH, element: <p>Sin acceso web</p> }] },
    );
    expect(await screen.findByText('Sin acceso web')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Generar estimación/ })).toBeNull();
    expect(estimationService.results).not.toHaveBeenCalled();
  });

  it('muestra SES y naive en L con su cifra base, α y campañas observadas del detalle, y la vigencia', async () => {
    serve(resultsWith([result('Herbicida')]), [run('run-1', [detail('Herbicida')])]);
    renderAt(<EstimationPage />, { path: PATH });
    const row = await screen.findByTestId('result-Herbicida');
    expect(within(row).getByTestId('estimate').textContent).toBe('111 LCifra exacta: 111 L (111.000 mL)'); // E3-R8: redondeada al presentar, la exacta escrita debajo
    expect(within(row).getByTestId('naive').textContent).toBe('116 L116.000 mL');
    await waitFor(() => expect(within(row).getByTestId('alpha').textContent).toBe('0,50'));
    expect(within(row).getByTestId('observed-span').textContent).toBe('4: C1 a C4');
    expect(within(row).getByTestId('observed-values').textContent).toBe('96 · 120 · 104 · 116 L');
    expect(within(row).getByTestId('validity').textContent).toBe('Vigente');
  });

  it('datos insuficientes: el motivo y ninguna cifra, nunca un cero', async () => {
    serve(
      resultsWith([result('Fungicida', { status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, naive_base: null, span_length: 2, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' })]),
      [run('run-1', [detail('Fungicida', { status: 'INSUFFICIENT_DATA', alpha: null, estimate_base: null, naive_base: null })])],
    );
    renderAt(<EstimationPage />, { path: PATH });
    const row = await screen.findByTestId('result-Fungicida');
    expect(within(row).getByTestId('reason').textContent).toMatch(/menos de tres campañas comparables consecutivas/);
    // «Datos insuficientes» ocupa el lugar de la cifra: ninguna cantidad, ningún cero.
    expect(within(row).getByTestId('estimate').textContent).toBe('Datos insuficientes');
    expect(within(row).getByTestId('naive').textContent).toBe('Sin cifra');
    expect(row.textContent).not.toMatch(/\b0 L\b/);
    expect(within(row).getByTestId('validity').textContent).toMatch(/No utilizable.*no tiene cifra/);
  });

  it('campañas observadas como W4: lo publicado, «oculto» y «sin registro» tal como llegan; sin campañas, «sin cifras publicadas»', async () => {
    const hidden = { ...point('C2', 2, null, true), kind: 'HIDDEN' as const, exclusion_reason: 'HIDDEN' as const };
    serve(
      resultsWith([
        result('Cipermetrina', { status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, naive_base: null, span_length: 2, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
        result('Amina', { status: 'INSUFFICIENT_DATA', reason_code: 'NO_SERIES', estimate_base: null, naive_base: null, span_length: null, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
      ]),
      [
        run('run-1', [
          detail('Cipermetrina', {
            status: 'INSUFFICIENT_DATA', alpha: null, estimate_base: null, naive_base: null, span: null,
            points: [{ ...point('C1', 1, '12000', false), exclusion_reason: 'BEFORE_GAP' as const }, hidden, point('C3', 3, '14000', true), { ...point('C4', 4, null, true), exclusion_reason: null }, point('T', 5, null, false)],
          }),
          detail('Amina', { status: 'INSUFFICIENT_DATA', alpha: null, estimate_base: null, naive_base: null, span: null, points: [point('T', 1, null, false)] }),
        ]),
      ],
    );
    renderAt(<EstimationPage />, { path: PATH });
    const row = await screen.findByTestId('result-Cipermetrina');
    await waitFor(() => expect(within(row).getByTestId('observed-values').textContent).toBe('12 · oculto · 14 · sin registro L'));
    expect(within(row).getByTestId('alpha').textContent).toBe('—');
    expect(within(screen.getByTestId('result-Amina')).getByTestId('observed-values').textContent).toBe('sin cifras publicadas');
  });

  it('aunque un resultado sin cifra llegara con una por error, no se muestra', async () => {
    serve(
      resultsWith([result('Glifosato', { status: 'INSUFFICIENT_DATA', reason_code: 'LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED', estimate_base: '5000.000000', naive_base: '5000', validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' })]),
      [run('run-1', [])],
    );
    renderAt(<EstimationPage />, { path: PATH });
    const row = await screen.findByTestId('result-Glifosato');
    expect(within(row).getByTestId('estimate').textContent).toBe('Datos insuficientes');
    expect(within(row).getByTestId('naive').textContent).toBe('Sin cifra');
    expect(row.textContent).not.toMatch(/5 L|5\.000/);
  });

  it('una fuente retirada oculta SES y naive; sustituido y fallido se distinguen', async () => {
    serve(
      resultsWith([
        result('Herbicida', { estimate_base: null, naive_base: null, validity: 'OUTDATED', validity_reason: 'SOURCES_WITHDRAWN' }),
        result('Urea', { base_unit: 'G', presentation_unit: 'KG', estimate_base: '2500.500000', naive_base: '2400', validity: 'SUPERSEDED', validity_reason: 'LATER_RUN' }),
        result('Insecticida', { status: 'CALCULATION_FAILED', reason_code: 'CALCULATION_ERROR', estimate_base: null, naive_base: null, validity: 'NOT_USABLE', validity_reason: 'RUN_FAILED' }),
      ]),
      [run('run-1', [detail('Herbicida'), detail('Urea'), detail('Insecticida')])],
    );
    renderAt(<EstimationPage />, { path: PATH });
    const withdrawn = await screen.findByTestId('result-Herbicida');
    expect(within(withdrawn).getByTestId('estimate').textContent).toBe('Cifra retirada');
    expect(within(withdrawn).getByTestId('naive').textContent).toBe('Cifra retirada');
    expect(within(withdrawn).getByTestId('validity').textContent).toMatch(/Desactualizado.*ya no se divulga/);
    const urea = screen.getByTestId('result-Urea');
    expect(within(urea).getByTestId('estimate').textContent).toBe('≈ 2,5 KGCifra exacta: 2,5005 KG (2.500,5 g)'); // E3-R8: redondeada a la décima, la exacta escrita debajo
    expect(within(urea).getByTestId('validity').textContent).toMatch(/Sustituido/);
    expect(within(screen.getByTestId('result-Insecticida')).getByTestId('validity').textContent).toMatch(/No utilizable.*falló/);
  });

  it('solicita, consulta el trabajo hasta que termina, recarga y deja de consultar', async () => {
    serve(resultsWith([]), []);
    vi.mocked(estimationService.request).mockResolvedValue(jobWith('QUEUED'));
    renderAt(<EstimationPage />, { path: PATH });
    await screen.findByText(/Todavía no hay ninguna estimación/);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(estimationService.job)
      .mockResolvedValueOnce(jobWith('RUNNING', { started_at: '2026-11-02T14:00:01.000Z' }))
      .mockResolvedValueOnce(jobWith('COMPLETED', { finished_at: '2026-11-02T14:00:02.000Z', run_ref: 'run-2' }));
    serve(resultsWith([result('Herbicida', { run_ref: 'run-2' })]), [run('run-2', [detail('Herbicida', { run_ref: 'run-2' })])]);
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    expect(await screen.findByTestId('job-status')).toHaveProperty('textContent', 'En cola');
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    await waitFor(() => expect(screen.getByTestId('job-status').textContent).toMatch(/Procesándose \(intento 1 de 3\)/));
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    await waitFor(() => expect(screen.getByTestId('job-status').textContent).toBe('Terminado'));
    expect(await screen.findByTestId('result-Herbicida')).toBeTruthy();
    const calls = vi.mocked(estimationService.job).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 5));
    expect(vi.mocked(estimationService.job).mock.calls.length).toBe(calls);
    const request = vi.mocked(estimationService.request).mock.calls[0]![0];
    expect(request).toMatchObject({ targetCampaignId: CAMPAIGN.id });
    expect(request).not.toHaveProperty('productRefs');
  });

  it('deja de consultar al salir de la pantalla', async () => {
    serve(resultsWith([]), []);
    vi.mocked(estimationService.request).mockResolvedValue(jobWith('QUEUED'));
    vi.mocked(estimationService.job).mockResolvedValue(jobWith('RUNNING'));
    const view = renderAt(<EstimationPage />, { path: PATH });
    await screen.findByText(/Todavía no hay ninguna estimación/);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    await screen.findByTestId('job-status');
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 5));
    expect(estimationService.job).not.toHaveBeenCalled();
  });

  it('perder el permiso mientras se consulta retira el trabajo y los resultados de la vista', async () => {
    serve(resultsWith([result('Herbicida')]), [run('run-1', [detail('Herbicida')])]);
    vi.mocked(estimationService.request).mockResolvedValue(jobWith('QUEUED'));
    vi.mocked(estimationService.job).mockRejectedValue(httpError(403, 'No tienes permisos para esta acción'));
    renderAt(<EstimationPage />, { path: PATH });
    await screen.findByTestId('result-Herbicida');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    await screen.findByTestId('job-status');
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(await screen.findByTestId('error-forbidden')).toBeTruthy();
    expect(screen.queryByTestId('result-Herbicida')).toBeNull();
    expect(screen.queryByTestId('job')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Generar estimación' })).toBeNull();
    const calls = vi.mocked(estimationService.job).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 5));
    expect(vi.mocked(estimationService.job).mock.calls.length).toBe(calls);
  });

  it.each([
    [401, 'Unauthorized', 'session'],
    [403, 'No tienes permisos para esta acción', 'forbidden'],
    [409, 'POLICY_PENDING', 'policy'],
  ])('un rechazo %i al consultar de nuevo retira las cifras ya mostradas (%s)', async (status, message, kind) => {
    serve(resultsWith([result('Herbicida')]), [run('run-1', [detail('Herbicida')])], [summary('run-1')]);
    renderAt(<EstimationPage />, { path: PATH });
    const row = await screen.findByTestId('result-Herbicida');
    await waitFor(() => expect(within(row).getByTestId('alpha').textContent).toBe('0,50'));
    // Hasta la siguiente consulta, el cliente no sabe del cambio: la cifra sigue a la vista.
    expect(within(row).getByTestId('estimate').textContent).toBe('111 LCifra exacta: 111 L (111.000 mL)'); // E3-R8: redondeada al presentar, la exacta escrita debajo
    vi.mocked(estimationService.run).mockRejectedValue(httpError(status, message));
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByTestId(`error-${kind}`)).toBeTruthy();
    expect(screen.queryByTestId('result-Herbicida')).toBeNull();
    expect(screen.queryByTestId('history-item')).toBeNull();
    expect(screen.queryByText(/111 L/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Descargar Excel' })).toHaveProperty('disabled', true);
  });

  it('política pendiente: sin cifras ni solicitud', async () => {
    vi.mocked(estimationService.results).mockRejectedValue(httpError(409, 'POLICY_PENDING'));
    vi.mocked(estimationService.runs).mockRejectedValue(httpError(409, 'POLICY_PENDING'));
    renderAt(<EstimationPage />, { path: PATH });
    expect((await screen.findByTestId('error-policy')).textContent).toMatch(/no se solicita ni se muestra ninguna estimación/);
    expect(screen.queryByRole('button', { name: 'Generar estimación' })).toBeNull();
    expect(screen.queryByText('Resultados para')).toBeNull();
  });

  it('sin conexión: el aviso es de conexión, se conserva lo mostrado marcado y el reintento reutiliza la misma solicitud', async () => {
    serve(resultsWith([result('Herbicida')]), [run('run-1', [detail('Herbicida')])]);
    vi.mocked(estimationService.request).mockRejectedValueOnce(httpError(null)).mockResolvedValueOnce(jobWith('COMPLETED', { run_ref: 'run-1' }));
    renderAt(<EstimationPage />, { path: PATH });
    await screen.findByTestId('result-Herbicida');
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    expect((await screen.findByTestId('error-offline')).textContent).toMatch(/Sin conexión con el servidor/);
    expect(screen.getByTestId('stale')).toBeTruthy();
    expect(screen.getByTestId('result-Herbicida')).toBeTruthy();
    // Sin conexión no se exporta: el Excel es de una consulta respondida, no una copia para consultar sin conexión.
    expect(screen.getByRole('button', { name: 'Descargar Excel' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    await screen.findByTestId('job-status');
    const [first, second] = vi.mocked(estimationService.request).mock.calls.map((call) => call[0].requestId);
    expect(second).toBe(first);
  });

  it('campaña no admisible, sin clasificar o trabajo detenido: el motivo, sin cálculo', async () => {
    serve(resultsWith([]), []);
    vi.mocked(estimationService.request)
      .mockRejectedValueOnce(httpError(422, 'TARGET_CAMPAIGN_NOT_CLASSIFIED'))
      .mockResolvedValueOnce(jobWith('NOT_EXECUTED', { stop_code: 'POLICY_PENDING', finished_at: '2026-11-02T14:00:01.000Z' }));
    renderAt(<EstimationPage />, { path: PATH });
    await screen.findByText(/Todavía no hay ninguna estimación/);
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    expect((await screen.findByTestId('error-invalid')).textContent).toMatch(/no está clasificada/);
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    expect((await screen.findByTestId('job-stop')).textContent).toMatch(/política de divulgación dejó de permitirlo/);
    expect(screen.getByTestId('job-status').textContent).toBe('No se ejecutó');
  });

  it('una campaña cerrada no ofrece solicitar, pero se consultan sus resultados', async () => {
    serve(resultsWith([]), []);
    renderAt(<EstimationPage />, { path: `${PATH}?campaign=${CLOSED.id}` });
    expect((await screen.findByTestId('not-eligible')).textContent).toMatch(/cerrada/);
    expect(screen.getByRole('button', { name: 'Generar estimación' })).toHaveProperty('disabled', true);
    await waitFor(() => expect(estimationService.results).toHaveBeenCalledWith(CLOSED.id));
  });

  it('cada cifra dice de qué ejecución viene; una anterior no pasa por la nueva', async () => {
    serve(resultsWith([result('Herbicida', { run_ref: 'run-1' })]), [run('run-1', [detail('Herbicida')])]);
    vi.mocked(estimationService.request).mockResolvedValue(jobWith('COMPLETED', { run_ref: 'run-2' }));
    renderAt(<EstimationPage />, { path: PATH });
    await screen.findByTestId('result-Herbicida');
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    expect((await screen.findByTestId('earlier-run')).textContent).toMatch(/De una ejecución anterior/);
  });

  it('el historial incluye las fallidas y el detalle muestra la serie de esa ejecución', async () => {
    const failed = run('run-2', [detail('Herbicida', { run_ref: 'run-2', status: 'CALCULATION_FAILED', reason_code: 'CALCULATION_ERROR', alpha: null, estimate_base: null, naive_base: null, points: [], span: null, validity: 'NOT_USABLE', validity_reason: 'RUN_FAILED' })], {
      outcome: 'FAILED', failure_code: 'RETRIES_EXHAUSTED', generated_at: '2026-11-02T15:00:00.000Z',
    });
    const calculated = run('run-1', [detail('Herbicida', { validity: 'SUPERSEDED', validity_reason: 'LATER_RUN' })]);
    serve(resultsWith([result('Herbicida')]), [calculated, failed], [summary('run-2', { outcome: 'FAILED', failure_code: 'RETRIES_EXHAUSTED' }), summary('run-1')]);
    renderAt(<EstimationPage />, { path: PATH });
    const items = await screen.findAllByTestId('history-item');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByTestId('history-outcome').textContent).toMatch(/Fallida.*agotaron los reintentos/);
    fireEvent.click(within(items[1]!).getByRole('button', { name: 'Ver detalle' }));
    const panel = await screen.findByTestId('run-detail');
    expect(within(panel).getByTestId('point-C2').textContent).toMatch(/120 L/);
    expect(within(panel).getByTestId('point-T').textContent).toMatch(/Sin cifra.*no es anterior al objetivo/);
    expect(within(panel).getByText(/Sustituido/)).toBeTruthy();
  });
  describe('copia para consultar sin conexión (F12-EST-07-WEB, #180)', () => {
    const offline = () => {
      vi.mocked(estimationService.results).mockRejectedValue(httpError(null));
      vi.mocked(estimationService.runs).mockRejectedValue(httpError(null));
    };
    const copyRead = () =>
      resultsWith([
        result('Herbicida'),
        result('Fungicida', { status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, naive_base: null, span_length: 2, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
        result('Insecticida', { estimate_base: null, naive_base: null, validity: 'OUTDATED', validity_reason: 'SOURCES_WITHDRAWN' }),
      ]);

    it('se descarga a petición, se guarda para la sesión y no es el Excel de la consulta', async () => {
      const read = resultsWith([result('Herbicida')]);
      serve(read, [run('run-1', [detail('Herbicida')])]);
      vi.mocked(estimationService.download).mockResolvedValue(downloadOf(read));
      renderAt(<EstimationPage />, { path: PATH });
      await screen.findByTestId('result-Herbicida');
      expect(screen.getByTestId('copy-status').textContent).toMatch(/No hay una copia de esta campaña/);
      fireEvent.click(screen.getByRole('button', { name: 'Guardar copia' /* rediseño v2 (lámina 26): antes «Descargar copia para consultar sin conexión» */ }));
      expect((await screen.findByTestId('copy-note')).textContent).toBe('Copia guardada en este navegador.');
      await waitFor(() => expect(screen.getByTestId('copy-status').textContent).toMatch(/Hay una copia de esta campaña en este navegador, descargada el/));
      expect(estimationService.download).toHaveBeenCalledWith(CAMPAIGN.id);
      const stored = await readableCopies(null);
      expect(stored.map((c) => [c.owner.userId, c.owner.tenantId, c.download.target.campaign_ref])).toEqual([['u-1', 't-1', CAMPAIGN.id]]);
      // La exportación de la consulta es aparte (sólo Excel; ningún CSV).
      expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull();
    });

    it('sin conexión y con copia: fechas, período, vigencia al descargar, vigencia actual desconocida y aviso; ausencias sin cifra', async () => {
      await saveForSession(downloadOf(copyRead()));
      offline();
      renderAt(<EstimationPage />, { path: PATH });
      await screen.findByTestId('error-offline');
      const view = await screen.findByTestId(`copy-${CAMPAIGN.id}`);
      // Rediseño v2 (lámina 27): «Campaña · guardada el … por … · Sindicato».
      expect(within(view).getByTestId('copy-downloaded').textContent).toMatch(/guardada el .* \(hora del servidor\) por Usuario sintético \(Directiva\) · Sindicato sintético/);
      expect(within(view).getByTestId('copy-period').textContent).toMatch(/Período objetivo: Campaña sintética.*Temporada INVIERNO/);
      expect(within(view).getByTestId('copy-outdated').textContent).toMatch(/Puede estar desactualizada.*vigencia actual es desconocida/);
      const herbicide = within(view).getByTestId('copy-result-Herbicida');
      expect(within(herbicide).getByTestId('copy-estimate').textContent).toBe('111 L111.000 mL');
      expect(within(herbicide).getByTestId('copy-naive').textContent).toBe('116 L116.000 mL');
      expect(within(herbicide).getByTestId('copy-validity').textContent).toBe('Vigente');
      expect(within(herbicide).getByTestId('copy-current').textContent).toBe('Desconocida sin conexión');
      expect(within(herbicide).getByTestId('copy-generated').textContent).not.toBe('');
      const short = within(view).getByTestId('copy-result-Fungicida');
      expect(within(short).getByTestId('copy-estimate').textContent).toBe('Sin cifra');
      expect(within(short).getByTestId('copy-reason').textContent).toMatch(/menos de tres campañas/);
      expect(short.textContent).not.toMatch(/\b0 L\b/);
      expect(within(within(view).getByTestId('copy-result-Insecticida')).getByTestId('copy-estimate').textContent).toBe('Cifra retirada');
      expect(screen.getByRole('button', { name: 'Guardar copia' })).toHaveProperty('disabled', true);
    });

    it('sin conexión y sin copia de esta identidad: el aviso y ninguna cifra (la copia de otra identidad no se ve)', async () => {
      const other = { ...SESSION, userId: 'u-otra', name: 'Otra identidad sintética' };
      await saveCopy(openContext(other)!, other, downloadOf(copyRead()));
      openContext(SESSION);
      offline();
      renderAt(<EstimationPage />, { path: PATH });
      await screen.findByTestId('error-offline');
      await waitFor(() => expect(screen.getByTestId('copy-status').textContent).toMatch(/No hay una estimación descargada de esta campaña.*ninguna cifra/));
      expect(screen.queryByTestId(`copy-${CAMPAIGN.id}`)).toBeNull();
      expect(screen.queryByText(/111 L/)).toBeNull();
    });

    it.each([
      [401, 'Unauthorized', 'session'],
      [403, 'No tienes permisos para esta acción', 'forbidden'],
      [409, 'POLICY_PENDING', 'policy'],
    ])('un rechazo %i retira la copia de esta identidad y no la ofrece como alternativa (%s)', async (status, message, kind) => {
      await saveForSession(downloadOf(copyRead()));
      vi.mocked(estimationService.results).mockRejectedValue(httpError(status, message));
      vi.mocked(estimationService.runs).mockRejectedValue(httpError(status, message));
      renderAt(<EstimationPage />, { path: PATH });
      expect(await screen.findByTestId(`error-${kind}`)).toBeTruthy();
      expect(await readableCopies(null)).toEqual([]);
      await waitFor(async () => expect(await memory.list()).toEqual([]));
      expect(screen.queryByTestId('copy-panel')).toBeNull();
      expect(screen.queryByTestId(`copy-${CAMPAIGN.id}`)).toBeNull();
    });

    it('un perfil de Agricultor en /results o en /download es un permiso perdido: sin cifras y sin copia', async () => {
      await saveForSession(downloadOf(copyRead()));
      serve({ ...resultsWith([result('Herbicida')]), profile: 'FARMER' } as unknown as InstitutionalResults, []);
      const first = renderAt(<EstimationPage />, { path: PATH });
      expect((await screen.findByTestId('error-forbidden')).textContent).toMatch(/ya no tiene acceso/);
      expect(await readableCopies(null)).toEqual([]);
      await waitFor(async () => expect(await memory.list()).toEqual([]));
      expect(screen.queryByTestId('result-Herbicida')).toBeNull();
      first.unmount();
      // Nueva sesión institucional: el servidor la acepta y se abre otro contexto local.
      openContext(SESSION);

      const read = resultsWith([result('Herbicida')]);
      serve(read, [run('run-1', [detail('Herbicida')])]);
      vi.mocked(estimationService.download).mockResolvedValue({ ...downloadOf(read), profile: 'FARMER' } as unknown as InstitutionalDownload);
      renderAt(<EstimationPage />, { path: PATH });
      await screen.findByTestId('result-Herbicida');
      fireEvent.click(screen.getByRole('button', { name: 'Guardar copia' }));
      expect(await screen.findByTestId('error-forbidden')).toBeTruthy();
      expect(await memory.list()).toEqual([]);
    });

    it('una descarga que responde cuando la sesión ya es otra no se guarda', async () => {
      const read = resultsWith([result('Herbicida')]);
      serve(read, [run('run-1', [detail('Herbicida')])]);
      vi.mocked(estimationService.download).mockImplementation(async () => {
        openContext({ ...SESSION, userId: 'u-2' });
        return downloadOf(read);
      });
      renderAt(<EstimationPage />, { path: PATH });
      await screen.findByTestId('result-Herbicida');
      fireEvent.click(screen.getByRole('button', { name: 'Guardar copia' }));
      expect((await screen.findByTestId('copy-note')).textContent).toMatch(/La sesión cambió o se retiró el acceso durante la descarga/);
      expect(await memory.list()).toEqual([]);
    });

    it('cerrar la sesión mientras una descarga está en curso: la respuesta no se guarda', async () => {
      const read = resultsWith([result('Herbicida')]);
      serve(read, [run('run-1', [detail('Herbicida')])]);
      vi.mocked(estimationService.download).mockImplementation(async () => {
        closeContext();
        return downloadOf(read);
      });
      renderAt(<EstimationPage />, { path: PATH });
      await screen.findByTestId('result-Herbicida');
      fireEvent.click(screen.getByRole('button', { name: 'Guardar copia' }));
      expect((await screen.findByTestId('copy-note')).textContent).toMatch(/La sesión cambió o se retiró el acceso/);
      expect(await memory.list()).toEqual([]);
    });

    it('un rechazo retira el acceso al instante aunque el borrado físico falle; no se afirma borrada', async () => {
      await saveForSession(downloadOf(copyRead()));
      setCopyBackend({ ...memory, delete: () => Promise.reject(new Error('IndexedDB no disponible')) });
      vi.mocked(estimationService.results).mockRejectedValue(httpError(403, 'No tienes permisos para esta acción'));
      vi.mocked(estimationService.runs).mockRejectedValue(httpError(403, 'No tienes permisos para esta acción'));
      renderAt(<EstimationPage />, { path: PATH });
      expect(await screen.findByTestId('error-forbidden')).toBeTruthy();
      expect(await readableCopies(null)).toEqual([]);
      await waitFor(() => expect(purgePending()).toBe(true));
      expect(await memory.list()).toHaveLength(1);
    });

    it('un 404 retira la copia de esa campaña en el contexto local (persiste) aunque su borrado falle', async () => {
      await saveForSession(downloadOf(copyRead()));
      setCopyBackend({ ...memory, delete: () => Promise.reject(new Error('IndexedDB no disponible')) });
      vi.mocked(estimationService.results).mockRejectedValue(httpError(404, 'TARGET_NOT_FOUND'));
      vi.mocked(estimationService.runs).mockRejectedValue(httpError(404, 'TARGET_NOT_FOUND'));
      renderAt(<EstimationPage />, { path: PATH });
      expect(await screen.findByTestId('error-not-found')).toBeTruthy();
      expect(await readableCopies(null)).toEqual([]);
      expect(Object.keys(currentContext()?.revoked ?? {})).toHaveLength(1);
      expect(localStorage.getItem('agro_estimacion_contexto_v1')).not.toContain(CAMPAIGN.id);
      await waitFor(() => expect(purgePending()).toBe(true));
      expect(await memory.list()).toHaveLength(1);
    });

    it('sin acceso local vigente no se descarga una copia', async () => {
      const read = resultsWith([result('Herbicida')]);
      serve(read, [run('run-1', [detail('Herbicida')])]);
      closeContext();
      renderAt(<EstimationPage />, { path: PATH });
      await screen.findByTestId('result-Herbicida');
      fireEvent.click(screen.getByRole('button', { name: 'Guardar copia' }));
      expect((await screen.findByTestId('copy-note')).textContent).toMatch(/No hay un acceso local vigente/);
      expect(estimationService.download).not.toHaveBeenCalled();
    });
  });
});
