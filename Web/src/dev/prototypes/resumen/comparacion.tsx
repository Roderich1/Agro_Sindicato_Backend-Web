import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Collapsible, DataState, Section } from '../../../components/ui';
import { fmtDateTime } from '../../../lib/collective-text';
import { COLLECTIVE_PATHS } from '../../../lib/navigation';
import { coverageLink, countsText, counts, groups, latestDataAsOf, type EstimationView, type Order } from './model';
import { AttentionList, attentionItems, Bars, Definitions, DetailTable, ConsumptionList, Gate, Header, OrderControl, PolicyPending, quietLink, Stats, statsFor, type VariantProps } from './parts';

/**
 * Variante C «Comparación» (eje: necesidad frente a referencia histórica).
 * Indicadores en una franja (incluida la vigencia de la estimación) y, como
 * centro, por cada producto la necesidad declarada con su barra y, al lado,
 * la estimación del consumo de campañas comparables con su vigencia. Son dos
 * cifras distintas: nunca se suman, restan ni comparan en porcentaje.
 */
export function Comparacion(props: VariantProps) {
  const [order, setOrder] = useState<Order>('nombre');
  const summary = props.state.kind === 'ready' ? props.state.summary : null;
  const estimation = summary ? props.estimation : null;
  const items = attentionItems(summary, props.noActive, estimation);
  const synthetic = summary?.disclosure.mode === 'PROVISIONAL_SYNTHETIC';
  const needs = summary && synthetic ? groups(summary, 'DECLARED_NEED', order) : [];
  const consumption = summary && synthetic ? groups(summary, 'CONSUMPTION_TOTAL', 'nombre') : [];
  const c = summary ? counts(summary) : null;
  const latest = summary ? latestDataAsOf(summary.cells) : null;
  const withReference = estimation?.kind === 'results' && estimation.results.results.length > 0;
  return (
    <div className="space-y-6" data-variant="comparacion">
      <Header {...props} />
      <Gate {...props} />
      {summary && !synthetic && <PolicyPending />}
      {summary && (
        <>
          <Stats stats={statsFor(summary, { estimation, latest: false })} boxed size="md" />
          {synthetic && (
            <Section
              title={withReference ? 'Necesidades declaradas y estimación del consumo' : 'Necesidades declaradas por producto'}
              note={
                <span data-testid="needs-note">
                  {countsText(c!)}
                  {withReference && ' Dos cifras distintas por producto: lo declarado para esta campaña y la estimación de consumo de campañas comparables (referencia: no se suman ni se restan).'}
                  {latest && ` Cifras publicadas con datos hasta ${fmtDateTime(latest)}.`}
                </span>
              }
              actions={needs.length > 0 && <OrderControl value={order} onChange={setOrder} />}
            >
              {needs.length === 0 ? (
                <DataState state="empty" title="Sin necesidades publicadas" description="Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero." />
              ) : (
                <div className="px-5 py-4">
                  <Bars groups={needs} density="compact" threshold={summary.disclosure.threshold} estimation={withReference ? estimation : null} />
                </div>
              )}
              <EstimationFooter estimation={estimation} campaignId={summary.campaign.campaign_ref} onRetry={props.onReload} />
            </Section>
          )}
          <AttentionList items={items} />
          {synthetic && (
            <>
              <Collapsible title="Consumo publicado" testId="consumption">
                <ConsumptionList groups={consumption} threshold={summary.disclosure.threshold} />
              </Collapsible>
              <Collapsible title="Tabla completa: cifras, aportantes y fechas" testId="detail-table">
                {needs.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-slate-600">Sin necesidades publicadas. Eso no significa cero.</p>
                ) : (
                  <DetailTable groups={needs} caption="Necesidades declaradas por producto, con aportantes y fecha de cada cifra" threshold={summary.disclosure.threshold} />
                )}
              </Collapsible>
            </>
          )}
          <Definitions />
          <p className="text-sm text-slate-700">
            <Link to={coverageLink(summary.campaign.campaign_ref)} className={quietLink}>
              Ver cobertura
            </Link>
          </p>
          {!summary.seal && <div id="sellado">{props.seal}</div>}
        </>
      )}
      {!summary && props.state.kind !== 'loading' && <AttentionList items={items} />}
    </div>
  );
}

/** Estado de la referencia bajo la sección: vigencia, temporada y aviso del servidor, o por qué no hay. */
function EstimationFooter({ estimation, campaignId, onRetry }: { estimation: EstimationView | null; campaignId: string; onRetry: () => void }) {
  const history = `${COLLECTIVE_PATHS.history}?vista=estimacion&campaign=${encodeURIComponent(campaignId)}`;
  if (!estimation) return null;
  const link = (
    <Link to={history} className={quietLink}>
      Histórico y estimaciones
    </Link>
  );
  return (
    <div className="border-t border-slate-100 px-5 py-3 text-xs leading-relaxed text-slate-600" data-testid="estimation-footer">
      {estimation.kind === 'loading' && <DataState state="loading" compact />}
      {estimation.kind === 'policy' && <DataState state="restricted" title="Estimación restringida" description="La política de divulgación no está aprobada: no se muestran cifras estimadas." compact />}
      {estimation.kind === 'error' && <DataState state="error" title="La estimación no se pudo consultar" description={estimation.text} onRetry={onRetry} compact />}
      {estimation.kind === 'none' && <DataState state="empty" title="Sin estimación para esta campaña" description="No hay ejecuciones de la estimación del consumo. Se pide en Histórico y estimaciones; nunca se calcula al abrir esta vista." compact action={link} />}
      {estimation.kind === 'results' &&
        (estimation.results.results.length === 0 ? (
          <DataState state="empty" title="Sin estimación para esta campaña" description="No hay ejecuciones de la estimación del consumo. Se pide en Histórico y estimaciones; nunca se calcula al abrir esta vista." compact action={link} />
        ) : (
          <p>
            <span className="font-semibold text-slate-700">Estimación del consumo (referencia):</span> vigencia evaluada el {fmtDateTime(estimation.results.evaluated_at)}
            {estimation.results.season ? ` · temporada ${estimation.results.season.key}` : ''}. {estimation.results.notice} {link}
          </p>
        ))}
    </div>
  );
}
