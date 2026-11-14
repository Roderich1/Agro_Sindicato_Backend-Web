/**
 * Piezas compartidas por las tres variantes del Resumen (prototipo 2026-11-11).
 * Sólo presentación: usan `components/ui` y los mismos textos y reglas que el
 * Resumen vigente. Ninguna pide datos; el arnés entrega el mismo fixture a las
 * tres variantes (`VariantProps`).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExportButtons } from '../../../components/export-buttons';
import { Button, buttonClass, CampaignSelector, Collapsible, DataState, DataTable, Notice, PageHeader, SegmentedControl, StatusChip, surfaceClass } from '../../../components/ui';
import { ICON } from '../../../components/ui/icon-paths';
import { Icon } from '../../../components/ui/icons';
import { fmtDateTime } from '../../../lib/collective-text';
import { COLLECTIVE_PATHS } from '../../../lib/navigation';
import type { Campaign } from '../../../types/campaigns';
import type { CollectiveSummary } from '../../../types/collective';
import {
  activityLabel,
  attention as attentionOf,
  recentActivity,
  type ActivityView,
  coverageLink,
  coverageView,
  counts,
  countsText,
  fmtCount,
  latestDataAsOf,
  plural,
  proposalsLink,
  referenceFor,
  versionView,
  UNIT_LIST,
  UNIT_TITLE,
  type Attention,
  type EstimationView,
  type Group,
  type Order,
  type Row,
} from './model';

/* ── Contrato con el arnés ───────────────────────────────────────────────── */

export type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; summary: CollectiveSummary }
  | { kind: 'error' | 'forbidden'; text: string };

export interface VariantProps {
  campaigns: Campaign[];
  selected: string | null;
  onSelect: (id: string) => void;
  campaignsError: string | null;
  onRetryCampaigns: () => void;
  /** La campaña activa del servidor es `null` (ya consultada): nadie puede registrar. */
  noActive: boolean;
  state: LoadState;
  onReload: () => void;
  /** Referencia de estimación (sólo la pide la variante que la muestra); `null` = no se consulta. */
  estimation: EstimationView | null;
  /** Panel real de sellado para la campaña (ya con `key`), o `null` si está sellada. */
  seal: ReactNode;
  /** Bitácora de la campaña (sólo la pide la variante que la muestra); `null` = no se consulta. */
  activity: ActivityView | null;
}

export const ORDER_OPTIONS: { value: Order; label: string }[] = [
  { value: 'cantidad', label: 'Mayor a menor' },
  { value: 'nombre', label: 'Por nombre' },
];

/* ── Cabecera compacta: título, campaña y acciones existentes ────────────── */

export function Header({ campaigns, selected, onSelect, state, onReload, primary = true }: Pick<VariantProps, 'campaigns' | 'selected' | 'onSelect' | 'state' | 'onReload'> & { primary?: boolean }) {
  const loading = state.kind === 'loading';
  const ready = state.kind === 'ready';
  return (
    <PageHeader
      testId="toolbar"
      title="Resumen"
      campaign={<CampaignSelector campaigns={campaigns} selected={selected} onSelect={onSelect} />}
      actions={
        selected && (
          <>
            <Button variant="ghost" onClick={onReload} disabled={loading}>
              Actualizar
            </Button>
            <ExportButtons kind="summary" reference={selected} disabled={!ready || loading} />
            {primary && (
              <Link to={proposalsLink(selected)} className={buttonClass}>
                Revisar borrador
              </Link>
            )}
          </>
        )
      }
    />
  );
}

/* ── Estados de carga, error, permiso y ausencia ─────────────────────────── */

/** Lo que va antes de cualquier contenido: error de la lista, error del resumen, carga, sin campañas. */
export function Gate({ campaignsError, onRetryCampaigns, state, onReload, selected }: Pick<VariantProps, 'campaignsError' | 'onRetryCampaigns' | 'state' | 'onReload' | 'selected'>) {
  return (
    <>
      {campaignsError && <DataState state="error" description={campaignsError} onRetry={onRetryCampaigns} testId="campaigns-list-error" />}
      {(state.kind === 'error' || state.kind === 'forbidden') && (
        <div className={surfaceClass}>
          <DataState state={state.kind} description={state.text} onRetry={state.kind === 'error' ? onReload : undefined} testId="summary-error" />
        </div>
      )}
      {state.kind === 'loading' && <DataState state="loading" compact />}
      {!selected && !campaignsError && (
        <div className={surfaceClass}>
          <DataState state="empty" title="No hay campañas" description="Cree o abra una campaña compartida en Campañas." action={<Link to="/campaigns" className={buttonClass}>Ir a Campañas</Link>} />
        </div>
      )}
    </>
  );
}

export function PolicyPending() {
  return (
    <div className={surfaceClass}>
      <DataState
        state="restricted"
        title="Política de divulgación pendiente (F07-POL-01)"
        description="Mientras no se apruebe, el servidor no publica cifras colectivas ni cobertura. Esta pantalla no calcula ni estima totales."
        testId="policy-pending"
      />
    </div>
  );
}

/* ── Indicadores: etiqueta, cifra, una línea de contexto; sin tarjetas anidadas ── */

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

/** Fila de indicadores. `boxed`: una sola superficie con separadores; si no, sobre el lienzo. */
export function Stats({ stats, boxed = false, size = 'lg', columns = 'auto' }: { stats: Stat[]; boxed?: boolean; size?: 'lg' | 'md'; columns?: 'auto' | 2 }) {
  const value = size === 'lg' ? 'text-3xl' : 'text-2xl';
  const cols = columns === 2 ? 'sm:grid-cols-2' : stats.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : stats.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <dl className={`grid gap-x-6 gap-y-4 ${cols} ${boxed ? `${surfaceClass} px-5 py-4 ${columns === 2 ? '' : 'sm:gap-x-0 sm:divide-x sm:divide-line'}` : ''}`} data-testid="summary-stats">
      {stats.map((stat) => (
        <div key={stat.key} className={boxed && columns !== 2 ? 'min-w-0 sm:px-5 sm:first:pl-0 sm:last:pr-0' : 'min-w-0'} data-testid={stat.testId}>
          <dt className="text-xs font-semibold text-slate-600">{stat.label}</dt>
          <dd className="mt-0.5 text-ink [overflow-wrap:anywhere]">
            <span className={`${stat.small ? 'text-lg' : value} font-bold leading-tight tabular-nums`}>{stat.value}</span>
            {stat.suffix && <span className={`${stat.small ? 'ml-1.5 inline-block align-middle' : 'block'} text-sm font-semibold leading-snug text-slate-700`}>{stat.suffix}</span>}
          </dd>
          {stat.note && <dd className="mt-1 text-xs leading-relaxed text-slate-600">{stat.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/* ── Barras por producto, una escala por unidad ──────────────────────────── */

export interface BarsProps {
  groups: Group[];
  /** `wide`: barra alta y cifra grande (visual principal); `compact`: lista densa. */
  density?: 'wide' | 'compact';
  /** Aportantes y fecha bajo el nombre. */
  meta?: boolean;
  /** Las unidades en dos columnas en pantallas anchas. */
  columns?: boolean;
  threshold: number | null;
  /** Referencia de estimación por fila (variante Comparación). */
  estimation?: EstimationView | null;
}

export function Bars({ groups, density = 'wide', meta = false, columns = false, threshold, estimation = null }: BarsProps) {
  const withReference = estimation !== null && estimation.kind === 'results';
  return (
    <div className={`grid gap-y-6 ${columns && groups.length > 1 ? 'lg:grid-cols-2 lg:gap-x-10' : ''}`}>
      {groups.map((group) => (
        <section key={group.unit} aria-labelledby={`unit-${group.unit}`} className="min-w-0">
          <h3 id={`unit-${group.unit}`} className="flex items-baseline gap-2 text-sm font-bold text-ink">
            {UNIT_TITLE[group.unit]} <span className="text-xs font-semibold text-slate-600">({group.unit})</span>
            <span className="ml-auto text-xs font-normal text-slate-600 tabular-nums">
              {fmtCount(group.published)} de {fmtCount(group.rows.length)} con cifra
            </span>
          </h3>
          {withReference && (
            <div className="mt-2 hidden grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7rem_9rem] gap-x-3 text-[11px] font-semibold text-slate-600 sm:grid" aria-hidden="true">
              <span>Producto</span>
              <span>Necesidad declarada</span>
              <span className="text-right">Cifra</span>
              <span className="text-right">Estimación del consumo</span>
            </div>
          )}
          <ul className={`mt-2 ${density === 'wide' ? 'space-y-3.5' : 'space-y-2'}`} aria-label={UNIT_LIST[group.unit]}>
            {group.rows.map((row) => (
              <BarRow key={row.key} row={row} density={density} meta={meta} threshold={threshold} estimation={withReference ? estimation : null} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BarRow({ row, density, meta, threshold, estimation }: { row: Row; density: 'wide' | 'compact'; meta: boolean; threshold: number | null; estimation: EstimationView | null }) {
  const bar = density === 'wide' ? 'h-5' : 'h-3';
  const figure = density === 'wide' ? 'text-lg' : 'text-base';
  const reference = estimation ? referenceFor(row, estimation) : null;
  const gridCols = reference ? 'sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7rem_9rem]' : 'sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]';
  return (
    <li className="min-w-0" data-testid={row.testId}>
      <div className={`grid gap-x-3 gap-y-1 ${gridCols} sm:items-center`}>
        <p className="min-w-0 text-sm font-medium leading-snug text-ink [overflow-wrap:anywhere]">
          {row.name}
          {row.pending && (
            <span className="ml-1.5 inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-amber-800" title="Hay cambios recibidos que aún no alcanzan el umbral: se muestra la cifra anterior.">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden="true" />
              cifra anterior
            </span>
          )}
          {meta && row.disclosed && (
            <span className="block text-xs font-normal text-slate-600 tabular-nums">
              {row.contributors !== null && `${plural(row.contributors, 'aportante', 'aportantes')} · `}datos hasta {fmtDateTime(row.asOf)}
            </span>
          )}
          {meta && row.pending && <span className="block text-[11px] text-amber-800">Hay cambios recibidos que aún no alcanzan el umbral: se muestra la cifra anterior.</span>}
        </p>
        {row.disclosed ? (
          row.invalid ? (
            <p className="text-sm font-semibold text-red-800 sm:col-span-2">Dato no válido recibido del servidor; no se muestra.</p>
          ) : (
            <>
              {row.share !== null ? (
                <div className={`${bar} min-w-0 rounded-[3px] bg-slate-100`} aria-hidden="true" data-bar-track>
                  <div className={`${bar} rounded-[3px] bg-brand-700`} style={{ width: `${row.share}%` }} />
                </div>
              ) : (
                <div className="hidden sm:block" aria-hidden="true" />
              )}
              <span className={`${figure} font-semibold leading-tight tabular-nums text-ink sm:text-right [overflow-wrap:anywhere]`} data-figure>
                {row.text}
              </span>
            </>
          )
        ) : (
          <p className="text-xs leading-snug text-slate-600 sm:col-span-2">
            <span className="mr-1.5 inline-block align-middle">
              <StatusChip status={row.cell.status} threshold={threshold} />
            </span>
            {row.reason} <span className="text-slate-500">· aportantes no revelados</span>
          </p>
        )}
        {reference && <Reference cell={reference} />}
      </div>
    </li>
  );
}

/** Estimación del consumo (referencia) al lado de la necesidad: dos cifras distintas, nunca se suman ni se restan. */
function Reference({ cell }: { cell: NonNullable<ReturnType<typeof referenceFor>> }) {
  const tone = cell.validity === 'CURRENT' ? 'text-ink' : cell.validity === 'OUTDATED' ? 'text-amber-900' : 'text-slate-600';
  return (
    <p className={`text-xs leading-snug sm:text-right ${tone}`} data-testid="reference">
      <span className="text-[11px] font-semibold text-slate-600 sm:hidden">Estimación del consumo: </span>
      {cell.text ? (
        <>
          <span className="text-sm font-semibold tabular-nums">{cell.text}</span>
          <span className="block text-[11px]" title={cell.reason ?? undefined}>
            {cell.validityText}
            {cell.generatedAt && ` · ${fmtDateTime(cell.generatedAt)}`}
          </span>
        </>
      ) : (
        <span className="text-[11px]" title={cell.reason ?? undefined}>
          {cell.absence}
          {cell.validityText && cell.absence !== 'Sin estimación' ? ` · ${cell.validityText}` : ''}
        </span>
      )}
    </p>
  );
}

/* ── Tabla completa: alternativa textual del gráfico, con cada fecha ──────── */

export function DetailTable({ groups, caption, threshold }: { groups: Group[]; caption: string; threshold: number | null }) {
  return (
    <DataTable caption={caption} minWidth={720}>
      <thead>
        <tr>
          <th scope="col">Producto</th>
          <th scope="col">Estado</th>
          <th scope="col" className="ui-num">
            Cifra
          </th>
          <th scope="col" className="ui-num">
            Aportantes
          </th>
          <th scope="col">Datos hasta</th>
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.unit}>
          <tr>
            <th scope="rowgroup" colSpan={5} className="bg-slate-50 text-xs font-semibold text-slate-700">
              {UNIT_TITLE[group.unit]} ({group.unit})
            </th>
          </tr>
          {group.rows.map((row) => (
            <tr key={row.key} data-testid={`table-${row.testId}`}>
              <th scope="row" className="font-medium text-ink [overflow-wrap:anywhere]">
                {row.name}
              </th>
              <td>
                <StatusChip status={row.cell.status} threshold={threshold} />
                {row.pending && <span className="block text-[11px] text-amber-800">Cambios pendientes: se muestra la cifra anterior.</span>}
                {!row.disclosed && <span className="block max-w-xs text-[11px] leading-snug text-slate-600">{row.reason}</span>}
              </td>
              <td className="ui-num font-semibold">{row.disclosed ? (row.invalid ? <span className="text-red-800">Dato no válido</span> : row.text) : <span className="font-normal text-slate-500">—</span>}</td>
              <td className="ui-num">{row.contributors !== null ? fmtCount(row.contributors) : <span className="text-slate-500">no revelados</span>}</td>
              <td className="whitespace-nowrap">{row.disclosed ? fmtDateTime(row.asOf) : <span className="text-slate-500">—</span>}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </DataTable>
  );
}

/** Consumo publicado: lista compacta, separada de la necesidad (no se resta ni se compara). */
export function ConsumptionList({ groups, threshold }: { groups: Group[]; threshold: number | null }) {
  if (groups.length === 0) {
    return <p className="px-5 py-3 text-sm text-slate-600">Sin consumo publicado en esta campaña. Eso no significa cero.</p>;
  }
  return (
    <div className="px-5 py-4">
      <p className="text-xs leading-relaxed text-slate-600">
        Lo que los agricultores registraron como aplicado y publicaron desde la app. Es un dato distinto de la necesidad declarada: no se resta ni se compara con ella.
      </p>
      <div className="mt-3">
        <Bars groups={groups} density="compact" meta threshold={threshold} />
      </div>
    </div>
  );
}

/* ── Atención: hechos con su dato de origen y la acción existente ───────── */

export function attentionItems(summary: CollectiveSummary | null, noActive: boolean, estimation: EstimationView | null): Attention[] {
  return attentionOf(summary, noActive, estimation);
}

export function AttentionList({ items, compact = false, title = 'Requiere atención' }: { items: Attention[]; compact?: boolean; title?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="atencion" data-testid="pending-actions" className={compact ? 'border-l-2 border-amber-500 pl-3' : ''}>
      <h2 id="atencion" className={`${compact ? 'sr-only' : 'text-sm font-bold text-ink'}`}>
        {title}
      </h2>
      <ul className={compact ? 'space-y-1' : 'mt-2 space-y-3'}>
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-sm leading-snug text-slate-800" data-testid={`action-${item.key}`}>
            {!compact && <Icon d={ICON.warn} className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
            <span className="min-w-0">
              <span className="font-semibold text-ink">{item.title}</span> {item.description} <span className="text-xs text-slate-600">({item.source})</span>
              {item.link && (
                <>
                  {' '}
                  <AttentionLink link={item.link} />
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AttentionLink({ link }: { link: NonNullable<Attention['link']> }) {
  const cls = 'whitespace-nowrap font-semibold text-brand-800 underline underline-offset-2 hover:text-ink';
  return link.hash ? (
    <a href={link.to} className={cls}>
      {link.label}
    </a>
  ) : (
    <Link to={link.to} className={cls}>
      {link.label}
    </Link>
  );
}

/**
 * Avisos del centro de atención (variante Ejecutivo): cada hecho con su color
 * por gravedad y el texto que lo porta, su dato de origen y la acción existente.
 */
export function AttentionNotices({ items }: { items: Attention[] }) {
  return (
    <ul className="space-y-2" data-testid="pending-actions" aria-label="Requiere atención">
      {items.map((item) => (
        <li key={item.key} data-testid={`action-${item.key}`}>
          <Notice kind={item.level ?? 'warn'} compact>
            <p className="text-sm leading-snug">
              <span className="font-semibold">{item.title}</span> {item.description}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Fuente: {item.source}
              {item.link && (
                <>
                  {' · '}
                  <AttentionLink link={item.link} />
                </>
              )}
            </p>
          </Notice>
        </li>
      ))}
    </ul>
  );
}

/* ── Estado de la referencia de estimación (vigencia, temporada, aviso) ────── */

/** Bajo una sección con referencia: vigencia, temporada y aviso del servidor, o por qué no hay. Nunca pide una ejecución. */
export function EstimationFooter({ estimation, campaignId, onRetry }: { estimation: EstimationView | null; campaignId: string; onRetry: () => void }) {
  const history = `${COLLECTIVE_PATHS.history}?vista=estimacion&campaign=${encodeURIComponent(campaignId)}`;
  if (!estimation) return null;
  const link = (
    <Link to={history} className={quietLink}>
      Histórico y estimaciones
    </Link>
  );
  const none = <DataState state="empty" title="Sin estimación para esta campaña" description="No hay ejecuciones de la estimación del consumo. Se pide en Histórico y estimaciones; nunca se calcula al abrir esta vista." compact action={link} />;
  return (
    <div className="border-t border-slate-100 px-5 py-3 text-xs leading-relaxed text-slate-600" data-testid="estimation-footer">
      {estimation.kind === 'loading' && <DataState state="loading" compact />}
      {estimation.kind === 'policy' && <DataState state="restricted" title="Estimación restringida" description="La política de divulgación no está aprobada: no se muestran cifras estimadas." compact />}
      {estimation.kind === 'error' && <DataState state="error" title="La estimación no se pudo consultar" description={estimation.text} onRetry={onRetry} compact />}
      {estimation.kind === 'none' && none}
      {estimation.kind === 'results' &&
        (estimation.results.results.length === 0 ? (
          none
        ) : (
          <p>
            <span className="font-semibold text-slate-700">Estimación del consumo (referencia):</span> vigencia evaluada el {fmtDateTime(estimation.results.evaluated_at)}
            {estimation.results.season ? ` · temporada ${estimation.results.season.key}` : ''}. {estimation.results.notice} {link}
          </p>
        ))}
    </div>
  );
}

/* ── Actividad reciente: entradas de la bitácora para la campaña ───────────── */

export function ActivityList({ activity, onRetry, limit = 5 }: { activity: ActivityView | null; onRetry: () => void; limit?: number }) {
  if (!activity) return null;
  if (activity.kind === 'loading') return <DataState state="loading" compact />;
  if (activity.kind === 'error') return <DataState state="error" title="La bitácora no se pudo consultar" description={activity.text} onRetry={onRetry} compact testId="activity-error" />;
  const recent = recentActivity(activity.logs, limit);
  if (recent.length === 0) {
    return (
      <p className="text-sm text-slate-600" data-testid="activity-empty">
        La bitácora no registra acciones para esta campaña. Los aportes de los agricultores no aparecen aquí.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-slate-100" aria-label="Actividad reciente" data-testid="activity">
      {recent.map((log) => (
        <li key={log.id} className="flex items-start gap-3 py-2 text-sm leading-snug first:pt-0 last:pb-0" data-testid={`activity-${log.action}`}>
          <span className="mt-0.5 inline-flex shrink-0 rounded-control bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{activityLabel(log.action)}</span>
          <span className="min-w-0">
            <span className="block font-medium text-ink [overflow-wrap:anywhere]">{log.summary ?? 'Acción registrada'}</span>
            <span className="block text-xs text-slate-600 [overflow-wrap:anywhere]">
              {fmtDateTime(log.createdAt)}
              {log.actor?.name && ` · ${log.actor.name}`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ── Detalle plegado: lo que no hace falta para decidir ───────────────────── */

export function Definitions() {
  const term = 'font-semibold text-ink';
  return (
    <Collapsible title="Qué significan estas cifras" testId="definitions">
      <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-xs leading-relaxed text-slate-700 sm:grid-cols-2">
        <div>
          <dt className={term}>Necesidad declarada</dt>
          <dd>Lo que cada agricultor declaró que necesita, sumado por producto canónico y unidad en el servidor. No es pronóstico, consumo ni cantidad comprada.</dd>
        </div>
        <div>
          <dt className={term}>Consumo publicado</dt>
          <dd>Aplicaciones que los agricultores registraron y publicaron desde la app. Es un dato distinto: no se resta ni se compara con la necesidad.</dd>
        </div>
        <div>
          <dt className={term}>Litros y kilogramos</dt>
          <dd>Cada unidad tiene su propia escala: litros y kilogramos no se comparan ni se suman. No hay totales por encima de cada producto.</dd>
        </div>
        <div>
          <dt className={term}>Cobertura</dt>
          <dd>Agricultores con vínculo y cuenta activos que están dentro de alguna cifra publicada. Mide participación, no que los datos estén completos. Ausencia de aporte = desconocido, no cero.</dd>
        </div>
        <div>
          <dt className={term}>Filas sin cifra</dt>
          <dd>Con menos aportantes que el umbral, en revisión o fuera de rango el servidor no publica la cifra ni el número de aportantes, para no revelar aportes individuales.</dd>
        </div>
        <div>
          <dt className={term}>Versión sellada y fechas</dt>
          <dd>Sólo se sella una campaña cerrada: cerrar y sellar son pasos distintos. «Datos hasta» es la última aceptación central de cada cifra, no la hora del teléfono ni la de esta consulta.</dd>
        </div>
      </dl>
    </Collapsible>
  );
}

export function OrderControl({ value, onChange }: { value: Order; onChange: (value: Order) => void }) {
  return <SegmentedControl label="Orden" options={ORDER_OPTIONS} value={value} onChange={onChange} testId="order" />;
}

/** Enlaces secundarios en una línea, separados por puntos. */
export function LinkRow({ children }: { children: ReactNode }) {
  return <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">{children}</p>;
}

export const quietLink = 'font-semibold text-brand-800 underline underline-offset-2 hover:text-ink';
