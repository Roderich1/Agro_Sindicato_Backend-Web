import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/app-shell';
import { DisclosureNotice, PendingChangesNote, ProductCell, QuantityCell } from '../components/collective-ui';
import { ExportButtons } from '../components/export-buttons';
import { Collapsible, DataState, inputClass, labelClass, PageHeader, Section, SectionHeader, SegmentedControl } from '../components/ui';
import { CAMPAIGN_STATUS_TEXT, collectiveError, fmtDateTime, statusReason } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { formatQuantity, isBaseQuantity } from '../lib/quantity';
import { collectiveService } from '../services/collective.service';
import type { CollectiveTrends, ProjectionType, TrendCampaign, TrendPoint, TrendSeries } from '../types/collective';

const TYPES: { type: ProjectionType; label: string; description: string }[] = [
  {
    type: 'CONSUMPTION_TOTAL',
    label: 'Consumo publicado',
    description: 'Consumo que los agricultores registraron y publicaron. Se muestra aparte: no se resta de la necesidad.',
  },
  {
    type: 'DECLARED_NEED',
    label: 'Necesidad declarada',
    description: 'Cantidad que cada agricultor declaró en la app. No es pronóstico ni recomendación.',
  },
];

/**
 * Sombra en el borde por el que una tabla sigue (sin JavaScript): los degradados blancos se desplazan con el
 * contenido (`local`) y tapan la sombra fija (`scroll`) sólo cuando se llega a ese borde. Sin desplazamiento no se ve.
 */
const SCROLL_HINT = '[background:linear-gradient(to_right,#fff_30%,rgb(255_255_255/0))_left_center/40px_100%_no-repeat_local,linear-gradient(to_left,#fff_30%,rgb(255_255_255/0))_right_center/40px_100%_no-repeat_local,radial-gradient(farthest-side_at_0_50%,rgb(15_23_42/0.2),transparent)_left_center/12px_100%_no-repeat_scroll,radial-gradient(farthest-side_at_100%_50%,rgb(15_23_42/0.2),transparent)_right_center/12px_100%_no-repeat_scroll]';

/**
 * H3 (emulador, 2026-11-11): al desplazar una tabla a lo ancho, la primera columna (campaña o producto)
 * queda fija a la izquierda con fondo opaco y un borde, para que ninguna cifra pierda su fila.
 */
const STICKY_HEAD = 'sticky left-0 z-[1] shadow-[inset_-1px_0_0_#e2e8f0] bg-slate-50';
const STICKY_CELL = 'sticky left-0 z-[1] shadow-[inset_-1px_0_0_#e2e8f0] bg-white';

const seriesKey = (line: TrendSeries) => `${line.product_ref}|${line.base_unit}`;

/** Un problema de carga, con el estado del §4 con el que se presenta. */
interface Problem {
  kind: 'error' | 'forbidden';
  message: string;
}

/**
 * F07 (2026-10-23, F07_SEALED_HISTORY_CONTRACT §8): historial entre versiones
 * selladas. Cada cifra viene del servidor, celda por celda: aquí no se suma,
 * resta, promedia ni interpola, y un hueco (cifra oculta, retirada, sin dato o
 * campaña sin sellar) nunca se dibuja como cero.
 *
 * Panel de la defensa (2026-11-05): el gráfico antes de la tabla; dos opciones
 * visibles («Consumo publicado», con la que se abre, y «Necesidad declarada») y
 * un selector de producto; unidad, campañas y valores visibles; sólo cifras
 * publicadas, con huecos. Campañas, versión y cobertura en «Ver campañas y
 * cobertura».
 *
 * Rediseño (sesión C, 2026-11-10): el cuerpo es `CollectiveTrendsView`, que
 * también usa el contenedor «Histórico y estimaciones» (`?vista=tendencias`).
 * Cada hueco del gráfico se rotula con su estado (F07 §8). En pantallas
 * estrechas el mismo dato se dibuja como barras horizontales, una fila por
 * campaña, para que 11 campañas o más se lean sin desplazamiento lateral. Sin
 * animación de datos.
 */
export function CollectiveTrendsPage() {
  return (
    <AppShell title="Tendencias" section="Colectivo">
      <CollectiveTrendsView />
    </AppShell>
  );
}

export function CollectiveTrendsView({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const [type, setType] = useState<ProjectionType>('CONSUMPTION_TOTAL');
  const [productKey, setProductKey] = useState<string | null>(null);
  const [trends, setTrends] = useState<CollectiveTrends | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (projectionType: ProjectionType) => {
    setLoading(true);
    setProblem(null);
    try {
      const data = await collectiveService.trends(projectionType);
      reportDisclosureMode(data.disclosure.mode);
      setTrends(data);
    } catch (err) {
      setTrends(null);
      const forbidden = axios.isAxiosError(err) && err.response?.status === 403;
      setProblem({ kind: forbidden ? 'forbidden' : 'error', message: collectiveError(err, 'No fue posible cargar las tendencias.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load(type));
  }, [type, load]);

  const current = TYPES.find((entry) => entry.type === type)!;
  const series = trends?.series ?? [];
  const selected = series.find((line) => seriesKey(line) === productKey) ?? series[0] ?? null;
  return (
    <div className="space-y-4">
      <PageHeader
        headingLevel={headingLevel}
        title="Histórico sellado"
        subtitle={`${current.description} Sólo cifras de versiones selladas, campaña por campaña.`}
        campaign={
          <div className="flex flex-wrap items-end gap-4" data-testid="toolbar">
            <SegmentedControl
              label="Dato"
              testId="trend-type"
              value={type}
              onChange={setType}
              options={TYPES.map((entry) => ({ value: entry.type, label: entry.label }))}
            />
            <div className="w-full min-w-0 sm:w-72">
              <label className={labelClass} htmlFor="trend-product">
                Producto
              </label>
              <select
                id="trend-product"
                className={inputClass}
                value={selected ? seriesKey(selected) : ''}
                onChange={(event) => setProductKey(event.target.value)}
                disabled={series.length === 0}
              >
                {series.length === 0 && <option value="">Sin productos con cifras selladas</option>}
                {series.map((line) => (
                  <option key={seriesKey(line)} value={seriesKey(line)}>
                    {line.product_name} ({line.presentation_unit})
                  </option>
                ))}
              </select>
            </div>
          </div>
        }
        actions={<ExportButtons kind="trends" reference={type} disabled={!trends} />}
      />
      {problem && (
        <Section>
          <DataState compact state={problem.kind} description={problem.message} onRetry={problem.kind === 'error' ? () => void load(type) : undefined} />
        </Section>
      )}
      {loading && <DataState state="loading" compact />}
      {trends && !loading && <TrendsBody trends={trends} selected={selected} typeLabel={current.label} />}
    </div>
  );
}

function TrendsBody({ trends, selected, typeLabel }: { trends: CollectiveTrends; selected: TrendSeries | null; typeLabel: string }) {
  const sealed = trends.campaigns.filter((campaign) => campaign.seal !== null);
  const unsealed = trends.campaigns.filter((campaign) => campaign.seal === null);
  return (
    <div className="space-y-4">
      <DisclosureNotice mode={trends.disclosure.mode} threshold={trends.disclosure.threshold} />
      {trends.disclosure.mode === 'PROVISIONAL_SYNTHETIC' &&
        (selected === null ? (
          <Section>
            <DataState
              state="empty"
              title="Sin series selladas"
              description={`Filtro aplicado: «${typeLabel}». No hay cifras selladas de ${typeLabel.toLowerCase()} en ninguna campaña. Eso no significa cero.`}
            />
          </Section>
        ) : (
          <Section
            label="Gráfico del historial"
            title={`${selected.product_name} · ${typeLabel}`}
            note={
              unsealed.length > 0
                ? `Una columna por campaña sellada, en ${selected.presentation_unit}. Campañas sin sellar (${unsealed.map((campaign) => campaign.name).join(', ')}) no se dibujan como histórico.`
                : `Una columna por campaña sellada, en ${selected.presentation_unit}; sin columna = sin cifra publicada, no cero.`
            }
          >
            <TrendChart line={selected} campaigns={sealed} threshold={trends.disclosure.threshold} />
          </Section>
        ))}
      <Collapsible title="Ver campañas y cobertura" testId="sources">
        <div className="space-y-5 p-5">
          <p className="text-xs text-slate-600">{trends.notice} Ningún dato individual se incorpora para enriquecer estas tendencias.</p>
          <CampaignsTable campaigns={trends.campaigns} />
          {trends.disclosure.mode === 'PROVISIONAL_SYNTHETIC' &&
            trends.series.map((line) => <SeriesTable key={seriesKey(line)} line={line} campaigns={trends.campaigns} threshold={trends.disclosure.threshold} />)}
        </div>
      </Collapsible>
    </div>
  );
}

function CampaignsTable({ campaigns }: { campaigns: TrendCampaign[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200" aria-label="Campañas y versiones">
      <SectionHeader
        title="Campañas, versión y cobertura"
        note="La cobertura es la fijada al sellar. Un cambio de cobertura entre campañas no prueba que cada agricultor consumiera o necesitara más o menos."
      />
      {campaigns.length === 0 ? (
        <DataState state="empty" compact title="Sin campañas" description="Todavía no hay campañas en el histórico." />
      ) : (
        <div className={`overflow-x-auto ${SCROLL_HINT}`}>
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-600">
              <tr>
                <th className={`px-3 py-2.5 sm:px-5 ${STICKY_HEAD}`}>Campaña</th>
                <th className="px-3 py-2.5 sm:px-5">Estado</th>
                <th className="px-3 py-2.5 sm:px-5">Versión sellada</th>
                <th className="px-3 py-2.5 sm:px-5">Cobertura al sellar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <tr key={campaign.campaign_ref} data-testid={`campaign-${campaign.name}`}>
                  <td className={`w-32 min-w-32 px-3 py-2.5 font-medium text-slate-800 [overflow-wrap:anywhere] sm:w-auto sm:min-w-40 sm:px-5 ${STICKY_CELL}`}>{campaign.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-700 sm:px-5">{CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-700 sm:px-5">
                    {campaign.seal ? `Versión ${campaign.seal.version}, sellada el ${fmtDateTime(campaign.seal.sealed_at)}` : 'Sin sellar: no aporta cifras'}
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-slate-700 sm:px-5">
                    {campaign.coverage ? `${campaign.coverage.members_with_contribution} de ${campaign.coverage.linked_members} con cifras publicadas` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SeriesTable({ line, campaigns, threshold }: { line: TrendSeries; campaigns: TrendCampaign[]; threshold: number | null }) {
  const nameOf = new Map(campaigns.map((campaign) => [campaign.campaign_ref, campaign.name]));
  const title = `${line.product_name} (${line.presentation_unit})`;
  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200"
      aria-label={title}
      data-testid={`series-${line.projection_type}-${line.product_name}-${line.base_unit}`}
    >
      <SectionHeader title={<span className="[overflow-wrap:anywhere]">{title}</span>} note="Una fila por campaña. Los huecos son campañas sin cifra publicada; no son ceros." />
      <div className={`overflow-x-auto ${SCROLL_HINT}`}>
        <table className="w-full min-w-[22rem] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-600">
            <tr>
              <th className={`px-3 py-2.5 sm:px-5 ${STICKY_HEAD}`}>Campaña</th>
              <th className="px-3 py-2.5 sm:px-5">Total publicado</th>
              <th className="px-3 py-2.5 text-right sm:px-5">Aportantes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {line.points.map((point) => (
              <tr key={point.campaign_ref} data-testid={`point-${nameOf.get(point.campaign_ref)}`}>
                <td className={`w-32 min-w-32 px-3 py-3 [overflow-wrap:anywhere] sm:w-auto sm:min-w-40 sm:px-5 ${STICKY_CELL}`}>
                  <ProductCell name={nameOf.get(point.campaign_ref) ?? ''} unit="" status={point.status} threshold={threshold} />
                </td>
                <td className="px-3 py-3 sm:px-5">
                  <QuantityCell
                    status={point.status}
                    base={point.total_base}
                    serverPresentation={point.total_presentation}
                    unit={line.base_unit}
                    threshold={threshold}
                    asOf={point.data_as_of}
                  />
                  {point.status === 'DISCLOSED' && point.pending_changes && <PendingChangesNote />}
                </td>
                <td className="px-3 py-3 text-right tabular-nums sm:px-5">{point.status === 'DISCLOSED' ? point.contributors : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Rótulo breve de un hueco, con su estado (F07 §8): ninguno es cero. */
const GAP_TEXT: Record<Exclude<TrendPoint['status'], 'DISCLOSED'>, string> = {
  SUPPRESSED_UNDER_THRESHOLD: 'oculto',
  SUPPRESSED_REVISION: 'en revisión',
  OVERFLOW: 'fuera de rango',
  WITHDRAWN_AFTER_SEAL: 'retirado',
  NO_DATA: 'sin dato',
  NOT_SEALED: 'sin sellar',
};

/** Una columna o fila del gráfico: cifra publicada (BigInt) o hueco rotulado. */
interface Column {
  campaign: TrendCampaign;
  point: TrendPoint | null;
  value: bigint | null;
  label: string | null;
  gap: string;
  reason: string;
}

function columnsOf(line: TrendSeries, campaigns: TrendCampaign[], threshold: number | null): Column[] {
  const pointOf = new Map(line.points.map((point) => [point.campaign_ref, point]));
  return campaigns.map((campaign) => {
    const point = pointOf.get(campaign.campaign_ref) ?? null;
    const value = point && point.status === 'DISCLOSED' && isBaseQuantity(point.total_base) ? BigInt(point.total_base!) : null;
    const label = point && point.status === 'DISCLOSED' ? formatQuantity(point.total_base, line.base_unit, point.total_presentation) : null;
    const status = point?.status ?? 'NO_DATA';
    const gap = status === 'DISCLOSED' ? 'cifra no válida' : GAP_TEXT[status];
    const reason = status === 'DISCLOSED' ? 'El dato recibido no es válido; no se muestra.' : (statusReason(status, threshold) ?? '');
    return { campaign, point, value, label, gap, reason };
  });
}

/** Ancho útil del gráfico a 1366 px: las columnas se estrechan para que 11 campañas o más quepan sin desplazamiento. */
const CHART_WIDTH = 1000;
const MAX_STEP = 136;
const MIN_STEP = 84;
const PAD = { left: 28, right: 28, top: 40, bottom: 56 };
const PLOT_HEIGHT = 190;
const LINE_CHARS = 17;

/** Nombre de campaña en hasta dos líneas de ~17 caracteres, sin cortar palabras; sólo se abrevia si no cabe. */
function wrapName(name: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of name.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= LINE_CHARS || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > 2) return [lines[0]!, `${lines.slice(1).join(' ').slice(0, LINE_CHARS - 1)}…`];
  return lines.map((line) => (line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS - 1)}…` : line));
}

/** Proporción exacta en milésimas (BigInt): la cifra escrita es siempre la del servidor. */
const permille = (value: bigint, max: bigint) => (max === 0n ? 0 : Number((value * 1000n) / max));

/**
 * Columnas de una sola serie (una unidad, una escala) sobre las campañas
 * selladas, en orden. Sólo se dibujan los puntos publicados, cada uno con su
 * cantidad y unidad encima; un hueco se rotula con su estado y no tiene
 * columna. Un solo color: no hay series que distinguir. En pantallas
 * estrechas, las mismas cifras como barras horizontales.
 */
function TrendChart({ line, campaigns, threshold }: { line: TrendSeries; campaigns: TrendCampaign[]; threshold: number | null }) {
  const columns = columnsOf(line, campaigns, threshold);
  const max = columns.reduce<bigint>((top, { value }) => (value !== null && value > top ? value : top), 0n);
  const shown = columns.filter(({ value, label }) => value !== null && label !== null).length;
  const summary = `${line.product_name}: ${shown} de ${columns.length} campañas selladas con cifra publicada; las demás son huecos, no ceros.`;
  return (
    <>
      <div className="hidden overflow-x-auto px-5 py-4 sm:block">
        <ColumnsSvg line={line} columns={columns} max={max} summary={summary} />
      </div>
      <CompactBars line={line} columns={columns} max={max} summary={summary} />
    </>
  );
}

function ColumnsSvg({ line, columns, max, summary }: { line: TrendSeries; columns: Column[]; max: bigint; summary: string }) {
  const STEP = Math.max(MIN_STEP, Math.min(MAX_STEP, Math.floor((CHART_WIDTH - PAD.left - PAD.right) / Math.max(columns.length, 1))));
  const COLUMN = Math.min(52, STEP - 32);
  const valueSize = STEP < 110 ? 14 : 17;
  const width = PAD.left + PAD.right + STEP * Math.max(columns.length, 1);
  const height = PAD.top + PLOT_HEIGHT + PAD.bottom;
  const x = (index: number) => PAD.left + STEP * index + (STEP - COLUMN) / 2;
  const h = (value: bigint) => (permille(value, max) * PLOT_HEIGHT) / 1000;
  const baseline = PAD.top + PLOT_HEIGHT;
  return (
    <svg role="img" aria-label={summary} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-emerald-700" data-testid="trend-chart">
      <text x={PAD.left - 8} y={16} fontSize={11} fill="#475569">
        {line.presentation_unit} por campaña sellada
      </text>
      <line x1={PAD.left - 8} x2={width - PAD.right + 8} y1={baseline} y2={baseline} stroke="#cbd5e1" strokeWidth={1} />
      {columns.map(({ campaign, value, label, gap, reason }, index) => {
        const name = wrapName(campaign.name);
        return (
          <g key={campaign.campaign_ref}>
            {value !== null && label ? (
              <>
                <rect
                  data-testid="trend-point"
                  x={x(index)}
                  y={baseline - Math.max(h(value), 2)}
                  width={COLUMN}
                  height={Math.max(h(value), 2)}
                  rx={4}
                  fill="currentColor"
                >
                  <title>{`${campaign.name}: ${label}`}</title>
                </rect>
                <text x={x(index) + COLUMN / 2} y={baseline - Math.max(h(value), 2) - 10} textAnchor="middle" fontSize={valueSize} fontWeight={700} fill="#0f172a">
                  {label}
                </text>
              </>
            ) : (
              <text x={x(index) + COLUMN / 2} y={baseline - 10} textAnchor="middle" fontSize={11} fill="#64748b" data-testid="trend-gap">
                <tspan>{gap}</tspan>
                <title>{`${campaign.name}: ${reason}`}</title>
              </text>
            )}
            <text x={x(index) + COLUMN / 2} y={baseline + 20} textAnchor="middle" fontSize={12} fill="#475569">
              {name.map((part, row) => (
                <tspan key={row} x={x(index) + COLUMN / 2} dy={row === 0 ? 0 : 15}>
                  {part}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Barras horizontales para pantallas estrechas: una fila por campaña, nombre completo, cifra sin truncar. */
function CompactBars({ line, columns, max, summary }: { line: TrendSeries; columns: Column[]; max: bigint; summary: string }) {
  return (
    <div className="px-4 py-3 sm:hidden">
      <p className="mb-2 text-[11px] text-slate-600">{line.presentation_unit} por campaña sellada</p>
      <ul className="space-y-2.5" aria-label={summary} data-testid="trend-chart-compact">
        {columns.map(({ campaign, value, label, gap, reason }) => (
          <li key={campaign.campaign_ref} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-xs text-slate-700 [overflow-wrap:anywhere]">{campaign.name}</span>
              {value !== null && label ? (
                <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">{label}</span>
              ) : (
                <span className="shrink-0 text-xs text-slate-600" title={reason}>
                  {gap}
                </span>
              )}
            </div>
            {value !== null && label && (
              <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden="true">
                <div className="h-2 rounded-full bg-emerald-700" style={{ width: `${value > 0n ? Math.max(permille(value, max) / 10, 1) : 0}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
