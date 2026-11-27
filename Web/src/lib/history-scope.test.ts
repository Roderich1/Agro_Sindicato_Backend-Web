import { describe, expect, it } from 'vitest';
import { point, trendsWith } from '../test/fixtures';
import type { TrendSeries } from '../types/collective';
import { filterHistorySeries, scopeHistory } from './history-scope';

const glifosato: TrendSeries = {
  projection_type: 'CONSUMPTION_TOTAL',
  product_ref: 'p-gli',
  product_name: 'GLIFÓSATO',
  base_unit: 'ML',
  presentation_unit: 'L',
  points: [
    point('c-2024', { total_base: '6000', total_presentation: '6', contributors: 3 }),
    point('c-2025', { status: 'NO_DATA' }),
    point('c-2026', { status: 'NOT_SEALED' }),
  ],
};

const urea: TrendSeries = {
  projection_type: 'CONSUMPTION_TOTAL',
  product_ref: 'p-urea',
  product_name: 'Urea granulada',
  base_unit: 'G',
  presentation_unit: 'KG',
  points: [
    point('c-2024', { status: 'NO_DATA' }),
    point('c-2025', { total_base: '30000', total_presentation: '30', contributors: 4 }),
    point('c-2026', { status: 'NOT_SEALED' }),
  ],
};

const herbicida: TrendSeries = {
  projection_type: 'CONSUMPTION_TOTAL',
  product_ref: 'p-herb',
  product_name: 'Herbicida selectivo',
  base_unit: 'ML',
  presentation_unit: 'L',
  points: [
    point('c-2024', { total_base: '12000', total_presentation: '12', contributors: 5 }),
    point('c-2025', { total_base: '15000', total_presentation: '15', contributors: 6 }),
    point('c-2026', { status: 'NOT_SEALED' }),
  ],
};

describe('filterHistorySeries', () => {
  const all = [glifosato, urea, herbicida];

  it('busca por nombre sin distinguir tildes, mayúsculas ni espacios repetidos', () => {
    expect(filterHistorySeries(all, { query: '  glifosato ' })).toEqual([glifosato]);
    expect(filterHistorySeries(all, { query: 'UREA   granulada' })).toEqual([urea]);
  });

  it('filtra por unidad sin mezclar litros y kilogramos', () => {
    expect(filterHistorySeries(all, { unit: 'L' })).toEqual([glifosato, herbicida]);
    expect(filterHistorySeries(all, { unit: 'KG' })).toEqual([urea]);
    expect(filterHistorySeries(all, { unit: 'ALL' })).toEqual(all);
  });

  it('combina unidad y búsqueda de producto', () => {
    expect(filterHistorySeries(all, { unit: 'L', query: 'selectivo' })).toEqual([herbicida]);
    expect(filterHistorySeries(all, { unit: 'KG', query: 'glifosato' })).toEqual([]);
  });
});

describe('scopeHistory', () => {
  const history = trendsWith([glifosato, urea, herbicida]);

  it('excluye campañas sin sellar y conserva sólo puntos válidos por campaña', () => {
    const scoped = scopeHistory(history, { campaignId: '' });
    expect(scoped.campaigns.map((c) => c.campaign_ref)).toEqual(['c-2024', 'c-2025']);
    expect(scoped.series.map((s) => s.product_ref)).toEqual(['p-gli', 'p-urea', 'p-herb']);
    expect(scoped.series[0]!.points.map((p) => p.campaign_ref)).toEqual(['c-2024', 'c-2025']);
  });

  it('filtra por campaña específica y descarta series sin cifras ni motivos en ella', () => {
    const c2024 = scopeHistory(history, { campaignId: 'c-2024' });
    expect(c2024.campaigns.map((c) => c.campaign_ref)).toEqual(['c-2024']);
    expect(c2024.series.map((s) => s.product_ref)).toEqual(['p-gli', 'p-herb']);
  });

  it('aplica unidad, búsqueda y productKey sobre la respuesta completa', () => {
    const byUnitAndQuery = scopeHistory(history, { campaignId: '', unit: 'L', query: 'gli' });
    expect(byUnitAndQuery.series.map((s) => s.product_ref)).toEqual(['p-gli']);

    const byKey = scopeHistory(history, { campaignId: '', productKey: 'p-urea|G' });
    expect(byKey.series.map((s) => s.product_ref)).toEqual(['p-urea']);
  });
});
