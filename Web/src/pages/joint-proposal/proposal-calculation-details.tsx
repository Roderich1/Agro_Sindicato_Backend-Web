import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Figure } from '../../components/estimation-figure';
import { surfaceClass } from '../../components/ui';
import { collectiveError, fmtDateTime } from '../../lib/collective-text';
import { ACTION_TEXT, MODE_TEXT } from '../../lib/estimation-link-text';
import { formatAlpha, JOB_STATUS_TEXT, RESULT_STATUS_TEXT } from '../../lib/estimation-text';
import { fmtCalendarDate } from '../../lib/format';
import { estimationService } from '../../services/estimation.service';
import type { Proposal } from '../../types/collective';
import type { ResultDetail } from '../../types/estimation';
import type { EstimationLinkView } from '../../types/estimation-link';
import type { RunDetailLoad } from './joint-proposal.types';

/**
 * Detalle técnico plegado: método, parámetros, temporada y período, política,
 * línea base naive y cobertura del tramo por producto, fuentes e historial de
 * vínculos. El detalle de la ejecución se pide sólo al desplegar.
 */
export function CalculationDetails({ view, proposal }: { view: EstimationLinkView; proposal: Proposal }) {
  const [detail, setDetail] = useState<RunDetailLoad | null>(null);
  const alive = useRef(true);
  const requested = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = view.run;
  const runRef = run?.run_ref ?? null;

  const fetchDetail = async () => {
    if (!runRef) return;
    setDetail({ status: 'loading' });
    try {
      const data = await estimationService.run(runRef);
      if (alive.current && data.run_ref === runRef) setDetail({ status: 'ready', run: data });
    } catch (err) {
      if (alive.current) setDetail({ status: 'error', message: collectiveError(err, 'No fue posible cargar el detalle de la ejecución.') });
    }
  };

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || requested.current) return;
    requested.current = true;
    void fetchDetail();
  };

  return (
    <details className={`${surfaceClass} group overflow-hidden`} data-testid="calculation" onToggle={onToggle}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-base font-semibold text-ink hover:bg-canvas [&::-webkit-details-marker]:hidden">
        <span>Parámetros, fuentes e historial</span>
        <span className="text-sm font-semibold text-link group-open:hidden">Ver</span>
        <span className="hidden text-sm font-semibold text-ink-muted group-open:inline">Ocultar</span>
      </summary>
      <div className="space-y-3 border-t border-line px-5 py-4 text-sm text-ink-muted">
        {run ? (
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]" data-testid="calculation-run">
            <dt className="text-ink-muted">Método y versión</dt>
            <dd>
              SES frente a la línea base naive ({run.method}) · versión {run.method_version}
            </dd>
            <dt className="text-ink-muted">Temporada</dt>
            <dd>
              {run.season.key} · {run.season.definition}
            </dd>
            <dt className="text-ink-muted">Campaña objetivo (período)</dt>
            <dd>
              {run.target.name} · {fmtCalendarDate(run.target.start_date) ?? '—'} a {fmtCalendarDate(run.target.end_date) ?? 'sin fecha de cierre'}
            </dd>
            <dt className="text-ink-muted">Ejecución</dt>
            <dd>
              <code title={run.run_ref}>{run.run_ref.slice(0, 8)}</code> del {fmtDateTime(run.generated_at)}
              {run.outcome === 'FAILED' && ' · fallida'}
            </dd>
          </dl>
        ) : (
          <p>No hay una ejecución fijada en este momento.</p>
        )}
        {runRef && <RunDetailBody detail={detail} proposal={proposal} onRetry={() => void fetchDetail()} />}
        <LinkHistory view={view} />
      </div>
    </details>
  );
}

function RunDetailBody({ detail, proposal, onRetry }: { detail: RunDetailLoad | null; proposal: Proposal; onRetry: () => void }) {
  if (!detail || detail.status === 'loading') return <p data-testid="calculation-detail">Cargando el detalle de la ejecución…</p>;
  if (detail.status === 'error') {
    return (
      <p className="text-danger-ink" data-testid="calculation-detail">
        {detail.message}{' '}
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Reintentar
        </button>
      </p>
    );
  }
  const run = detail.run;
  const results = proposal.lines
    .map((line) => run.results.find((r) => r.product.product_ref === line.product_ref && r.base_unit === line.base_unit))
    .filter((r, index, all): r is ResultDetail => r !== undefined && all.indexOf(r) === index);
  return (
    <div className="space-y-3" data-testid="calculation-detail">
      <div>
        <p className="font-semibold text-ink">Parámetros</p>
        <ul className="mt-0.5 space-y-0.5" data-testid="calculation-parameters">
          {Object.entries(run.parameters).map(([key, value]) => (
            <li key={key}>
              <code>{key}</code>: <code className="[overflow-wrap:anywhere]">{JSON.stringify(value)}</code>
            </li>
          ))}
        </ul>
      </div>
      {results.map((result) => {
        const span = result.points.filter((point) => point.in_span);
        return (
          <div key={`${result.product.product_ref}|${result.base_unit}`} data-testid={`calculation-${result.product.name}`}>
            <p className="font-semibold text-ink">
              {result.product.name} ({result.presentation_unit}) · {RESULT_STATUS_TEXT[result.status]}
            </p>
            <p>
              Línea base naive:{' '}
              <Figure value={result.naive_base} unit={result.base_unit} kind="naive" status={result.status} validityReason={result.validity_reason} /> · α{' '}
              {formatAlpha(result.alpha)}
            </p>
            <p>
              Cobertura del tramo{result.span_length !== null ? ` (${result.span_length} ${result.span_length === 1 ? 'campaña' : 'campañas'})` : ''}:{' '}
              {span.length === 0
                ? 'sin campañas en el tramo'
                : span
                    .map((point) =>
                      point.coverage.status === 'IDENTIFIED'
                        ? `${point.campaign.name}: ${point.coverage.members_in_published_figures} de ${point.coverage.linked_members}`
                        : `${point.campaign.name}: desconocida`,
                    )
                    .join(' · ')}
              . Mide participación, no integridad.
            </p>
            <p>
              Fuentes: ejecución <code title={run.run_ref}>{run.run_ref.slice(0, 8)}</code>
              {result.series ? (
                <>
                  {' '}
                  · serie <code title={result.series.series_ref}>{result.series.series_ref.slice(0, 8)}</code> versión {result.series.version} · huella{' '}
                  <code title={result.series.source_hash}>{result.series.source_hash.slice(0, 12)}</code>
                </>
              ) : (
                ' · sin serie'
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Todos los vínculos del borrador, del más reciente al primero. */
function LinkHistory({ view }: { view: EstimationLinkView }) {
  if (view.history.length === 0) return null;
  const entries = [...view.history].sort((a, b) => b.sequence - a.sequence);
  return (
    <div>
      <p className="font-semibold text-ink">Historial de la referencia</p>
      <ol className="mt-0.5 space-y-0.5" data-testid="link-history">
        {entries.map((entry) => (
          <li key={entry.link_ref}>
            {entry.sequence}. {fmtDateTime(entry.created_at)} · {MODE_TEXT[entry.mode]} ({ACTION_TEXT[entry.action]}) por {entry.created_by.name}
            {entry.run_ref && (
              <>
                {' '}
                · ejecución <code title={entry.run_ref}>{entry.run_ref.slice(0, 8)}</code>
              </>
            )}
            {!entry.run_ref && entry.job_status && ` · trabajo ${JOB_STATUS_TEXT[entry.job_status].toLowerCase()}`}
            {entry.current && <strong> · vigente</strong>}
          </li>
        ))}
      </ol>
    </div>
  );
}
