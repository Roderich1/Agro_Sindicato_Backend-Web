import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Collapsible, DataState, DataTable, KpiTile, Section, StatusChip } from '../../../components/ui';
import { CAMPAIGN_STATUS_TEXT, fmtDateTime } from '../../../lib/collective-text';
import { COLLECTIVE_PATHS } from '../../../lib/navigation';
import type { CollectiveSummary } from '../../../types/collective';
import {
  activeOf,
  coverageLink,
  coverageView,
  counts,
  countsText,
  executiveAttention,
  fmtCount,
  groups,
  latestDataAsOf,
  plural,
  proposalsLink,
  referenceFor,
  versionView,
  UNIT_TITLE,
  type EstimationView,
  type Group,
  type Order,
} from './model';
import { ActivityList, AttentionNotices, Bars, Definitions, DetailTable, ConsumptionList, EstimationFooter, Gate, Header, LinkRow, OrderControl, PolicyPending, quietLink, type VariantProps } from './parts';

/**
 * Variante D «Ejecutivo» (eje: el tablero que propone el autor, con los datos
 * que la API sirve hoy a la Directiva). Cuatro indicadores en tarjetas; a la
 * derecha el centro de atención (hechos con color y texto) y la actividad
 * reciente de la bitácora; en el centro la mayor necesidad declarada por
 * unidad (las cinco primeras, el resto a un clic) y, debajo, la necesidad
 * frente a la estimación del consumo como referencia. Sin compras conjuntas,
 * tendencias ni observaciones automáticas: no hay dato ni permiso que las
 * sustente (ver d_RESUMEN_VARIANTES §11).
 */
export function Ejecutivo(props: VariantProps) {
  const [order, setOrder] = useState<Order>('cantidad');
  const summary = props.state.kind === 'ready' ? props.state.summary : null;
  const estimation = summary ? props.estimation : null;
  const activity = summary ? props.activity : null;
  const items = executiveAttention(summary, props.noActive, estimation, activity);
  const synthetic = summary?.disclosure.mode === 'PROVISIONAL_SYNTHETIC';
  const needs = summary && synthetic ? groups(summary, 'DECLARED_NEED', order) : [];
  const consumption = summary && synthetic ? groups(summary, 'CONSUMPTION_TOTAL', 'nombre') : [];
  const c = summary ? counts(summary) : null;
  const latest = summary ? latestDataAsOf(summary.cells) : null;
  const campaignId = summary?.campaign.campaign_ref ?? null;
  const active = activeOf(props.campaigns);
  return (
    <div className="space-y-6" data-variant="ejecutivo">
      <Header {...props} />
      <Gate {...props} />
      {summary && !synthetic && <PolicyPending />}
      {summary && campaignId && (
        <>
          <Kpis summary={summary} isActive={active?.id === campaignId} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_minmax(0,1fr)] lg:items-start">
            <div className="min-w-0 lg:col-start-2 lg:row-start-1" data-testid="attention-slot">
              {items.length > 0 ? (
                <Section title="Requiere atención" note={`${plural(items.length, 'hecho', 'hechos')} con su dato de origen y la acción que ya existe.`}>
                  <div className="px-4 py-3">
                    <AttentionNotices items={items} />
                  </div>
                </Section>
              ) : (
                <p className="rounded-card border border-dashed border-line px-4 py-3 text-sm text-slate-600" data-testid="pending-actions-none">
                  Ningún estado requiere atención en esta campaña, según los datos publicados por el servidor.
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              {synthetic && (
                <Section
                  title="Mayor necesidad declarada"
                  note={
                    <span data-testid="needs-counts">
                      {countsText(c!)} Una escala por unidad; el orden no dice qué comprar primero.
                      {latest && ` Datos hasta ${fmtDateTime(latest)}`}
                    </span>
                  }
                  actions={needs.length > 0 && <OrderControl value={order} onChange={setOrder} />}
                >
                  {needs.length === 0 ? (
                    <DataState state="empty" title="Sin necesidades publicadas" description="Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero." />
                  ) : (
                    <TopBars groups={needs} threshold={summary.disclosure.threshold} />
                  )}
                </Section>
              )}
              {synthetic && needs.length > 0 && (
                <Section
                  title="Necesidad declarada y estimación del consumo"
                  note="Dos cifras distintas por producto: lo declarado para esta campaña y la estimación de consumo de campañas comparables (referencia). No se suman, restan ni comparan en porcentaje."
                >
                  <ReferenceTable groups={needs} estimation={estimation} />
                  <EstimationFooter estimation={estimation} campaignId={campaignId} onRetry={props.onReload} />
                </Section>
              )}
            </div>
            <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-2">
              <Section
                title="Actividad reciente"
                note="Lo que la bitácora registra para esta campaña: crear, actualizar, abrir, cerrar y sellar."
                actions={
                  <Link to="/audit-logs" className={quietLink}>
                    Ver bitácora
                  </Link>
                }
              >
                <div className="px-5 py-4">
                  <ActivityList activity={activity} onRetry={props.onReload} />
                </div>
              </Section>
              <nav aria-label="Dónde seguir" className="px-1">
                <p className="text-xs font-semibold text-slate-600">Dónde seguir</p>
                <LinkRow>
                  <Link to={proposalsLink(campaignId)} className={quietLink}>
                    Necesidades y propuestas
                  </Link>
                  <Link to={coverageLink(campaignId)} className={quietLink}>
                    Ver cobertura
                  </Link>
                  <Link to={`${COLLECTIVE_PATHS.history}?vista=estimacion&campaign=${encodeURIComponent(campaignId)}`} className={quietLink}>
                    Histórico y estimaciones
                  </Link>
                  <Link to={COLLECTIVE_PATHS.trends} className={quietLink}>
                    Tendencias
                  </Link>
                  <Link to="/campaigns" className={quietLink}>
                    Campañas
                  </Link>
                </LinkRow>
              </nav>
            </div>
          </div>
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
          {!summary.seal && <div id="sellado">{props.seal}</div>}
        </>
      )}
      {!summary && props.state.kind !== 'loading' && items.length > 0 && <AttentionNotices items={items} />}
    </div>
  );
}

/* ── Indicadores en tarjetas: campaña, participación, necesidades, versión ── */

function Kpis({ summary, isActive }: { summary: CollectiveSummary; isActive: boolean }) {
  const c = counts(summary);
  const version = versionView(summary.seal, summary.campaign.status);
  const coverage = summary.coverage ? coverageView(summary.coverage, summary.seal?.sealed_at) : null;
  const synthetic = summary.disclosure.mode === 'PROVISIONAL_SYNTHETIC';
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${coverage && synthetic ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`} data-testid="summary-stats">
      <KpiTile
        label="Campaña consultada"
        value={<span className="block text-xl leading-snug [overflow-wrap:anywhere]">{summary.campaign.name}</span>}
        note={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <StatusChip status={summary.campaign.status} />
            {isActive ? 'Es la campaña activa: los agricultores registran en ella.' : `${CAMPAIGN_STATUS_TEXT[summary.campaign.status] ?? summary.campaign.status}; no es la campaña activa.`}
          </span>
        }
        testId="campaign-tile"
      />
      {coverage && (
        <KpiTile
          label={coverage.title}
          value={
            <>
              <span data-testid="coverage-value">{coverage.ratio}</span>
              {coverage.percent && <span className="ml-2 text-base font-semibold text-slate-600">({coverage.percent})</span>}
            </>
          }
          note={
            <>
              {coverage.noun}. {coverage.notes.join(' ')}{' '}
              <Link to={coverageLink(summary.campaign.campaign_ref)} className={quietLink}>
                Ver cobertura
              </Link>
            </>
          }
          testId="coverage"
        />
      )}
      {synthetic && (
        <KpiTile
          label="Necesidades declaradas"
          value={c.total === 0 ? <span className="text-xl">Ninguna publicada</span> : `${fmtCount(c.published)} de ${fmtCount(c.total)}`}
          note={c.total === 0 ? 'Eso no significa cero: ningún agricultor publicó una necesidad en esta campaña.' : `Productos con cifra publicada. ${c.privacy > 0 ? `${plural(c.privacy, 'oculto', 'ocultos')} por privacidad. ` : ''}${c.other > 0 ? `${c.other} sin cifra publicada.` : ''}`}
          testId="needs-tile"
        />
      )}
      <KpiTile
        label="Versión"
        value={<span className="block text-xl leading-snug">{version.label}</span>}
        note={version.detail}
        tone={!version.sealed && summary.campaign.status === 'CERRADA' ? 'attention' : 'default'}
        testId={version.sealed ? 'seal-banner' : 'version-tile'}
      />
    </div>
  );
}

/* ── Mayor necesidad: las cinco primeras por unidad, el resto a un clic ───── */

const TOP = 5;

function TopBars({ groups: all, threshold }: { groups: Group[]; threshold: number | null }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="grid gap-y-6 px-5 py-4">
      {all.map((group) => {
        const cut = group.rows.length > TOP + 1 && !expanded[group.unit];
        const shown = cut ? { ...group, rows: group.rows.slice(0, TOP) } : group;
        const rest = group.rows.length - TOP;
        const hiddenRest = group.rows.slice(TOP).filter((row) => !row.disclosed).length;
        return (
          <div key={group.unit} className="min-w-0" data-testid={`top-${group.unit}`}>
            <Bars groups={[shown]} density="compact" threshold={threshold} />
            {group.rows.length > TOP + 1 && (
              <button
                type="button"
                className={`mt-2 ${quietLink} text-sm`}
                aria-expanded={!cut}
                onClick={() => setExpanded((prev) => ({ ...prev, [group.unit]: cut }))}
                data-testid={`top-toggle-${group.unit}`}
              >
                {cut ? `Ver ${plural(rest, 'producto más', 'productos más')} en ${UNIT_TITLE[group.unit].toLowerCase()}${hiddenRest > 0 ? ` (${hiddenRest} sin cifra)` : ''}` : `Mostrar sólo los ${TOP} primeros en ${UNIT_TITLE[group.unit].toLowerCase()}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Necesidad declarada y estimación del consumo, lado a lado ─────────────── */

function ReferenceTable({ groups: all, estimation }: { groups: Group[]; estimation: EstimationView | null }) {
  if (!estimation || estimation.kind !== 'results' || estimation.results.results.length === 0) return null;
  const published = all.map((group) => ({ ...group, rows: group.rows.filter((row) => row.disclosed && !row.invalid) })).filter((group) => group.rows.length > 0);
  if (published.length === 0) return <p className="px-5 py-3 text-sm text-slate-600">Sin cifras publicadas que poner junto a la referencia.</p>;
  return (
    <DataTable caption="Necesidad declarada y estimación del consumo por producto" minWidth={560}>
      <thead>
        <tr>
          <th scope="col" className="min-w-[10rem]">
            Producto
          </th>
          <th scope="col" className="ui-num">
            Necesidad declarada
          </th>
          <th scope="col" className="ui-num">
            Estimación del consumo
          </th>
          <th scope="col">Vigencia de la estimación</th>
        </tr>
      </thead>
      {published.map((group) => (
        <tbody key={group.unit}>
          <tr>
            <th scope="rowgroup" colSpan={4} className="bg-slate-50 text-xs font-semibold text-slate-700">
              {UNIT_TITLE[group.unit]} ({group.unit})
            </th>
          </tr>
          {group.rows.map((row) => {
            const reference = referenceFor(row, estimation);
            return (
              <tr key={row.key} data-testid={`reference-${row.testId}`}>
                <th scope="row" className="font-medium text-ink [overflow-wrap:anywhere]">
                  {row.name}
                </th>
                <td className="ui-num font-semibold">{row.text}</td>
                <td className="ui-num font-semibold" data-testid="reference">
                  {reference?.text ?? <span className="font-normal text-slate-600">{reference?.absence ?? 'Sin estimación'}</span>}
                </td>
                <td className="text-xs text-slate-600">
                  {reference?.validityText ? (
                    <span className={reference.validity === 'OUTDATED' ? 'text-amber-900' : ''} title={reference.reason ?? undefined}>
                      {reference.validityText}
                      {reference.generatedAt && ` · ${fmtDateTime(reference.generatedAt)}`}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </DataTable>
  );
}
