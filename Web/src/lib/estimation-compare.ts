import type { ProposalLine } from '../types/collective';
import type { ReferenceLine } from '../types/estimation';
import { formatDecimalQuantity, formatQuantity, isBaseDecimal, isBaseQuantity } from './quantity';

/**
 * Diferencia entre la necesidad declarada de una línea del borrador y la
 * estimación del consumo que la acompaña (F12-EST-08). Es sólo un texto de
 * lectura: no cambia la propuesta, no se suma a nada y nunca es un porcentaje.
 *
 * Se ofrece únicamente cuando las dos cifras son comparables:
 * - la referencia es de la misma línea, producto canónico y unidad (el servidor
 *   ya la alinea con la campaña del borrador, que es la campaña objetivo);
 * - la necesidad está publicada (`DISCLOSED`) y su cifra es válida;
 * - la estimación es `ESTIMATED`, `CURRENT` y mayor que cero.
 * En cualquier otro caso (ausente, cero, no vigente, retirada, datos
 * insuficientes, necesidad oculta) devuelve `null` y la vista no compara.
 *
 * La aritmética es exacta sobre los textos del servidor: enteros en unidad base
 * y decimales de hasta 6 cifras, escalados a millonésimas con BigInt; nunca
 * pasa por `Number`.
 */
export type NeedEstimateComparison =
  | { kind: 'equal' }
  | { kind: 'greater' | 'smaller'; /** Diferencia absoluta ya presentada en L o KG, p. ej. «12 L». */ difference: string };

const MICRO = 1_000_000n;

/** «295000.25» → 295000250000n (millonésimas de unidad base). `null` si no es un decimal válido. */
function toMicro(value: string): bigint | null {
  if (!isBaseDecimal(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * MICRO + BigInt(fraction.padEnd(6, '0'));
}

function fromMicro(value: bigint): string {
  return `${value / MICRO}.${(value % MICRO).toString().padStart(6, '0')}`;
}

export function compareNeedWithEstimate(line: ProposalLine, reference: ReferenceLine | null): NeedEstimateComparison | null {
  if (!reference || reference.absence !== null || !reference.estimation) return null;
  if (reference.position !== line.position || reference.product_ref !== line.product_ref || reference.base_unit !== line.base_unit) return null;
  if (reference.presentation_unit !== line.presentation_unit) return null;
  const estimation = reference.estimation;
  if (estimation.status !== 'ESTIMATED' || estimation.validity !== 'CURRENT' || estimation.estimate_base === null) return null;
  if (line.status !== 'DISCLOSED' || !isBaseQuantity(line.quantity_base)) return null;
  // Una cifra de necesidad que no coincide con su presentación no se muestra; tampoco se compara.
  if (formatQuantity(line.quantity_base, line.base_unit, line.quantity_presentation) === null) return null;
  const estimate = toMicro(estimation.estimate_base);
  if (estimate === null || estimate <= 0n) return null;
  const need = BigInt(line.quantity_base) * MICRO;
  if (estimate === need) return { kind: 'equal' };
  const difference = formatDecimalQuantity(fromMicro(estimate > need ? estimate - need : need - estimate), line.base_unit);
  if (difference === null) return null;
  return { kind: estimate > need ? 'greater' : 'smaller', difference };
}

/** «La estimación es 12 L mayor que la necesidad declarada.» */
export function comparisonText(comparison: NeedEstimateComparison): string {
  if (comparison.kind === 'equal') return 'La estimación coincide con la necesidad declarada.';
  return `La estimación es ${comparison.difference} ${comparison.kind === 'greater' ? 'mayor' : 'menor'} que la necesidad declarada.`;
}
