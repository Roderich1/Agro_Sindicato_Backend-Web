/** Textos de unidad de la sesión C. */

/** Unidad del servidor → texto corto, nombre largo y si se vincula a cifras colectivas (L o kg). */
export function unitInfo(unit: string): { short: string; long: string; linkable: boolean } {
  const upper = unit.trim().toUpperCase();
  if (upper === 'L') return { short: 'L', long: 'litros', linkable: true };
  if (upper === 'KG') return { short: 'kg', long: 'kilogramos', linkable: true };
  return { short: unit, long: unit, linkable: false };
}

