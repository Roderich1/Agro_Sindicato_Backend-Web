import { useCallback, useEffect, useState } from 'react';
import { AppShell, EmptyState, inputClass, labelClass, Notice, secondaryButtonClass } from '../components/app-shell';
import { DisclosureNotice, PendingChangesNote, QuantityCell, StatusBadge } from '../components/collective-ui';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
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
    label: 'Consumo publicado',
    description: 'Consumo confirmado que los agricultores publicaron. Se muestra aparte: no se resta de la necesidad.',
  },
];

/**
 * F07 (2026-10-23, F07_SEALED_HISTORY_CONTRACT §8): primera consulta de
 * tendencias entre versiones selladas. Cada cifra viene del servidor, celda por
 * celda: aquí no se suma, resta, promedia ni interpola, y un hueco (cifra
 * oculta, retirada, sin dato o campaña sin sellar) nunca se dibuja como cero.
 */
export function CollectiveTrendsPage() {
  const [type, setType] = useState<ProjectionType>('DECLARED_NEED');
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
      const blob = await collectiveService.trendsCsv(type);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tendencias-${type === 'DECLARED_NEED' ? 'necesidad' : 'consumo'}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(collectiveError(err, 'No fue posible descargar el CSV.'));
    }
  };

  const current = TYPES.find((entry) => entry.type === type)!;
  return (
    <AppShell
      title="Tendencias entre campañas"
      section="Directiva"
      actions={
        <button type="button" className={secondaryButtonClass} onClick={() => void downloadCsv()} disabled={!trends}>
          Descargar CSV
        </button>
      }
    >
      <div className="space-y-6">
        <div className="max-w-sm">
          <label className={labelClass} htmlFor="trend-type">
            Dato (filtro aplicado)
          </label>
          <select
            id="trend-type"
            className={inputClass}
            value={type}
            onChange={(event) => setType(event.target.value as ProjectionType)}
          >
            {TYPES.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{current.description}</p>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {loading && <p className="text-sm text-slate-500">Cargando…</p>}
        {trends && !loading && <TrendsBody trends={trends} />}
      </div>
    </AppShell>
  );
}

function TrendsBody({ trends }: { trends: CollectiveTrends }) {
  return (
    <div className="space-y-6">
      <DisclosureNotice mode={trends.disclosure.mode} threshold={trends.disclosure.threshold} />
      <Notice kind="info">
        {trends.notice} Ningún dato individual se incorpora para enriquecer estas tendencias.
      </Notice>
      <CampaignsTable campaigns={trends.campaigns} />
      {trends.disclosure.mode === 'PROVISIONAL_SYNTHETIC' &&
        (trends.series.length === 0 ? (
          <EmptyState
            title="Sin series selladas"
            description="Ninguna versión sellada tiene datos de este tipo. Eso no significa cero."
          />
        ) : (
          trends.series.map((line) => (
            <SeriesCard
              key={`${line.projection_type}|${line.product_ref}|${line.base_unit}`}
              line={line}
              campaigns={trends.campaigns}
              threshold={trends.disclosure.threshold}
            />
          ))
        ))}
    </div>
  );
}

function CampaignsTable({ campaigns }: { campaigns: TrendCampaign[] }) {
  return (
    <section className="glass-card overflow-hidden" aria-label="Campañas y versiones">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Campañas, versión y cobertura</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          La cobertura es la fijada al sellar. Un cambio de cobertura entre campañas no prueba que cada agricultor
          consumiera o necesitara más o menos.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Campaña</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Versión sellada</th>
              <th className="px-5 py-3">Cobertura al sellar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campaigns.map((campaign) => (
              <tr key={campaign.campaign_ref} data-testid={`campaign-${campaign.name}`}>
                <td className="px-5 py-3 font-medium text-slate-800">{campaign.name}</td>
                <td className="px-5 py-3 text-xs text-slate-600">{campaign.status}</td>
                <td className="px-5 py-3 text-xs text-slate-600">
                  {campaign.seal
                    ? `Versión ${campaign.seal.version}, sellada el ${fmtDateTime(campaign.seal.sealed_at)}`
                    : 'Sin sellar: no aporta cifras'}
                </td>
                <td className="px-5 py-3 text-xs text-slate-600">
                  {campaign.coverage
                    ? `${campaign.coverage.members_with_contribution} de ${campaign.coverage.linked_members} con cifras publicadas`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SeriesCard({
  line,
  campaigns,
  threshold,
}: {
  line: TrendSeries;
  campaigns: TrendCampaign[];
  threshold: number | null;
}) {
  const nameOf = new Map(campaigns.map((campaign) => [campaign.campaign_ref, campaign.name]));
  const title = `${line.product_name} (${line.presentation_unit})`;
  return (
    <section
      className="glass-card overflow-hidden"
      aria-label={title}
      data-testid={`series-${line.projection_type}-${line.product_name}-${line.base_unit}`}
    >
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Una serie por producto y unidad: masa y volumen nunca se mezclan. Los huecos son campañas sin cifra publicada.
        </p>
      </div>
      <TrendChart line={line} names={nameOf} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Campaña</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Aportantes</th>
              <th className="px-5 py-3">Datos aceptados hasta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {line.points.map((point) => (
              <tr key={point.campaign_ref} data-testid={`point-${nameOf.get(point.campaign_ref)}`}>
                <td className="px-5 py-3 font-medium text-slate-800">{nameOf.get(point.campaign_ref)}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={point.status} threshold={threshold} />
                </td>
                <td className="px-5 py-3">
                  <QuantityCell
                    status={point.status}
                    base={point.total_base}
                    serverPresentation={point.total_presentation}
                    unit={line.base_unit}
                    threshold={threshold}
                  />
                  {point.status === 'DISCLOSED' && point.pending_changes && <PendingChangesNote />}
                </td>
                <td className="px-5 py-3 tabular-nums">{point.status === 'DISCLOSED' ? point.contributors : '—'}</td>
                <td className="px-5 py-3 text-xs text-slate-500">
                  {point.status === 'DISCLOSED' ? fmtDateTime(point.data_as_of) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const STEP = 96;
const PAD = { left: 16, right: 16, top: 16, bottom: 40 };
const PLOT_HEIGHT = 120;

/**
 * Una sola serie por gráfico (el título la nombra). Sólo se dibujan los
 * puntos publicados; una línea une dos campañas consecutivas sólo si ambas
 * tienen cifra. Las posiciones se calculan con BigInt: la cifra mostrada es
 * siempre la del servidor.
 */
function TrendChart({ line, names }: { line: TrendSeries; names: Map<string, string> }) {
  const visible = line.points.map((point) =>
    point.status === 'DISCLOSED' && isBaseQuantity(point.total_base) ? BigInt(point.total_base) : null,
  );
  const max = visible.reduce<bigint>((top, value) => (value !== null && value > top ? value : top), 0n);
  const width = PAD.left + PAD.right + STEP * Math.max(line.points.length - 1, 1);
  const height = PAD.top + PLOT_HEIGHT + PAD.bottom;
  const x = (index: number) => PAD.left + STEP * index;
  // Altura relativa en milésimas, con aritmética entera exacta.
  const y = (value: bigint) => PAD.top + PLOT_HEIGHT - (max === 0n ? 0 : Number((value * 1000n) / max) * PLOT_HEIGHT / 1000);
  const segments: [number, number][] = [];
  for (let index = 1; index < visible.length; index++) {
    if (visible[index - 1] !== null && visible[index] !== null) segments.push([index - 1, index]);
  }
  const shown = visible.filter((value) => value !== null).length;
  return (
    <div className="overflow-x-auto px-5 py-3">
      <svg
        role="img"
        aria-label={`${line.product_name}: ${shown} de ${line.points.length} campañas con cifra publicada; las demás son huecos, no ceros.`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="text-emerald-700"
      >
        <line
          x1={PAD.left - 8}
          x2={width - PAD.right + 8}
          y1={PAD.top + PLOT_HEIGHT}
          y2={PAD.top + PLOT_HEIGHT}
          stroke="#cbd5e1"
          strokeWidth={1}
        />
        {segments.map(([from, to]) => (
          <line
            key={`${from}-${to}`}
            data-testid="trend-segment"
            x1={x(from)}
            y1={y(visible[from]!)}
            x2={x(to)}
            y2={y(visible[to]!)}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
        {line.points.map((point, index) => {
          const value = visible[index];
          const label = names.get(point.campaign_ref) ?? '';
          return (
            <g key={point.campaign_ref}>
              {value !== null ? (
                <circle data-testid="trend-point" cx={x(index)} cy={y(value)} r={4} fill="currentColor" stroke="#ffffff" strokeWidth={2}>
                  <title>{`${label}: ${formatQuantity(point.total_base, line.base_unit, point.total_presentation) ?? ''}`}</title>
                </circle>
              ) : null}
              <text x={x(index)} y={PAD.top + PLOT_HEIGHT + 16} textAnchor="middle" fontSize={10} fill="#475569">
                {label.length > 16 ? `${label.slice(0, 15)}…` : label}
              </text>
              {value === null && (
                <text x={x(index)} y={PAD.top + PLOT_HEIGHT + 30} textAnchor="middle" fontSize={10} fill="#94a3b8">
                  sin cifra
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
