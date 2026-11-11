import axios from 'axios';
import type {
  EstimationLinkLine,
  EstimationLinkView,
  LinkAction,
  LinkErrorBody,
  LinkErrorCode,
  LinkMode,
  NotCalculableReason,
  PrepareBlocker,
  PrepareOutcome,
  ProposalSelection,
  UpdateReason,
} from '../types/estimation-link';
import { COLLECTIVE_PATHS } from './navigation';

/**
 * E3 (docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md): textos de la
 * referencia de consumo estimado fijada en el borrador. Sólo presentan lo que
 * decide el servidor: la Web no calcula diferencias ni porcentajes y nunca
 * habla de «compra recomendada», «demanda excesiva» ni semáforos.
 */

/** Cada cuánto se vuelve a leer la referencia mientras se calcula (sólo `GET`). */
export const LINK_POLL_MS = 3000;

export const POPULATION_NOT_VERIFIED_TEXT =
  'No se calcula la diferencia: no hay datos para comprobar que la necesidad y la estimación cubran a las mismas personas.';

/** Por qué no se puede obtener una referencia ahora. */
export const PREPARE_BLOCKER_TEXT: Record<PrepareBlocker, string> = {
  POLICY_PENDING: 'Restringida: la política de divulgación no está aprobada. No se obtiene ni se muestra ninguna estimación.',
  TARGET_CAMPAIGN_NOT_ELIGIBLE: 'No se puede calcular: sólo se estima para una campaña planificada o abierta.',
  TARGET_CAMPAIGN_NOT_CLASSIFIED:
    'No se puede calcular: la campaña no está clasificada en una temporada, así que no hay campañas comparables con las que estimar.',
  NO_ESTIMABLE_PRODUCTS: 'No se puede calcular: ningún producto del borrador es estimable (producto canónico con unidad comparable).',
};

export const NOT_CALCULABLE_TEXT: Record<NotCalculableReason, string> = {
  TARGET_CAMPAIGN_NOT_ELIGIBLE: PREPARE_BLOCKER_TEXT.TARGET_CAMPAIGN_NOT_ELIGIBLE,
  TARGET_CAMPAIGN_NOT_CLASSIFIED: PREPARE_BLOCKER_TEXT.TARGET_CAMPAIGN_NOT_CLASSIFIED,
  NO_ESTIMABLE_PRODUCTS: PREPARE_BLOCKER_TEXT.NO_ESTIMABLE_PRODUCTS,
};

/** Por qué se ofrece «Actualizar referencia». */
export const UPDATE_REASON_TEXT: Record<UpdateReason, string> = {
  NEWER_RUN: 'Hay una ejecución calculada posterior a la fijada.',
  OUTDATED: 'Alguna línea quedó desactualizada: cambiaron sus fuentes o la clasificación de una campaña.',
  FAILED: 'La ejecución fijada falló.',
  NOT_EXECUTED: 'El cálculo pedido no se ejecutó.',
  INCOMPLETE: 'La ejecución fijada no incluye todos los productos estimables del borrador.',
};

/** Qué pasó tras pulsar «Obtener», «Actualizar» o «Quitar referencia». */
export function outcomeText(outcome: PrepareOutcome, reason?: NotCalculableReason): string {
  switch (outcome) {
    case 'EXISTING':
      return 'Ya había una referencia fijada (otra persona u otra pestaña la obtuvo): se muestra la vigente. No se calculó nada.';
    case 'LINKED_EXISTING_RUN':
      return 'Referencia recuperada: se fijó una ejecución ya calculada para esta campaña, sin calcular de nuevo.';
    case 'REUSED_JOB':
      return 'Ya había un cálculo en curso para esta campaña y estos productos: se espera ese mismo cálculo.';
    case 'REQUESTED_JOB':
      return 'Cálculo solicitado. Esta vista consulta su estado cada pocos segundos; el borrador sigue disponible mientras tanto.';
    case 'CLEARED':
      return 'Referencia quitada. El borrador y la selección no cambian; un cálculo en curso ya no se fijará.';
    case 'NOT_CALCULABLE':
      return reason ? NOT_CALCULABLE_TEXT[reason] : 'No se puede calcular una referencia para este borrador.';
  }
}

export const MODE_TEXT: Record<LinkMode, string> = {
  INITIAL: 'Obtener',
  UPDATE: 'Actualizar',
  CLEAR: 'Quitar',
};

export const ACTION_TEXT: Record<LinkAction, string> = {
  LINK_EXISTING_RUN: 'ejecución existente fijada',
  REUSE_JOB: 'cálculo en curso reutilizado',
  REQUEST_JOB: 'cálculo solicitado',
  CLEAR: 'referencia quitada',
};

/** El código de un error de E3 (`{ errorCode, view?, selection? }`), o `null`. */
export function linkErrorOf(err: unknown): (LinkErrorBody & { status: number }) | null {
  if (!axios.isAxiosError(err) || !err.response) return null;
  const data = err.response.data as Partial<LinkErrorBody> | undefined;
  if (!data || typeof data.errorCode !== 'string') return null;
  return { ...(data as LinkErrorBody), status: err.response.status };
}

const ERROR_TEXT: Partial<Record<LinkErrorCode, string>> = {
  POLICY_PENDING: PREPARE_BLOCKER_TEXT.POLICY_PENDING,
  REFERENCE_CHANGED:
    'La referencia cambió mientras tanto: otra persona u otra pestaña la obtuvo, la actualizó o la quitó. Se muestra la vigente; revísela antes de volver a actuar.',
  REFERENCE_UP_TO_DATE: 'No había nada que actualizar: se muestra la referencia vigente.',
  REQUEST_ID_REUSED: 'La solicitud no coincide con otra enviada con el mismo identificador. Vuelva a intentarlo.',
  PRODUCT_NOT_IN_PROPOSAL: 'Algún producto elegido no es una línea de este borrador. Recargue la página y vuelva a elegir.',
  SELECTION_STALE:
    'Otra persona u otra pestaña cambió la selección mientras tanto: se cargó la vigente. Revísela y vuelva a guardar si hace falta.',
  PROPOSAL_NOT_FOUND: 'El borrador no existe o no pertenece a su organización.',
  PAYLOAD_INVALID: 'La solicitud no es válida. Recargue la página y vuelva a intentarlo.',
};

/** Texto de un error de E3 o, si no lo es, `null` (se usa entonces el texto general). */
export function linkErrorText(code: LinkErrorCode): string | null {
  return ERROR_TEXT[code] ?? null;
}

/** Hay cifra de estimación en la línea (sólo AVAILABLE y OUTDATED la traen). */
export function hasEstimateFigure(line: EstimationLinkLine): boolean {
  return (line.estimation.state === 'AVAILABLE' || line.estimation.state === 'OUTDATED') && line.estimation.estimate_base !== null;
}

/**
 * Por qué no hay diferencia, una sola vez: el mensaje del servidor de las
 * líneas en las que se esperaría una (necesidad divulgada y estimación
 * vigente con cifra) y que no son comparables. Si todas comparten el mismo
 * mensaje se escribe una vez sobre la tabla (`shared`); si no, cada fila
 * lleva el suyo (`perLine`). Las demás filas ya dicen en su celda por qué no
 * hay cifra que comparar.
 */
export function comparisonMessages(view: EstimationLinkView): { shared: string | null; perLine: Map<number, string> } {
  const pending = view.lines.filter(
    (line) => !line.comparison.comparable && line.comparison.message && line.need.status === 'DISCLOSED' && line.estimation.state === 'AVAILABLE',
  );
  const distinct = new Set(pending.map((line) => line.comparison.message!));
  if (distinct.size <= 1) return { shared: pending[0]?.comparison.message ?? null, perLine: new Map() };
  return { shared: null, perLine: new Map(pending.map((line) => [line.position, line.comparison.message!])) };
}

/** La misma lista de productos (orden incluido). */
export function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Con SELECTION_STALE el servidor devuelve la selección vigente. */
export function staleSelectionOf(err: unknown): ProposalSelection | null {
  const body = linkErrorOf(err);
  return body?.errorCode === 'SELECTION_STALE' && body.selection ? body.selection : null;
}

/**
 * E3 §6: el formulario de convocatorias (E2) con el borrador como origen y los
 * productos elegidos. Cada valor va codificado; los productos se separan con
 * comas.
 */
export function prepareCallPath(campaignRef: string, proposalRef: string, productRefs: readonly string[]): string {
  const enc = encodeURIComponent;
  return `${COLLECTIVE_PATHS.jointPurchaseCalls}?nueva=1&campana=${enc(campaignRef)}&propuesta=${enc(proposalRef)}&productos=${productRefs.map(enc).join(',')}`;
}
