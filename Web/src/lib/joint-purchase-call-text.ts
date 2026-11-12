import axios from 'axios';
import type {
  JointPurchaseCallCloseMode,
  JointPurchaseCallEventKind,
  JointPurchaseCallGrant,
  JointPurchaseCallOrigin,
  JointPurchaseCallStatus,
  JointPurchaseCallTotalVisibility,
  JointPurchaseParticipationStatus,
} from '../types/joint-purchase-calls';
import { collectiveError, fmtDateTime } from './collective-text';
import { COLLECTIVE_PATHS } from './navigation';
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
  ACCESS_GRANTED: 'Permiso concedido',
  ACCESS_REVOKED: 'Permiso retirado',
};

/** E2-P3 (§10.2): nombres de los permisos por convocatoria, como los publica el servidor (`GRANT_LABEL`). */
export const GRANT_LABEL: Record<JointPurchaseCallGrant, string> = {
  PARTICIPANTS: 'Consultar participantes y cantidades',
  MANAGE: 'Administrar la convocatoria',
};

/** Qué permite cada permiso (§10.2). */
export const GRANT_DESCRIPTION: Record<JointPurchaseCallGrant, string> = {
  PARTICIPANTS:
    'Ver los nombres y las cantidades solicitadas por persona, sólo de quienes autorizaron que también los vean las personas que la responsable autorice, y el detalle del consolidado al cierre.',
  MANAGE: 'Editar el borrador, abrirla, cancelarla y cerrarla a mano. No permite ver participantes ni conceder permisos.',
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
  'El responsable podrá ver el nombre y las cantidades de quienes participen y autorizar a otras personas de la Directiva o la Administración para coordinarla. No se puede cambiar después de abrir.';
/**
 * P-B (aviso previo al creador, 2026-11-12). E2 §10.2: editar, abrir, cancelar
 * y cerrar exigen ser la persona responsable o tener «Administrar» (403
 * `MANAGE_FORBIDDEN`), y ver participantes exige su propio permiso. Quien
 * guarda un borrador nombrando a otra persona responsable pierde todo eso
 * salvo que ella se lo conceda; nadie lo concede automáticamente.
 */
export function handOverText(responsibleName: string): { lead: string; losses: string[]; closing: string } {
  return {
    lead: `Eligió a ${responsibleName} como responsable. Si guarda así, usted deja de administrar esta convocatoria:`,
    losses: [
      'no podrá editar el borrador;',
      'no podrá abrir la convocatoria;',
      'no podrá cancelarla ni cerrarla;',
      `no verá a los participantes ni sus cantidades, salvo que ${responsibleName} le conceda ese permiso.`,
    ],
    closing: `Nadie se lo concede automáticamente: sólo ${responsibleName}, como responsable, puede devolverle «${GRANT_LABEL.MANAGE}».`,
  };
}

export const PARTICIPANTS_FORBIDDEN_TEXT =
  'Sólo la persona responsable de esta convocatoria y quienes ella autorice pueden ver a los participantes.';
/** §10.2: el permiso se perdió mientras la página mostraba participantes; texto exacto del contrato. */
export const PARTICIPANTS_REVOKED_TEXT =
  'Ya no tiene permiso para ver a los participantes de esta convocatoria. Lo que se haya copiado, impreso o capturado antes no se puede retirar desde aquí.';
/** §10.2: sin `can_manage` ni `can_cancel_or_close` no hay acciones de estado. */
export const MANAGE_ONLY_TEXT =
  'Sólo la persona responsable o quien tenga el permiso «Administrar la convocatoria» puede editarla, abrirla, cancelarla o cerrarla.';
/** §10.2: el responsable dejó de ser elegible; cualquier Directiva o Administración puede cancelar o cerrar. */
export const RESPONSIBLE_INELIGIBLE_TEXT =
  'La persona responsable ya no es un usuario activo de la Directiva o la Administración: cualquiera de ellas puede cancelar o cerrar esta convocatoria, pero no ver a sus participantes.';
/** El servidor respondió `MANAGE_FORBIDDEN`: el permiso cambió mientras la página estaba abierta. */
export const MANAGE_LOST_TEXT =
  'Ya no puede administrar esta convocatoria: el permiso cambió. Se volvió a cargar con sus permisos actuales.';
/** El servidor respondió `COLLABORATORS_FORBIDDEN`: quien consulta ya no es la persona responsable. */
export const COLLABORATORS_LOST_TEXT =
  'Ya no puede conceder ni retirar permisos en esta convocatoria: sólo la persona responsable puede hacerlo. Se volvió a cargar con sus permisos actuales.';

/** §10.6: aviso de participaciones autorizadas sólo para la persona responsable, si el servidor no lo envió. */
export function hiddenParticipantsText(count: number): string {
  return count === 1
    ? '1 participación autorizada sólo para la persona responsable: sólo la ve ella.'
    : `${count} participaciones autorizadas sólo para la persona responsable: sólo las ve ella.`;
}
export const PROVISIONAL_NOTE = 'Puede cambiar hasta el cierre. Son cantidades solicitadas, no compras ni deudas.';
export const NOT_A_PURCHASE_TEXT = 'Son cantidades solicitadas: no son compras, entregas ni deudas.';
export const OPEN_IMPLICATIONS = [
  'Los agricultores verán la convocatoria al actualizar su aplicación.',
  'No se podrán cambiar productos, fecha límite ni responsable.',
];
export const CLOSE_IMPLICATION = 'Se consolidan las participaciones recibidas hasta ahora con la hora del servidor. No se puede reabrir.';

/** §10.3: total retenido porque incluye participaciones que quien consulta no puede ver (abierta o cerrada). */
export const RESPONSIBLE_ONLY_HIDDEN_TEXT =
  'Total visible sólo para la persona responsable: incluye participaciones autorizadas sólo para ella, que usted no puede ver.';

/**
 * Texto en lugar de un total retenido (E2-D7 / E2-P1 / §10.3); nunca se
 * muestra 0. `RESPONSIBLE_ONLY` con la convocatoria abierta, para quien no
 * tiene `PARTICIPANTS`: E2-P1. `RESPONSIBLE_ONLY` en el consolidado, o para un
 * colaborador con `PARTICIPANTS`: el total incluye participaciones ocultas para
 * él (`hidden`). `UNDER_THRESHOLD`: al cierre, menos del umbral de personas.
 */
export function withheldTotalText(
  visibility: JointPurchaseCallTotalVisibility,
  threshold: number | null | undefined,
  hidden = false,
): string {
  const k = threshold ?? 3;
  if (visibility === 'RESPONSIBLE_ONLY')
    return hidden
      ? RESPONSIBLE_ONLY_HIDDEN_TEXT
      : `Total visible sólo para el responsable mientras la convocatoria está abierta; al cierre se muestra si hay ${k} o más personas en el producto.`;
  return `Total no visible: menos de ${k} personas pidieron este producto.`;
}

/**
 * Un mensaje por cada `errorCode` cerrado del servidor (`call-error.ts`). Los
 * del agricultor (`STALE_SEQUENCE`, `CONSENT_REQUIRED`…) no deberían llegar a
 * la Web, pero tampoco se muestran como código.
 */
const ERROR_TEXT: Record<string, string> = {
  PAYLOAD_INVALID: 'Datos no válidos: revise los campos e inténtelo de nuevo.',
  AUTH_REQUIRED: 'Su sesión venció. Vuelva a iniciar sesión.',
  AUTH_CONTEXT_FORBIDDEN: 'Su rol no tiene acceso a las compras conjuntas.',
  CALL_NOT_FOUND: 'La convocatoria no existe o no pertenece a su organización.',
  CAMPAIGN_NOT_FOUND: 'La campaña no existe o no pertenece a su organización.',
  CAMPAIGN_NOT_ELIGIBLE: 'La campaña no admite convocatorias: debe estar planificada o abierta.',
  PROPOSAL_NOT_FOUND: 'El borrador de propuesta no existe o no pertenece a su organización.',
  PROPOSAL_CAMPAIGN_MISMATCH: 'El borrador de propuesta es de otra campaña: elija uno de esta campaña.',
  PRODUCT_NOT_FOUND: 'Uno de los productos ya no existe en el catálogo del sindicato.',
  PRODUCT_INACTIVE: 'Uno de los productos está inactivo: quítelo o elija uno activo.',
  PRODUCT_UNIT_UNSUPPORTED: 'Sólo se admiten productos medidos en L o KG.',
  PRODUCT_NOT_CANONICAL: 'Uno de los productos es una denominación asociada a otro producto: elija el producto principal.',
  PRODUCT_DUPLICATED: 'Un producto está repetido en la convocatoria.',
  PRODUCT_IN_OPEN_CALL:
    'Uno de los productos ya está en otra convocatoria abierta de esta campaña. Quítelo de este borrador o espere a que la otra se cierre o se cancele.',
  RESPONSIBLE_NOT_ELIGIBLE:
    'El responsable elegido no es un usuario activo de la Directiva o la Administración de su organización. Elija otro.',
  DEADLINE_IN_PAST: 'La fecha límite ya pasó según la hora del servidor. Edite el borrador y elija una fecha posterior.',
  CONFIRMATION_REQUIRED: 'Falta la confirmación: marque la casilla antes de continuar.',
  REASON_REQUIRED: 'Escriba el motivo: es obligatorio y admite hasta 280 caracteres.',
  INVALID_TRANSITION: 'La convocatoria cambió de estado mientras tanto. Recargue la página y revise su estado.',
  CALL_NOT_EDITABLE: 'Sólo un borrador se puede modificar: la convocatoria ya se abrió, se cerró o se canceló.',
  CALL_NOT_CLOSED: 'El consolidado sólo existe cuando la convocatoria está cerrada.',
  PARTICIPANTS_FORBIDDEN: PARTICIPANTS_FORBIDDEN_TEXT,
  MANAGE_FORBIDDEN: `No tiene permiso para administrar esta convocatoria. ${MANAGE_ONLY_TEXT}`,
  COLLABORATORS_FORBIDDEN: 'Sólo la persona responsable de esta convocatoria puede conceder o retirar permisos.',
  COLLABORATOR_NOT_ELIGIBLE:
    'Esa persona no puede recibir o perder este permiso: debe ser otro usuario activo de la Directiva o la Administración, distinto de la persona responsable y de usted. Los permisos de la persona responsable no se retiran.',
  CALL_NOT_OPEN: 'La convocatoria ya no está abierta.',
  STALE_SEQUENCE: 'La participación cambió desde otro envío. Recargue la página.',
  OPERATION_ID_REUSED: 'La operación ya se había enviado con otros datos. Recargue la página.',
  CONSENT_REQUIRED: 'Falta la aceptación del aviso de participación.',
  PRODUCT_NOT_IN_CALL: 'Uno de los productos no forma parte de esta convocatoria.',
  QUANTITY_INVALID: 'Una de las cantidades no es válida.',
  RATE_LIMITED: 'Demasiadas solicitudes seguidas. Espere un momento y vuelva a intentarlo.',
  TEMPORARILY_UNAVAILABLE: 'El servidor no pudo completar la acción en este momento. Vuelva a intentarlo en unos minutos.',
  // Nombres previos al servidor (redactados sólo con el contrato); se conservan por compatibilidad.
  DEADLINE_INVALID: 'La fecha límite no es válida.',
  CALL_NOT_DRAFT: 'Sólo un borrador se puede modificar o abrir: la convocatoria ya se abrió, se cerró o se canceló.',
  CALL_FINAL: 'La convocatoria ya está cerrada o cancelada: no admite más cambios.',
  RESPONSIBLE_INVALID:
    'El responsable elegido no es un usuario activo de la Directiva o la Administración de su organización. Elija otro.',
  RESPONSIBLE_REQUIRED: 'Elija el responsable de la convocatoria.',
  PRODUCTS_REQUIRED: 'Elija al menos un producto.',
  PRODUCT_DUPLICATE: 'Un producto está repetido en la convocatoria.',
  PRODUCT_IS_ALIAS: 'Uno de los productos es una denominación asociada a otro producto: elija el producto principal.',
  PRODUCT_UNIT_INVALID: 'Sólo se admiten productos medidos en L o KG.',
  PRODUCT_NOT_ELIGIBLE: 'Uno de los productos no se puede usar: debe ser activo, principal (no asociado) y en L o KG.',
  PROPOSAL_LINE_NOT_FOUND: 'Una de las líneas elegidas ya no está en el borrador de propuesta.',
  NAME_REQUIRED: 'Escriba el nombre de la convocatoria (hasta 120 caracteres).',
};

/** `CALL_NOT_OPEN` puede traer `reason` (E2-D11). */
const NOT_OPEN_REASON_TEXT: Record<string, string> = {
  DEADLINE_PASSED: 'La fecha límite ya pasó según la hora del servidor.',
  CLOSED: 'Ya está cerrada.',
  CANCELLED: 'Ya está cancelada.',
  DRAFT: 'Todavía es un borrador.',
};

/** `errorCode` del cuerpo de error (E2 §4), o `null`. */
export function callErrorCode(err: unknown): string | null {
  if (!axios.isAxiosError(err) || !err.response) return null;
  const data = err.response.data as { errorCode?: unknown; message?: unknown } | undefined;
  if (typeof data?.errorCode === 'string') return data.errorCode;
  return typeof data?.message === 'string' && data.message in ERROR_TEXT ? data.message : null;
}

/**
 * Mensaje en español por `errorCode`; con `reason` (`CALL_NOT_OPEN`) o
 * `status` (`INVALID_TRANSITION`, `CALL_NOT_EDITABLE`, `CALL_NOT_CLOSED`) se
 * añade el detalle. Lo desconocido, con el texto general de las vistas colectivas.
 */
export function callError(err: unknown, fallback: string): string {
  const code = callErrorCode(err);
  if (code && ERROR_TEXT[code]) {
    const data = (axios.isAxiosError(err) ? err.response?.data : undefined) as { reason?: unknown; status?: unknown } | undefined;
    if (code === 'CALL_NOT_OPEN' && typeof data?.reason === 'string' && NOT_OPEN_REASON_TEXT[data.reason])
      return `${ERROR_TEXT[code]} ${NOT_OPEN_REASON_TEXT[data.reason]}`;
    const status = typeof data?.status === 'string' ? CALL_STATUS_LABEL[data.status as JointPurchaseCallStatus] : undefined;
    if (status && (code === 'INVALID_TRANSITION' || code === 'CALL_NOT_EDITABLE' || code === 'CALL_NOT_CLOSED'))
      return `${ERROR_TEXT[code]} Estado actual: ${status}.`;
    return ERROR_TEXT[code];
  }
  if (axios.isAxiosError(err) && err.response?.status === 404) return ERROR_TEXT.CALL_NOT_FOUND!;
  if (axios.isAxiosError(err) && err.response?.status === 409) return ERROR_TEXT.INVALID_TRANSITION!;
  return collectiveError(err, fallback);
}

/**
 * E3-P2: una línea con el origen de la convocatoria. `undefined` (el servidor
 * no lo envía): nada. `null`: convocatoria anterior al registro; no se deduce.
 */
export function callOriginText(origin: JointPurchaseCallOrigin | null | undefined): string | null {
  if (origin === undefined) return null;
  if (origin === null) return 'Origen no registrado (convocatoria anterior).';
  if (origin.kind === 'CATALOG') return 'Creada eligiendo productos del catálogo.';
  const draft = origin.proposal_generated_at
    ? `Creada desde el borrador de propuesta del ${fmtDateTime(origin.proposal_generated_at)}`
    : 'Creada desde un borrador de propuesta';
  if (origin.selection_revision === null) return `${draft}.`;
  return origin.selection_matched
    ? `${draft} (selección guardada n.º ${origin.selection_revision}).`
    : `${draft}, con productos distintos de la selección guardada (n.º ${origin.selection_revision}).`;
}

/** E3-P2: los productos se editaron en el borrador después de crearla. */
export function callOriginEditedText(origin: JointPurchaseCallOrigin): string {
  return `Los productos se editaron después de crearla; origen: ${origin.products.map((p) => p.product_name).join(', ')}.`;
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
  ref: { status: string; quantity_base: string | null; quantity_presentation?: string | null },
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

/**
 * «Preparar convocatoria» desde un borrador de propuesta: la lista de
 * convocatorias abre el formulario de creación con esa campaña, ese borrador y
 * esos productos preseleccionados. No crea nada: la persona completa el resto
 * y confirma. `/colectivo/compras-conjuntas?nueva=1&campana=…&propuesta=…&productos=a,b`.
 */
export const PREPARE_CALL_PARAMS = ['nueva', 'campana', 'propuesta', 'productos'] as const;
const PREPARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PREPARED_PRODUCTS = 50;

export function prepareCallPath(campaignRef: string, proposalRef: string, productRefs: readonly string[]): string {
  const query = new URLSearchParams({ nueva: '1', campana: campaignRef, propuesta: proposalRef, productos: productRefs.join(',') });
  return `${COLLECTIVE_PATHS.jointPurchaseCalls}?${query.toString()}`;
}

export interface PreparedCall {
  campaignId: string;
  proposalId: string;
  productRefs: string[];
}

/** Lee los parámetros de «Preparar convocatoria»; `null` si falta `nueva=1`, la campaña no es un UUID o falta el borrador. */
export function readPreparedCall(params: URLSearchParams): PreparedCall | null {
  if (params.get('nueva') !== '1') return null;
  const campaignId = params.get('campana') ?? '';
  const proposalId = (params.get('propuesta') ?? '').trim();
  if (!PREPARE_UUID.test(campaignId) || !proposalId || proposalId.length > 128) return null;
  const productRefs = [
    ...new Set(
      (params.get('productos') ?? '')
        .split(',')
        .map((ref) => ref.trim())
        .filter((ref) => ref.length > 0 && ref.length <= 128),
    ),
  ].slice(0, MAX_PREPARED_PRODUCTS);
  return { campaignId, proposalId, productRefs };
}
