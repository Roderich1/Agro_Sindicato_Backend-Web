import { statusReason } from '../lib/collective-text';
import { fmtDate } from '../lib/format';
import { formatQuantity, type BaseUnit } from '../lib/quantity';
import type { Campaign } from '../types/campaigns';
import type { Coverage, ProposalLineStatus } from '../types/collective';
import { inputClass, labelClass, Notice } from './app-shell';

/* Estados de una celda o línea (F07-POL-01). Ninguno inventa ni deduce cifras. */

const STATUS_TEXT: Record<ProposalLineStatus, { label: string; cls: string }> = {
  DISCLOSED: { label: 'Publicado', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  SUPPRESSED_UNDER_THRESHOLD: { label: 'Oculto', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
  SUPPRESSED_REVISION: { label: 'Oculto (revisión)', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  OVERFLOW: { label: 'Fuera de rango', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
  WITHDRAWN: { label: 'Retirado', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  SUPERSEDED: { label: 'Sustituido', cls: 'bg-amber-500/10 text-amber-800 ring-amber-500/20' },
  POLICY_PENDING: { label: 'Política pendiente', cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20' },
};


export function StatusBadge({ status, threshold }: { status: ProposalLineStatus; threshold?: number | null }) {
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
  status: ProposalLineStatus;
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

export function CoverageBanner({ coverage, campaignName }: { coverage: Coverage; campaignName: string }) {
  return (
    <div className="glass-card p-5" data-testid="coverage">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Cobertura · {campaignName}</p>
      <p className="mt-1.5 text-lg font-bold text-slate-900">
        {coverage.members_with_contribution} de {coverage.linked_members} agricultores vinculados aportaron datos
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Ausencia de aporte = desconocido, no cero. Las cifras no son el total del sindicato: sólo de quienes aportaron.
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
