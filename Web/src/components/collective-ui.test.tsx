import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { statusReason } from '../lib/collective-text';
import type { AnyStatus } from '../types/collective';
import { StatusBadge } from './collective-ui';

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
