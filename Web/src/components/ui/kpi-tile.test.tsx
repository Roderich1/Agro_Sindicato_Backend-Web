import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KpiTile } from './kpi-tile';

afterEach(cleanup);

describe('KpiTile', () => {
  it('etiqueta, cifra recibida tal cual y nota; el tono se marca sin cambiar el texto', () => {
    render(<KpiTile label="Agricultores con cifras publicadas" value="3 de 4" note="Ausencia de aporte = desconocido, no cero." tone="attention" testId="kpi" />);
    const tile = screen.getByTestId('kpi');
    expect(tile.textContent).toBe('Agricultores con cifras publicadas3 de 4Ausencia de aporte = desconocido, no cero.');
    expect(tile.getAttribute('data-tone')).toBe('attention');
  });
});
