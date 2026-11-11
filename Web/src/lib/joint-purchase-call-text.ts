import axios from 'axios';
import type { ProposalLineStatus } from '../types/collective';
import type {
  JointPurchaseCallCloseMode,
  JointPurchaseCallEventKind,
  JointPurchaseCallStatus,
  JointPurchaseParticipationStatus,
} from '../types/joint-purchase-calls';
import { collectiveError } from './collective-text';
import { formatQuantity, type BaseUnit } from './quantity';

/**
 * E2 §6: textos de «Compras conjuntas», sin códigos internos a la vista. Una
 * participación se nombra siempre «cantidad solicitada»: nunca como compra,
 * entrega o deuda (E2-D13).
 */

/** Clave de `StatusChip` (textos ya existentes: Borrador, Abierta, Cerrada, Cancelada). */
export const CALL_STATUS_CHIP: Record<JointPurchaseCallStatus, string> = {
  DRAFT: 'BORRADOR',
  OPEN: 'ABIERTA',
  CLOSED: 'CERRADA',
  CANCELLED: 'CANCELADA',
};

export const CALL_STATUS_LABEL: Record<JointPurchaseCallStatus, string> = {
  DRAFT: 'Borrador',
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
  CANCELLED: 'Cancelada',
};

export const CALL_EVENT_LABEL: Record<JointPurchaseCallEventKind, string> = {
  CREATED: 'Borrador creado',
  UPDATED: 'Borrador modificado',
  OPENED: 'Convocatoria abierta',
  CLOSED: 'Convocatoria cerrada',
  CANCELLED: 'Convocatoria cancelada',
  RESPONSIBLE_ASSIGNED: 'Responsable asignado',
};

export const CLOSE_MODE_LABEL: Record<JointPurchaseCallCloseMode, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automático, al vencer la fecha límite',
};

export const PARTICIPATION_STATUS_LABEL: Record<JointPurchaseParticipationStatus, string> = {
  ACTIVE: 'Vigente',
  WITHDRAWN: 'Retirada',
};

export const ROLE_LABEL: Record<string, string> = {
  DIRECTIVA: 'Directiva',
  ADMINISTRADOR: 'Administrador',
};

export const RESPONSIBLE_NOTICE =
  'El responsable podrá ver el nombre y las cantidades de quienes participen. No se puede cambiar después de abrir.';
export const PARTICIPANTS_FORBIDDEN_TEXT = 'Sólo el responsable de esta convocatoria puede ver a los participantes.';
export const PROVISIONAL_NOTE = 'Puede cambiar hasta el cierre. Son cantidades solicitadas, no compras ni deudas.';
export const NOT_A_PURCHASE_TEXT = 'Son cantidades solicitadas: no son compras, entregas ni deudas.';
export const OPEN_IMPLICATIONS = [
  'Los agricultores verán la convocatoria al actualizar su aplicación.',
  'No se podrán cambiar productos, fecha límite ni responsable.',
];
export const CLOSE_IMPLICATION = 'Se consolidan las participaciones recibidas hasta ahora con la hora del servidor. No se puede reabrir.';

export function hiddenTotalText(threshold?: number | null): string {
  return `Total visible sólo para el responsable o con ${threshold ?? 3} o más participantes en el producto`;
}

const ERROR_TEXT: Record<string, string> = {
  PRODUCT_IN_OPEN_CALL:
    'Uno de los productos ya está en otra convocatoria abierta de esta campaña. Quítelo de este borrador o espere a que la otra se cierre o se cancele.',
  DEADLINE_IN_PAST: 'La fecha límite ya pasó según la hora del servidor. Edite el borrador y elija una fecha posterior.',
  DEADLINE_INVALID: 'La fecha límite no es válida.',
  CONFIRMATION_REQUIRED: 'Falta la confirmación: marque la casilla antes de continuar.',
  REASON_REQUIRED: 'Escriba el motivo: es obligatorio y admite hasta 280 caracteres.',
  PARTICIPANTS_FORBIDDEN: PARTICIPANTS_FORBIDDEN_TEXT,
  CALL_NOT_FOUND: 'La convocatoria no existe o no pertenece a su organización.',
  CALL_NOT_DRAFT: 'Sólo un borrador se puede modificar o abrir: la convocatoria ya se abrió, se cerró o se canceló.',
  CALL_NOT_OPEN: 'La convocatoria ya no está abierta.',
  CALL_NOT_CLOSED: 'El consolidado sólo existe cuando la convocatoria está cerrada.',
  INVALID_TRANSITION: 'La convocatoria cambió de estado mientras tanto. Recargue la página y revise su estado.',
  CALL_FINAL: 'La convocatoria ya está cerrada o cancelada: no admite más cambios.',
  RESPONSIBLE_INVALID:
    'El responsable elegido no es un usuario activo de la Directiva o la Administración de su organización. Elija otro.',
  RESPONSIBLE_NOT_ELIGIBLE:
    'El responsable elegido no es un usuario activo de la Directiva o la Administración de su organización. Elija otro.',
  RESPONSIBLE_REQUIRED: 'Elija el responsable de la convocatoria.',
  PRODUCTS_REQUIRED: 'Elija al menos un producto.',
  PRODUCT_DUPLICATE: 'Un producto está repetido en la convocatoria.',
  PRODUCT_NOT_FOUND: 'Uno de los productos ya no existe en el catálogo del sindicato.',
  PRODUCT_INACTIVE: 'Uno de los productos está inactivo: quítelo o elija uno activo.',
  PRODUCT_NOT_CANONICAL: 'Uno de los productos es una denominación asociada a otro producto: elija el producto principal.',
  PRODUCT_IS_ALIAS: 'Uno de los productos es una denominación asociada a otro producto: elija el producto principal.',
  PRODUCT_UNIT_INVALID: 'Sólo se admiten productos medidos en L o KG.',
  PRODUCT_NOT_ELIGIBLE: 'Uno de los productos no se puede usar: debe ser activo, principal (no asociado) y en L o KG.',
  PROPOSAL_NOT_FOUND: 'El borrador de propuesta no existe o no es de esta campaña.',
  PROPOSAL_LINE_NOT_FOUND: 'Una de las líneas elegidas ya no está en el borrador de propuesta.',
  CAMPAIGN_NOT_FOUND: 'La campaña no existe o no pertenece a su organización.',
  NAME_REQUIRED: 'Escriba el nombre de la convocatoria (hasta 120 caracteres).',
  PAYLOAD_INVALID: 'Datos no válidos: revise los campos e inténtelo de nuevo.',
};

/** `errorCode` del cuerpo de error (E2 §4), o `null`. */
export function callErrorCode(err: unknown): string | null {
  if (!axios.isAxiosError(err) || !err.response) return null;
  const data = err.response.data as { errorCode?: unknown; message?: unknown } | undefined;
  if (typeof data?.errorCode === 'string') return data.errorCode;
  return typeof data?.message === 'string' && data.message in ERROR_TEXT ? data.message : null;
}

/** Mensaje en español por `errorCode`; lo desconocido, con el texto general de las vistas colectivas. */
export function callError(err: unknown, fallback: string): string {
  const code = callErrorCode(err);
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code];
  if (axios.isAxiosError(err) && err.response?.status === 404) return ERROR_TEXT.CALL_NOT_FOUND!;
  if (axios.isAxiosError(err) && err.response?.status === 409) return ERROR_TEXT.INVALID_TRANSITION!;
  return collectiveError(err, fallback);
}

/** «11,5 L» o, si el dato no es un entero válido en unidad base, un aviso en lugar de una cifra dudosa. */
export function quantityText(base: string | null | undefined, unit: BaseUnit): string {
  return formatQuantity(base ?? null, unit) ?? 'Cifra no válida';
}

/**
 * Cifra de la línea del borrador de propuesta, como referencia (E2-D14): sólo
 * la cifra ya divulgada; nunca una cantidad comprometida.
 */
export function referenceText(
  ref: { status: ProposalLineStatus | string; quantity_base: string | null; quantity_presentation?: string | null },
  unit: BaseUnit,
): string {
  const figure = ref.status === 'DISCLOSED' ? formatQuantity(ref.quantity_base, unit, ref.quantity_presentation ?? null) : null;
  return figure ? `Referencia del borrador: ${figure} (divulgada)` : 'Sin cifra divulgada';
}

const pad = (value: number) => String(value).padStart(2, '0');

/** ISO → valor de `<input type="datetime-local">` en la hora de este navegador. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valor de `datetime-local` → ISO (UTC), o `null` si no es una fecha válida. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
