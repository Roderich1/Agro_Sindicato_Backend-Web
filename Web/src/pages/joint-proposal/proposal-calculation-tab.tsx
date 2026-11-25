import { Link } from 'react-router-dom';
import { Card, DataState } from '../../components/ui';
import { fmtDateTime } from '../../lib/collective-text';
import type { Proposal } from '../../types/collective';
import type { EstimationLinkView } from '../../types/estimation-link';
import { estimationPath, fmtCount, NO_ESTIMATE_TEXT, seasonName, type LinkLoad } from './joint-proposal.types';
import { CalculationDetails } from './proposal-calculation-details';

/**
 * Pestaña «Cómo se calculó» (láminas 08 y 51). Todo sale de la referencia
 * fijada (`GET …/estimation-link`): la ejecución, el vínculo y el alcance de
 * cada línea. Los rangos «entre … y …» son el mínimo y el máximo de los
 * `scope` de las líneas, sin cifras nuevas. Método, parámetros, fuentes e
 * historial siguen en el detalle técnico.
 */
export function HowCalculated({
  proposal,
  link,
  view,
  campaignName,
  onRetry,
}: {
  proposal: Proposal;
  link: LinkLoad | null;
  view: EstimationLinkView | null;
  campaignName: string;
  onRetry: () => void;
}) {
  if (!link || link.status === 'loading') {
    return (
      <Card>
        <DataState state="loading" title="Cargando la referencia…" />
      </Card>
    );
  }
  if (link.status === 'error' || !view) {
    return (
      <Card>
        <DataState state="error" description="No se pudo cargar la referencia de consumo estimado de este borrador. El motivo está en la pestaña «Borrador»." onRetry={onRetry} />
      </Card>
    );
  }
  const run = view.run;
  const scopes = view.lines.map((line) => line.scope.estimate).filter((scope): scope is NonNullable<typeof scope> => scope !== null);
  const range = (values: number[]) => {
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? `${fmtCount(min)}` : `Entre ${fmtCount(min)} y ${fmtCount(max)}`;
  };
  const campaignsRange = range(scopes.map((scope) => scope.span_campaigns));
  const contributorsRange = scopes.length === 0 ? null : range([...scopes.map((scope) => scope.contributors_min), ...scopes.map((scope) => scope.contributors_max)]);
  const counts = new Map<string, number>();
  for (const line of view.lines) {
    if (line.estimation.state === 'AVAILABLE' || line.estimation.state === 'OUTDATED') continue;
    counts.set(line.estimation.state, (counts.get(line.estimation.state) ?? 0) + 1);
  }
  const missing = [...counts.entries()].map(([state, count]) => {
    const [one, many] = NO_ESTIMATE_TEXT[state] ?? ['sin cifra', 'sin cifra'];
    return `${fmtCount(count)} ${count === 1 ? `producto ${one}` : `productos ${many}`}`;
  });
  const linkState =
    view.state === 'LINKED'
      ? view.update.available
        ? 'Desactualizada'
        : 'Vigente'
      : view.state === 'CALCULATING'
        ? 'Calculando'
        : view.state === 'RESTRICTED'
          ? 'Restringida'
          : view.state === 'UNAVAILABLE'
            ? 'No completada'
            : 'Sin referencia';
  const season = run ? seasonName(run.season.key) : null;
  return (
    <div className="grid gap-5 lg:grid-cols-3 lg:items-start" data-testid="how-calculated">
      <section className="ui-on-ink rounded-card bg-ink px-6 py-6 text-white sm:px-8" aria-labelledby="pocas-palabras">
        <h2 id="pocas-palabras" className="text-2xl font-bold text-white">
          En pocas palabras
        </h2>
        {run ? (
          <p className="mt-3 text-lg leading-relaxed text-on-ink">
            El consumo estimado sale del consumo publicado en las campañas anteriores de la misma temporada ({season}), dando más peso a las más
            recientes.
          </p>
        ) : (
          <p className="mt-3 text-lg leading-relaxed text-on-ink">Este borrador todavía no tiene una referencia de consumo estimado fijada.</p>
        )}
        <p className="mt-3 text-base leading-relaxed text-on-ink-muted">
          Es una referencia para comparar. No se suma a la necesidad declarada ni decide cuánto comprar.
        </p>
      </section>
      <section className="rounded-card border border-line bg-surface px-6 py-6 shadow-card sm:px-8" aria-labelledby="con-que-datos">
        <h2 id="con-que-datos" className="text-2xl font-bold text-ink">
          Con qué datos
        </h2>
        {run ? (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-base" data-testid="calc-data">
            <dt className="text-ink-muted">Calculado</dt>
            <dd className="font-semibold text-ink">{fmtDateTime(run.generated_at)}</dd>
            <dt className="text-ink-muted">Temporada</dt>
            <dd className="font-semibold text-ink">{season}</dd>
            <dt className="text-ink-muted">Para la campaña</dt>
            <dd className="font-semibold text-ink [overflow-wrap:anywhere]">{run.target.name ?? campaignName}</dd>
            <dt className="text-ink-muted">Campañas usadas</dt>
            <dd className="font-semibold text-ink">{campaignsRange ? `${campaignsRange}, según el producto` : 'No disponible'}</dd>
            <dt className="text-ink-muted">Aportantes por campaña</dt>
            <dd className="font-semibold text-ink">{contributorsRange ? `${contributorsRange}, según el producto` : 'No disponible'}</dd>
            <dt className="text-ink-muted">Sin estimación</dt>
            <dd className="font-semibold text-ink">{missing.length > 0 ? missing.join(' · ') : 'Ninguno'}</dd>
          </dl>
        ) : (
          <p className="mt-4 text-base text-ink-muted">Sin una ejecución fijada no hay datos del cálculo.</p>
        )}
        <p className="mt-4 text-sm text-ink-muted">El alcance de cada producto está en su fila del borrador.</p>
      </section>
      <section className="rounded-card border border-line bg-surface px-6 py-6 shadow-card sm:px-8" aria-labelledby="referencia-borrador">
        <h2 id="referencia-borrador" className="text-2xl font-bold text-ink">
          Referencia del borrador
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-base">
          <dt className="text-ink-muted">Fijada</dt>
          <dd className="font-semibold text-ink">{view.link ? fmtDateTime(view.link.created_at) : 'Sin fijar'}</dd>
          {view.link && (
            <>
              <dt className="text-ink-muted">Por</dt>
              <dd className="font-semibold text-ink [overflow-wrap:anywhere]">{view.link.created_by.name}</dd>
            </>
          )}
          <dt className="text-ink-muted">Estado</dt>
          <dd className="font-semibold text-ink">{linkState}</dd>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Solo cambia si alguien pulsa «Actualizar». Si sus datos de origen cambian, se marca «Desactualizada» y no se reemplaza sola.
        </p>
      </section>
      <section className="rounded-card border border-line bg-surface px-6 py-6 shadow-card sm:px-8 lg:col-span-3" aria-labelledby="detalle-tecnico">
        <h2 id="detalle-tecnico" className="text-2xl font-bold text-ink">
          Detalle técnico
        </h2>
        {run && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-base sm:max-w-2xl">
            <dt className="text-ink-muted">Método</dt>
            <dd className="font-semibold text-ink">{run.method === 'SES_NAIVE' ? 'Suavizado exponencial simple' : run.method}</dd>
            <dt className="text-ink-muted">Se compara con</dt>
            <dd className="font-semibold text-ink">El último consumo publicado (línea base naive)</dd>
            <dt className="text-ink-muted">Versión del cálculo</dt>
            <dd className="font-semibold text-ink">{run.method_version}</dd>
          </dl>
        )}
        {(run || view.history.length > 0) && (
          <div className="mt-4">
            <CalculationDetails key={`${view.proposal_ref}|${run?.run_ref ?? ''}`} view={view} proposal={proposal} />
          </div>
        )}
        <p className="mt-4">
          <Link className="font-semibold text-link underline underline-offset-2" to={estimationPath(proposal)}>
            Ver la estimación completa
          </Link>
        </p>
      </section>
    </div>
  );
}
