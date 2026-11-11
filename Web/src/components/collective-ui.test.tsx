import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { statusReason } from '../lib/collective-text';
import type { AnyStatus } from '../types/collective';
import { MemoryRouter } from 'react-router-dom';
import { ComparisonBars, CoverageBanner, StatusBadge, type BarRow } from './collective-ui';

afterEach(cleanup);

/** Rediseño 2026-11-10: el StatusBadge colectivo delega en StatusChip sin cambiar sus reglas. */
describe('StatusBadge colectivo (delegado en StatusChip)', () => {
  it('mismo texto y motivo en title', () => {
    render(<StatusBadge status="SUPPRESSED_UNDER_THRESHOLD" threshold={3} />);
    const chip = screen.getByText('Oculto por privacidad');
    expect(chip.getAttribute('title')).toBe(statusReason('SUPPRESSED_UNDER_THRESHOLD', 3));
  });

  it('un estado desconocido se muestra como «Política pendiente», nunca como código en bruto', () => {
    render(<StatusBadge status={'ESTADO_FUTURO' as AnyStatus} />);
    expect(screen.getByText('Política pendiente')).toBeTruthy();
    expect(screen.queryByText('ESTADO_FUTURO')).toBeNull();
  });
});

/** Etapa 2 (peticiones de B y C). */
describe('CoverageBanner y ComparisonBars: cifras grandes', () => {
  it('la cobertura usa separador de miles es-BO', () => {
    render(
      <MemoryRouter>
        <CoverageBanner coverage={{ linked_members: 2000, members_with_contribution: 1234, suppressed_cells: false }} campaignName="Campaña sintética" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('coverage').textContent).toContain('1.234 de 2.000');
  });

  it('una cifra larga puede pasar a su propia línea: la fila no fija un ancho que desborde', () => {
    const row: BarRow = {
      key: 'p|ML',
      testId: 'bar-largo',
      name: 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L',
      unit: 'L',
      status: 'DISCLOSED',
      base: '123456789012',
      presentation: '123456789.012',
      contributors: 31,
      asOf: null,
      pending: false,
    };
    render(<ComparisonBars rows={[row]} unit="L" threshold={3} />);
    const figure = screen.getByText('123.456.789,012 L');
    expect(figure.className).toContain('min-w-44');
    expect(figure.className).not.toMatch(/(^|\s)w-44/);
    expect(figure.parentElement!.className).toContain('flex-wrap');
  });
});
