import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { point, trendsWith } from '../test/fixtures';
import { renderAt } from '../test/render';
import type { TrendSeries } from '../types/collective';
import { CollectiveTrendsPage } from './collective-trends.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { trends: vi.fn(), trendsCsv: vi.fn() },
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
    const herb = await screen.findByTestId('series-DECLARED_NEED-Herbicida-ML');
    expect(within(herb).getByTestId('point-Campaña 2024').textContent).toContain('6 L');
    const withdrawn = within(herb).getByTestId('point-Campaña 2025');
    expect(withdrawn.textContent).toMatch(/retiró su aporte después del sellado/);
    expect(withdrawn.textContent).not.toMatch(/9000|9 L/);
    expect(within(herb).getByTestId('point-Campaña 2026').textContent).toMatch(/no tiene una versión sellada/);
    // Gráfico: un solo punto publicado y ninguna línea hacia un hueco.
    expect(within(herb).getAllByTestId('trend-point')).toHaveLength(1);
    expect(within(herb).queryAllByTestId('trend-segment')).toHaveLength(0);
    expect(within(herb).getByRole('img').getAttribute('aria-label')).toMatch(/1 de 3 campañas con cifra publicada; las demás son huecos, no ceros/);
    expect(herb.querySelector('svg title')?.textContent).toBe('Campaña 2024: 6 L');

    // Dos campañas consecutivas con cifra: un segmento; la tercera es un hueco.
    const ur = screen.getByTestId('series-DECLARED_NEED-Urea-G');
    expect(within(ur).getAllByTestId('trend-point')).toHaveLength(2);
    expect(within(ur).getAllByTestId('trend-segment')).toHaveLength(1);
    expect(within(ur).getByTestId('point-Campaña 2024').textContent).toMatch(/aún no alcanzan el umbral/);
    expect([...ur.querySelectorAll('svg title')].map((t) => t.textContent)).toEqual(['Campaña 2024: 25 KG', 'Campaña 2025: 30 KG']);

    const gli = screen.getByTestId('series-DECLARED_NEED-Glifosato-ML');
    expect(within(gli).queryAllByTestId('trend-point')).toHaveLength(0);
    expect(within(gli).getByTestId('point-Campaña 2025').textContent).toMatch(/No significa cero/);
    expect(within(gli).getByTestId('point-Campaña 2024').textContent).toMatch(/Menos de 3 agricultores/);

    // Sin totales entre campañas, productos ni unidades.
    expect(document.body.textContent).not.toMatch(/55 KG|36 L|Total general|Promedio/);
  });

  it('identifica campaña, versión y cobertura al sellar; una campaña sin sellar no aporta cifras', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([herbicida]));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    const sealed = await screen.findByTestId('campaign-Campaña 2024');
    expect(sealed.textContent).toMatch(/Versión 1, sellada el/);
    expect(sealed.textContent).toMatch(/4 de 7 con cifras publicadas/);
    expect(screen.getByTestId('campaign-Campaña 2026').textContent).toMatch(/Sin sellar: no aporta cifras/);
    expect(document.body.textContent).toMatch(/no prueba que cada agricultor\s+consumiera o necesitara más o menos/);
  });

  it('necesidad y consumo se piden por separado', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([]));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    await screen.findByText(/Sin series selladas/);
    expect(collectiveService.trends).toHaveBeenLastCalledWith('DECLARED_NEED');
    fireEvent.change(screen.getByLabelText(/Dato/), { target: { value: 'CONSUMPTION_TOTAL' } });
    await waitFor(() => expect(collectiveService.trends).toHaveBeenLastCalledWith('CONSUMPTION_TOTAL'));
  });

  it('POLICY_PENDING: sin series ni cifras', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([herbicida], 'POLICY_PENDING'));
    renderAt(<CollectiveTrendsPage />, { path: PATH });
    expect(await screen.findByText(/Sin cifras colectivas/)).toBeTruthy();
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
