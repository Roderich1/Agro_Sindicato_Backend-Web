import axios from 'axios';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/app-shell';
import { DisclosureNotice, PendingChangesNote, QuantityCell } from '../components/collective-ui';
import { ExportButtons } from '../components/export-buttons';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Collapsible, DataState, dataStateKindForError, FilterChips, ICON, Icon, PageHeader, SearchInput, SectionHeader, SegmentedControl, type DataStateKind } from '../components/ui';
import { CAMPAIGN_STATUS_TEXT, collectiveError, fmtDateTime, statusReason } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { filterHistorySeries, historyProductKey, scopeHistory, type HistoryUnitFilter } from '../lib/history-scope';
import { formatQuantity, isBaseQuantity, type BaseUnit } from '../lib/quantity';
import { collectiveService } from '../services/collective.service';
import type { CollectiveTrends, ProjectionType, TrendCampaign, TrendPoint, TrendSeries } from '../types/collective';

const TYPES: { type: ProjectionType; label: string; description: string }[] = [
  {
    type: 'CONSUMPTION_TOTAL',
    label: 'Consumo publicado',
    description: 'Consumo publicado por campaña.',
  },
  {
    type: 'DECLARED_NEED',
    label: 'Necesidad declarada',
    description: 'Necesidad declarada por campaña.',
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


/** Un problema de carga, con el estado del §4 con el que se presenta. */
interface Problem {
  kind: DataStateKind;
  message: string;
}

const UNIT_WORD: Record<'L' | 'KG', string> = { L: 'litros', KG: 'kilogramos' };
const COUNT = new Intl.NumberFormat('es-BO');

/**
 * F07 (2026-10-23, F07_SEALED_HISTORY_CONTRACT §8): historial entre versiones
 * selladas. Cada cifra viene del servidor, celda por celda: aquí no se suma,
 * resta, promedia ni interpola, y un hueco (sin cifra, retirada, sin dato o
 * campaña sin sellar) nunca se dibuja como cero.
 *
 * Rediseño comparativo: presenta una matriz Productos × Campañas para ver
 * todos los productos a la vez sin ciclar un selector, con búsqueda instantánea,
 * filtro por unidad (L / KG, sin mezclar escalas) y el gráfico de barras de un
 * producto desplegable bajo demanda en cualquier fila.
 */
export function CollectiveTrendsPage() {
  return (
    <AppShell title="Tendencias" section="Colectivo">
      <CollectiveTrendsView />
    </AppShell>
  );
}

export function CollectiveTrendsView({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const [params, setParams] = useSearchParams();
  const campaignId = params.get('campaign') ?? '';
  const chooseCampaign = (next: string) => {
    setParams((previous) => {
      const query = new URLSearchParams(previous);
      if (next) query.set('campaign', next);
      else query.delete('campaign');
      return query;
    });
  };
  const [type, setType] = useState<ProjectionType>('CONSUMPTION_TOTAL');
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<HistoryUnitFilter>('ALL');
  const [expandedProductKey, setExpandedProductKey] = useState<string | null>(null);
  const [trends, setTrends] = useState<CollectiveTrends | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(false);
  const latestRequest = useRef(0);

  const load = useCallback(async (projectionType: ProjectionType) => {
    const request = latestRequest.current + 1;
    latestRequest.current = request;
    setLoading(true);
    setProblem(null);
    try {
      const data = await collectiveService.trends(projectionType);
      if (request !== latestRequest.current) return;
      reportDisclosureMode(data.disclosure.mode);
      setTrends(data);
    } catch (err) {
      if (request !== latestRequest.current) return;
      setTrends(null);
      const kind = axios.isAxiosError(err) ? dataStateKindForError(err) : 'error';
      setProblem({ kind, message: collectiveError(err, 'No fue posible cargar las tendencias.') });
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const beforeInitialLoad = latestRequest.current;
    void Promise.resolve().then(() => {
      if (mounted && latestRequest.current === beforeInitialLoad) {
        return load('CONSUMPTION_TOTAL');
      }
    });
    return () => {
      mounted = false;
      latestRequest.current += 1;
    };
  }, [load]);

  const chooseType = (next: ProjectionType) => {
    if (next === type) return;
    setExpandedProductKey(null);
    setType(next);
    void load(next);
  };

  const current = TYPES.find((entry) => entry.type === type)!;
  const fullSealedCampaigns = trends ? trends.campaigns.filter((campaign) => campaign.seal !== null) : [];
  const fullSeriesByKey = new Map((trends?.series ?? []).map((line) => [historyProductKey(line), line]));
  const history = trends ? scopeHistory(trends, { campaignId }) : null;
  const byQuery = history ? filterHistorySeries(history.series, { query: searchQuery }) : [];
  const visibleSeries = history ? filterHistorySeries(history.series, { unit: unitFilter, query: searchQuery }) : [];
  const litersCount = byQuery.filter((line) => line.presentation_unit === 'L').length;
  const kilosCount = byQuery.filter((line) => line.presentation_unit === 'KG').length;
  const hasActiveFilters = searchQuery.trim() !== '' || unitFilter !== 'ALL';

  const clearFilters = () => {
    setSearchQuery('');
    setUnitFilter('ALL');
  };

  const toggleProduct = (key: string) => {
    setExpandedProductKey((previous) => (previous === key ? null : key));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        headingLevel={headingLevel}
        title="Histórico de campañas"
        subtitle={current.description}
      />
      <div className="flex flex-wrap items-center gap-3" data-testid="toolbar">
        <SegmentedControl
          label="Dato"
          hideLabel
          testId="trend-type"
          value={type}
          onChange={chooseType}
          options={TYPES.map((entry) => ({ value: entry.type, label: entry.label }))}
        />
        <div className="flex min-w-0 items-center gap-2">
          <label className="sr-only" htmlFor="trend-campaign">Campaña</label>
          <select
            id="trend-campaign"
            className="min-h-11 max-w-full rounded-full border border-line bg-surface px-4 font-semibold text-ink"
            value={campaignId}
            onChange={(event) => chooseCampaign(event.target.value)}
          >
            <option value="">Todas las campañas</option>
            {campaignId && !trends?.campaigns.some((campaign) => campaign.campaign_ref === campaignId && campaign.seal) &&
              <option value={campaignId}>Campaña sin resultados históricos</option>}
            {fullSealedCampaigns.map((campaign) => (
              <option key={campaign.campaign_ref} value={campaign.campaign_ref}>{campaign.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:ml-auto">
          <ExportButtons
            kind="trends"
            reference={type}
            disabled={!history?.campaigns.length || visibleSeries.length === 0 || loading}
            historyScope={{ campaignId, unit: unitFilter, query: searchQuery }}
          />
        </div>
      </div>
      {history && !loading && history.disclosure.mode !== 'POLICY_PENDING' && history.series.length > 0 && (
        <div className="flex flex-wrap items-center gap-3" data-testid="trend-filters">
          <SearchInput
            id="trend-search"
            label="Buscar producto"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Buscar producto…"
            enterKeyHint="search"
            inputMode="search"
            autoComplete="off"
            fieldClassName="w-full min-w-0 sm:w-72"
          />
          <FilterChips
            label="Filtrar por unidad"
            testId="trend-unit-filter"
            value={unitFilter}
            onChange={setUnitFilter}
            options={[
              { value: 'ALL', label: 'Todas', count: byQuery.length },
              { value: 'L', label: 'Litros (L)', count: litersCount },
              { value: 'KG', label: 'Kilogramos (KG)', count: kilosCount },
            ]}
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Quitar filtros
            </Button>
          )}
        </div>
      )}
      {problem && (
        <Card>
          <DataState
            state={problem.kind}
            description={problem.kind === 'offline' || problem.kind === 'busy' ? undefined : problem.message}
            onRetry={problem.kind === 'forbidden' ? undefined : () => void load(type)}
          />
        </Card>
      )}
      {loading && (
        <Card>
          <DataState state="loading" title="Cargando el histórico…" skeletonRows={3} />
        </Card>
      )}
      {history && !loading && (
        <TrendsBody
          trends={history}
          visibleSeries={visibleSeries}
          fullSealedCampaigns={fullSealedCampaigns}
          fullSeriesByKey={fullSeriesByKey}
          campaignId={campaignId}
          typeLabel={current.label}
          expandedProductKey={expandedProductKey}
          onToggleProduct={toggleProduct}
          onCloseChart={() => setExpandedProductKey(null)}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />
      )}
    </div>
  );
}

interface TrendsBodyProps {
  trends: CollectiveTrends;
  visibleSeries: TrendSeries[];
  fullSealedCampaigns: TrendCampaign[];
  fullSeriesByKey: Map<string, TrendSeries>;
  campaignId: string;
  typeLabel: string;
  expandedProductKey: string | null;
  onToggleProduct: (key: string) => void;
  onCloseChart: () => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

function TrendsBody({
  trends,
  visibleSeries,
  fullSealedCampaigns,
  fullSeriesByKey,
  campaignId,
  typeLabel,
  expandedProductKey,
  onToggleProduct,
  onCloseChart,
  hasActiveFilters,
  onClearFilters,
}: TrendsBodyProps) {
  const sealed = trends.campaigns.filter((campaign) => campaign.seal !== null);
  const policyPending = trends.disclosure.mode === 'POLICY_PENDING';
  const hasAnySeries = trends.series.length > 0 && sealed.length > 0;

  return (
    <div className="space-y-4">
      <DisclosureNotice mode={trends.disclosure.mode} />
      {!policyPending &&
        (!hasAnySeries ? (
          <Card>
            <DataState state="empty" title="Sin datos disponibles" />
          </Card>
        ) : visibleSeries.length === 0 ? (
          <Card>
            <DataState
              state="empty"
              title="Sin coincidencias"
              description="Ningún producto coincide con el filtro actual."
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" onClick={onClearFilters}>
                    Quitar filtros
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : campaignId ? (
          <SingleCampaignList
            campaign={sealed[0]!}
            series={visibleSeries}
            fullSealedCampaigns={fullSealedCampaigns}
            fullSeriesByKey={fullSeriesByKey}
            typeLabel={typeLabel}
            expandedProductKey={expandedProductKey}
            onToggleProduct={onToggleProduct}
            onCloseChart={onCloseChart}
          />
        ) : (
          <ComparativeMatrix
            campaigns={sealed}
            series={visibleSeries}
            typeLabel={typeLabel}
            expandedProductKey={expandedProductKey}
            onToggleProduct={onToggleProduct}
            onCloseChart={onCloseChart}
          />
        ))}
      {!policyPending && hasAnySeries && visibleSeries.length > 0 && <HowToRead />}
      <Collapsible title="Ver campañas y cobertura" testId="sources">
        <div className="p-5">
          <CampaignsTable campaigns={trends.campaigns} />
        </div>
      </Collapsible>
    </div>
  );
}

function ProductTitle({ name, unit }: { name: string; unit: 'L' | 'KG' }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-ink [overflow-wrap:anywhere]">{name}</span>
      <span className="inline-flex shrink-0 items-center rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-ink">
        {unit}
      </span>
    </div>
  );
}

function ChartToggleButton({
  productName,
  expanded,
  onClick,
  ariaPrefix = '',
}: {
  productName: string;
  expanded: boolean;
  onClick: () => void;
  ariaPrefix?: string;
}) {
  const prefix = ariaPrefix ? `${ariaPrefix} ` : '';
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={`${expanded ? `Ocultar gráfico${prefix}` : `Ver gráfico${prefix}`} de ${productName}`}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${
        expanded ? 'bg-ink text-white' : 'border border-line bg-surface text-ink hover:border-ink'
      }`}
    >
      <Icon d={expanded ? ICON.chevronUp : ICON.chart} className="h-4 w-4" />
      {expanded ? 'Ocultar' : 'Ver gráfico'}
    </button>
  );
}

function MatrixCell({ point, unit }: { point: TrendPoint | null; unit: BaseUnit }) {
  if (!point) {
    return (
      <span className="inline-block text-xs leading-snug text-ink-muted" title={statusReason('NO_DATA') ?? undefined}>
        {GAP_TEXT.NO_DATA}
      </span>
    );
  }
  if (point.status !== 'DISCLOSED') {
    return (
      <span className="inline-block text-xs leading-snug text-ink-muted" title={statusReason(point.status) ?? undefined}>
        {GAP_TEXT[point.status]}
      </span>
    );
  }
  const text = formatQuantity(point.total_base, unit, point.total_presentation);
  if (text === null) {
    return <span className="text-xs font-semibold text-danger-ink">Dato no válido</span>;
  }
  return (
    <div className="space-y-0.5">
      <span className="block whitespace-nowrap font-display text-base font-bold leading-tight tabular-nums text-ink">
        {text}
      </span>
      {point.contributors !== null && (
        <span className="block text-xs tabular-nums text-ink-muted">
          {COUNT.format(point.contributors)} {point.contributors === 1 ? 'aportante' : 'aportantes'}
        </span>
      )}
      {point.pending_changes && <PendingChangesNote />}
    </div>
  );
}

function ComparativeMatrix({
  campaigns,
  series,
  typeLabel,
  expandedProductKey,
  onToggleProduct,
  onCloseChart,
}: {
  campaigns: TrendCampaign[];
  series: TrendSeries[];
  typeLabel: string;
  expandedProductKey: string | null;
  onToggleProduct: (key: string) => void;
  onCloseChart: () => void;
}) {
  return (
    <section
      aria-label="Comparativa por producto y campaña"
      className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card"
      data-testid="trends-matrix"
    >
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 className="text-xl font-bold text-ink sm:text-2xl">{typeLabel} por producto y campaña</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Cada celda muestra la cifra publicada y sus aportantes. Los huecos nunca son cero; las cifras no se suman ni promedian entre campañas, productos ni unidades.
        </p>
      </div>

      {/* Escritorio y tableta: tabla comparativa con producto fijo y gráfico bajo demanda */}
      <div
        className={`hidden overflow-x-auto sm:block ${SCROLL_HINT}`}
        role="region"
        aria-label="Matriz comparativa de productos por campaña"
        tabIndex={0}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th scope="col" className={`min-w-52 max-w-72 px-4 py-3 font-semibold uppercase tracking-wider ${STICKY_HEAD}`}>
                Producto
              </th>
              {campaigns.map((campaign) => (
                <th key={campaign.campaign_ref} scope="col" className="min-w-36 px-3 py-3 align-bottom">
                  <span className="block font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{campaign.name}</span>
                  <span className="mt-1 block text-[11px] font-semibold tabular-nums text-ink-muted" data-testid="matrix-coverage">
                    Cobertura: {coverageText(campaign)}
                  </span>
                </th>
              ))}
              <th scope="col" className="w-32 px-3 py-3 text-right font-semibold uppercase tracking-wider">
                Gráfico
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {series.map((line) => {
              const key = historyProductKey(line);
              const expanded = expandedProductKey === key;
              const pointOf = new Map(line.points.map((point) => [point.campaign_ref, point]));
              return (
                <Fragment key={key}>
                  <tr
                    data-testid={`series-${line.projection_type}-${line.product_name}-${line.base_unit}`}
                    className={expanded ? 'bg-sunken/40' : 'hover:bg-slate-50/70'}
                  >
                    <td className={`min-w-52 max-w-72 px-4 py-3 align-top ${STICKY_CELL}`}>
                      <ProductTitle name={line.product_name} unit={line.presentation_unit} />
                    </td>
                    {campaigns.map((campaign) => (
                      <td
                        key={campaign.campaign_ref}
                        className="px-3 py-3 align-top"
                        data-testid={`point-${campaign.name}`}
                      >
                        <MatrixCell point={pointOf.get(campaign.campaign_ref) ?? null} unit={line.base_unit} />
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right align-top">
                      <ChartToggleButton productName={line.product_name} expanded={expanded} onClick={() => onToggleProduct(key)} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr data-testid="trend-chart-row" className="bg-canvas/50">
                      <td colSpan={campaigns.length + 2} className="p-4 sm:p-6">
                        <ExpandedDesktopChart line={line} campaigns={campaigns} typeLabel={typeLabel} onClose={onCloseChart} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pantallas estrechas: tarjetas por producto sin desplazamiento horizontal incómodo */}
      <ul className="divide-y divide-line sm:hidden" data-testid="trends-cards">
        {series.map((line) => {
          const key = historyProductKey(line);
          const expanded = expandedProductKey === key;
          const pointOf = new Map(line.points.map((point) => [point.campaign_ref, point]));
          const columns = columnsOf(line, campaigns);
          const max = columns.reduce<bigint>((top, { value }) => (value !== null && value > top ? value : top), 0n);
          const shown = columns.filter(({ value, label }) => value !== null && label !== null).length;
          const summary = `${line.product_name}: ${shown} de ${columns.length} campañas con cifra publicada; las demás son huecos, no ceros.`;
          return (
            <li
              key={key}
              className="space-y-3 p-4"
              data-testid={`card-series-${line.projection_type}-${line.product_name}-${line.base_unit}`}
            >
              <div className="flex items-start justify-between gap-3">
                <ProductTitle name={line.product_name} unit={line.presentation_unit} />
                <ChartToggleButton
                  productName={line.product_name}
                  expanded={expanded}
                  ariaPrefix="compacto"
                  onClick={() => onToggleProduct(key)}
                />
              </div>
              <dl className="divide-y divide-slate-100 text-sm">
                {campaigns.map((campaign) => (
                  <div key={campaign.campaign_ref} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <dt className="font-medium text-ink [overflow-wrap:anywhere]">{campaign.name}</dt>
                      <dd className="text-xs tabular-nums text-ink-muted">Cobertura: {coverageText(campaign)}</dd>
                    </div>
                    <dd className="shrink-0 text-right">
                      <MatrixCell point={pointOf.get(campaign.campaign_ref) ?? null} unit={line.base_unit} />
                    </dd>
                  </div>
                ))}
              </dl>
              {expanded && (
                <div className="rounded-xl border border-line bg-surface pb-4">
                  <CompactBars line={line} columns={columns} max={max} summary={summary} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SingleCampaignList({
  campaign,
  series,
  fullSealedCampaigns,
  fullSeriesByKey,
  typeLabel,
  expandedProductKey,
  onToggleProduct,
  onCloseChart,
}: {
  campaign: TrendCampaign;
  series: TrendSeries[];
  fullSealedCampaigns: TrendCampaign[];
  fullSeriesByKey: Map<string, TrendSeries>;
  typeLabel: string;
  expandedProductKey: string | null;
  onToggleProduct: (key: string) => void;
  onCloseChart: () => void;
}) {
  return (
    <section
      aria-label={`Productos en ${campaign.name}`}
      className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card"
      data-testid="trends-campaign-list"
    >
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 className="text-xl font-bold text-ink [overflow-wrap:anywhere] sm:text-2xl">{campaign.name}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {typeLabel} · Cobertura histórica:{' '}
          <strong className="font-semibold tabular-nums text-ink" data-testid="matrix-coverage">
            {coverageText(campaign)}
          </strong>
          {campaign.seal ? ` · Resultados fijados el ${fmtDateTime(campaign.seal.sealed_at)}` : ''}
        </p>
      </div>

      {/* Escritorio y tableta */}
      <div
        className={`hidden overflow-x-auto sm:block ${SCROLL_HINT}`}
        role="region"
        aria-label={`Cifras de ${campaign.name}`}
        tabIndex={0}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th scope="col" className={`min-w-52 px-4 py-3 font-semibold ${STICKY_HEAD}`}>
                Producto
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {typeLabel}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Aportantes
              </th>
              <th scope="col" className="w-32 px-4 py-3 text-right font-semibold">
                Gráfico
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {series.map((line) => {
              const key = historyProductKey(line);
              const expanded = expandedProductKey === key;
              const point = line.points.find((entry) => entry.campaign_ref === campaign.campaign_ref) ?? null;
              const status = point?.status ?? 'NO_DATA';
              const fullLine = fullSeriesByKey.get(key) ?? line;
              const chartCampaigns = fullSealedCampaigns.length > 0 ? fullSealedCampaigns : [campaign];
              return (
                <Fragment key={key}>
                  <tr
                    data-testid={`series-${line.projection_type}-${line.product_name}-${line.base_unit}`}
                    className={expanded ? 'bg-sunken/40' : 'hover:bg-slate-50/70'}
                  >
                    <td className={`min-w-52 px-4 py-3 align-top ${STICKY_CELL}`}>
                      <ProductTitle name={line.product_name} unit={line.presentation_unit} />
                    </td>
                    <td className="px-4 py-3 align-top" data-testid={`point-${campaign.name}`}>
                      <QuantityCell
                        status={status}
                        base={point?.total_base ?? null}
                        serverPresentation={point?.total_presentation ?? null}
                        unit={line.base_unit}
                        asOf={point?.data_as_of}
                      />
                      {point?.status === 'DISCLOSED' && point.pending_changes && <PendingChangesNote />}
                    </td>
                    <td className="px-4 py-3 text-right align-top tabular-nums text-ink">
                      {point?.status === 'DISCLOSED' && point.contributors !== null ? COUNT.format(point.contributors) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <ChartToggleButton productName={line.product_name} expanded={expanded} onClick={() => onToggleProduct(key)} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr data-testid="trend-chart-row" className="bg-canvas/50">
                      <td colSpan={4} className="p-4 sm:p-6">
                        <ExpandedDesktopChart
                          line={fullLine}
                          campaigns={chartCampaigns}
                          typeLabel={typeLabel}
                          note="Evolución entre todas las campañas con resultados"
                          onClose={onCloseChart}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pantallas estrechas */}
      <ul className="divide-y divide-line sm:hidden" data-testid="trends-cards">
        {series.map((line) => {
          const key = historyProductKey(line);
          const expanded = expandedProductKey === key;
          const point = line.points.find((entry) => entry.campaign_ref === campaign.campaign_ref) ?? null;
          const status = point?.status ?? 'NO_DATA';
          const fullLine = fullSeriesByKey.get(key) ?? line;
          const chartCampaigns = fullSealedCampaigns.length > 0 ? fullSealedCampaigns : [campaign];
          const columns = columnsOf(fullLine, chartCampaigns);
          const max = columns.reduce<bigint>((top, { value }) => (value !== null && value > top ? value : top), 0n);
          const shown = columns.filter(({ value, label }) => value !== null && label !== null).length;
          const summary = `${fullLine.product_name}: ${shown} de ${columns.length} campañas con cifra publicada; las demás son huecos, no ceros.`;
          return (
            <li
              key={key}
              className="space-y-3 p-4"
              data-testid={`card-series-${line.projection_type}-${line.product_name}-${line.base_unit}`}
            >
              <div className="flex items-start justify-between gap-3">
                <ProductTitle name={line.product_name} unit={line.presentation_unit} />
                <ChartToggleButton
                  productName={line.product_name}
                  expanded={expanded}
                  ariaPrefix="compacto"
                  onClick={() => onToggleProduct(key)}
                />
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <QuantityCell
                  status={status}
                  base={point?.total_base ?? null}
                  serverPresentation={point?.total_presentation ?? null}
                  unit={line.base_unit}
                  asOf={point?.data_as_of}
                />
                <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                  {point?.status === 'DISCLOSED' && point.contributors !== null
                    ? `${COUNT.format(point.contributors)} ${point.contributors === 1 ? 'aportante' : 'aportantes'}`
                    : '—'}
                </span>
              </div>
              {point?.status === 'DISCLOSED' && point.pending_changes && <PendingChangesNote />}
              {expanded && (
                <div className="rounded-xl border border-line bg-surface pb-4">
                  <CompactBars line={fullLine} columns={columns} max={max} summary={summary} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ExpandedDesktopChart({
  line,
  campaigns,
  typeLabel,
  note,
  onClose,
}: {
  line: TrendSeries;
  campaigns: TrendCampaign[];
  typeLabel: string;
  note?: string;
  onClose: () => void;
}) {
  const columns = columnsOf(line, campaigns);
  const max = columns.reduce<bigint>((top, { value }) => (value !== null && value > top ? value : top), 0n);
  const shown = columns.filter(({ value, label }) => value !== null && label !== null).length;
  const summary = `${line.product_name}: ${shown} de ${columns.length} campañas con cifra publicada; las demás son huecos, no ceros.`;
  return (
    <section
      aria-label={`Gráfico de ${line.product_name}`}
      className="min-w-0 rounded-xl border border-line bg-surface py-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-ink [overflow-wrap:anywhere]">{line.product_name}</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {typeLabel} por campaña, en {UNIT_WORD[line.presentation_unit]}. Bajo cada campaña, su cobertura.
            {note ? ` · ${note}` : ''}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar gráfico
        </Button>
      </div>
      <div className="overflow-x-auto px-5 pt-4">
        <ColumnsSvg line={line} columns={columns} max={max} summary={summary} />
      </div>
    </section>
  );
}

/** «Cómo leerlo» (lámina 25), sin «Campaña más alta» (H-10); versión compacta bajo la matriz. */
function HowToRead() {
  return (
    <section
      aria-labelledby="como-leerlo"
      className="rounded-card border border-line bg-surface px-5 py-4 shadow-card sm:px-6"
      data-testid="how-to-read"
    >
      <h2 id="como-leerlo" className="text-base font-bold text-ink">
        Cómo leerlo
      </h2>
      <ul className="mt-2 flex flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-muted list-disc sm:flex-row sm:flex-wrap sm:gap-x-8">
        <li>Un hueco es «sin dato» o «sin cifra», nunca cero.</li>
        <li>La cobertura cambia entre campañas: un cambio de cobertura no prueba un cambio de consumo de cada agricultor.</li>
      </ul>
    </section>
  );
}

function CampaignsTable({ campaigns }: { campaigns: TrendCampaign[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200" aria-label="Campañas y versiones">
      <SectionHeader
        title="Campañas y cobertura"
        note="Se muestra la cobertura registrada para cada campaña. Un cambio de cobertura entre campañas no prueba que cada agricultor consumiera o necesitara más o menos."
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
                <th className="px-3 py-2.5 sm:px-5">Resultados fijados</th>
                <th className="px-3 py-2.5 sm:px-5">Cobertura histórica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <tr key={campaign.campaign_ref} data-testid={`campaign-${campaign.name}`}>
                  <td className={`w-32 min-w-32 px-3 py-2.5 font-medium text-slate-800 [overflow-wrap:anywhere] sm:w-auto sm:min-w-40 sm:px-5 ${STICKY_CELL}`}>{campaign.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-700 sm:px-5">{CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-700 sm:px-5">
                    {campaign.seal ? `${fmtDateTime(campaign.seal.sealed_at)}` : 'Sin resultados históricos'}
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

/** Rótulo breve de un hueco, con su estado (F07 §8): ninguno es cero. */
const GAP_TEXT: Record<Exclude<TrendPoint['status'], 'DISCLOSED'>, string> = {
  SUPPRESSED_UNDER_THRESHOLD: 'sin datos disponibles',
  SUPPRESSED_REVISION: 'en revisión',
  OVERFLOW: 'fuera de rango',
  WITHDRAWN_AFTER_SEAL: 'retirado',
  NO_DATA: 'sin dato',
  NOT_SEALED: 'sin resultados históricos',
};

/** Cobertura histórica de una campaña, corta («14 de 15»); sin dato, «sin cobertura». */
function coverageText(campaign: TrendCampaign): string {
  return campaign.coverage ? `${COUNT.format(campaign.coverage.members_with_contribution)} de ${COUNT.format(campaign.coverage.linked_members)}` : 'sin cobertura';
}

/** Una columna o fila del gráfico: cifra publicada (BigInt) o hueco rotulado. */
interface Column {
  campaign: TrendCampaign;
  point: TrendPoint | null;
  value: bigint | null;
  label: string | null;
  gap: string;
  reason: string;
}

function columnsOf(line: TrendSeries, campaigns: TrendCampaign[]): Column[] {
  const pointOf = new Map(line.points.map((point) => [point.campaign_ref, point]));
  return campaigns.map((campaign) => {
    const point = pointOf.get(campaign.campaign_ref) ?? null;
    const value = point && point.status === 'DISCLOSED' && isBaseQuantity(point.total_base) ? BigInt(point.total_base!) : null;
    const label = point && point.status === 'DISCLOSED' ? formatQuantity(point.total_base, line.base_unit, point.total_presentation) : null;
    const status = point?.status ?? 'NO_DATA';
    const gap = status === 'DISCLOSED' ? 'cifra no válida' : GAP_TEXT[status];
    const reason = status === 'DISCLOSED' ? 'El dato recibido no es válido; no se muestra.' : (statusReason(status) ?? '');
    return { campaign, point, value, label, gap, reason };
  });
}

/** Ancho útil del gráfico a 1366 px: las columnas se estrechan para que 11 campañas o más quepan sin desplazamiento. */
const CHART_WIDTH = 1000;
const MAX_STEP = 136;
const MIN_STEP = 84;
const PAD = { left: 28, right: 28, top: 40, bottom: 78 };
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
    <svg role="img" aria-label={summary} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-ink" data-testid="trend-chart">
      <text x={PAD.left - 8} y={16} fontSize={12} fill="#55645a">
        {line.presentation_unit} por campaña
      </text>
      <line x1={PAD.left - 8} x2={width - PAD.right + 8} y1={baseline} y2={baseline} stroke="#0f2a1d" strokeWidth={2} />
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
                  rx={10}
                  fill="currentColor"
                >
                  <title>{`${campaign.name}: ${label}`}</title>
                </rect>
                <text x={x(index) + COLUMN / 2} y={baseline - Math.max(h(value), 2) - 10} textAnchor="middle" fontSize={valueSize} fontWeight={700} fill="#0f2a1d">
                  {label}
                </text>
              </>
            ) : (
              <text x={x(index) + COLUMN / 2} y={baseline - 10} textAnchor="middle" fontSize={12} fill="#55645a" data-testid="trend-gap">
                <tspan>{gap}</tspan>
                <title>{`${campaign.name}: ${reason}`}</title>
              </text>
            )}
            <text x={x(index) + COLUMN / 2} y={baseline + 22} textAnchor="middle" fontSize={13} fill="#55645a">
              {name.map((part, row) => (
                <tspan key={row} x={x(index) + COLUMN / 2} dy={row === 0 ? 0 : 15}>
                  {part}
                </tspan>
              ))}
            </text>
            <text x={x(index) + COLUMN / 2} y={baseline + 22 + 15 * name.length + 4} textAnchor="middle" fontSize={11} fill="#0f2a1d" fontWeight={600} data-testid="trend-coverage">
              {coverageText(campaign)}
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
    <div className="px-5 pt-4 sm:hidden">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Solo campañas · {line.presentation_unit}</p>
      <ul className="divide-y divide-line" aria-label={summary} data-testid="trend-chart-compact">
        {columns.map(({ campaign, value, label, gap, reason }) => (
          <li key={campaign.campaign_ref} className="min-w-0 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-base font-semibold text-ink [overflow-wrap:anywhere]">{campaign.name}</span>
              {value !== null && label ? (
                <span className="shrink-0 whitespace-nowrap font-display text-xl font-extrabold tabular-nums text-ink">{label}</span>
              ) : (
                <span className="shrink-0 text-sm text-ink-muted">{gap}</span>
              )}
            </div>
            {value !== null && label && (
              <div className="mt-2 h-2.5 rounded-full bg-track" aria-hidden="true">
                <div className="h-2.5 rounded-full bg-ink" style={{ width: `${value > 0n ? Math.max(permille(value, max) / 10, 1) : 0}%` }} />
              </div>
            )}
            <p className="mt-1 text-sm text-ink-muted">
              Cobertura histórica: {coverageText(campaign)}
              {value === null || !label ? ` · ${reason}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
