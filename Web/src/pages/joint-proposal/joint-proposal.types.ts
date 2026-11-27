import { COLLECTIVE_PATHS } from '../../lib/navigation';
import { FAILURE_TEXT, STOP_TEXT } from '../../lib/estimation-text';
import type { Proposal, ProposalLine } from '../../types/collective';
import type { FailureCode, Run, StopCode } from '../../types/estimation';
import type { EstimationLinkLine, EstimationLinkView } from '../../types/estimation-link';

export const POLICY_PENDING_MESSAGE =
  'Sin aportes autorizados para generar un borrador.';

/** La referencia fijada del borrador mostrado: se carga aparte y su fallo no oculta el borrador. */
export type LinkLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; view: EstimationLinkView };

/** La selección de productos del borrador mostrado: `saved` es la del servidor; `chosen`, la marcada. */
export type SelectionLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; revision: number; saved: string[]; chosen: string[] };

export interface Feedback {
  kind: 'ok' | 'info' | 'warn' | 'error';
  message: string;
}

export type LinkIntent = 'INITIAL' | 'UPDATE' | 'CLEAR';

/** Un problema de la vista: el texto y el estado del §4 con el que se presenta. */
export interface Problem {
  kind: 'error' | 'forbidden' | 'restricted';
  message: string;
  /** Falló la carga del historial: se ofrece «Reintentar». */
  retry: boolean;
}

export type ProposalTab = 'actual' | 'anteriores' | 'calculo';

export type RunDetailLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; run: Run };

export interface DetailProps {
  proposal: Proposal;
  latest: boolean;
  onShowLatest?: () => void;
  link: LinkLoad | null;
  linkFeedback: Feedback | null;
  acting: LinkIntent | null;
  onAct: (intent: LinkIntent) => void;
  onRetryLink: () => void;
  selection: SelectionLoad | null;
  selectionFeedback: Feedback | null;
  saving: boolean;
  onToggle: (productRef: string) => void;
  onSave: () => void;
  onRetrySelection: () => void;
  onPrepareCall: () => void;
}

export function fmtCount(value: number): string {
  return new Intl.NumberFormat('es-BO').format(value);
}

/** Los productos del borrador en el orden de sus líneas, sin repetir. */
export function productOrder(proposal: Proposal): string[] {
  return [...new Set(proposal.lines.map((line) => line.product_ref))];
}

/** La línea de la referencia que acompaña a esta línea del borrador: misma posición, producto y unidad. */
export function linkLineOf(link: LinkLoad | null, line: ProposalLine): EstimationLinkLine | null {
  if (link?.status !== 'ready') return null;
  const found = link.view.lines.find((l) => l.position === line.position);
  return found && found.product.product_ref === line.product_ref && found.base_unit === line.base_unit ? found : null;
}

/** Tono de la franja según el estado de la referencia (lámina 05 §12). */
export function bannerTone(view: EstimationLinkView): string {
  if (view.state === 'LINKED') return view.update.available ? 'bg-warn-bg text-warn-ink' : 'bg-lime-soft text-lime-ink';
  if (view.state === 'UNAVAILABLE') return 'bg-danger-bg text-danger-ink';
  return 'bg-sunken text-ink';
}

/** La única acción principal que corresponde a la vista. */
export function primaryAction(view: EstimationLinkView): LinkIntent | 'CALCULATING' | null {
  if (view.state === 'CALCULATING') return 'CALCULATING';
  if (view.state === 'NONE') return view.prepare_blocker ? null : 'INITIAL';
  if (view.update.available && view.link) return 'UPDATE';
  return null;
}

export function unavailableText(view: EstimationLinkView): string {
  const stop = view.link?.stop_code;
  const failure = view.link?.failure_code ?? view.run?.failure_code;
  if (stop && stop in STOP_TEXT) return STOP_TEXT[stop as StopCode];
  if (failure && failure in FAILURE_TEXT) return FAILURE_TEXT[failure as FailureCode];
  return 'El cálculo no produjo cifras. Puede volver a pedirlo con «Actualizar referencia».';
}

export function estimationPath(proposal: Proposal): string {
  return `${COLLECTIVE_PATHS.history}?vista=estimacion&campaign=${encodeURIComponent(proposal.campaign.campaign_ref)}`;
}

export function productsText(count: number): string {
  if (count === 0) return 'sin productos';
  return `${fmtCount(count)} ${count === 1 ? 'producto' : 'productos'}`;
}

/** Recuento de líneas sin estimación, por su estado (nunca todo como «falta de datos», MATRIZ 08). */
export const NO_ESTIMATE_TEXT: Record<string, [string, string]> = {
  INSUFFICIENT_DATA: ['con datos insuficientes', 'con datos insuficientes'],
  RESTRICTED: ['restringido', 'restringidos'],
  NO_RESULT: ['sin resultado', 'sin resultado'],
  ERROR: ['con error de cálculo', 'con error de cálculo'],
  NONE: ['sin referencia', 'sin referencia'],
  CALCULATING: ['calculándose', 'calculándose'],
};

/** «INVIERNO» → «Invierno» (la clave de la temporada; su definición completa va en el detalle técnico). */
export function seasonName(key: string): string {
  const lower = key.toLocaleLowerCase('es');
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
}
