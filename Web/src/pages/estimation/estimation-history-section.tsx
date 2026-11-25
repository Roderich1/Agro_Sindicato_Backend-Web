import { Figure, ValidityBadge } from '../../components/estimation-figure';
import { DataState, ICON, Icon, SectionHeader, secondaryButtonClass } from '../../components/ui';
import { fmtDateTime } from '../../lib/collective-text';
import { FAILURE_TEXT, formatAlpha, REASON_TEXT, RESULT_STATUS_TEXT } from '../../lib/estimation-text';
import { formatQuantity } from '../../lib/quantity';
import type { Run, RunSummary } from '../../types/estimation';
import { countsText, EXCLUSION_TEXT, KIND_TEXT, SCROLL_HINT, STICKY_EDGE } from './estimation.helpers';

export function HistorySection({
  runs,
  hasMore,
  onMore,
  onOpen,
  openedId,
}: {
  runs: RunSummary[];
  hasMore: boolean;
  onMore: () => void;
  onOpen: (id: string) => void;
  openedId: string | null;
}) {
  return (
    <section className="rounded-card border border-line bg-surface px-6 py-6 shadow-card sm:px-7" aria-labelledby="calculos-anteriores">
      <h2 id="calculos-anteriores" className="text-2xl font-bold text-ink">
        Cálculos anteriores{runs.length > 0 ? ` (${runs.length}${hasMore ? '+' : ''})` : ''}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">De la más reciente a la más antigua, incluidas las fallidas. Ninguna se modifica.</p>
      {runs.length === 0 ? (
        <DataState state="empty" compact title="Sin ejecuciones" description="" />
      ) : (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {runs.map((run) => (
            <li key={run.run_ref} className="flex items-center justify-between gap-3 py-3" data-testid="history-item">
              <div className="min-w-0 text-sm">
                <span className="block text-base font-semibold text-ink">{fmtDateTime(run.generated_at)}</span>
                <span className="text-ink-muted">Temporada {run.season.key.toLowerCase()} · </span>
                <span className="text-ink-muted" data-testid="history-outcome">
                  {run.outcome === 'CALCULATED'
                    ? `Calculada: ${countsText(run.counts)}`
                    : `Fallida. ${run.failure_code ? FAILURE_TEXT[run.failure_code] : ''}`}
                </span>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-link disabled:text-ink-muted"
                onClick={() => onOpen(run.run_ref)}
                disabled={openedId === run.run_ref}
              >
                Ver detalle
                <Icon d={ICON.chevronRight} className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="border-t border-line pt-3">
          <button type="button" className={secondaryButtonClass} onClick={onMore}>
            Cargar más
          </button>
        </div>
      )}
    </section>
  );
}

export function RunDetail({ run, onClose }: { run: Run; onClose: () => void }) {
  const useful = run.results;
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-label="Detalle de la ejecución" data-testid="run-detail">
      <SectionHeader
        title={`Ejecución del ${fmtDateTime(run.generated_at)}`}
        note={
          <>
            {run.outcome === 'CALCULATED' ? 'Calculada' : `Fallida. ${run.failure_code ? FAILURE_TEXT[run.failure_code] : ''}`} · método {run.method}{' '}
            {run.method_version} · temporada {run.season.key}. Las cifras de esta sección son las de esta ejecución.
          </>
        }
        actions={
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cerrar detalle
          </button>
        }
      />
      {useful.length === 0 ? (
        <DataState state="empty" title="Sin resultados" description="Esta ejecución no registró resultados por producto." />
      ) : (
        <div className="space-y-5 p-5">
          {useful.map((result) => (
            <div key={`${result.product.product_ref}|${result.base_unit}`} data-testid={`detail-${result.product.name}`} className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  {result.product.name} ({result.presentation_unit}) · {RESULT_STATUS_TEXT[result.status]}
                </h3>
                <ValidityBadge validity={result.validity} reason={result.validity_reason} />
              </div>
              {result.reason_code && <p className="text-xs text-slate-600">{REASON_TEXT[result.reason_code]}</p>}
              <p className="text-xs text-slate-700">
                SES:{' '}
                <Figure value={result.estimate_base} unit={result.base_unit} kind="estimate" status={result.status} validityReason={result.validity_reason} />{' '}
                · naive:{' '}
                <Figure value={result.naive_base} unit={result.base_unit} kind="naive" status={result.status} validityReason={result.validity_reason} />{' '}
                · α {formatAlpha(result.alpha)}
                {detailInformativeSuffix(result.fit_informative)}
              </p>
              {result.points.length > 0 && (
                <div className={`overflow-x-auto ${SCROLL_HINT}`}>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className={`sticky left-0 z-[1] bg-slate-50 px-3 py-2 ${STICKY_EDGE}`}>Campaña</th>
                        <th className="px-3 py-2">Clase</th>
                        <th className="px-3 py-2">Consumo publicado</th>
                        <th className="px-3 py-2">En el tramo</th>
                        <th className="px-3 py-2">Cobertura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.points.map((point) => (
                        <tr key={point.position} data-testid={`point-${point.campaign.name}`}>
                          <td className={`sticky left-0 z-[1] min-w-28 bg-white px-3 py-2 [overflow-wrap:anywhere] ${STICKY_EDGE}`}>{point.campaign.name}</td>
                          <td className="px-3 py-2">{KIND_TEXT[point.kind]}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {point.kind === 'VERIFIED_CONSUMPTION' && point.quantity_base !== null
                              ? formatQuantity(point.quantity_base, result.base_unit) ?? 'Cifra no válida'
                              : 'Sin cifra'}
                          </td>
                          <td className="px-3 py-2">{point.in_span ? 'Sí' : point.exclusion_reason ? `No: ${EXCLUSION_TEXT[point.exclusion_reason]}` : 'No'}</td>
                          <td className="px-3 py-2">
                            {point.coverage.status === 'IDENTIFIED'
                              ? `${point.coverage.members_in_published_figures} de ${point.coverage.linked_members}`
                              : 'Desconocida'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function detailInformativeSuffix(fitInformative: boolean | null): string {
  return fitInformative === false ? ' (ajuste no informativo)' : '';
}
