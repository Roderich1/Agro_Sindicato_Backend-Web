import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as fixtures from '../dev/fixtures/summary-fixtures';
import '../test/render';
import type { SummaryCell } from '../types/collective';
import { NeedsBars } from './needs-bars';

const needs = fixtures.worst.summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
const row = (cell: Pick<SummaryCell, 'projection_type' | 'product_name' | 'base_unit'>) =>
  screen.getByTestId(`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`);
const byName = (name: string) => needs.find((cell) => cell.product_name === name)!;

describe('NeedsBars (variante «Analítica comparativa»)', () => {
  it('L y KG en listas y escalas separadas, ordenadas por nombre y no por cantidad', () => {
    render(<NeedsBars cells={needs} threshold={3} />);
    const liters = screen.getByRole('list', { name: 'En litros' });
    const kilos = screen.getByRole('list', { name: 'En kilogramos' });
    expect(liters.textContent).not.toMatch(/\d\s?KG\b/);
    expect(kilos.textContent).not.toMatch(/\d\s?L\b/);
    const order = within(liters)
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('data-testid'));
    expect(order).toEqual([...order].sort((a, b) => a!.localeCompare(b!, 'es', { sensitivity: 'base' })));
    // La mayor cifra de cada unidad llena su propia escala: 123456789012 en L y en KG.
    for (const list of [liters, kilos]) {
      const widths = [...list.querySelectorAll<HTMLElement>('[data-bar-track] > div')].map((bar) => bar.style.width);
      expect(widths).toContain('100%');
    }
  });

  it('cifra exacta grande en su propio elemento, con min-w-0 y overflow-wrap para no desbordar', () => {
    render(<NeedsBars cells={needs} threshold={3} />);
    const long = row(byName(fixtures.LONG_PRODUCT));
    const figure = long.querySelector<HTMLElement>('[data-figure]')!;
    expect(figure.textContent).toBe('123.456.789,012 L');
    expect(figure.className).toMatch(/min-w-0/);
    expect(figure.className).toMatch(/overflow-wrap:anywhere/);
    const name = within(long).getByText(fixtures.LONG_PRODUCT, { exact: false });
    expect(name.className).toMatch(/min-w-0/);
    expect(name.className).toMatch(/overflow-wrap:anywhere/);
    // La fila del nombre y la cifra se envuelven: en estrecho, la cifra baja a su línea.
    expect(figure.parentElement!.className).toMatch(/flex-wrap/);
    // Rediseño v2 (lámina 03): «aportantes» pasa a «agricultores».
    expect(long.textContent).toMatch(/47 agricultores · datos hasta/);
    expect(long.textContent).toMatch(/aún no alcanzan el umbral/);
  });

  it('cero publicado «0 L» sin barra; restringidas con motivo, sin barra, número ni cero', () => {
    render(<NeedsBars cells={needs} threshold={3} />);
    const zero = row(byName('Adherente agrícola no iónico'));
    // Rediseño v2: número y unidad van en dos tamaños; la cifra se lee del elemento [data-figure].
    expect(zero.querySelector('[data-figure]')!.textContent).toBe('0 L');
    expect(zero.querySelector('[data-bar-track]')).toBeNull();
    for (const status of ['SUPPRESSED_UNDER_THRESHOLD', 'SUPPRESSED_REVISION', 'OVERFLOW'] as const) {
      const cell = needs.find((entry) => entry.status === status)!;
      const element = row(cell);
      expect(element.querySelector('[data-bar-track]')).toBeNull();
      expect(element.querySelector('[data-figure]')).toBeNull();
      expect(element.textContent).not.toMatch(/\d[\d.,]*\s?(L|KG)\b/);
      expect(element.textContent).toMatch(/aportantes no revelados/);
    }
    expect(row(byName('Fungicida protectante Mancozeb 80 % WP en bolsa de 25 kg')).textContent).toMatch(/Menos de 3 agricultores/);
  });

  it('sin barras (consumo): cifras exactas sin pista de barra; singular «1 aportante»', () => {
    render(<NeedsBars cells={fixtures.one.summary.cells} threshold={3} bars={false} />);
    const only = row(fixtures.one.summary.cells[0]);
    expect(only.querySelector('[data-bar-track]')).toBeNull();
    expect(only.querySelector('[data-figure]')!.textContent).toBe('1 L');
    expect(only.textContent).toMatch(/1 agricultor(?!es)/);
  });

  it('un dato no válido del servidor se señala y no se dibuja', () => {
    render(
      <NeedsBars
        threshold={3}
        cells={[{ ...needs[0], product_name: 'Raro', total_base: '1.5', total_presentation: '0.0015' }]}
      />,
    );
    const odd = screen.getByTestId(`cell-DECLARED_NEED-Raro-ML`);
    expect(odd.textContent).toMatch(/Dato no válido/);
    expect(odd.querySelector('[data-bar-track]')).toBeNull();
    expect(odd.textContent).not.toMatch(/1[.,]5/);
  });
});
