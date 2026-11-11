import { describe, expect, it } from 'vitest';
import { fmtCampaignDay, isEstimatedEndOverdue } from './campaign-dates';

const NOW = new Date(2026, 10, 10, 9, 0); // 10 nov 2026, hora local

describe('fechas de campaña', () => {
  it('un día de calendario guardado a medianoche UTC se muestra en su día, no en el anterior', () => {
    expect(fmtCampaignDay('2026-10-15T00:00:00.000Z')).toMatch(/15/);
    expect(fmtCampaignDay(null)).toBeNull();
    expect(fmtCampaignDay('no-es-fecha')).toBeNull();
  });

  it('«fin estimado vencido» sólo con ABIERTA, fecha anterior a hoy y sin cierre', () => {
    const open = { status: 'ABIERTA' as const, closedAt: null };
    expect(isEstimatedEndOverdue({ ...open, estimatedEndDate: '2026-11-09T00:00:00.000Z' }, NOW)).toBe(true);
    // El mismo día todavía no está vencido.
    expect(isEstimatedEndOverdue({ ...open, estimatedEndDate: '2026-11-10T00:00:00.000Z' }, NOW)).toBe(false);
    expect(isEstimatedEndOverdue({ ...open, estimatedEndDate: null }, NOW)).toBe(false);
    for (const status of ['PLANIFICADA', 'CERRADA', 'CANCELADA'] as const) {
      expect(isEstimatedEndOverdue({ status, closedAt: null, estimatedEndDate: '2026-01-01T00:00:00.000Z' }, NOW)).toBe(false);
    }
    expect(isEstimatedEndOverdue({ ...open, closedAt: '2026-11-01T10:00:00.000Z', estimatedEndDate: '2026-01-01T00:00:00.000Z' }, NOW)).toBe(false);
  });
});
