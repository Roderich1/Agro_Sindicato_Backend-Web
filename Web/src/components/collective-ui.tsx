import type { ReactNode } from 'react';
import { CAMPAIGN_STATUS_TEXT, fmtDateTime, statusReason } from '../lib/collective-text';
import { fmtDate } from '../lib/format';
import { formatQuantity, isBaseQuantity, type BaseUnit } from '../lib/quantity';
import type { Campaign } from '../types/campaigns';
import type { AnyStatus, Coverage, SealRef } from '../types/collective';
import { inputClass, labelClass, Notice } from './app-shell';

/* Estados de una celda o línea (F07-POL-01). Ninguno inventa ni deduce cifras. */

const STATUS_TEXT: Record<AnyStatus, { label: string; cls: string }> = {
  DISCLOSED: { label: 'Publicado', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  SUPPRESSED_UNDER_THRESHOLD: { label: 'Oculto', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
  SUPPRESSED_REVISION: { label: 'Oculto (revisión)', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  OVERFLOW: { label: 'Fuera de rango', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
  WITHDRAWN: { label: 'Retirado', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  SUPERSEDED: { label: 'Sustituido', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  POLICY_PENDING: { label: 'Política pendiente', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
  WITHDRAWN_AFTER_SEAL: { label: 'Retirado tras sellar', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  NO_DATA: { label: 'Sin dato', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
  NOT_SEALED: { label: 'Sin sellar', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
};

export function StatusBadge({ status, threshold }: { status: AnyStatus; threshold?: number | null }) {
  const { label, cls } = STATUS_TEXT[status] ?? STATUS_TEXT.POLICY_PENDING;
  const reason = statusReason(status, threshold);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}
      title={reason ?? undefined}
    >
      {label}
    </span>
  );
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
      <span className="font-semibold text-slate-800">{name}</span>
      <span className="text-xs text-slate-400">{unit}</span>
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
    return <span className="text-xs text-slate-500">{statusReason(status, threshold)}</span>;
  }
  const text = formatQuantity(base, unit, serverPresentation);
  if (text === null) {
    return <span className="text-xs font-semibold text-red-700">Dato no válido recibido del servidor; no se muestra.</span>;
  }
  return (
    <span className="block">
      <span className={`${size === 'lg' ? 'text-2xl' : 'text-base'} font-bold tabular-nums text-slate-900`}>{text}</span>
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
 * Cobertura agregada, en una sola franja. Sin `asOf` es la cobertura actual
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
}: {
  coverage: Coverage;
  campaignName: string;
  asOf?: string;
  /** Versión sellada: la cobertura es la del sellado y no se recalcula. */
  sealedAt?: string;
}) {
  const title = sealedAt
    ? `Cobertura al sellar (${fmtDateTime(sealedAt)})`
    : asOf
      ? `Cobertura al generar el borrador (${fmtDateTime(asOf)})`
      : 'Cobertura';
  const headline =
    coverage.basis === 'ALL_CONTRIBUTORS'
      ? `${coverage.members_with_contribution} de ${coverage.linked_members} agricultores vinculados habían aportado datos en esa fecha`
      : `${coverage.members_with_contribution} de ${coverage.linked_members} agricultores vinculados con cifras publicadas${asOf ? ' en esa fecha' : ''}`;
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3" data-testid="coverage">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-800/70">
        {title} · {campaignName}
      </p>
      <p className="mt-0.5 text-base font-bold text-slate-900">{headline}</p>
      <p className="mt-0.5 text-xs text-slate-500">
        {coverage.basis === 'ALL_CONTRIBUTORS' &&
          'Borrador guardado con la regla anterior a F10-SEC-02: el conteo incluye a quienes aportaron a filas sin cifra. '}
        {asOf && 'No es la cobertura actual: la de hoy está en el resumen. '}
        {sealedAt && 'Fijada al sellar; no se recalcula. '}
        {coverage.suppressed_cells && 'Hay filas sin cifra (bajo el umbral o en revisión) cuyos aportes no se cuentan. '}
        Ausencia de aporte = desconocido, no cero. No es el total del sindicato.
      </p>
    </div>
  );
}

/**
 * Versión sellada (F07): identifica campaña y versión. «Datos aceptados hasta»
 * es el instante de la decisión sellada; cada cifra vale por su propia fecha.
 */
export function SealBanner({ seal }: { seal: SealRef }) {
  return (
    <div className="rounded-xl border-l-4 border-emerald-600 bg-white/70 px-4 py-3 shadow-sm" data-testid="seal-banner">
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

export function DisclosureNotice({ mode, threshold }: { mode: 'POLICY_PENDING' | 'PROVISIONAL_SYNTHETIC'; threshold?: number | null }) {
  if (mode === 'POLICY_PENDING') {
    return (
      <Notice kind="info">
        <strong>Política de divulgación pendiente (F07-POL-01).</strong> Mientras no se apruebe, el servidor no publica
        cifras colectivas. Esta pantalla no calcula ni estima totales.
      </Notice>
    );
  }
  // Política aprobada: ningún banner. El umbral sigue explicándose fila por fila
  // («Menos de k agricultores aportaron…»), que es donde falta el dato.
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
    <div className="w-full sm:w-[26rem]">
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
            {campaign.name} · {CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status} · {fmtDate(campaign.startDate)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Barra común de las vistas colectivas: la campaña elegida siempre a la vista,
 * a la izquierda, y la acción principal de la vista a la derecha.
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
  const campaign = campaigns.find((entry) => entry.id === selected) ?? null;
  return (
    <div className="glass-card flex flex-wrap items-end justify-between gap-4 px-5 py-4" data-testid="toolbar">
      <div className="flex flex-wrap items-end gap-3">
        <CampaignPicker campaigns={campaigns} selected={selected} onSelect={onSelect} />
        {campaign && (
          <span
            className={`mb-2.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
              campaign.status === 'ABIERTA'
                ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20'
                : 'bg-slate-500/10 text-slate-600 ring-slate-500/20'
            }`}
          >
            {CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status}
          </span>
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

/** Cabecera de una sección en tarjeta: título breve y, si hace falta, una línea de contexto. */
export function SectionHeader({ title, note, actions }: { title: string; note?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Indicador grande para proyector: etiqueta, cifra y una línea de contexto. */
export function StatTile({ label, value, note, testId, tone = 'default' }: { label: string; value: ReactNode; note?: ReactNode; testId?: string; tone?: 'default' | 'muted' }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 ${tone === 'muted' ? 'border-slate-200 bg-white/60' : 'border-emerald-100 bg-emerald-50/50'}`} data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold leading-tight text-slate-900 tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>}
    </div>
  );
}

/** Sección secundaria plegada: lo que no hace falta para decidir, a un clic. */
export function Collapsible({ title, children, testId, label, defaultOpen = false }: { title: string; children: ReactNode; testId?: string; label?: string; defaultOpen?: boolean }) {
  return (
    <details className="glass-card group overflow-hidden" data-testid={testId} aria-label={label ?? title} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50/60">
        {title}
        <span className="text-xs font-medium text-emerald-700 group-open:hidden">Ver</span>
        <span className="hidden text-xs font-medium text-slate-500 group-open:inline">Ocultar</span>
      </summary>
      <div className="border-t border-slate-100">{children}</div>
    </details>
  );
}

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
 * motivo. Un solo color: no hay series que distinguir.
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
          <li key={row.key} className="grid items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto]" data-testid={row.testId}>
            <ProductCell name={row.name} unit={row.unit} status={row.status} threshold={threshold} />
            {row.status === 'DISCLOSED' ? (
              <div className="flex items-center gap-3" title={text ?? undefined}>
                <div className="h-3 flex-1 rounded-full bg-slate-100">
                  <div className="h-3 rounded-full bg-emerald-600" style={{ width: `${Math.max(width(value), text === '0 L' || text === '0 KG' ? 0 : 1)}%` }} />
                </div>
                <span className="w-28 text-right text-2xl font-bold tabular-nums text-slate-900">{text ?? <span className="text-sm text-red-700">Dato no válido</span>}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-500">{statusReason(row.status, threshold)}</p>
            )}
            <div className="text-right text-xs text-slate-500 sm:w-40">
              {row.status === 'DISCLOSED' ? (
                <>
                  <span className="block text-sm font-semibold text-slate-700">{row.contributors} aportantes</span>
                  <span>datos hasta {fmtDateTime(row.asOf)}</span>
                </>
              ) : (
                '—'
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
