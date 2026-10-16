/**
 * Cantidades colectivas (F06/F07): el servidor las entrega como enteros exactos
 * en unidad base (`ML` o `G`) dentro de un string. Aquí sólo se presentan,
 * con BigInt y strings: nunca con `Number`/`parseFloat`, que pierden precisión
 * por encima de 2^53, y nunca se suman, restan ni recalculan totales.
 */

export type BaseUnit = 'ML' | 'G';

const PRESENTATION_UNIT: Record<BaseUnit, 'L' | 'KG'> = { ML: 'L', G: 'KG' };
const DIGITS = /^(0|[1-9][0-9]*)$/;

/** `true` sólo para un entero no negativo sin signo, ceros iniciales ni decimales. */
export function isBaseQuantity(value: unknown): value is string {
  return typeof value === 'string' && DIGITS.test(value);
}

/**
 * Base → L/KG exactos (1000 unidades base por L/KG), sin redondeo:
 * `"11500"` → `"11.5"`, `"25"` → `"0.025"`. `null` si el valor no es válido.
 */
export function toPresentation(base: string): string | null {
  if (!isBaseQuantity(base)) return null;
  const value = BigInt(base);
  const whole = value / 1000n;
  const fraction = (value % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Agrupa miles con punto y usa coma decimal (es-BO), operando sobre el string. */
export function groupDecimal(decimal: string): string {
  const [whole, fraction] = decimal.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction ? `${grouped},${fraction}` : grouped;
}

/**
 * Texto para mostrar: `"11,5 L"`. Si el servidor también envió su propia
 * presentación, debe coincidir con la calculada; si no coincide o el dato no es
 * válido, se devuelve `null` y la interfaz muestra un error en lugar de una
 * cifra dudosa.
 */
export function formatQuantity(base: string | null, unit: BaseUnit, serverPresentation?: string | null): string | null {
  if (base === null) return null;
  const presentation = toPresentation(base);
  if (presentation === null) return null;
  if (serverPresentation != null && serverPresentation !== presentation) return null;
  return `${groupDecimal(presentation)} ${PRESENTATION_UNIT[unit]}`;
}

export function presentationUnit(unit: BaseUnit): 'L' | 'KG' {
  return PRESENTATION_UNIT[unit];
}
