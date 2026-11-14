import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../../types/campaigns';
import { CampaignPill } from './campaign-pill';
import { DataTable } from './data-table';
import { Dialog } from './dialog';
import { PageHeader } from './page-header';
import { QuantityFigure } from './quantity-figure';
import { Tabs } from './tabs';

afterEach(cleanup);

/** Peticiones de A, B y C a la base (2026-11-13). */
describe('Tabs variant="pill"', () => {
  it('conserva el ARIA y las flechas; el recuento va entre paréntesis', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        variant="pill"
        label="Borrador de compra"
        idBase="b"
        value="actual"
        onChange={onChange}
        tabs={[
          { value: 'actual', label: 'Borrador actual' },
          { value: 'anteriores', label: 'Borradores anteriores', count: 4 },
          { value: 'calculo', label: 'Cómo se calculó' },
        ]}
        testId="t"
      />,
    );
    expect(screen.getByTestId('t').getAttribute('data-variant')).toBe('pill');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs[1]!.textContent).toBe('Borradores anteriores (4)');
    expect(tabs[0]!.className).toContain('bg-ink');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('calculo');
  });
});

describe('DataTable: testid por fila y tarjetas en modo libre', () => {
  it('modo declarativo: data-testid por fila', () => {
    render(
      <DataTable
        caption="Filas"
        columns={[{ key: 'n', header: 'Nombre', cell: (row: { id: string }) => row.id }]}
        rows={[{ id: 'a' }, { id: 'b' }]}
        rowTestId={(row) => `fila-${row.id}`}
      />,
    );
    expect(screen.getByTestId('fila-b').textContent).toBe('b');
  });

  it('modo libre con stack: cada celda toma el texto de su encabezado (respeta colSpan y data-label propio)', () => {
    render(
      <DataTable caption="Libre" stack>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Unidad</th>
            <th>Necesidad</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Urea</td>
            <td>kg</td>
            <td data-label="Necesidad declarada">1.046,7 kg</td>
          </tr>
          <tr>
            <td colSpan={2}>Fila combinada</td>
            <td>—</td>
          </tr>
        </tbody>
      </DataTable>,
    );
    const table = screen.getByRole('table', { name: 'Libre' });
    expect(table.className).toContain('ui-table-stack');
    const cells = within(table).getAllByRole('cell');
    expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual(['Producto', 'Unidad', 'Necesidad declarada', 'Producto', 'Necesidad']);
  });

  it('modo libre sin stack: igual que antes (sin tarjetas ni data-label)', () => {
    render(
      <DataTable caption="Antes">
        <thead>
          <tr>
            <th>Producto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Urea</td>
          </tr>
        </tbody>
      </DataTable>,
    );
    expect(screen.getByRole('table').className).not.toContain('ui-table-stack');
    expect(screen.getByRole('cell').getAttribute('data-label')).toBeNull();
  });
});

describe('PageHeader attachToHeader', () => {
  it('un solo h1, oscuro en teléfono y claro en escritorio; la acción principal es lima en teléfono', () => {
    const onClick = vi.fn();
    render(
      <PageHeader
        attachToHeader
        title="Campañas"
        eyebrow="Sindicato sintético"
        eyebrowPhoneOnly
        primaryAction={{ label: 'Nueva campaña', onClick, testId: 'nueva' }}
        testId="cab"
      />,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const header = screen.getByTestId('cab');
    expect(header.className).toMatch(/ui-hero-attach/);
    expect(header.className).toMatch(/bg-ink/);
    expect(header.className).toMatch(/lg:bg-transparent/);
    expect(screen.getByText('Sindicato sintético').className).toContain('lg:hidden');
    const action = screen.getByTestId('nueva');
    expect(action.className).toMatch(/bg-lime/);
    expect(action.className).toMatch(/lg:bg-ink/);
    fireEvent.click(action);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sin attachToHeader no cambia', () => {
    render(<PageHeader title="Catálogo" testId="cab" />);
    expect(screen.getByTestId('cab').className).toBe('flex flex-col gap-4');
  });
});

describe('Dialog fullScreenOnPhone', () => {
  it('pantalla completa en teléfono, sin asa; por defecto sigue la hoja inferior', () => {
    const { unmount } = render(
      <Dialog title="Nueva convocatoria" onClose={() => undefined} fullScreenOnPhone>
        <p>formulario</p>
      </Dialog>,
    );
    const panel = screen.getByRole('dialog', { name: 'Nueva convocatoria' });
    expect(panel.getAttribute('data-fullscreen-phone')).toBe('true');
    expect(panel.className).toMatch(/h-dvh/);
    expect(panel.className).not.toMatch(/rounded-t-/);
    unmount();
    render(
      <Dialog title="Cancelar" onClose={() => undefined}>
        <p>x</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Cancelar' }).className).toMatch(/rounded-t-\[28px\]/);
  });
});

describe('Promovidos desde A', () => {
  it('QuantityFigure parte número y unidad sin cambiar el texto', () => {
    const { container } = render(<QuantityFigure text="1.046,7 KG" prefix="≈ " />);
    expect(container.textContent).toBe('≈ 1.046,7 KG');
  });

  it('CampaignPill lista todas las campañas con su estado y «Activa» sólo para la marcada', () => {
    const base = { startDate: '2026-01-01', estimatedEndDate: null, closedAt: null, notes: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const campaigns = [
      { ...base, id: 'c1', name: 'Invierno', status: 'ABIERTA', isActive: true },
      { ...base, id: 'c2', name: 'Verano', status: 'ABIERTA', isActive: false },
    ] as Campaign[];
    const onSelect = vi.fn();
    render(<CampaignPill campaigns={campaigns} selected="c1" onSelect={onSelect} />);
    const select = screen.getByRole('combobox', { name: 'Campaña' });
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Invierno · Abierta · Activa', 'Verano · Abierta']);
    fireEvent.change(select, { target: { value: 'c2' } });
    expect(onSelect).toHaveBeenCalledWith('c2');
  });
});
