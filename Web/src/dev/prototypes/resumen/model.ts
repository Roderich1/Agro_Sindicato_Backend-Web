/**
 * Presentación compartida por las tres variantes del Resumen (prototipo,
 * 2026-11-11). Nada se suma, resta ni deduce: se agrupa por unidad (L y KG
 * nunca se mezclan), se ordena, se cuentan filas y se formatea lo que el
 * servidor publicó. Las reglas vienen del Resumen vigente
 * (`pages/collective-summary.page.tsx`, `components/needs-bars.tsx`).
 */
import { fmtDateTime, statusReason } from '../../../lib/collective-text';
import { VALIDITY_REASON_TEXT, VALIDITY_TEXT, REASON_TEXT } from '../../../lib/estimation-text';
import { fmtPercent } from '../../../lib/format';
import { COLLECTIVE_PATHS } from '../../../lib/navigation';
import { formatDecimalQuantity, formatQuantity, isBaseQuantity } from '../../../lib/quantity';
import type { AuditLog } from '../../../types/audit-logs';
import type { Campaign } from '../../../types/campaigns';
import type { CollectiveSummary, Coverage, SealRef, SummaryCell } from '../../../types/collective';
import type { InstitutionalResult, InstitutionalResults, Validity } from '../../../types/estimation';

export type Unit = 'L' | 'KG';
export type Order = 'cantidad' | 'nombre';

export const UNIT_TITLE: Record<Unit, string> = { L: 'Litros', KG: 'Kilogramos' };
export const UNIT_LIST: Record<Unit, string> = { L: 'En litros', KG: 'En kilogramos' };
const COUNT = new Intl.NumberFormat('es-BO');

export interface Row {
  key: string;
  testId: string;
  cell: SummaryCell;
  name: string;
  unit: Unit;
  disclosed: boolean;
  /** Cifra publicada con unidad; `null` si no se publica o el dato no es válido. */
  text: string | null;
  /** El servidor publicó una cifra que no supera la validación: se avisa, no se muestra. */
  invalid: boolean;
  /** Ancho relativo (1–100) dentro de su unidad; sólo cifras publicadas mayores que cero. */
  share: number | null;
  contributors: number | null;
  asOf: string | null;
  pending: boolean;
  /** Motivo (sin cifra) cuando no está publicada. */
  reason: string | null;
}

export interface Group {
  unit: Unit;
  rows: Row[];
  published: number;
}

function toRow(cell: SummaryCell, max: bigint, threshold: number | null): Row {
  const disclosed = cell.status === 'DISCLOSED';
  const text = disclosed ? formatQuantity(cell.total_base, cell.base_unit, cell.total_presentation) : null;
  const value = disclosed && isBaseQuantity(cell.total_base) ? BigInt(cell.total_base) : null;
  return {
    key: `${cell.product_ref}|${cell.base_unit}`,
    testId: `cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`,
    cell,
    name: cell.product_name,
    unit: cell.presentation_unit,
    disclosed,
    text,
    invalid: disclosed && text === null,
    share: disclosed && text !== null && value !== null && value > 0n && max > 0n ? Math.max(Number((value * 1000n) / max) / 10, 1) : null,
    contributors: disclosed ? cell.contributors : null,
    asOf: disclosed ? cell.data_as_of : null,
    pending: disclosed && cell.pending_changes,
    reason: disclosed ? null : statusReason(cell.status, threshold),
  };
}

const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
const valueOf = (row: Row) => (row.disclosed && isBaseQuantity(row.cell.total_base) ? BigInt(row.cell.total_base) : -1n);

/**
 * Filas por unidad. `cantidad`: de mayor a menor dentro de su unidad (nunca entre
 * unidades) y las filas sin cifra al final por nombre; `nombre`: alfabético.
 * Ordenar por cantidad no es una prioridad de compra: sólo ordena la lectura.
 */
export function groups(summary: CollectiveSummary, projection: SummaryCell['projection_type'], order: Order): Group[] {
  const cells = summary.cells.filter((cell) => cell.projection_type === projection);
  return (['L', 'KG'] as const)
    .map((unit) => {
      const own = cells.filter((cell) => cell.presentation_unit === unit);
      const max = own.reduce<bigint>((top, cell) => {
        const value = cell.status === 'DISCLOSED' && isBaseQuantity(cell.total_base) ? BigInt(cell.total_base) : 0n;
        return value > top ? value : top;
      }, 0n);
      const rows = own.map((cell) => toRow(cell, max, summary.disclosure.threshold));
      rows.sort((a, b) => {
        if (order === 'nombre') return byName(a, b);
        if (a.disclosed !== b.disclosed) return a.disclosed ? -1 : 1;
        const diff = valueOf(b) - valueOf(a);
        return diff === 0n ? byName(a, b) : diff > 0n ? 1 : -1;
      });
      return { unit, rows, published: rows.filter((row) => row.disclosed).length };
    })
    .filter((group) => group.rows.length > 0);
}

/** Conteo de filas de necesidad por estado: nunca cantidades. */
export interface Counts {
  total: number;
  published: number;
  privacy: number;
  other: number;
  pending: number;
}

export function counts(summary: CollectiveSummary): Counts {
  const needs = summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
  const published = needs.filter((cell) => cell.status === 'DISCLOSED');
  const privacy = needs.filter((cell) => cell.status === 'SUPPRESSED_UNDER_THRESHOLD').length;
  return { total: needs.length, published: published.length, privacy, other: needs.length - published.length - privacy, pending: published.filter((cell) => cell.pending_changes).length };
}

/** «7 productos con cifra publicada · 3 ocultos por privacidad · 1 sin cifra publicada». */
export function countsText(c: Counts): string {
  if (c.total === 0) return 'Sin necesidades publicadas.';
  const parts = [`${plural(c.published, 'producto con cifra publicada', 'productos con cifra publicada')}`];
  if (c.privacy > 0) parts.push(`${plural(c.privacy, 'oculto', 'ocultos')} por privacidad`);
  if (c.other > 0) parts.push(`${c.other} sin cifra publicada`);
  return `${parts.join(' · ')}.`;
}

export function plural(count: number, one: string, many: string): string {
  return `${COUNT.format(count)} ${count === 1 ? one : many}`;
}

export const fmtCount = (value: number) => COUNT.format(value);

/** Máximo de `data_as_of` entre las cifras publicadas (regla de presentación declarada; el resumen no tiene marca global). */
export function latestDataAsOf(cells: SummaryCell[]): string | null {
  let latest: { at: number; value: string } | null = null;
  for (const cell of cells) {
    if (cell.status !== 'DISCLOSED' || !cell.data_as_of) continue;
    const at = Date.parse(cell.data_as_of);
    if (Number.isFinite(at) && (!latest || at > latest.at)) latest = { at, value: cell.data_as_of };
  }
  return latest?.value ?? null;
}

export interface CoverageView {
  ratio: string;
  percent: string | null;
  noun: string;
  notes: string[];
  title: string;
}

/** «13 de 15» y su porcentaje sólo con denominador > 0; sin umbrales de color. */
export function coverageView(coverage: Coverage, sealedAt: string | null | undefined): CoverageView {
  const { linked_members: linked, members_with_contribution: within } = coverage;
  const notes: string[] = [];
  if (linked === 0) notes.push('Hoy no hay agricultores vinculados activos: no se calcula porcentaje.');
  if (sealedAt) notes.push('Fijada al sellar; no se recalcula.');
  if (coverage.suppressed_cells) notes.push('Hay filas sin cifra (ocultas o en revisión) cuyos aportes no se cuentan.');
  return {
    ratio: `${COUNT.format(within)} de ${COUNT.format(linked)}`,
    percent: fmtPercent(within, linked),
    noun: `${linked === 1 ? 'agricultor vinculado' : 'agricultores vinculados'} con cifras publicadas`,
    notes,
    title: sealedAt ? `Cobertura al sellar (${fmtDateTime(sealedAt)})` : 'Cobertura',
  };
}

export interface VersionView {
  sealed: boolean;
  label: string;
  detail: string | null;
}

export function versionView(seal: SealRef | null, status?: string): VersionView {
  if (!seal) return { sealed: false, label: 'Sin sellar', detail: status === 'CERRADA' ? 'Campaña cerrada sin versión sellada: puede sellarse.' : 'Las cifras pueden cambiar; sólo se sella una campaña cerrada.' };
  return {
    sealed: true,
    label: `Versión ${seal.version} sellada`,
    detail: `El ${fmtDateTime(seal.sealed_at)} por ${seal.sealed_by.name} (${seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'}) · datos aceptados hasta ${fmtDateTime(seal.accepted_until)} · ref. ${seal.seal_ref.slice(0, 8)}`,
  };
}

/* ── Atención y siguiente paso ────────────────────────────────────────────── */

export interface Attention {
  key: 'no-active' | 'closed-unsealed' | 'pending-changes' | 'estimation-outdated' | 'estimation-error' | 'no-needs' | 'activity-error';
  /** Gravedad para el color (siempre acompañado del texto): `warn` por omisión. */
  level?: 'warn' | 'error' | 'info';
  /** El hecho, en una frase. */
  title: string;
  /** Qué significa para quien lee. */
  description: string;
  /** De qué dato sale: se muestra al lado para que nada parezca inventado. */
  source: string;
  link?: { to: string; label: string; hash?: boolean };
}

/**
 * Sólo hechos que un dato del servidor sustenta; nada se deduce de cantidades.
 * La estimación entra sólo si la variante la muestra (`estimation`).
 */
export function attention(
  summary: CollectiveSummary | null,
  noActive: boolean,
  estimation: EstimationView | null,
): Attention[] {
  const items: Attention[] = [];
  if (noActive) {
    items.push({
      key: 'no-active',
      title: 'Sin campaña activa.',
      description: 'Los agricultores no pueden registrar en una campaña hasta que se abra una.',
      source: 'campaña activa del servidor',
      link: { to: '/campaigns', label: 'Ir a Campañas' },
    });
  }
  if (summary) {
    if (summary.campaign.status === 'CERRADA' && summary.seal === null) {
      items.push({
        key: 'closed-unsealed',
        title: 'Campaña cerrada sin sellar.',
        description: 'Cerrar no es sellar: revise la versión colectiva y, si corresponde, séllela.',
        source: 'estado de la campaña y sellado',
        link: { to: '#sellado', label: 'Ir al sellado', hash: true },
      });
    }
    const pending = summary.cells.filter((cell) => cell.pending_changes).length;
    if (pending > 0) {
      items.push({
        key: 'pending-changes',
        title: 'Hay cambios recibidos sin publicar.',
        description: `${pending === 1 ? 'Una fila tiene' : `${pending} filas tienen`} cambios recibidos que aún no alcanzan el umbral para publicarse; mientras tanto se muestra lo publicado antes.`,
        source: 'cambios pendientes del servidor',
      });
    }
  }
  if (estimation?.kind === 'results' && estimation.outdated > 0) {
    items.push({
      key: 'estimation-outdated',
      title: 'Estimación desactualizada.',
      description: `${plural(estimation.outdated, 'producto tiene', 'productos tienen')} una estimación calculada con fuentes que cambiaron; una ejecución nueva se pide en Histórico y estimaciones.`,
      source: 'vigencia de la estimación',
      link: { to: `${COLLECTIVE_PATHS.history}?vista=estimacion`, label: 'Ver estimación' },
    });
  }
  if (estimation?.kind === 'error') {
    items.push({
      key: 'estimation-error',
      level: 'error',
      title: 'La estimación no se pudo consultar.',
      description: estimation.text,
      source: 'consulta de la estimación',
    });
  }
  return items;
}

/**
 * Centro de atención de la variante Ejecutivo: los mismos hechos y, además,
 * «sin necesidades publicadas» (campaña abierta sin ninguna cifra) y el fallo de
 * la bitácora. Nada sale de umbrales ni de comparar cantidades.
 */
export function executiveAttention(
  summary: CollectiveSummary | null,
  noActive: boolean,
  estimation: EstimationView | null,
  activity: ActivityView | null,
): Attention[] {
  const items = attention(summary, noActive, estimation);
  if (summary && summary.disclosure.mode === 'PROVISIONAL_SYNTHETIC' && summary.campaign.status === 'ABIERTA' && counts(summary).total === 0) {
    items.push({
      key: 'no-needs',
      level: 'info',
      title: 'Sin necesidades publicadas todavía.',
      description: 'Ningún agricultor publicó una necesidad declarada en esta campaña; no hay borrador que revisar. Eso no significa cero.',
      source: 'cifras publicadas del servidor',
      link: { to: proposalsLink(summary.campaign.campaign_ref), label: 'Abrir Necesidades y propuestas' },
    });
  }
  if (activity?.kind === 'error') {
    items.push({
      key: 'activity-error',
      level: 'error',
      title: 'La bitácora no se pudo consultar.',
      description: activity.text,
      source: 'consulta de la bitácora',
      link: { to: '/audit-logs', label: 'Abrir Bitácora' },
    });
  }
  return items;
}

/* ── Actividad reciente: lo que la bitácora registra para la campaña (C14) ── */

export type ActivityView = { kind: 'loading' } | { kind: 'ready'; logs: AuditLog[] } | { kind: 'error'; text: string };

/** Las mismas etiquetas que la Bitácora (`pages/audit-logs.page.tsx`); una acción desconocida se muestra tal cual, legible. */
const ACTION_TEXT: Record<string, string> = {
  CREAR: 'Crear',
  ACTUALIZAR: 'Actualizar',
  INACTIVAR: 'Inactivar',
  ELIMINAR: 'Eliminar',
  ABRIR_CAMPANA: 'Abrir campaña',
  CERRAR_CAMPANA: 'Cerrar campaña',
  AJUSTAR_STOCK: 'Ajustar stock',
  REGISTRAR_PAGO: 'Registrar pago',
  SINCRONIZAR: 'Sincronizar',
  OTRO: 'Otro',
};

export function activityLabel(action: string): string {
  return ACTION_TEXT[action] ?? action.replace(/_/g, ' ');
}

/** Las entradas más recientes primero; el servidor no garantiza el orden. Nada se agrupa ni se cuenta por tipo. */
export function recentActivity(logs: AuditLog[], limit = 5): AuditLog[] {
  return [...logs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

export const proposalsLink = (campaignId: string) => `${COLLECTIVE_PATHS.proposals}?campaign=${encodeURIComponent(campaignId)}`;
export const coverageLink = (campaignId: string) => `${COLLECTIVE_PATHS.coverage}?campaign=${encodeURIComponent(campaignId)}`;

/* ── Estimación del consumo como referencia (F12-EST-08: nunca se suma) ───── */

export type EstimationView =
  | { kind: 'results'; results: InstitutionalResults; byKey: Map<string, InstitutionalResult>; current: number; outdated: number; without: number }
  | { kind: 'policy' }
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'error'; text: string };

export function estimationView(results: InstitutionalResults, summary: CollectiveSummary): EstimationView {
  const byKey = new Map(results.results.map((result) => [`${result.product.product_ref}|${result.base_unit}`, result]));
  const needs = summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
  let current = 0;
  let outdated = 0;
  let without = 0;
  for (const cell of needs) {
    const match = byKey.get(`${cell.product_ref}|${cell.base_unit}`);
    if (!match || match.status !== 'ESTIMATED' || match.estimate_base === null) without += 1;
    else if (match.validity === 'CURRENT') current += 1;
    else if (match.validity === 'OUTDATED') outdated += 1;
    else without += 1;
  }
  return { kind: 'results', results, byKey, current, outdated, without };
}

export interface ReferenceCell {
  /** Cifra estimada formateada (L/KG), si la hay. */
  text: string | null;
  validity: Validity | null;
  validityText: string | null;
  reason: string | null;
  generatedAt: string | null;
  /** Texto para una ausencia: «Sin estimación», «Datos insuficientes»… */
  absence: string | null;
}

/** La referencia de una fila de necesidad: mismo producto canónico y unidad. */
export function referenceFor(row: Row, view: EstimationView | null): ReferenceCell | null {
  if (!view || view.kind !== 'results') return null;
  const match = view.byKey.get(row.key);
  if (!match) return { text: null, validity: null, validityText: null, reason: null, generatedAt: null, absence: 'Sin estimación' };
  const validityText = VALIDITY_TEXT[match.validity];
  const reason = match.validity_reason ? VALIDITY_REASON_TEXT[match.validity_reason] : match.reason_code ? REASON_TEXT[match.reason_code] : null;
  if (match.status !== 'ESTIMATED') {
    return { text: null, validity: match.validity, validityText, reason, generatedAt: match.generated_at, absence: match.status === 'INSUFFICIENT_DATA' ? 'Datos insuficientes' : match.status === 'INCOMPATIBLE_DATA' ? 'Datos incompatibles' : 'Cálculo fallido' };
  }
  if (match.estimate_base === null) return { text: null, validity: match.validity, validityText, reason, generatedAt: match.generated_at, absence: 'Cifra retirada' };
  const text = formatDecimalQuantity(match.estimate_base, match.base_unit);
  return { text, validity: match.validity, validityText, reason, generatedAt: match.generated_at, absence: text === null ? 'Cifra no válida' : null };
}

export function activeOf(campaigns: Campaign[]): Campaign | null {
  return campaigns.find((campaign) => campaign.isActive && campaign.status === 'ABIERTA') ?? null;
}
