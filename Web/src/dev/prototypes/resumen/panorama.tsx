import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Collapsible, DataState, Section } from '../../../components/ui';
import { coverageLink, countsText, counts, groups, plural, type Order } from './model';
import { AttentionList, attentionItems, Bars, Definitions, DetailTable, ConsumptionList, Gate, Header, OrderControl, PolicyPending, quietLink, Stats, statsFor, type VariantProps } from './parts';

/**
 * Variante A «Panorama» (eje: lectura de un vistazo). Pocos indicadores sobre
 * el lienzo, sin cajas, y un gráfico amplio como centro de la pantalla, con
 * litros y kilogramos lado a lado en escritorio. Casi nada de texto permanente:
 * la atención va en una franja de una línea y todo lo demás está plegado.
 */
export function Panorama(props: VariantProps) {
  const [order, setOrder] = useState<Order>('cantidad');
  const summary = props.state.kind === 'ready' ? props.state.summary : null;
  const items = attentionItems(summary, props.noActive, null);
  const synthetic = summary?.disclosure.mode === 'PROVISIONAL_SYNTHETIC';
  const needs = summary && synthetic ? groups(summary, 'DECLARED_NEED', order) : [];
  const consumption = summary && synthetic ? groups(summary, 'CONSUMPTION_TOTAL', 'nombre') : [];
  const c = summary ? counts(summary) : null;
  return (
    <div className="space-y-6" data-variant="panorama">
      <Header {...props} />
      <Gate {...props} />
      {summary && !synthetic && <PolicyPending />}
      {summary && (
        <>
          <Stats stats={statsFor(summary)} />
          <AttentionList items={items} compact />
          {synthetic && (
            <Section
              title="Necesidades declaradas por producto"
              note={<span data-testid="needs-note">{countsText(c!)} Cada unidad tiene su propia escala; las cifras exactas están al lado de cada barra.</span>}
              actions={needs.length > 0 && <OrderControl value={order} onChange={setOrder} />}
            >
              {needs.length === 0 ? (
                <DataState state="empty" title="Sin necesidades publicadas" description="Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero." />
              ) : (
                <div className="px-5 py-5">
                  <Bars groups={needs} density="wide" columns threshold={summary.disclosure.threshold} />
                </div>
              )}
            </Section>
          )}
          {synthetic && (
            <>
              <Collapsible title={consumption.length === 0 ? 'Consumo publicado' : `Consumo publicado (${plural(consumption.reduce((n, group) => n + group.rows.length, 0), 'producto', 'productos')})`} label="Consumo publicado" testId="consumption">
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
