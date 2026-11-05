import { useCallback, useEffect, useState } from 'react';
import { AppShell, EmptyState, inputClass, labelClass, Notice } from '../components/app-shell';
import { Collapsible, DisclosureNotice, PendingChangesNote, ProductCell, QuantityCell, SectionHeader } from '../components/collective-ui';
import { ExportButtons } from '../components/export-buttons';
import { CAMPAIGN_STATUS_TEXT, collectiveError, fmtDateTime } from '../lib/collective-text';
import { saveBlob } from '../lib/exports';
import { formatQuantity, isBaseQuantity } from '../lib/quantity';
import { collectiveService } from '../services/collective.service';
import type { CollectiveTrends, ProjectionType, TrendCampaign, TrendSeries } from '../types/collective';

const TYPES: { type: ProjectionType; label: string; description: string }[] = [
  {
    type: 'DECLARED_NEED',
    label: 'Necesidad declarada',
    description: 'Cantidad que cada agricultor declaró en la app. No es pronóstico ni recomendación.',
  },
  {
    type: 'CONSUMPTION_TOTAL',
    label: 'Consumo registrado',
    description: 'Consumo registrado que los agricultores publicaron. Se muestra aparte: no se resta de la necesidad.',
  },
];

const seriesKey = (line: TrendSeries) => `${line.product_ref}|${line.base_unit}`;

/**
 * F07 (2026-10-23, F07_SEALED_HISTORY_CONTRACT §8): historial entre versiones
 * selladas. Cada cifra viene del servidor, celda por celda: aquí no se suma,
 * resta, promedia ni interpola, y un hueco (cifra oculta, retirada, sin dato o
 * campaña sin sellar) nunca se dibuja como cero.
 *
 * Jerarquía (defensa, 2026-11-05): primero el gráfico de un producto, con
 * selector de dato (necesidad o consumo) y de producto; columnas con cantidad y
 * unidad legibles sobre las campañas selladas. Una campaña sin sellar no se
 * dibuja como histórico. La versión sellada, la cobertura y las tablas van en
 * «Ver fuentes y cobertura».
 */
export function CollectiveTrendsPage() {
  const [type, setType] = useState<ProjectionType>('DECLARED_NEED');
  const [productKey, setProductKey] = useState<string | null>(null);
  const [trends, setTrends] = useState<CollectiveTrends | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (projectionType: ProjectionType) => {
    setLoading(true);
    setError(null);
    try {
      setTrends(await collectiveService.trends(projectionType));
    } catch (err) {
      setTrends(null);
      setError(collectiveError(err, 'No fue posible cargar las tendencias.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load(type));
  }, [type, load]);

  const downloadCsv = async () => {
    try {
      saveBlob(await collectiveService.trendsCsv(type), `historial-${type === 'DECLARED_NEED' ? 'necesidad' : 'consumo'}.csv`);
    } catch (err) {
      setError(collectiveError(err, 'No fue posible descargar el CSV.'));
    }
  };

  const current = TYPES.find((entry) => entry.type === type)!;
  const series = trends?.series ?? [];
  const selected = series.find((line) => seriesKey(line) === productKey) ?? series[0] ?? null;
  return (
    <AppShell title="Historial entre campañas" section="Colectivo">
      <div className="space-y-5">
        <div className="glass-card flex flex-wrap items-end justify-between gap-4 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-56">
              <label className={labelClass} htmlFor="trend-type">
                Dato
              </label>
              <select id="trend-type" className={inputClass} value={type} onChange={(event) => setType(event.target.value as ProjectionType)}>
                {TYPES.map((entry) => (
                  <option key={entry.type} value={entry.type}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-72">
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
          <ExportButtons kind="trends" reference={type} onCsv={() => void downloadCsv()} disabled={!trends} />
        </div>
        <p className="text-sm text-slate-600">{current.description} Sólo cifras de versiones selladas, campaña por campaña.</p>
        {error && <Notice kind="error">{error}</Notice>}
        {loading && <p className="text-sm text-slate-500">Cargando…</p>}
        {trends && !loading && <TrendsBody trends={trends} selected={selected} typeLabel={current.label} />}
      </div>
    </AppShell>
  );
}

function TrendsBody({ trends, selected, typeLabel }: { trends: CollectiveTrends; selected: TrendSeries | null; typeLabel: string }) {
  const sealed = trends.campaigns.filter((campaign) => campaign.seal !== null);
  const unsealed = trends.campaigns.filter((campaign) => campaign.seal === null);
  return (
    <div className="space-y-5">
      <DisclosureNotice mode={trends.disclosure.mode} threshold={trends.disclosure.threshold} />
      {trends.disclosure.mode === 'PROVISIONAL_SYNTHETIC' &&
        (selected === null ? (
          <div className="glass-card">
            <EmptyState
              compact
              title="Sin series selladas"
              description={`No hay cifras selladas de ${typeLabel.toLowerCase()} en ninguna campaña. Eso no significa cero.`}
            />
          </div>
        ) : (
          <section className="glass-card overflow-hidden" aria-label="Gráfico del historial">
            <SectionHeader
              title={`${selected.product_name} (${selected.presentation_unit}) · ${typeLabel}`}
              note={
                unsealed.length > 0
                  ? `Campañas sin sellar (${unsealed.map((campaign) => campaign.name).join(', ')}) no se dibujan como histórico.`
                  : 'Una columna por campaña sellada; sin columna = sin cifra publicada, no cero.'
              }
            />
            <TrendChart line={selected} campaigns={sealed} />
          </section>
        ))}
      <Collapsible title="Ver fuentes y cobertura" testId="sources">
        <div className="space-y-5 p-5">
          <p className="text-xs text-slate-500">{trends.notice} Ningún dato individual se incorpora para enriquecer estas tendencias.</p>
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-2.5">Campaña</th>
              <th className="px-5 py-2.5">Estado</th>
              <th className="px-5 py-2.5">Versión sellada</th>
              <th className="px-5 py-2.5">Cobertura al sellar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campaigns.map((campaign) => (
              <tr key={campaign.campaign_ref} data-testid={`campaign-${campaign.name}`}>
                <td className="px-5 py-2.5 font-medium text-slate-800">{campaign.name}</td>
                <td className="px-5 py-2.5 text-xs text-slate-600">{CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status}</td>
                <td className="px-5 py-2.5 text-xs text-slate-600">
                  {campaign.seal ? `Versión ${campaign.seal.version}, sellada el ${fmtDateTime(campaign.seal.sealed_at)}` : 'Sin sellar: no aporta cifras'}
                </td>
                <td className="px-5 py-2.5 text-xs text-slate-600">
                  {campaign.coverage ? `${campaign.coverage.members_with_contribution} de ${campaign.coverage.linked_members} con cifras publicadas` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <SectionHeader title={title} note="Una fila por campaña. Los huecos son campañas sin cifra publicada; no son ceros." />
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-5 py-2.5">Campaña</th>
            <th className="px-5 py-2.5">Total publicado</th>
            <th className="px-5 py-2.5 text-right">Aportantes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {line.points.map((point) => (
            <tr key={point.campaign_ref} data-testid={`point-${nameOf.get(point.campaign_ref)}`}>
              <td className="px-5 py-3">
                <ProductCell name={nameOf.get(point.campaign_ref) ?? ''} unit="" status={point.status} threshold={threshold} />
              </td>
              <td className="px-5 py-3">
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
              <td className="px-5 py-3 text-right tabular-nums">{point.status === 'DISCLOSED' ? point.contributors : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const STEP = 112;
const COLUMN = 44;
const PAD = { left: 24, right: 24, top: 36, bottom: 44 };
const PLOT_HEIGHT = 160;

/**
 * Columnas de una sola serie sobre las campañas selladas, en orden. Sólo se
 * dibujan los puntos publicados, cada uno con su cantidad y unidad encima; un
 * hueco se rotula «sin cifra» y no tiene columna. Las alturas se calculan con
 * BigInt: la cifra escrita es siempre la del servidor. Un solo color: no hay
 * series que distinguir.
 */
function TrendChart({ line, campaigns }: { line: TrendSeries; campaigns: TrendCampaign[] }) {
  const pointOf = new Map(line.points.map((point) => [point.campaign_ref, point]));
  const columns = campaigns.map((campaign) => {
    const point = pointOf.get(campaign.campaign_ref) ?? null;
    const value = point && point.status === 'DISCLOSED' && isBaseQuantity(point.total_base) ? BigInt(point.total_base!) : null;
    const label = point && point.status === 'DISCLOSED' ? formatQuantity(point.total_base, line.base_unit, point.total_presentation) : null;
    return { campaign, point, value, label };
  });
  const max = columns.reduce<bigint>((top, { value }) => (value !== null && value > top ? value : top), 0n);
  const width = PAD.left + PAD.right + STEP * Math.max(columns.length, 1);
  const height = PAD.top + PLOT_HEIGHT + PAD.bottom;
  const x = (index: number) => PAD.left + STEP * index + (STEP - COLUMN) / 2;
  // Altura relativa en milésimas, con aritmética entera exacta.
  const h = (value: bigint) => (max === 0n ? 0 : (Number((value * 1000n) / max) * PLOT_HEIGHT) / 1000);
  const shown = columns.filter(({ value }) => value !== null).length;
  const baseline = PAD.top + PLOT_HEIGHT;
  return (
    <div className="overflow-x-auto px-5 py-4">
      <svg
        role="img"
        aria-label={`${line.product_name}: ${shown} de ${columns.length} campañas selladas con cifra publicada; las demás son huecos, no ceros.`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="text-emerald-700"
        data-testid="trend-chart"
      >
        <line x1={PAD.left - 8} x2={width - PAD.right + 8} y1={baseline} y2={baseline} stroke="#cbd5e1" strokeWidth={1} />
        {columns.map(({ campaign, value, label }, index) => {
          const name = campaign.name.length > 18 ? `${campaign.name.slice(0, 17)}…` : campaign.name;
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
                  <text x={x(index) + COLUMN / 2} y={baseline - Math.max(h(value), 2) - 10} textAnchor="middle" fontSize={15} fontWeight={700} fill="#0f172a">
                    {label}
                  </text>
                </>
              ) : (
                <text x={x(index) + COLUMN / 2} y={baseline - 10} textAnchor="middle" fontSize={11} fill="#94a3b8">
                  sin cifra
                </text>
              )}
              <text x={x(index) + COLUMN / 2} y={baseline + 18} textAnchor="middle" fontSize={11} fill="#475569">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
