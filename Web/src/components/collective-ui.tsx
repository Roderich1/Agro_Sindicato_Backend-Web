import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCampaign } from '../hooks/use-campaign';
import { CAMPAIGN_STATUS_TEXT, fmtDateTime, statusReason } from '../lib/collective-text';
import { formatQuantity, isBaseQuantity, type BaseUnit } from '../lib/quantity';
import type { Campaign } from '../types/campaigns';
import type { AnyStatus, Coverage, SealRef } from '../types/collective';
import { inputClass, isKnownStatus, KpiTile, labelClass, Notice, StatusChip } from './ui';

/** Conteos (cobertura) con separador de miles es-BO: «1.234 de 2.000». */
const COUNT = new Intl.NumberFormat('es-BO');

/* Estados de una celda o línea (F07-POL-01). Ninguno inventa ni deduce cifras. */

/**
 * Unificado en `StatusChip` (components/ui): texto del estado y motivo en
 * `title`. Un estado desconocido se trata, como antes, como «Política
 * pendiente» (sin cifra), nunca como un código en bruto.
 */
export function StatusBadge({ status, threshold }: { status: AnyStatus; threshold?: number | null }) {
  return <StatusChip status={isKnownStatus(status) ? status : 'POLICY_PENDING'} threshold={threshold} />;
}

/**
 * Nombre del producto con su unidad de presentación y su estado al lado: así
 * la tabla no necesita una columna «Estado» aparte.
 */
export function ProductCell({
  name,
  unit,
  status,
  threshold,
}: {
  name: string;
  unit: string;
  status: AnyStatus;
  threshold?: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-base font-semibold text-slate-900">{name}</span>
      {unit && <span className="text-xs text-slate-400">{unit}</span>}
      <StatusBadge status={status} threshold={threshold} />
    </div>
  );
}

/**
 * Cantidad publicada o el motivo por el que no se muestra. Nunca muestra un
 * número para una celda no publicada, aunque llegara uno por error.
 */
export function QuantityCell({
  status,
  base,
  serverPresentation,
  unit,
  threshold,
  asOf,
  size = 'md',
}: {
  status: AnyStatus;
  base: string | null;
  serverPresentation: string | null;
  unit: BaseUnit;
  threshold?: number | null;
  /** Fecha hasta la que el servidor aceptó datos para esta cifra; se muestra bajo la cifra. */
  asOf?: string | null;
  /** `lg`: cifra grande, para proyector. */
  size?: 'md' | 'lg';
}) {
  if (status !== 'DISCLOSED') {
    return <span className="text-xs leading-snug text-slate-500">{statusReason(status, threshold)}</span>;
  }
  const text = formatQuantity(base, unit, serverPresentation);
  if (text === null) {
    return <span className="text-xs font-semibold text-red-700">Dato no válido recibido del servidor; no se muestra.</span>;
  }
  return (
    <span className="block">
      <span className={`${size === 'lg' ? 'text-2xl' : 'text-lg'} font-bold leading-tight tabular-nums text-slate-900`}>{text}</span>
      {asOf !== undefined && <span className="block text-[11px] text-slate-400">datos hasta {fmtDateTime(asOf)}</span>}
    </span>
  );
}

/** Huella del borrador; oculta cuando alguna de sus cifras ya no se publica. */
export function Fingerprint({ value }: { value: string | null }) {
  if (value === null) {
    return <span className="text-slate-400" title="Alguna cifra del borrador ya no se publica">huella oculta</span>;
  }
  return <code title={value}>{value.slice(0, 12)}</code>;
}

export function PendingChangesNote() {
  return (
    <span className="mt-1 block text-[11px] font-medium text-amber-700">
      Hay cambios recibidos que aún no alcanzan el umbral: se muestra la cifra anterior.
    </span>
  );
}

/**
 * Cobertura agregada en una tarjeta compacta. Sin `asOf` es la cobertura actual
 * (resumen); con `asOf` es la que quedó guardada al generar un borrador y no
 * se actualiza después. F10-SEC-02: cuenta sólo a los agricultores que están
 * dentro de una cifra publicada; los aportes de celdas sin cifra no se cuentan
 * (revelarían su número exacto) y sólo se avisa de que existen.
 */
export function CoverageBanner({
  coverage,
  campaignName,
  asOf,
  sealedAt,
  link,
}: {
  coverage: Coverage;
  campaignName: string;
  asOf?: string;
  /** Versión sellada: la cobertura es la del sellado y no se recalcula. */
  sealedAt?: string;
  /** Enlace a la vista de cobertura («Ver cobertura»). */
  link?: string;
}) {
  const title = sealedAt
    ? `Cobertura al sellar (${fmtDateTime(sealedAt)})`
    : asOf
      ? `Cobertura al generar el borrador (${fmtDateTime(asOf)})`
      : 'Cobertura';
  const headline =
    coverage.basis === 'ALL_CONTRIBUTORS'
      ? 'agricultores vinculados habían aportado datos en esa fecha'
      : `agricultores vinculados con cifras publicadas${asOf ? ' en esa fecha' : ''}`;
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-5 py-3"
      data-testid="coverage"
      title={campaignName}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-800/70">{title}</p>
        <p className="mt-0.5 text-slate-900">
          <span className="text-3xl font-bold leading-tight tabular-nums">
            {COUNT.format(coverage.members_with_contribution)} de {COUNT.format(coverage.linked_members)}
          </span>{' '}
          <span className="text-sm font-semibold">{headline}</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {coverage.basis === 'ALL_CONTRIBUTORS' &&
            'Borrador guardado con la regla anterior a F10-SEC-02: el conteo incluye a quienes aportaron a filas sin cifra. '}
          {asOf && 'No es la cobertura actual: la de hoy está en el resumen. '}
          {sealedAt && 'Fijada al sellar; no se recalcula. '}
          {coverage.suppressed_cells && 'Hay filas sin cifra (ocultas o en revisión) cuyos aportes no se cuentan. '}
          Ausencia de aporte = desconocido, no cero. No es el total del sindicato.
        </p>
      </div>
      {link && (
        <Link to={link} className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline">
          Ver cobertura
        </Link>
      )}
    </div>
  );
}

/**
 * Versión sellada (F07): identifica campaña y versión. «Datos aceptados hasta»
 * es el instante de la decisión sellada; cada cifra vale por su propia fecha.
 */
export function SealBanner({ seal }: { seal: SealRef }) {
  return (
    <div className="rounded-xl border-l-4 border-emerald-600 bg-white/70 px-4 py-2.5 shadow-sm" data-testid="seal-banner">
      <p className="text-sm font-bold text-slate-900">
        Versión {seal.version} sellada el {fmtDateTime(seal.sealed_at)} por {seal.sealed_by.name} (
        {seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'}) · datos aceptados hasta{' '}
        {fmtDateTime(seal.accepted_until)} · ref. <code title={seal.seal_ref}>{seal.seal_ref.slice(0, 8)}</code>
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        Cada cifra indica su propia fecha; las que tienen cambios pendientes muestran una cifra anterior. El servidor no
        puede asegurar que todos los teléfonos publicaron todo. Las correcciones privadas posteriores no cambian esta
        versión.
      </p>
    </div>
  );
}

/**
 * Aviso de política pendiente: se conserva porque bloquea las cifras. El modo
 * sintético no lleva banner: el armazón muestra la etiqueta «Datos sintéticos».
 */
export function DisclosureNotice({ mode, threshold }: { mode: 'POLICY_PENDING' | 'PROVISIONAL_SYNTHETIC'; threshold?: number | null }) {
  if (mode === 'POLICY_PENDING') {
    return (
      <Notice kind="info">
        <strong>Política de divulgación pendiente (F07-POL-01).</strong> Mientras no se apruebe, el servidor no publica
        cifras colectivas. Esta pantalla no calcula ni estima totales.
      </Notice>
    );
  }
  void threshold;
  return null;
}

export function CampaignPicker({
  campaigns,
  selected,
  onSelect,
}: {
  campaigns: Campaign[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-full sm:w-80">
      <label className={labelClass} htmlFor="campaign-picker">
        Campaña
      </label>
      <select
        id="campaign-picker"
        className={inputClass}
        value={selected ?? ''}
        onChange={(event) => onSelect(event.target.value)}
      >
        {selected === null && <option value="">Seleccione una campaña</option>}
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name} · {CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Barra común de las vistas colectivas: la campaña consultada a la izquierda
 * (con su estado y, si no es la activa, un aviso) y la acción principal de la
 * vista a la derecha. El nombre de la campaña no se repite en las tarjetas.
 */
export function CollectiveToolbar({
  campaigns,
  selected,
  onSelect,
  children,
}: {
  campaigns: Campaign[];
  selected: string | null;
  onSelect: (id: string) => void;
  children?: ReactNode;
}) {
  const { activeCampaign } = useCampaign();
  const campaign = campaigns.find((entry) => entry.id === selected) ?? null;
  const differs = Boolean(campaign && activeCampaign && campaign.id !== activeCampaign.id);
  return (
    <div className="glass-card flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-5 py-3" data-testid="toolbar">
      <div className="flex flex-wrap items-end gap-3">
        <CampaignPicker campaigns={campaigns} selected={selected} onSelect={onSelect} />
        {campaign && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                campaign.status === 'ABIERTA'
                  ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20'
                  : 'bg-slate-500/10 text-slate-600 ring-slate-500/20'
              }`}
            >
              {CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status}
            </span>
            {differs ? (
              <span
                className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-500/20"
                title={`La campaña activa del sindicato es ${activeCampaign!.name}`}
                data-testid="campaign-differs"
              >
                Consultando una campaña distinta de la activa
              </span>
            ) : (
              activeCampaign &&
              campaign.id === activeCampaign.id && (
                <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  Activa
                </span>
              )
            )}
          </div>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Explicación breve de la vista, bajo la barra: una línea, sin caja. */
export function PageNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="text-sm leading-relaxed text-slate-600" data-testid={testId}>
      {children}
    </p>
  );
}

/** Indicador grande para proyector; delega en `KpiTile` (components/ui). */
export function StatTile({ label, value, note, testId, tone = 'default' }: { label: string; value: ReactNode; note?: ReactNode; testId?: string; tone?: 'default' | 'muted' }) {
  return <KpiTile label={label} value={value} note={note} testId={testId} tone={tone} />;
}

/* Movidos a `components/ui` (rediseño 2026-11-10); se re-exportan para no romper importaciones. */
export { Collapsible, SectionHeader, SegmentedControl } from './ui';

/** Una fila comparable: producto, barra (sólo con cifra publicada), cifra grande y aportantes. */
export interface BarRow {
  key: string;
  testId?: string;
  name: string;
  unit: string;
  status: AnyStatus;
  base: string | null;
  presentation: string | null;
  contributors: number | null;
  asOf: string | null;
  pending: boolean;
}

/**
 * Barras horizontales por producto, una escala por unidad (L y KG nunca se
 * comparan entre sí). Una cifra oculta no dibuja barra ni cero: muestra el
 * motivo. Un cero divulgado se escribe «0 L» sin barra. Un solo color: no hay
 * series que distinguir.
 */
export function ComparisonBars({ rows, unit, threshold }: { rows: BarRow[]; unit: 'L' | 'KG'; threshold: number | null }) {
  const values = rows.map((row) => (row.status === 'DISCLOSED' && isBaseQuantity(row.base) ? BigInt(row.base!) : null));
  const max = values.reduce<bigint>((top, value) => (value !== null && value > top ? value : top), 0n);
  const width = (value: bigint | null) => (value === null || max === 0n ? 0 : Number((value * 1000n) / max) / 10);
  return (
    <ul className="divide-y divide-slate-100" aria-label={`Comparación en ${unit}`}>
      {rows.map((row, index) => {
        const value = values[index]!;
        const text = row.status === 'DISCLOSED' ? formatQuantity(row.base, unit === 'L' ? 'ML' : 'G', row.presentation) : null;
        return (
          <li key={row.key} className="grid items-center gap-x-4 gap-y-1 px-5 py-2.5 sm:grid-cols-[minmax(11rem,15rem)_1fr_auto]" data-testid={row.testId}>
            <ProductCell name={row.name} unit={row.unit} status={row.status} threshold={threshold} />
            {row.status === 'DISCLOSED' ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" title={text ?? undefined}>
                <div className="h-3 min-w-24 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-emerald-600"
                    style={{ width: `${value !== null && value > 0n ? Math.max(width(value), 1) : 0}%` }}
                  />
                </div>
                {/* Ancho mínimo para alinear filas; una cifra larga pasa a su propia línea en vez de desbordar. */}
                <span className="ml-auto min-w-44 whitespace-nowrap text-right text-2xl font-bold leading-none tabular-nums text-slate-900 sm:text-3xl">
                  {text ?? <span className="text-sm text-red-700">Dato no válido</span>}
                </span>
              </div>
            ) : (
              <p className="text-xs leading-snug text-slate-500">{statusReason(row.status, threshold)}</p>
            )}
            <div className="text-right text-xs text-slate-500 sm:w-44">
              {row.status === 'DISCLOSED' ? (
                <>
                  <span className="block text-sm font-semibold text-slate-700">{row.contributors} aportantes</span>
                  <span>datos hasta {fmtDateTime(row.asOf)}</span>
                </>
              ) : (
                <span className="text-slate-400">aportantes no revelados</span>
              )}
            </div>
            {row.status === 'DISCLOSED' && row.pending && (
              <div className="sm:col-span-3">
                <PendingChangesNote />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
