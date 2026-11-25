import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StatusChip } from '../../../components/ui';
import { fmtDateTime } from '../../../lib/collective-text';
import type { CollectiveSummary } from '../../../types/collective';
import {
  attention as attentionOf,
  coverageLink,
  coverageView,
  counts,
  countsText,
  fmtCount,
  latestDataAsOf,
  plural,
  versionView,
  type Attention,
  type EstimationView,
  type Order,
} from './model';

export const ORDER_OPTIONS: { value: Order; label: string }[] = [
  { value: 'cantidad', label: 'Mayor a menor' },
  { value: 'nombre', label: 'Por nombre' },
];

export interface Stat {
  key: string;
  label: string;
  value: ReactNode;
  suffix?: ReactNode;
  note?: ReactNode;
  testId?: string;
  /** Cifra menor (fechas, texto): no compite con los números. */
  small?: boolean;
}

export function statsFor(summary: CollectiveSummary, options: { estimation?: EstimationView | null; coverageLinked?: boolean; latest?: boolean } = {}): Stat[] {
  const stats: Stat[] = [];
  const campaignId = summary.campaign.campaign_ref;
  if (summary.coverage) {
    const view = coverageView(summary.coverage, summary.seal?.sealed_at);
    stats.push({
      key: 'coverage',
      label: view.title,
      value: <span data-testid="coverage-value">{view.ratio}</span>,
      suffix: (
        <>
          {view.noun}
          {view.percent && <span className="text-slate-600 tabular-nums"> ({view.percent})</span>}
        </>
      ),
      note: (
        <>
          {view.notes.join(' ')} Mide participación, no datos completos (ausencia = desconocido, no cero).{' '}
          {options.coverageLinked !== false && (
            <Link to={coverageLink(campaignId)} className="font-semibold text-brand-800 underline underline-offset-2 hover:text-ink">
              Ver cobertura
            </Link>
          )}
        </>
      ),
      testId: 'coverage',
    });
  }
  const c = counts(summary);
  if (summary.disclosure.mode === 'PROVISIONAL_SYNTHETIC') {
    stats.push({
      key: 'needs',
      label: 'Necesidades declaradas',
      value: c.total === 0 ? 'Ninguna' : `${fmtCount(c.published)} de ${fmtCount(c.total)}`,
      suffix: c.total === 0 ? 'publicada' : 'productos con cifra publicada',
      note: <span data-testid="needs-counts">{countsText(c)}</span>,
      small: c.total === 0,
    });
  }
  const estimation = options.estimation;
  if (estimation && estimation.kind !== 'none') {
    stats.push({
      key: 'estimation',
      label: 'Estimación del consumo',
      value:
        estimation.kind === 'results' ? (estimation.current + estimation.outdated === 0 ? 'Sin cifras' : `${fmtCount(estimation.current)} de ${fmtCount(c.total)}`) : estimation.kind === 'policy' ? 'Restringida' : estimation.kind === 'loading' ? 'Cargando…' : 'Sin respuesta',
      suffix: estimation.kind === 'results' && estimation.current + estimation.outdated > 0 ? 'productos con referencia vigente' : undefined,
      note:
        estimation.kind === 'results'
          ? `${estimation.outdated > 0 ? `${plural(estimation.outdated, 'desactualizada', 'desactualizadas')} · ` : ''}${plural(estimation.without, 'sin referencia', 'sin referencia')} · vigencia evaluada el ${fmtDateTime(estimation.results.evaluated_at)}`
          : estimation.kind === 'policy'
            ? 'La política de divulgación no está aprobada: no se muestran cifras estimadas.'
            : estimation.kind === 'error'
              ? estimation.text
              : null,
      testId: 'estimation-stat',
      small: estimation.kind !== 'results' || estimation.current + estimation.outdated === 0,
    });
  }
  const version = versionView(summary.seal, summary.campaign.status);
  stats.push({
    key: 'version',
    label: 'Versión',
    value: version.label,
    suffix: version.sealed ? undefined : <StatusChip status={summary.campaign.status} />,
    note: version.detail,
    testId: version.sealed ? 'seal-banner' : 'version-tile',
    small: true,
  });
  const latest = options.latest === false ? null : latestDataAsOf(summary.cells);
  if (latest) {
    stats.push({
      key: 'latest',
      label: 'Cifra más reciente: datos hasta',
      value: fmtDateTime(latest),
      note: 'Última aceptación central entre las cifras publicadas; cada cifra lleva su propia fecha en la tabla completa.',
      testId: 'latest-figure',
      small: true,
    });
  }
  return stats;
}

export function attentionItems(summary: CollectiveSummary | null, noActive: boolean, estimation: EstimationView | null): Attention[] {
  return attentionOf(summary, noActive, estimation);
}
