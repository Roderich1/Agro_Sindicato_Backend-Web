import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from './data-table';

afterEach(cleanup);

describe('DataTable', () => {
  it('región desplazable con nombre, enfocable, título de tabla y ancho mínimo', () => {
    render(
      <DataTable caption="Borradores de la campaña" minWidth={640} maxHeight={320} testId="table">
        <thead>
          <tr>
            <th>Generado el</th>
            <th className="ui-num">Líneas</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>12 nov. 2026</td>
            <td className="ui-num">2</td>
          </tr>
        </tbody>
      </DataTable>,
    );
    const region = screen.getByRole('region', { name: 'Borradores de la campaña' });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.style.maxHeight).toBe('320px');
    const table = screen.getByRole('table', { name: 'Borradores de la campaña' });
    expect(table.style.minWidth).toBe('640px');
    expect(table.className).toContain('ui-table');
  });
});
