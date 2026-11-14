import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { point, trendsWith } from '../test/fixtures';
import { renderAt } from '../test/render';
import type { TrendSeries } from '../types/collective';
import { CollectiveTrendsPage } from './collective-trends.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { trends: vi.fn() },
}));

const urea: TrendSeries = {
  projection_type: 'CONSUMPTION_TOTAL',
  product_ref: 'p-urea',
  product_name: 'Urea',
  base_unit: 'G',
  presentation_unit: 'KG',
  points: [
    point('c-2024', { total_base: '25000', total_presentation: '25', contributors: 3 }),
    point('c-2025', { total_base: '30000', total_presentation: '30', contributors: 4 }),
    point('c-2026', { status: 'NOT_SEALED' }),
  ],
};

/** Rediseño v2 (láminas 25 y 40), H-10 provisional y F07 §8. */
describe('Histórico sellado v2', () => {
  beforeEach(() => {
    vi.mocked(collectiveService.trends).mockReset().mockResolvedValue(trendsWith([urea]));
  });

  it('la cobertura de cada campaña sellada va junto a la serie, sin pasar el ratón', async () => {
    renderAt(<CollectiveTrendsPage />, { path: '/colectivo/tendencias' });
    const chart = await screen.findByTestId('trend-chart');
    expect(within(chart).getAllByTestId('trend-coverage').map((node) => node.textContent)).toEqual(['4 de 7', '6 de 9']);
    const compact = screen.getByTestId('trend-chart-compact');
    expect(compact.textContent).toMatch(/Cobertura al sellar: 4 de 7/);
    expect(compact.textContent).toMatch(/Cobertura al sellar: 6 de 9/);
  });

  it('H-10: no destaca el máximo ni lo nombra; sin totales, medias, diferencias ni tasas', async () => {
    renderAt(<CollectiveTrendsPage />, { path: '/colectivo/tendencias' });
    const chart = await screen.findByTestId('trend-chart');
    // Todas las columnas con el mismo relleno: ninguna resaltada.
    const fills = new Set([...chart.querySelectorAll('[data-testid="trend-point"]')].map((bar) => bar.getAttribute('fill')));
    expect(fills).toEqual(new Set(['currentColor']));
    expect(document.body.textContent).not.toMatch(/más alta|mayor consumo|máximo|\bTotal\b|\bPromedio\b|\bmedia\b|%/i);
    const help = screen.getByTestId('how-to-read');
    expect(help.textContent).toMatch(/Solo entran campañas selladas/);
    expect(help.textContent).toMatch(/Campaña 2026 no está sellada: no se dibuja/);
    expect(within(help).getByRole('link', { name: 'Ver campañas y cobertura' }).getAttribute('href')).toBe('/campaigns');
  });
});
