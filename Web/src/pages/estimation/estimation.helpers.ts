import type { DataStateKind } from '../../components/ui';
import type { EstimationError } from '../../lib/estimation-text';
import { groupDecimal, toPresentation } from '../../lib/quantity';
import type { SaveOutcome } from '../../lib/estimation-copy';
import type {
  InstitutionalResult,
  InstitutionalResults,
  ResultDetail,
  Run,
  RunSummary,
  SeriesPoint,
} from '../../types/estimation';

/**
 * Sombra en el borde por el que una tabla sigue (sin JavaScript): los degradados blancos se desplazan con el
 * contenido (`local`) y tapan la sombra fija (`scroll`) sólo cuando se llega a ese borde. Sin desplazamiento no se ve.
 */
export const SCROLL_HINT =
  '[background:linear-gradient(to_right,#fff_30%,rgb(255_255_255/0))_left_center/40px_100%_no-repeat_local,linear-gradient(to_left,#fff_30%,rgb(255_255_255/0))_right_center/40px_100%_no-repeat_local,radial-gradient(farthest-side_at_0_50%,rgb(15_23_42/0.2),transparent)_left_center/12px_100%_no-repeat_scroll,radial-gradient(farthest-side_at_100%_50%,rgb(15_23_42/0.2),transparent)_right_center/12px_100%_no-repeat_scroll]';

/**
 * H3 (emulador, 2026-11-11): al desplazar una tabla a lo ancho, la primera columna (campaña o producto)
 * queda fija a la izquierda con fondo opaco y un borde, para que ninguna cifra pierda su fila.
 */
export const STICKY_EDGE = 'shadow-[inset_-1px_0_0_#e2e8f0]';

export const ELIGIBLE = ['PLANIFICADA', 'ABIERTA'];

/** Un perfil que no es el institucional: el rol ya no es de la Directiva ni del Administrador. */
export const LOST_ROLE: EstimationError = {
  kind: 'forbidden',
  message: 'Su rol ya no tiene acceso a la estimación institucional.',
};

export const SAVE_TEXT: Record<SaveOutcome, string> = {
  SAVED: 'Copia guardada en este navegador.',
  KEPT_NEWER: 'Ya había una copia igual o más reciente de esta campaña: se conserva.',
  CONTEXT_CHANGED: 'La sesión cambió o se retiró el acceso durante la descarga: la copia no se guardó.',
  TARGET_REVOKED: 'La campaña dejó de estar disponible durante la descarga: la copia no se guardó.',
  NOT_INSTITUTIONAL: 'La respuesta no es del perfil institucional: no se guardó.',
  OTHER_SCOPE: 'La respuesta no es de su sindicato: no se guardó.',
  UNSUPPORTED: 'El formato de la respuesta no es el esperado: no se guardó.',
};

/** Cómo se presenta cada clase de error de INT-09 (§4 del contrato compartido). */
export const ERROR_STATE: Record<EstimationError['kind'], DataStateKind> = {
  offline: 'stale',
  session: 'forbidden',
  forbidden: 'forbidden',
  policy: 'restricted',
  'not-found': 'error',
  invalid: 'error',
  other: 'error',
};

export const ERROR_TITLE: Record<EstimationError['kind'], string> = {
  offline: 'Sin conexión',
  session: 'Sesión vencida',
  forbidden: 'Sin permiso',
  policy: 'Información restringida',
  'not-found': 'No disponible',
  invalid: 'Solicitud no admitida',
  other: 'No fue posible completar la consulta',
};

export const OBSERVED_GAP: Record<Exclude<SeriesPoint['kind'], 'VERIFIED_CONSUMPTION'>, string> = {
  NO_RECORD: 'sin registro',
  HIDDEN: 'oculto',
};

export const KIND_TEXT: Record<SeriesPoint['kind'], string> = {
  VERIFIED_CONSUMPTION: 'Consumo comprobado',
  NO_RECORD: 'Sin registro',
  HIDDEN: 'Oculto',
};

export const EXCLUSION_TEXT: Record<NonNullable<SeriesPoint['exclusion_reason']>, string> = {
  NO_RECORD: 'sin registro',
  HIDDEN: 'oculto por la política',
  BEFORE_GAP: 'antes de un hueco',
  NOT_BEFORE_TARGET: 'no es anterior al objetivo',
};

/** Orden por unidades de código, independiente del idioma: la misma elección da la misma clave de solicitud. */
export function byCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * «Calculada el …» de la barra (lámina 26): la ejecución más reciente entre
 * los resultados mostrados (regla de presentación, como «Cifra más reciente»).
 */
export function latestGeneratedAt(results: InstitutionalResults | null): string | null {
  let latest: { at: number; value: string } | null = null;
  for (const result of results?.results ?? []) {
    const at = Date.parse(result.generated_at);
    if (Number.isFinite(at) && (!latest || at > latest.at)) latest = { at, value: result.generated_at };
  }
  return latest?.value ?? null;
}

export function detailOf(details: Record<string, Run>, result: InstitutionalResult): ResultDetail | null {
  return (
    details[result.run_ref]?.results.find((r) => r.product.product_ref === result.product.product_ref && r.base_unit === result.base_unit) ?? null
  );
}

export function observed(detail: ResultDetail | null): string {
  if (!detail?.span) return '—';
  const names = new Map(detail.points.map((p) => [p.campaign.campaign_ref, p.campaign.name]));
  return `${detail.span.length}: ${names.get(detail.span.first_campaign_ref) ?? '?'} a ${names.get(detail.span.last_campaign_ref) ?? '?'}`;
}

/**
 * Lo publicado en cada campaña anterior al objetivo, en orden y tal como lo
 * entrega el servidor (prototipo W4): «96 · 120 · 104 · 116 L», «12 · oculto ·
 * 14 · 15 L». Una cifra que dejó de divulgarse llega como oculta.
 */
export function observedValues(detail: ResultDetail | null, unit: 'L' | 'KG'): string | null {
  if (!detail) return null;
  const before = detail.points.filter((p) => p.exclusion_reason !== 'NOT_BEFORE_TARGET');
  if (before.length === 0) return 'sin cifras publicadas';
  const values = before.map((p) => {
    if (p.kind !== 'VERIFIED_CONSUMPTION') return OBSERVED_GAP[p.kind];
    const shown = p.quantity_base === null ? null : toPresentation(p.quantity_base);
    return shown === null ? 'cifra no válida' : groupDecimal(shown);
  });
  return `${values.join(' · ')} ${unit}`;
}

/** Campaña del último consumo comprobado anterior a la campaña objetivo (la que da la línea base). */
export function lastObservedCampaign(detail: ResultDetail | null): string | null {
  if (!detail) return null;
  const before = detail.points.filter((p) => p.exclusion_reason !== 'NOT_BEFORE_TARGET' && p.kind === 'VERIFIED_CONSUMPTION' && p.quantity_base !== null);
  const last = before[before.length - 1];
  return last ? last.campaign.name : null;
}

/** Recuento de una ejecución sin los ceros: «1 estimado, 1 con datos insuficientes». */
export function countsText(counts: RunSummary['counts']): string {
  const parts = [
    [counts.estimated, 'estimados', 'estimado'],
    [counts.insufficient_data, 'con datos insuficientes', 'con datos insuficientes'],
    [counts.incompatible_data, 'incompatibles', 'incompatible'],
    [counts.calculation_failed, 'fallidos', 'fallido'],
  ] as const;
  const shown = parts.filter(([n]) => n > 0).map(([n, plural, singular]) => `${n} ${n === 1 ? singular : plural}`);
  return shown.length > 0 ? shown.join(', ') : 'sin resultados por producto';
}
