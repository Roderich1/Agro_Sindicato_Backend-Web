import { describe, expect, it } from 'vitest';
import { formatQuantity } from '../../lib/quantity';
import * as campaigns from './campaigns-fixtures';
import * as summaries from './summary-fixtures';

const SCENARIOS = {
  demo: summaries.demo,
  worst: summaries.worst,
  worstSealed: summaries.worstSealed,
  worstClosedUnsealed: summaries.worstClosedUnsealed,
  worstPolicyPending: summaries.worstPolicyPending,
  empty: summaries.empty,
  one: summaries.one,
};

/** Los fixtures deben ser respuestas que el servidor podría dar (salvo lo anotado en `one`/`worstSealed`). */
describe('fixtures sintéticos de B', () => {
  it.each(Object.entries(SCENARIOS))('%s: la campaña consultada está en la lista y el resumen la nombra', (_, fixture) => {
    const row = fixture.campaigns.find((entry) => entry.id === fixture.selected);
    expect(row).toBeTruthy();
    expect(fixture.summary.campaign).toEqual({ campaign_ref: row!.id, name: row!.name, status: row!.status });
    // Sellada: la Web no pide el estado del sellado; sin sellar, siempre hay respuesta.
    expect(fixture.sealState === null).toBe(fixture.summary.seal !== null);
  });

  it.each(Object.entries(SCENARIOS))('%s: toda cifra publicada es exacta y coincide con su presentación', (_, fixture) => {
    for (const entry of fixture.summary.cells) {
      if (entry.status === 'DISCLOSED') {
        expect(formatQuantity(entry.total_base, entry.base_unit, entry.total_presentation)).not.toBeNull();
        expect(entry.data_as_of).not.toBeNull();
      } else if (entry.status !== 'WITHDRAWN_AFTER_SEAL') {
        expect(entry.total_base).toBeNull();
      }
      expect(entry.presentation_unit).toBe(entry.base_unit === 'G' ? 'KG' : 'L');
    }
  });

  it('worst: varias ABIERTA, una sola activa, CERRADA con cierre, CANCELADA y nombres que sólo difieren en mayúsculas', () => {
    const list = campaigns.worst;
    expect(list.filter((entry) => entry.status === 'ABIERTA').length).toBeGreaterThan(1);
    expect(list.filter((entry) => entry.isActive).length).toBe(1);
    expect(list.some((entry) => entry.status === 'CERRADA' && entry.closedAt)).toBe(true);
    expect(list.some((entry) => entry.status === 'CANCELADA')).toBe(true);
    const lower = list.map((entry) => entry.name.trim().toLowerCase());
    expect(new Set(lower).size).toBeLessThan(lower.length);
    // El índice único (tenantId, name) impide el duplicado exacto.
    expect(new Set(list.map((entry) => entry.name)).size).toBe(list.length);
    expect(list.every((entry) => entry.name.length >= 2 && entry.name.length <= 160)).toBe(true);
  });

  it('worst: L y KG, cantidades grandes y pequeñas, celdas sin cifra y cambios pendientes', () => {
    const cells = summaries.worst.summary.cells;
    expect(new Set(cells.map((entry) => entry.presentation_unit))).toEqual(new Set(['L', 'KG']));
    expect(cells.map((entry) => entry.total_base)).toEqual(expect.arrayContaining(['123456789012', '25']));
    for (const status of ['SUPPRESSED_UNDER_THRESHOLD', 'SUPPRESSED_REVISION', 'OVERFLOW'] as const) {
      expect(cells.some((entry) => entry.status === status)).toBe(true);
    }
    expect(cells.some((entry) => entry.pending_changes)).toBe(true);
    const coverage = summaries.worst.summary.coverage!;
    for (const entry of cells) expect(entry.contributors ?? 0).toBeLessThanOrEqual(coverage.members_with_contribution);
  });
});
