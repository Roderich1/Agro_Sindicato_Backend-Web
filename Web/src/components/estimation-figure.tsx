import { VALIDITY_REASON_TEXT, VALIDITY_TEXT } from '../lib/estimation-text';
import { formatBaseValue, formatDecimalQuantity, formatQuantity } from '../lib/quantity';
import type { InstitutionalResult, Validity } from '../types/estimation';

/**
 * F12-EST-06 y F12-EST-07-WEB: presentación de las cifras de la estimación, la
 * misma en línea y en la copia descargada. Una ausencia nunca se muestra como
 * cero; una cifra retirada por la política, tampoco.
 */
const VALIDITY_CLASS: Record<Validity, string> = {
  CURRENT: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  OUTDATED: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  SUPERSEDED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  NOT_USABLE: 'bg-red-50 text-red-700 ring-red-600/20',
};

export function ValidityBadge({ validity, reason }: { validity: Validity; reason: string | null }) {
  return (
    <div>
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${VALIDITY_CLASS[validity]}`}>
        {VALIDITY_TEXT[validity]}
      </span>
      {reason && <p className="mt-1 text-[11px] text-slate-500">{VALIDITY_REASON_TEXT[reason as keyof typeof VALIDITY_REASON_TEXT]}</p>}
    </div>
  );
}

/** La cifra o por qué no hay: nunca un cero en lugar de una ausencia. */
export function Figure({ value, unit, kind, status, validityReason }: {
  value: string | null;
  unit: 'ML' | 'G';
  kind: 'estimate' | 'naive';
  status: InstitutionalResult['status'];
  validityReason: string | null;
}) {
  if (status !== 'ESTIMATED') return <span className="text-slate-400">Sin cifra</span>;
  if (value === null) {
    return <span className="text-amber-700">{validityReason === 'SOURCES_WITHDRAWN' ? 'Cifra retirada' : 'Sin cifra'}</span>;
  }
  const shown = kind === 'estimate' ? formatDecimalQuantity(value, unit) : formatQuantity(value, unit);
  if (shown === null) return <span className="text-red-700">Cifra no válida</span>;
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-slate-900">{shown}</span>
      <span className="block text-[11px] text-slate-500">{formatBaseValue(value, unit)}</span>
    </span>
  );
}
