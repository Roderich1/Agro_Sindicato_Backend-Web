import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Figure, ValidityBadge } from '../../components/estimation-figure';
import { Button, DataState, FilterChips, Notice, SearchInput } from '../../components/ui';
import { fmtDateTime } from '../../lib/collective-text';
import type { StoredCopy } from '../../lib/estimation-copy';
import { formatAlpha, JOB_STATUS_TEXT, REASON_TEXT, RESULT_STATUS_TEXT, STOP_TEXT } from '../../lib/estimation-text';
import { ESTIMATION_COPY_PATH } from '../../lib/navigation';
import { normalizeName } from '../../lib/product-text';
import type { CatalogEntry } from '../../types/collective';
import type { InstitutionalResult, InstitutionalResults, Job, ResultDetail, Run } from '../../types/estimation';
import { detailOf, lastObservedCampaign, observed, observedValues, SCROLL_HINT } from './estimation.helpers';

type ResultFilter = 'ALL' | 'L' | 'KG' | 'ESTIMATED' | 'NO_FIGURE';

const RESULT_FILTERS: { value: ResultFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'L', label: 'Litros' },
  { value: 'KG', label: 'Kilogramos' },
  { value: 'ESTIMATED', label: 'Estimados' },
  { value: 'NO_FIGURE', label: 'Sin cifra' },
];

/**
 * F12-EST-07-WEB (#180): la copia para consultar sin conexión. Se descarga a
 * petición y con conexión; es distinta del Excel de la consulta.
 */
export function CopyPanel({
  copy,
  offline,
  downloading,
  note,
  onDownload,
}: {
  copy: StoredCopy | null;
  offline: boolean;
  downloading: boolean;
  note: string | null;
  onDownload: () => void;
}) {
  return (
    <section className="rounded-card border border-line bg-surface px-6 py-6 shadow-card sm:px-7" aria-labelledby="llevarla-sin-conexion" data-testid="copy-panel">
      <h2 id="llevarla-sin-conexion" className="text-2xl font-bold text-ink">
        Llevarla sin conexión
      </h2>
      <p className="mt-2 text-base leading-relaxed text-ink-muted">
        Guarde una copia en este navegador para consultarla sin internet. Es distinta del Excel: sólo la lee esta sesión y sin conexión puede
        estar desactualizada.
      </p>
      <div className="mt-4">
        <Button variant="secondary" block onClick={onDownload} disabled={downloading || offline} busy={downloading}>
          {downloading ? 'Guardando…' : 'Guardar copia'}
        </Button>
      </div>
      <div className="mt-3 space-y-1 text-sm text-ink-muted">
        <p data-testid="copy-status">
          {copy
            ? `Hay una copia de esta campaña en este navegador, descargada el ${fmtDateTime(copy.download.downloaded_at)}.`
            : offline
              ? 'No hay una estimación descargada de esta campaña en este navegador. Sin conexión no se muestra ninguna cifra.'
              : 'No hay una copia de esta campaña en este navegador.'}
          {copy && (
            <>
              {' '}
              <Link className="font-semibold text-link underline" to={ESTIMATION_COPY_PATH}>
                Ver las copias descargadas
              </Link>
            </>
          )}
        </p>
        {note && (
          <p className="text-sm text-ink" data-testid="copy-note">
            {note}
          </p>
        )}
        {offline && <p>Guardar una copia requiere conexión.</p>}
      </div>
    </section>
  );
}

/**
 * Opciones de la solicitud. El botón «Generar estimación» está en la barra;
 * aquí sólo la elección opcional de productos y el motivo por el que no se
 * puede generar.
 */
export function RequestOptions({
  eligible,
  campaignStatus,
  catalog,
  chosen,
  onChoose,
}: {
  eligible: boolean;
  campaignStatus: string | null;
  catalog: CatalogEntry[] | null;
  chosen: string[];
  onChoose: (refs: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const toggle = (ref: string) => onChoose(chosen.includes(ref) ? chosen.filter((r) => r !== ref) : [...chosen, ref]);
  const hasCatalog = Boolean(catalog && catalog.length > 0);
  const wanted = normalizeName(query);
  const visibleCatalog = (catalog ?? []).filter((entry) => !wanted || normalizeName(entry.product_name).includes(wanted));
  return (
    <section className="space-y-2 text-sm" aria-label="Opciones de la estimación">
      {!eligible && campaignStatus && (
        <p className="text-xs text-ink-muted" data-testid="not-eligible">
          Esta campaña está {campaignStatus.toLowerCase()}: sólo se genera una estimación para una campaña planificada o
          abierta. Sus resultados anteriores siguen consultándose abajo.
        </p>
      )}
      {hasCatalog && eligible && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-ink">
            <span className="text-link group-open:hidden">Elegir productos</span>
            <span className="hidden text-link group-open:inline">Ocultar productos</span>
            {' · '}
            {chosen.length > 0 ? `${chosen.length} elegidos` : 'todos los que tienen consumo publicado'}
          </summary>
          <div className="mt-2 space-y-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
            {catalog!.length > 6 && (
              <SearchInput
                label="Filtrar productos del catálogo"
                placeholder="Buscar producto…"
                value={query}
                onChange={setQuery}
                autoComplete="off"
                fieldClassName="w-full sm:max-w-72"
              />
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {visibleCatalog.map((entry) => (
                <label key={entry.product_ref} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input type="checkbox" className="h-4 w-4 rounded accent-ink" checked={chosen.includes(entry.product_ref)} onChange={() => toggle(entry.product_ref)} />
                  {entry.product_name}
                </label>
              ))}
            </div>
          </div>
        </details>
      )}
    </section>
  );
}

export function JobPanel({ job, polling, onRecheck }: { job: Job; polling: boolean; onRecheck: () => void }) {
  const active = job.status === 'QUEUED' || job.status === 'RUNNING';
  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border px-4 py-3 ${
        active ? 'border-line bg-sunken' : 'border-line bg-surface shadow-card'
      }`}
      aria-label="Estado del trabajo"
      data-testid="job"
    >
      <div className="text-sm text-ink">
        <span className="font-semibold">Última solicitud: </span>
        <span data-testid="job-status">
          {JOB_STATUS_TEXT[job.status]}
          {job.status === 'RUNNING' && ` (intento ${job.attempts} de ${job.max_attempts})`}
        </span>
        <span className="ml-2 text-xs text-ink-muted">
          en cola {fmtDateTime(job.enqueued_at)}
          {job.finished_at && ` · terminada ${fmtDateTime(job.finished_at)}`}
          {active && (polling ? ' · se consulta el estado automáticamente' : ' · la consulta automática se detuvo por un error')}
          {job.status === 'COMPLETED' && ' · resultados abajo, con su vigencia'}
        </span>
        {job.status === 'NOT_EXECUTED' && job.stop_code && (
          <div className="mt-2">
            <Notice kind="warn" compact>
              <span data-testid="job-stop">{STOP_TEXT[job.stop_code]}</span>
            </Notice>
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onRecheck}>
        Consultar estado ahora
      </Button>
    </section>
  );
}

/**
 * Resultados por producto: la cifra estimada con su unidad, la línea base (el
 * último consumo publicado de la serie, tal como la entrega la API) y la
 * vigencia. «Datos insuficientes» se muestra en lugar de la cifra, con su
 * motivo; una fila de una ejecución anterior lo dice junto a su vigencia. La
 * serie observada, el método (α), la cobertura y la ejecución van en «Ver
 * detalle».
 */
export function ResultsSection({ results, details, latestRun }: { results: InstitutionalResults; details: Record<string, Run>; latestRun: string | null }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ResultFilter>('ALL');
  const wanted = normalizeName(query);
  const visible = results.results.filter((result) => {
    if (filter === 'L' || filter === 'KG') {
      if (result.presentation_unit !== filter) return false;
    } else if (filter === 'ESTIMATED') {
      if (result.status !== 'ESTIMATED') return false;
    } else if (filter === 'NO_FIGURE') {
      if (result.status === 'ESTIMATED') return false;
    }
    if (wanted && !normalizeName(result.product.name).includes(wanted)) return false;
    return true;
  });

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-labelledby="resultados-estimacion">
      <h2 id="resultados-estimacion" className="sr-only">
        Resultados para {results.target.name}
      </h2>
      {results.results.length === 0 ? (
        <DataState state="empty" title="Sin ejecuciones" description="Todavía no hay ninguna estimación para esta campaña. No se muestra ninguna cifra: eso no significa cero." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4 sm:px-8" data-testid="estimation-filters">
            <SearchInput
              id="estimation-search"
              label="Buscar producto"
              placeholder="Buscar producto…"
              value={query}
              onChange={setQuery}
              autoComplete="off"
              enterKeyHint="search"
              inputMode="search"
              fieldClassName="min-w-0 flex-1 basis-56 sm:max-w-72"
            />
            <FilterChips label="Filtrar resultados de estimación" testId="estimation-result-filter" options={RESULT_FILTERS} value={filter} onChange={setFilter} />
          </div>
          {visible.length === 0 ? (
            <div className="px-5 py-6 sm:px-8">
              <DataState
                state="no-match"
                compact
                description={`Ningún producto estimado coincide con el filtro aplicado${query.trim() ? ` («${query.trim()}»)` : ''}.`}
                onClearFilters={() => {
                  setQuery('');
                  setFilter('ALL');
                }}
              />
            </div>
          ) : (
            <div className={`overflow-x-auto ${SCROLL_HINT}`}>
              <table className="w-full text-base">
                <thead className="border-b-2 border-ink text-left text-xs font-bold uppercase tracking-wider text-ink-muted max-sm:hidden">
                  <tr>
                    <th className="px-5 pb-3 pt-5 sm:pl-8">Producto</th>
                    <th className="px-4 pb-3 pt-5 text-right">Consumo estimado</th>
                    <th className="px-4 pb-3 pt-5 text-right">Último consumo publicado</th>
                    <th className="min-w-36 px-5 pb-3 pt-5 sm:pr-8">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((result) => {
                    const detail = detailOf(details, result);
                    const baseCampaign = lastObservedCampaign(detail);
                    const earlier = latestRun !== null && result.run_ref !== latestRun;
                    const estimated = result.status === 'ESTIMATED';
                    return (
                      <tr key={`${result.product.product_ref}|${result.base_unit}`} data-testid={`result-${result.product.name}`} className="align-top max-sm:block max-sm:px-1 max-sm:py-3">
                        <td className="px-5 py-4 [overflow-wrap:anywhere] max-sm:block max-sm:py-1 sm:min-w-48 sm:pl-8">
                          <span className="text-base font-semibold text-ink">{result.product.name}</span>
                          <span className="ml-1 text-sm font-normal text-ink-muted">{result.presentation_unit}</span>
                          <RowDetail result={result} detail={detailOf(details, result)} />
                        </td>
                        <td className="px-4 py-4 max-sm:block max-sm:py-1 sm:text-right">
                          <span className="mb-0.5 block text-xs font-bold uppercase tracking-wider text-ink-muted sm:hidden">Consumo estimado</span>
                          {estimated ? (
                            <span className="text-2xl leading-tight sm:text-[1.75rem]" data-testid="estimate">
                              <Figure value={result.estimate_base} unit={result.base_unit} kind="estimate" status={result.status} validityReason={result.validity_reason} rounded />
                            </span>
                          ) : (
                            <>
                              <span className="block text-base text-ink-muted" data-testid="estimate">
                                {RESULT_STATUS_TEXT[result.status]}
                              </span>
                              {result.reason_code && (
                                <p className="mt-0.5 max-w-xs text-sm leading-snug text-ink-muted sm:ml-auto" data-testid="reason">
                                  {REASON_TEXT[result.reason_code]}
                                </p>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-4 max-sm:block max-sm:py-1 sm:text-right">
                          <span className="mb-0.5 block text-xs font-bold uppercase tracking-wider text-ink-muted sm:hidden">Último consumo publicado</span>
                          <span className="text-base" data-testid="naive">
                            <Figure value={result.naive_base} unit={result.base_unit} kind="naive" status={result.status} validityReason={result.validity_reason} />
                          </span>
                          <span className="block text-sm text-ink-muted" data-testid="observed-last">
                            {estimated && baseCampaign ? `en ${baseCampaign}` : estimated ? 'Último consumo publicado de la serie' : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-4 max-sm:block max-sm:py-1 sm:pr-8">
                          <span className="mb-0.5 block text-xs font-bold uppercase tracking-wider text-ink-muted sm:hidden">Estado</span>
                          <span data-testid="validity">
                            <ValidityBadge validity={result.validity} reason={result.validity_reason} />
                          </span>
                          {earlier && (
                            <span className="mt-1 block text-sm font-medium text-caution" data-testid="earlier-run">
                              De una ejecución anterior, no de la última solicitada
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <div className="space-y-1 border-t border-line px-5 py-4 text-sm leading-relaxed text-ink-muted sm:px-8">
        <p>«{RESULT_STATUS_TEXT.INSUFFICIENT_DATA}» significa que no hay suficientes campañas comparables seguidas con consumo publicado (el motivo va en cada fila). No es cero.</p>
        <p data-testid="results-evaluated">
          Vigencia evaluada el {fmtDateTime(results.evaluated_at)}
          {results.season ? ` · temporada ${results.season.key}` : ''}. Cada cifra es una estimación puntual para esta campaña, con la fecha de
          su ejecución; no es un rango histórico.
        </p>
      </div>
    </section>
  );
}

/** «Ver detalle» de una fila: serie observada, método (α), cobertura y ejecución (detalle técnico). */
function RowDetail({ result, detail }: { result: InstitutionalResult; detail: ResultDetail | null }) {
  return (
    <div className="mt-1 text-sm text-ink-muted">
      <details>
        <summary className="cursor-pointer font-semibold text-link">Ver detalle</summary>
        <dl className="mt-2 max-w-xs space-y-1 sm:w-max">
          <div data-testid="observed">
            <dt className="inline text-ink-muted">Serie observada: </dt>
            <dd className="inline">
              <span data-testid="observed-span">{observed(detail)}</span>
              {observedValues(detail, result.presentation_unit) && (
                <span className="block tabular-nums text-ink" data-testid="observed-values">
                  {observedValues(detail, result.presentation_unit)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="inline text-ink-muted">Método: </dt>
            <dd className="inline">
              SES frente a la línea base naive · α <span className="tabular-nums" data-testid="alpha">{formatAlpha(detail?.alpha ?? null)}</span>
              {detail?.fit_informative === false && <span className="ml-1 text-ink-muted">(ajuste no informativo)</span>}
            </dd>
          </div>
          {result.coverage.campaigns.length > 0 && (
            <div>
              <dt className="inline text-ink-muted">Cobertura: </dt>
              <dd className="inline">
                {result.coverage.status === 'IDENTIFIED' ? 'identificada en cada campaña del tramo (participación, no integridad)' : 'desconocida en alguna campaña'}
              </dd>
            </div>
          )}
          <div>
            <dt className="inline text-ink-muted">Ejecución: </dt>
            <dd className="inline">
              <span data-testid="run">{fmtDateTime(result.generated_at)}</span>{' '}
              <span className="text-ink-muted">
                (ref. <code title={result.run_ref}>{result.run_ref.slice(0, 8)}</code>)
              </span>
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
