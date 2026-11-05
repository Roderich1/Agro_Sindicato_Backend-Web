import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCampaign } from '../hooks/use-campaign';
import { CAMPAIGN_STATUS_TEXT, fmtDateTime, statusReason } from '../lib/collective-text';
import { formatQuantity, isBaseQuantity, type BaseUnit } from '../lib/quantity';
import type { Campaign } from '../types/campaigns';
import type { AnyStatus, Coverage, SealRef } from '../types/collective';
import { inputClass, labelClass, Notice } from './app-shell';

/* Estados de una celda o línea (F07-POL-01). Ninguno inventa ni deduce cifras. */

const STATUS_TEXT: Record<AnyStatus, { label: string; cls: string }> = {
  DISCLOSED: { label: 'Publicado', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  SUPPRESSED_UNDER_THRESHOLD: { label: 'Oculto por privacidad', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
  SUPPRESSED_REVISION: { label: 'Sin cifra publicada', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  OVERFLOW: { label: 'Fuera de rango', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
  WITHDRAWN: { label: 'Retirado', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  SUPERSEDED: { label: 'Sustituido', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  POLICY_PENDING: { label: 'Política pendiente', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
  WITHDRAWN_AFTER_SEAL: { label: 'Retirado tras sellar', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  NO_DATA: { label: 'Sin cifra publicada', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
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
            {coverage.members_with_contribution} de {coverage.linked_members}
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

/** Cabecera de una sección en tarjeta: título breve y, si hace falta, una línea de contexto. */
export function SectionHeader({ title, note, actions, badge }: { title: ReactNode; note?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {badge}
        </div>
        {note && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{note}</p>}
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
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
        {title}
        <span className="text-xs font-medium text-emerald-700 group-open:hidden">Ver</span>
        <span className="hidden text-xs font-medium text-slate-500 group-open:inline">Ocultar</span>
      </summary>
      <div className="border-t border-slate-100">{children}</div>
    </details>
  );
}

/**
 * Dos o tres opciones visibles a la vez (en lugar de un desplegable), manejables
 * con teclado: cada opción es un botón con estado `aria-pressed`.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5" role="group" aria-label={label} data-testid={testId}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`rounded-[10px] px-3.5 py-2 text-sm font-semibold transition-colors ${
                active ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
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
              <div className="flex items-center gap-3" title={text ?? undefined}>
                <div className="h-3 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-emerald-600"
                    style={{ width: `${value !== null && value > 0n ? Math.max(width(value), 1) : 0}%` }}
                  />
                </div>
                <span className="w-44 whitespace-nowrap text-right text-3xl font-bold leading-none tabular-nums text-slate-900">
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
