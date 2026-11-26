import type { CollectiveTrends, TrendSeries } from '../types/collective';

export interface HistoryScope {
  campaignId: string;
  productKey?: string | null;
}

export function historyProductKey(line: TrendSeries): string {
  return `${line.product_ref}|${line.base_unit}`;
}

export function scopeHistory(history: CollectiveTrends, scope: HistoryScope): CollectiveTrends {
  const campaigns = history.campaigns.filter((campaign) =>
    campaign.seal !== null && (!scope.campaignId || campaign.campaign_ref === scope.campaignId),
  );
  const ids = new Set(campaigns.map((campaign) => campaign.campaign_ref));
  const series = history.series
    .filter((line) => !scope.productKey || historyProductKey(line) === scope.productKey)
    .map((line) => ({ ...line, points: line.points.filter((point) => ids.has(point.campaign_ref)) }))
    .filter((line) => line.points.some((point) => point.status !== 'NO_DATA' && point.status !== 'NOT_SEALED'));
  return { ...history, campaigns, series };
}
