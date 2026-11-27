import type { CollectiveTrends, TrendSeries } from '../types/collective';
import { normalizeName } from './product-text';

export type HistoryUnitFilter = 'ALL' | 'L' | 'KG';

export interface HistoryScope {
  campaignId: string;
  productKey?: string | null;
  unit?: HistoryUnitFilter;
  query?: string;
}

export function historyProductKey(line: TrendSeries): string {
  return `${line.product_ref}|${line.base_unit}`;
}

/** Filtra series del histórico por unidad y búsqueda por nombre sin tildes ni mayúsculas. */
export function filterHistorySeries(
  series: readonly TrendSeries[],
  filters: { unit?: HistoryUnitFilter; query?: string } = {},
): TrendSeries[] {
  const unit = filters.unit ?? 'ALL';
  const wanted = normalizeName(filters.query ?? '');
  return series.filter((line) => {
    if (unit !== 'ALL' && line.presentation_unit !== unit) return false;
    if (wanted && !normalizeName(line.product_name).includes(wanted)) return false;
    return true;
  });
}

export function scopeHistory(history: CollectiveTrends, scope: HistoryScope): CollectiveTrends {
  const campaigns = history.campaigns.filter((campaign) =>
    campaign.seal !== null && (!scope.campaignId || campaign.campaign_ref === scope.campaignId),
  );
  const ids = new Set(campaigns.map((campaign) => campaign.campaign_ref));
  const candidates = scope.productKey
    ? history.series.filter((line) => historyProductKey(line) === scope.productKey)
    : history.series;
  const series = filterHistorySeries(candidates, { unit: scope.unit, query: scope.query })
    .map((line) => ({ ...line, points: line.points.filter((point) => ids.has(point.campaign_ref)) }))
    .filter((line) => line.points.some((point) => point.status !== 'NO_DATA' && point.status !== 'NOT_SEALED'));
  return { ...history, campaigns, series };
}
