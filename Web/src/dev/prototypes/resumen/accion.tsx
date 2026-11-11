import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass, Collapsible, DataState, Section, surfaceClass } from '../../../components/ui';
import type { CollectiveSummary } from '../../../types/collective';
import { coverageLink, countsText, counts, groups, proposalsLink, type Order } from './model';
import { AttentionList, attentionItems, Bars, Definitions, DetailTable, ConsumptionList, Gate, Header, OrderControl, PolicyPending, quietLink, Stats, statsFor, type VariantProps } from './parts';

/**
 * Variante B «Acción» (eje: qué hacer ahora). Dos columnas en escritorio: a la
 * izquierda los indicadores y las necesidades en lista densa; a la derecha,
 * fija, el siguiente paso con su botón, lo que requiere atención y el sellado
 * cuando corresponde. En el teléfono la columna de acción va primero.
 */
export function Accion(props: VariantProps) {
  const [order, setOrder] = useState<Order>('cantidad');
  const summary = props.state.kind === 'ready' ? props.state.summary : null;
  const items = attentionItems(summary, props.noActive, null);
  const synthetic = summary?.disclosure.mode === 'PROVISIONAL_SYNTHETIC';
  const needs = summary && synthetic ? groups(summary, 'DECLARED_NEED', order) : [];
  const consumption = summary && synthetic ? groups(summary, 'CONSUMPTION_TOTAL', 'nombre') : [];
  const c = summary ? counts(summary) : null;
  const showAside = summary !== null || (props.state.kind !== 'loading' && props.noActive);
  return (
    <div className="space-y-6" data-variant="accion">
      <Header {...props} primary={false} />
      <Gate {...props} />
      {summary && !synthetic && <PolicyPending />}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          {summary && <Stats stats={statsFor(summary)} boxed size="md" columns={2} />}
          {summary && synthetic && (
            <Section title="Necesidades declaradas por producto" note={<span data-testid="needs-note">{countsText(c!)}</span>} actions={needs.length > 0 && <OrderControl value={order} onChange={setOrder} />}>
              {needs.length === 0 ? (
                <DataState state="empty" title="Sin necesidades publicadas" description="Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero." />
              ) : (
                <div className="px-5 py-4">
                  <Bars groups={needs} density="compact" threshold={summary.disclosure.threshold} />
                </div>
              )}
            </Section>
          )}
          {summary && synthetic && (
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
          {summary && <Definitions />}
        </div>
        {showAside && (
          <aside className="order-first min-w-0 space-y-4 lg:order-none lg:sticky lg:top-20" aria-label="Siguiente paso y atención">
            <NextStep summary={summary} noActive={props.noActive} selected={props.selected} />
            {items.length > 0 && (
              <div className={`${surfaceClass} px-5 py-4`}>
                <AttentionList items={items} />
              </div>
            )}
            {summary && !summary.seal && <div id="sellado">{props.seal}</div>}
            {summary && (
              <p className="px-1 text-sm text-slate-700">
                <Link to={coverageLink(summary.campaign.campaign_ref)} className={quietLink}>
                  Ver cobertura
                </Link>
              </p>
            )}
          </aside>
        )}
      </div>
      {!summary && props.state.kind !== 'loading' && items.length > 0 && !showAside && <AttentionList items={items} />}
    </div>
  );
}

/** El paso que sigue según los datos, con un destino que ya existe. Un borrador no es una compra. */
function NextStep({ summary, noActive, selected }: { summary: CollectiveSummary | null; noActive: boolean; selected: string | null }) {
  const c = summary ? counts(summary) : null;
  let step: { title: string; description: string; to: string; label: string; hash?: boolean };
  if (noActive && (!summary || summary.campaign.status !== 'CERRADA')) {
    step = { title: 'Abrir una campaña', description: 'No hay campaña activa: los agricultores no pueden registrar hasta que se abra una.', to: '/campaigns', label: 'Ir a Campañas' };
  } else if (summary && summary.campaign.status === 'CERRADA' && summary.seal === null) {
    step = { title: 'Revisar y sellar la versión colectiva', description: 'La campaña está cerrada. Sellar fija una versión identificable para el histórico; cerrar y sellar son pasos distintos.', to: '#sellado', label: 'Ir al sellado', hash: true };
  } else if (summary && c && c.published > 0 && selected) {
    step = { title: 'Revisar el borrador de propuesta', description: 'Con las necesidades publicadas de esta campaña. Un borrador no registra ninguna compra.', to: proposalsLink(selected), label: 'Revisar borrador' };
  } else if (selected) {
    step = { title: 'Esperar aportes', description: 'Sin necesidades publicadas todavía no hay borrador que revisar. Eso no significa cero.', to: proposalsLink(selected), label: 'Abrir Necesidades y propuestas' };
  } else {
    return null;
  }
  return (
    <section className={`${surfaceClass} px-5 py-4`} aria-labelledby="siguiente-paso" data-testid="next-step">
      <p className="text-xs font-semibold text-slate-600">Siguiente paso</p>
      <h2 id="siguiente-paso" className="mt-0.5 text-base font-bold leading-snug text-ink">
        {step.title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{step.description}</p>
      <div className="mt-3">
        {step.hash ? (
          <a href={step.to} className={buttonClass}>
            {step.label}
          </a>
        ) : (
          <Link to={step.to} className={buttonClass}>
            {step.label}
          </Link>
        )}
      </div>
    </section>
  );
}
