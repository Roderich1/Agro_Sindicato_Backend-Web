import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as estimationFx from '../dev/fixtures/estimation-fixtures';
import * as trendsFx from '../dev/fixtures/trends-fixtures';
import { memoryBackend, openContext, setCopyBackend } from '../lib/estimation-copy';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { estimationService } from '../services/estimation.service';
import { CAMPAIGN, renderAt } from '../test/render';
import { HistoryPage } from './history.page';

vi.mock('../services/estimation.service', () => ({
  estimationService: { request: vi.fn(), job: vi.fn(), results: vi.fn(), runs: vi.fn(), run: vi.fn(), download: vi.fn() },
}));
vi.mock('../services/collective.service', () => ({
  collectiveService: { trends: vi.fn(), trendsCsv: vi.fn(), catalog: vi.fn(), associations: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn(), active: vi.fn() } }));

/** Contenedor «Histórico y estimaciones» (rediseño, sesión C, 2026-11-10). Datos sintéticos. */
const BASE = '/colectivo/historico';

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function serveEstimation(fixture: estimationFx.EstimationFixture) {
  vi.mocked(estimationService.results).mockResolvedValue({ ...fixture.results, target: { ...fixture.results.target, campaign_ref: CAMPAIGN.id } });
  vi.mocked(estimationService.runs).mockResolvedValue(fixture.runs);
  vi.mocked(estimationService.run).mockImplementation(async (id) => fixture.details.find((run) => run.run_ref === id)!);
}

const render = (search: string) =>
  renderAt(
    <>
      <HistoryPage />
      <Probe />
    </>,
    { path: `${BASE}${search}` },
  );

describe('Histórico y estimaciones (contenedor)', () => {
  beforeEach(() => {
    localStorage.clear();
    setCopyBackend(memoryBackend());
    openContext({ userId: 'u-1', tenantId: 't-1', name: 'Usuario sintético', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' });
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(collectiveService.trends).mockReset().mockResolvedValue(trendsFx.demo);
    vi.mocked(collectiveService.catalog).mockResolvedValue([]);
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [], history: [] });
    vi.mocked(estimationService.results).mockReset();
    vi.mocked(estimationService.request).mockReset();
    vi.mocked(estimationService.download).mockReset();
    serveEstimation(estimationFx.demo);
  });

  it('abre «Histórico sellado» por defecto y no pide la estimación', async () => {
    render('');
    // El h1 lo pone PageHeader (AppShell también lo pone hasta la fase 2 de A); cada vista va como h2.
    expect((await screen.findAllByRole('heading', { level: 1, name: 'Histórico y estimaciones' })).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 2, name: 'Histórico sellado' })).toBeTruthy();
    expect(await screen.findByTestId('trend-chart')).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Vista' });
    expect(within(group).getByRole('button', { name: 'Histórico sellado' }).getAttribute('aria-pressed')).toBe('true');
    expect(estimationService.results).not.toHaveBeenCalled();
  });

  it('cambia de vista con ?vista= y conserva ?campaign=; ninguna vista escribe al abrir', async () => {
    render(`?campaign=${CAMPAIGN.id}`);
    await screen.findByTestId('trend-chart');
    fireEvent.click(screen.getByRole('button', { name: 'Estimación del consumo' }));
    await screen.findByTestId('result-Glifosato');
    const search = new URLSearchParams(screen.getByTestId('location').textContent!);
    expect(search.get('vista')).toBe('estimacion');
    expect(search.get('campaign')).toBe(CAMPAIGN.id);
    expect(estimationService.results).toHaveBeenCalledWith(CAMPAIGN.id);
    fireEvent.click(screen.getByRole('button', { name: 'Histórico sellado' }));
    await screen.findByTestId('trend-chart');
    expect(new URLSearchParams(screen.getByTestId('location').textContent!).get('campaign')).toBe(CAMPAIGN.id);
    // Abrir y cambiar de vista sólo consulta: ningún trabajo de estimación ni descarga.
    expect(estimationService.request).not.toHaveBeenCalled();
    expect(estimationService.download).not.toHaveBeenCalled();
    expect(collectiveService.trendsCsv).not.toHaveBeenCalled();
  });

  it('con ?vista=estimacion abre la estimación con la vigencia evaluada y la ejecución en «Ver detalle»', async () => {
    render(`?vista=estimacion&campaign=${CAMPAIGN.id}`);
    const row = await screen.findByTestId('result-Glifosato');
    expect(screen.getByTestId('results-evaluated').textContent).toMatch(/^Vigencia evaluada el .*temporada INVIERNO/);
    expect(screen.getByTestId('results-evaluated').textContent).toMatch(/no es un rango histórico/);
    expect(row.textContent).toMatch(/ref\. run-2/);
    expect(collectiveService.trends).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/rango histórico de/i);
  });

  it('peor caso del histórico: 11 campañas, huecos rotulados con su estado y nunca como cero', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsFx.worst);
    render('');
    const chart = await screen.findByTestId('trend-chart');
    // 8 campañas selladas; 4 con cifra publicada (una de ellas, un cero explícito).
    expect(within(chart).getAllByTestId('trend-point')).toHaveLength(4);
    expect(within(chart).getAllByTestId('trend-gap').map((gap) => gap.querySelector('tspan')!.textContent)).toEqual([
      'sin dato',
      'retirado',
      'oculto',
      'en revisión',
    ]);
    expect(chart.textContent).toMatch(/123\.456\.789,012 L/);
    expect(chart.textContent).toMatch(/0,025 L/);
    expect(chart.getAttribute('aria-label')).toMatch(/4 de 8 campañas selladas/);
    const compact = screen.getByTestId('trend-chart-compact');
    expect(compact.querySelectorAll('li')).toHaveLength(8);
    expect(compact.textContent).toMatch(/Invierno 2020 – Comunidad Villa Esperanza del Valle Alto/);
    // Sin promedios, totales ni tasas.
    expect(document.body.textContent).not.toMatch(/Promedio|Total general|%/);
  });

  it('peor caso de la estimación: sin cifras retiradas u ocultas, seis decimales y línea base cero', async () => {
    serveEstimation(estimationFx.worst);
    render(`?vista=estimacion&campaign=${CAMPAIGN.id}`);
    const long = await screen.findByTestId('result-Herbicida sistémico de amplio espectro para barbecho químico 480 g/L');
    expect(within(long).getByTestId('estimate').textContent).toMatch(/^123\.456\.789,012123456 L/);
    expect(within(long).getByTestId('naive').textContent).toMatch(/^0 L/);
    const withdrawn = screen.getByTestId('result-Fungicida protectante a base de mancozeb 80 % WP (polvo mojable)');
    expect(within(withdrawn).getByTestId('estimate').textContent).toBe('Cifra retirada');
    expect(within(withdrawn).getByTestId('naive').textContent).toBe('Cifra retirada');
    await waitFor(() => expect(within(withdrawn).getByTestId('observed-values').textContent).toMatch(/oculto/));
    expect(within(withdrawn).getByTestId('observed-values').textContent).not.toMatch(/^\s*0\b/);
    expect(within(screen.getByTestId('result-Amina')).getByTestId('estimate').textContent).toBe('Datos insuficientes');
    expect(within(screen.getByTestId('result-Insecticida piretroide Cipermetrina 25 % EC')).getByTestId('validity').textContent).toMatch(/Sustituido/);
    expect(screen.getAllByTestId('history-item')).toHaveLength(3);
    expect(estimationService.request).not.toHaveBeenCalled();
  });

  it('vacío y uno: sin cifras inventadas', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsFx.empty);
    serveEstimation(estimationFx.empty);
    const view = render('');
    expect(await screen.findByText('Sin series selladas')).toBeTruthy();
    view.unmount();
    render(`?vista=estimacion&campaign=${CAMPAIGN.id}`);
    expect(await screen.findByText(/Todavía no hay ninguna estimación/)).toBeTruthy();
  });

  it('una sola campaña y un solo resultado', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsFx.one);
    serveEstimation(estimationFx.one);
    const view = render('');
    const chart = await screen.findByTestId('trend-chart');
    expect(chart.getAttribute('aria-label')).toMatch(/1 de 1 campañas selladas/);
    view.unmount();
    render(`?vista=estimacion&campaign=${CAMPAIGN.id}`);
    expect(within(await screen.findByTestId('result-Urea')).getByTestId('estimate').textContent).toMatch(/^1 KG/);
  });

  it('un 403 en el histórico es «sin permiso», sin gráfico', async () => {
    const error = new AxiosError('forbidden', '403');
    error.response = { status: 403, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
    vi.mocked(collectiveService.trends).mockRejectedValue(error);
    render('');
    expect((await screen.findByText(/Su rol no tiene acceso/)).closest('[data-state]')!.getAttribute('data-state')).toBe('forbidden');
    expect(screen.queryByTestId('trend-chart')).toBeNull();
  });
});
