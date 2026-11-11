import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Collapsible, DataState, Section } from '../../../components/ui';
import { fmtDateTime } from '../../../lib/collective-text';
import { coverageLink, countsText, counts, groups, latestDataAsOf, type Order } from './model';
import { AttentionList, attentionItems, Bars, Definitions, DetailTable, ConsumptionList, EstimationFooter, Gate, Header, OrderControl, PolicyPending, quietLink, Stats, statsFor, type VariantProps } from './parts';

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
