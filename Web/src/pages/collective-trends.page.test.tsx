import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { point, trendsWith } from '../test/fixtures';
import { renderAt } from '../test/render';
import type { TrendSeries } from '../types/collective';
import { CollectiveTrendsPage } from './collective-trends.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { trends: vi.fn() },
}));

const PATH = '/colectivo/tendencias';

const herbicida: TrendSeries = {
  projection_type: 'DECLARED_NEED',
  product_ref: 'p-herb',
  product_name: 'Herbicida',
  base_unit: 'ML',
  presentation_unit: 'L',
  points: [
    point('c-2024', { total_base: '6000', total_presentation: '6', contributors: 3, data_as_of: '2024-12-01T00:00:00.000Z' }),
    // Aunque llegara un total en una celda retirada, no se muestra ni se dibuja.
    point('c-2025', { status: 'WITHDRAWN_AFTER_SEAL', total_base: '9000' }),
    point('c-2026', { status: 'NOT_SEALED' }),
  ],
};
const urea: TrendSeries = {
  projection_type: 'DECLARED_NEED',
  product_ref: 'p-urea',
  product_name: 'Urea',
  base_unit: 'G',
  presentation_unit: 'KG',
  points: [
    point('c-2024', { total_base: '25000', total_presentation: '25', contributors: 3, pending_changes: true }),
    point('c-2025', { total_base: '30000', total_presentation: '30', contributors: 4 }),
    point('c-2026', { status: 'NOT_SEALED' }),
  ],
};
const glifosato: TrendSeries = {
  ...herbicida,
  product_ref: 'p-gli',
  product_name: 'Glifosato',
  points: [point('c-2024', { status: 'SUPPRESSED_UNDER_THRESHOLD' }), point('c-2025', { status: 'NO_DATA' }), point('c-2026', { status: 'NOT_SEALED' })],
};

/** F07 (2026-10-23, contrato §8): tendencias sólo entre versiones selladas. */
describe('Tendencias entre campañas', () => {
  beforeEach(() => {
    vi.mocked(collectiveService.trends).mockReset();
  });

  it('tabla y gráfico muestran las mismas cifras; los huecos nunca son cero ni se interpolan', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([herbicida, urea, glifosato]));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    // Matriz inicial: todos los productos visibles a la vez sin ciclar un selector.
    const herb = await screen.findByTestId('series-DECLARED_NEED-Herbicida-ML');
    const ur = screen.getByTestId('series-DECLARED_NEED-Urea-G');
    const gli = screen.getByTestId('series-DECLARED_NEED-Glifosato-ML');

    expect(within(herb).getByTestId('point-Campaña 2024').textContent).toContain('6 L');
    const withdrawn = within(herb).getByTestId('point-Campaña 2025');
    expect(withdrawn.textContent).toMatch(/retirado/i);
    expect(withdrawn.textContent).not.toMatch(/9000|9 L/);

    // Desplegar gráfico de Herbicida: un solo punto publicado, sin segmentos; sólo campañas selladas.
    fireEvent.click(within(herb).getByRole('button', { name: /Ver gráfico/i }));
    const chart = screen.getByTestId('trend-chart');
    expect(within(chart).getAllByTestId('trend-point')).toHaveLength(1);
    expect(within(chart).queryAllByTestId('trend-segment')).toHaveLength(0);
    expect(chart.getAttribute('aria-label')).toMatch(/1 de 2 campañas con cifra publicada; las demás son huecos, no ceros/);
    expect(chart.querySelector('title')?.textContent).toBe('Campaña 2024: 6 L');
    // La campaña abierta sin sellar no se dibuja como histórico.
    expect(chart.textContent).not.toMatch(/Campaña 2026/);

    // Desplegar gráfico de Urea: dos campañas consecutivas con cifra y nota de cambios pendientes.
    fireEvent.click(within(ur).getByRole('button', { name: /Ver gráfico/i }));
    const ureaChart = screen.getByTestId('trend-chart');
    expect(within(ureaChart).getAllByTestId('trend-point')).toHaveLength(2);
    expect([...ureaChart.querySelectorAll('title')].map((t) => t.textContent)).toEqual(['Campaña 2024: 25 KG', 'Campaña 2025: 30 KG']);
    // E4: el aviso de cifra anterior ya no habla de «umbral».
    expect(within(ur).getByTestId('point-Campaña 2024').textContent).toMatch(/todavía no se publican: se muestra la cifra anterior/);

    // Desplegar gráfico de Glifosato: sin barras publicadas, huecos rotulados.
    fireEvent.click(within(gli).getByRole('button', { name: /Ver gráfico/i }));
    expect(within(screen.getByTestId('trend-chart')).queryAllByTestId('trend-point')).toHaveLength(0);
    expect(within(gli).getByTestId('point-Campaña 2025').textContent).toMatch(/sin dato/i);
    // E4 §3.4/§5.1: lo sellado con F07-POL-01 conserva su estado, rotulado con esa política (antes «Menos de 3 agricultores»).
    expect(within(gli).getByTestId('point-Campaña 2024').textContent).toMatch(/sin datos disponibles/i);

    // Alternar Ocultar cierra el gráfico desplegable.
    fireEvent.click(within(gli).getByRole('button', { name: /Ocultar/i }));
    expect(screen.queryByTestId('trend-chart')).toBeNull();

    // Sin totales entre campañas, productos ni unidades.
    expect(document.body.textContent).not.toMatch(/55 KG|36 L|Total general|Promedio/);
  });

  it('filtra por búsqueda sin tildes y por unidad sin mezclar litros ni kilogramos', async () => {
    const conAcento: TrendSeries = {
      ...glifosato,
      product_name: 'GLIFÓSATO',
    };
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([herbicida, urea, conAcento]));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    await screen.findByTestId('trends-matrix');

    const unitGroup = screen.getByTestId('trend-unit-filter');
    fireEvent.click(within(unitGroup).getByRole('button', { name: /Litros \(L\)/i }));
    expect(screen.getByTestId('series-DECLARED_NEED-Herbicida-ML')).toBeTruthy();
    expect(screen.getByTestId('series-DECLARED_NEED-GLIFÓSATO-ML')).toBeTruthy();
    expect(screen.queryByTestId('series-DECLARED_NEED-Urea-G')).toBeNull();

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'glifosato' } });
    expect(screen.getByTestId('series-DECLARED_NEED-GLIFÓSATO-ML')).toBeTruthy();
    expect(screen.queryByTestId('series-DECLARED_NEED-Herbicida-ML')).toBeNull();

    fireEvent.click(within(unitGroup).getByRole('button', { name: /Kilogramos \(KG\)/i }));
    expect(screen.getByText('Sin coincidencias')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar filtros' })[0]!);
    expect(screen.getByTestId('series-DECLARED_NEED-Herbicida-ML')).toBeTruthy();
    expect(screen.getByTestId('series-DECLARED_NEED-Urea-G')).toBeTruthy();
  });

  it('al elegir una campaña muestra todos sus productos y permite abrir su evolución histórica', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([herbicida, urea]));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    await screen.findByTestId('trends-matrix');

    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: 'c-2025' } });
    const list = screen.getByTestId('trends-campaign-list');
    expect(within(list).getByTestId('matrix-coverage').textContent).toBe('6 de 9');
    expect(within(list).getByTestId('series-DECLARED_NEED-Herbicida-ML')).toBeTruthy();
    const ureaRow = within(list).getByTestId('series-DECLARED_NEED-Urea-G');
    expect(within(ureaRow).getByTestId('point-Campaña 2025').textContent).toContain('30 KG');

    fireEvent.click(within(ureaRow).getByRole('button', { name: /Ver gráfico/i }));
    const chart = screen.getByTestId('trend-chart');
    expect([...chart.querySelectorAll('title')].map((t) => t.textContent)).toEqual(['Campaña 2024: 25 KG', 'Campaña 2025: 30 KG']);
  });

  it('identifica campaña, versión y cobertura al sellar; una campaña sin sellar no aporta cifras', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([herbicida]));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    const sealed = await screen.findByTestId('campaign-Campaña 2024');
    expect(sealed.textContent).toMatch(/Cerrada/);
    expect(sealed.textContent).toMatch(/4 de 7 con cifras publicadas/);
    expect(document.body.textContent).toMatch(/no prueba que cada agricultor\s+consumiera o necesitara más o menos/);
  });

  it('abre con «Consumo publicado»; necesidad y consumo se piden por separado con dos opciones visibles', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([]));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    await screen.findByText(/Sin datos disponibles/);
    expect(screen.getByRole('button', { name: 'Consumo publicado' }).getAttribute('aria-pressed')).toBe('true');
    expect(collectiveService.trends).toHaveBeenLastCalledWith('CONSUMPTION_TOTAL');
    const group = screen.getByRole('group', { name: 'Dato' });
    expect(within(group).getByRole('button', { name: 'Consumo publicado' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: 'Necesidad declarada' }));
    await waitFor(() => expect(collectiveService.trends).toHaveBeenLastCalledWith('DECLARED_NEED'));
    expect(within(group).getByRole('button', { name: 'Necesidad declarada' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('la matriz y el gráfico desplegable aparecen antes de «Ver campañas y cobertura»', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([herbicida]));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    const matrix = await screen.findByTestId('trends-matrix');
    const sources = screen.getByTestId('sources');
    expect(sources.textContent).toMatch(/Ver campañas y cobertura/);
    expect(matrix.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(within(screen.getByTestId('series-DECLARED_NEED-Herbicida-ML')).getByRole('button', { name: /Ver gráfico/i }));
    const chart = screen.getByTestId('trend-chart');
    expect(chart.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chart.textContent).toMatch(/L por campaña/);
  });

  it('POLICY_PENDING: sin series ni cifras', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([herbicida], 'POLICY_PENDING'));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    expect(await screen.findByText(/Sin datos disponibles/)).toBeTruthy();
    expect(screen.queryByTestId('series-DECLARED_NEED-Herbicida-ML')).toBeNull();
    expect(document.body.textContent).not.toMatch(/6 L/);
  });

  it('sin conexión: lo informa, sin datos residuales', async () => {
    vi.mocked(collectiveService.trends).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
