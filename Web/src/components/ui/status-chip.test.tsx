import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { statusReason } from '../../lib/collective-text';
import type { CampaignStatus } from '../../types/campaigns';
import type { AnyStatus } from '../../types/collective';
import { StatusChip } from './status-chip';

afterEach(cleanup);

const DISCLOSURE: { status: AnyStatus; label: string }[] = [
  { status: 'DISCLOSED', label: 'Publicado' },
  { status: 'SUPPRESSED_UNDER_THRESHOLD', label: 'Oculto por privacidad' },
  { status: 'SUPPRESSED_REVISION', label: 'Sin cifra publicada' },
  { status: 'OVERFLOW', label: 'Fuera de rango' },
  { status: 'WITHDRAWN', label: 'Retirado' },
  { status: 'SUPERSEDED', label: 'Sustituido' },
  { status: 'POLICY_PENDING', label: 'Política pendiente' },
  { status: 'WITHDRAWN_AFTER_SEAL', label: 'Retirado tras sellar' },
  { status: 'NO_DATA', label: 'Sin cifra publicada' },
  { status: 'NOT_SEALED', label: 'Sin sellar' },
];

describe('StatusChip: estados de divulgación', () => {
  it.each(DISCLOSURE)('$status: texto en español y motivo en title', ({ status, label }) => {
    render(<StatusChip status={status} threshold={3} testId="chip" />);
    const chip = screen.getByTestId('chip');
    expect(chip.textContent).toBe(label);
    const reason = statusReason(status, 3);
    if (status === 'DISCLOSED') {
      expect(reason).toBeNull();
      expect(chip.getAttribute('title')).toBeNull();
    } else {
      expect(reason).toBeTruthy();
      expect(chip.getAttribute('title')).toBe(reason);
    }
  });

  it('el motivo bajo umbral usa el umbral recibido, sin conteos exactos', () => {
    render(<StatusChip status="SUPPRESSED_UNDER_THRESHOLD" threshold={5} testId="chip" />);
    expect(screen.getByTestId('chip').getAttribute('title')).toContain('Menos de 5 agricultores');
  });
});

describe('StatusChip: campañas y otros textos', () => {
  it.each<[CampaignStatus, string]>([
    ['PLANIFICADA', 'Planificada'],
    ['ABIERTA', 'Abierta'],
    ['CERRADA', 'Cerrada'],
    ['CANCELADA', 'Cancelada'],
  ])('%s → «%s», sin motivo', (status, label) => {
    render(<StatusChip status={status} testId="chip" />);
    expect(screen.getByTestId('chip').textContent).toBe(label);
    expect(screen.getByTestId('chip').getAttribute('title')).toBeNull();
  });

  it('conserva los textos del StatusBadge del armazón (bitácora y legacy)', () => {
    render(<StatusChip status="ABRIR_CAMPANA" testId="chip" />);
    expect(screen.getByTestId('chip').textContent).toBe('Abrir campaña');
  });

  it('un estado desconocido se muestra tal cual, incluso con nombres de propiedades de objeto', () => {
    for (const status of ['ESTADO_NUEVO', 'constructor', 'toString']) {
      render(<StatusChip status={status} testId="chip" />);
      expect(screen.getByTestId('chip').textContent).toBe(status);
      cleanup();
    }
  });
});
