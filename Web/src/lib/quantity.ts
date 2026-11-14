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

/**
 * F12-EST-06: la estimación SES llega como decimal exacto en unidad base, con
 * hasta 6 decimales (EST-D-07), dentro de un string.
 */
const BASE_DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/;

export function isBaseDecimal(value: unknown): value is string {
  return typeof value === 'string' && BASE_DECIMAL.test(value);
}

/**
 * Decimal en unidad base → L/KG exactos, desplazando la coma tres lugares sobre
 * el string, sin redondear: `"111000.000000"` → `"111"`, `"0.292613"` →
 * `"0.000292613"`. `null` si el valor no es válido.
 */
export function decimalToPresentation(base: string): string | null {
  const match = BASE_DECIMAL.exec(base);
  if (!match) return null;
  const whole = match[1]!;
  const digits = whole + (match[2] ?? '').slice(1);
  const point = whole.length - 3;
  const integer = point <= 0 ? '0' : digits.slice(0, point).replace(/^0+(?=\d)/, '');
  const fraction = (point <= 0 ? '0'.repeat(-point) + digits : digits.slice(point)).replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
}

/** `"111000.000000"` (ML) → `"111 L"`; `null` si no es un decimal válido. */
export function formatDecimalQuantity(base: string | null, unit: BaseUnit): string | null {
  if (base === null) return null;
  const presentation = decimalToPresentation(base);
  return presentation === null ? null : `${groupDecimal(presentation)} ${PRESENTATION_UNIT[unit]}`;
}

/**
 * E3 §5: una estimación redondeada SÓLO para presentarla junto a la necesidad,
 * a una décima (mitad hacia arriba), con aritmética exacta sobre el string:
 * desde 1 L/KG en L/KG (`"428929.385090"` G → `"≈ 428,9 KG"`), por debajo en
 * mL/g para no mostrar «≈ 0» (`"30.123456"` G → `"≈ 30,1 g"`); `"0.000000"` →
 * `"0 L"`. La cifra exacta sigue disponible (título y «Ver cálculo»). `null`
 * si no es válida.
 */
export function formatRoundedEstimate(base: string | null, unit: BaseUnit): string | null {
  if (base === null || !isBaseDecimal(base)) return null;
  const [whole, fraction = ''] = base.split('.');
  const micro = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  const small = micro > 0n && micro < 1_000_000_000n;
  // Décimas de la unidad mostrada: L/KG = micro / 10^8; mL/g = micro / 10^5.
  const step = small ? 100_000n : 100_000_000n;
  const tenths = (micro + step / 2n) / step;
  const exact = tenths * step === micro;
  const integer = tenths / 10n;
  const decimal = tenths % 10n;
  const text = groupDecimal(decimal === 0n ? integer.toString() : `${integer}.${decimal}`);
  const shownUnit = small ? (unit === 'ML' ? 'mL' : 'g') : PRESENTATION_UNIT[unit];
  return `${exact ? '' : '≈ '}${text} ${shownUnit}`;
}

/** La cifra tal como la entrega el servidor, en unidad base: `"111000.000000"` → `"111.000 mL"`. */
export function formatBaseValue(base: string | null, unit: BaseUnit): string | null {
  if (base === null || !(isBaseQuantity(base) || isBaseDecimal(base))) return null;
  const [whole, fraction] = base.split('.');
  const trimmed = fraction?.replace(/0+$/, '');
  return `${groupDecimal(trimmed ? `${whole}.${trimmed}` : whole!)} ${unit === 'ML' ? 'mL' : 'g'}`;
}
