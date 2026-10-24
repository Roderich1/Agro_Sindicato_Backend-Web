import { fmtDateTime, statusReason } from '../lib/collective-text';
import { fmtDate } from '../lib/format';
import { formatQuantity, type BaseUnit } from '../lib/quantity';
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}
      title={reason ?? undefined}
    >
      {label}
    </span>
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
}: {
  status: AnyStatus;
  base: string | null;
  serverPresentation: string | null;
  unit: BaseUnit;
  threshold?: number | null;
}) {
  if (status !== 'DISCLOSED') {
    return <span className="text-xs text-slate-500">{statusReason(status, threshold)}</span>;
  }
  const text = formatQuantity(base, unit, serverPresentation);
  if (text === null) {
    return <span className="text-xs font-semibold text-red-700">Dato no válido recibido del servidor; no se muestra.</span>;
  }
  return <span className="font-semibold tabular-nums text-slate-900">{text}</span>;
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
 * Cobertura agregada. Sin `asOf` es la cobertura actual (resumen); con `asOf`
 * es la que quedó guardada al generar un borrador y no se actualiza después.
 * F10-SEC-02: cuenta sólo a los agricultores que están dentro de una cifra
 * publicada; los aportes de celdas sin cifra no se cuentan (revelarían su
 * número exacto) y sólo se avisa de que existen.
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
  return (
    <div className="glass-card p-5" data-testid="coverage">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        {title} · {campaignName}
      </p>
      <p className="mt-1.5 text-lg font-bold text-slate-900">
        {coverage.basis === 'ALL_CONTRIBUTORS'
          ? `${coverage.members_with_contribution} de ${coverage.linked_members} agricultores vinculados habían aportado datos en esa fecha`
          : `${coverage.members_with_contribution} de ${coverage.linked_members} agricultores vinculados con cifras publicadas${asOf ? ' en esa fecha' : ''}`}
      </p>
      {coverage.basis === 'ALL_CONTRIBUTORS' && (
        <p className="mt-1 text-xs text-slate-500">
          Borrador guardado con la regla anterior a F10-SEC-02: el conteo incluye a quienes aportaron a filas sin cifra.
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        {asOf && 'No es la cobertura actual: consulte el resumen de la campaña para la de hoy. '}
        {sealedAt && 'Es la cobertura fijada al sellar; no se recalcula después. '}
        {coverage.suppressed_cells &&
          'Hay filas sin cifra (bajo el umbral o en revisión): sus aportes no se cuentan aquí. '}
        Ausencia de aporte = desconocido, no cero. Las cifras no son el total del sindicato: sólo de quienes están en ellas.
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
    <div className="glass-card border-l-4 border-emerald-600 p-5" data-testid="seal-banner">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Versión sellada</p>
      <p className="mt-1.5 text-base font-bold text-slate-900">
        Versión {seal.version} · sellada el {fmtDateTime(seal.sealed_at)} por {seal.sealed_by.name} (
        {seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'})
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Datos aceptados por el servidor hasta {fmtDateTime(seal.accepted_until)}; cada cifra indica su propia fecha y las
        que tienen cambios pendientes muestran una cifra anterior. El servidor no puede asegurar que todos los teléfonos
        publicaron todo. Las correcciones privadas posteriores no cambian esta versión. Referencia:{' '}
        <code title={seal.seal_ref}>{seal.seal_ref.slice(0, 8)}</code>
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
  return (
    <Notice kind="warn">
      <strong>Modo provisional con datos sintéticos.</strong> Política F07-POL-01 no aprobada
      {threshold ? ` (umbral provisional k = ${threshold})` : ''}. No usar para decisiones reales.
    </Notice>
  );
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
    <div className="max-w-sm">
      <label className={labelClass} htmlFor="campaign-picker">Campaña (filtro aplicado)</label>
      <select
        id="campaign-picker"
        className={inputClass}
        value={selected ?? ''}
        onChange={(event) => onSelect(event.target.value)}
      >
        {selected === null && <option value="">Seleccione una campaña</option>}
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name} · {campaign.status} · {fmtDate(campaign.startDate)}
          </option>
        ))}
      </select>
    </div>
  );
}
