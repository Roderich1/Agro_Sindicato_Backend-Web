import { VALIDITY_REASON_TEXT, VALIDITY_TEXT } from '../lib/estimation-text';
import { formatBaseValue, formatDecimalQuantity, formatQuantity, formatRoundedEstimate } from '../lib/quantity';
import type { InstitutionalResult, Validity } from '../types/estimation';

/**
 * F12-EST-06 y F12-EST-07-WEB: presentación de las cifras de la estimación, la
 * misma en línea y en la copia descargada. Una ausencia nunca se muestra como
 * cero; una cifra retirada por la política, tampoco.
 *
 * Rediseño v2 (láminas 26 y 27): «Vigente» en lima suave, los demás estados
 * con su color de aviso; siempre con texto.
 */
const VALIDITY_CLASS: Record<Validity, string> = {
  CURRENT: 'bg-lime-soft text-lime-ink',
  OUTDATED: 'bg-warn-bg text-warn-ink',
  SUPERSEDED: 'bg-sunken text-ink',
  NOT_USABLE: 'bg-sunken text-ink',
};

export function ValidityBadge({ validity, reason }: { validity: Validity; reason: string | null }) {
  return (
    <div>
      <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${VALIDITY_CLASS[validity]}`}>{VALIDITY_TEXT[validity]}</span>
      {reason && <p className="mt-1 text-sm leading-snug text-ink-muted">{VALIDITY_REASON_TEXT[reason as keyof typeof VALIDITY_REASON_TEXT]}</p>}
    </div>
  );
}

/**
 * La cifra o por qué no hay: nunca un cero en lugar de una ausencia.
 *
 * `rounded` (sólo la estimación, E3-R8): la cifra grande va redondeada a la
 * décima al presentar («≈ 19,5 KG»; por debajo de 1 L o 1 KG, en mL o g) y la
 * exacta queda escrita debajo, visible sin pasar el ratón, y en el `title`.
 * La cifra exacta del servidor no cambia ni vuelve a usarse en ningún cálculo.
 */
export function Figure({
  value,
  unit,
  kind,
  status,
  validityReason,
  rounded = false,
}: {
  value: string | null;
  unit: 'ML' | 'G';
  kind: 'estimate' | 'naive';
  status: InstitutionalResult['status'];
  validityReason: string | null;
  rounded?: boolean;
}) {
  if (status !== 'ESTIMATED') return <span className="text-ink-muted">Sin cifra</span>;
  if (value === null) {
    return <span className="text-caution">{validityReason === 'SOURCES_WITHDRAWN' ? 'Cifra retirada' : 'Sin cifra'}</span>;
  }
  const shown = kind === 'estimate' ? formatDecimalQuantity(value, unit) : formatQuantity(value, unit);
  if (shown === null) return <span className="text-danger-ink">Cifra no válida</span>;
  if (rounded && kind === 'estimate') {
    const base = formatBaseValue(value, unit);
    return (
      <span className="tabular-nums" title={`Cifra exacta: ${shown} (${base ?? ''})`}>
        <span className="font-display font-extrabold text-ink">{formatRoundedEstimate(value, unit) ?? shown}</span>
        <span className="block text-xs font-normal text-ink-muted" data-testid="estimate-exact">
          Cifra exacta: {shown} ({base})
        </span>
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      <span className={kind === 'estimate' ? 'font-display font-extrabold text-ink' : 'text-ink'}>{shown}</span>
      <span className="block text-xs font-normal text-ink-muted">{formatBaseValue(value, unit)}</span>
    </span>
  );
}
