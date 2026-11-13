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
import { collectiveError } from './collective-text';
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
  RESPONSIBLE_ASSIGNED: 'Responsable asignada',
  ACCESS_GRANTED: 'Permiso concedido',
  ACCESS_REVOKED: 'Permiso retirado',
  RESPONSIBLE_REPLACED: 'Responsable sustituida',
  ACCESS_CONFIRMED: 'Permiso confirmado',
};

/** Cierre por plazo: el servidor registra el evento `CLOSED` sin actor (cierre automático). */
export const AUTO_CLOSED_EVENT_LABEL = 'Convocatoria cerrada al vencer el plazo';
/** Actor de un evento sin usuario institucional (el cierre automático). */
export const SYSTEM_ACTOR = 'Sistema';

/** E2-P3 (§10.2): nombres de los permisos por convocatoria, como los publica el servidor (`GRANT_LABEL`). */
export const GRANT_LABEL: Record<JointPurchaseCallGrant, string> = {
  PARTICIPANTS: 'Consultar participantes y cantidades',
  MANAGE: 'Administrar la convocatoria',
};

/** Qué permite cada permiso (§10.2), con el texto de la lámina 15. */
export const GRANT_DESCRIPTION: Record<JointPurchaseCallGrant, string> = {
  PARTICIPANTS:
    'Ve a los participantes y sus cantidades, y el detalle del consolidado al cierre, sólo de quienes lo autorizaron.',
  MANAGE: 'Edita, abre, cierra y cancela la convocatoria. No da acceso a participantes ni a cantidades individuales.',
};

/** Qué deja de ver o hacer quien pierde un permiso (lámina 34.2). */
export const GRANT_LOSS: Record<JointPurchaseCallGrant, string> = {
  PARTICIPANTS: 'Dejará de ver los nombres y las cantidades de esta convocatoria.',
  MANAGE: 'Dejará de poder editarla, abrirla, cerrarla o cancelarla.',
};

/** Ningún permiso de la convocatoria pasa por encima de lo que autorizó cada agricultor (§10.6, P-A C1). */
export const GRANT_CONSENT_NOTE = 'Ningún permiso sustituye la autorización de cada agricultor.';

export const CLOSE_MODE_LABEL: Record<JointPurchaseCallCloseMode, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automático, al vencer el plazo',
};

export const PARTICIPATION_STATUS_LABEL: Record<JointPurchaseParticipationStatus, string> = {
  ACTIVE: 'Vigente',
  WITHDRAWN: 'Retirada',
};

export const ROLE_LABEL: Record<string, string> = {
  DIRECTIVA: 'Directiva',
  ADMINISTRADOR: 'Administrador',
};

/**
 * H-15 (P-A C1): la responsable sólo ve nombres y cantidades de quienes la
 * autorizan desde su aplicación; no de todos los que participen.
 */
export const RESPONSIBLE_NOTICE =
  'Verá nombres y cantidades sólo de quienes la autoricen, y podrá autorizar a otras personas de la Directiva o la Administración para coordinarla. No se cambia después de abrir, salvo con la sustitución autorizada.';
/**
 * H-14 (E2-D4): el plazo es un instante del reloj del servidor; la API no
 * tiene zona horaria del sindicato. El campo se lee en la hora del navegador.
 */
export const DEADLINE_HELP = 'El plazo se cumple con el reloj del servidor. La fecha se escribe y se muestra en la hora de este equipo.';
/** Pie del formulario de creación (lámina 15.1). */
export const CREATE_AS_DRAFT_NOTE = 'Se crea como borrador: los agricultores no la ven hasta que la abra.';
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

/** Quien consulta no tiene «Consultar participantes» (lámina 16); la vista añade quién lo concede. */
export const PARTICIPANTS_FORBIDDEN_TEXT = `Usted no tiene el permiso «${GRANT_LABEL.PARTICIPANTS}».`;
/** Respuesta 403 `PARTICIPANTS_FORBIDDEN` del servidor. */
const PARTICIPANTS_FORBIDDEN_ERROR =
  'Sólo la persona responsable de esta convocatoria y quienes ella autorice pueden ver a los participantes.';
/** §10.2: el permiso se perdió mientras la página mostraba participantes; texto exacto del contrato. */
export const PARTICIPANTS_REVOKED_TEXT =
  'Ya no tiene permiso para ver a los participantes de esta convocatoria. Lo que se haya copiado, impreso o capturado antes no se puede retirar desde aquí.';
/** §10.2: sin `can_manage` ni `can_cancel_or_close` no hay acciones de estado. */
export const MANAGE_ONLY_TEXT =
  'Sólo la persona responsable o quien tenga el permiso «Administrar la convocatoria» puede editarla, abrirla, cancelarla o cerrarla.';
/**
 * N2 rechazada y m6 (2026-11-12) con P-A (§12): la responsable dejó de estar
 * habilitada. Nadie cancela ni cierra por su rol; los permisos que concedió
 * quedan suspendidos; la salida es la sustitución por quien tenga el permiso
 * «Sustituir responsable». El cierre automático por plazo se mantiene.
 */
export const RESPONSIBLE_INELIGIBLE_TITLE = 'Nadie puede administrarla.';
const RESPONSIBLE_INELIGIBLE_BODY =
  'La responsable ya no tiene una cuenta habilitada: los permisos que concedió quedan suspendidos y ningún cargo la administra por sí solo.';
const RESPONSIBLE_INELIGIBLE_CLOSES = 'Si no se hace nada, se cerrará sola al vencer el plazo.';
/** Texto del aviso con la convocatoria abierta (lámina 20). */
export const RESPONSIBLE_INELIGIBLE_TEXT = `${RESPONSIBLE_INELIGIBLE_TITLE} ${RESPONSIBLE_INELIGIBLE_BODY} ${RESPONSIBLE_INELIGIBLE_CLOSES}`;
/** El cierre automático sólo existe con la convocatoria abierta. */
export function responsibleIneligibleBody(status: JointPurchaseCallStatus): string {
  return status === 'OPEN' ? `${RESPONSIBLE_INELIGIBLE_BODY} ${RESPONSIBLE_INELIGIBLE_CLOSES}` : RESPONSIBLE_INELIGIBLE_BODY;
}
/** Quien consulta no puede sustituir: se dice quién puede. */
export const RESPONSIBLE_INELIGIBLE_WHO =
  'Quien tenga el permiso del sindicato «Sustituir responsable» puede nombrar a otra persona responsable.';
/** El servidor respondió `MANAGE_FORBIDDEN`: el permiso cambió mientras la página estaba abierta. */
export const MANAGE_LOST_TEXT =
  'Ya no puede administrar esta convocatoria: el permiso cambió. Se volvió a cargar con sus permisos actuales.';
/** El servidor respondió `COLLABORATORS_FORBIDDEN`: quien consulta ya no es la persona responsable. */
export const COLLABORATORS_LOST_TEXT =
  'Ya no puede conceder ni retirar permisos en esta convocatoria: sólo la persona responsable puede hacerlo. Se volvió a cargar con sus permisos actuales.';

/** P-A §12: nombre del permiso del sindicato y qué permite (y qué no). */
export const SUBSTITUTION_PERMISSION_LABEL = 'Sustituir responsable';
export const SUBSTITUTION_PERMISSION_DESCRIPTION =
  'Quien lo tiene puede nombrar a otra responsable cuando la de una convocatoria ya no está habilitada, con motivo y confirmación. No da acceso a participantes, no administra convocatorias ni concede otros permisos.';
/** Quién lo concede (A1): una persona Administrador habilitada, a personas concretas. */
export const SUBSTITUTION_PERMISSION_WHO =
  'Lo concede o lo retira una persona Administrador habilitada, a personas concretas de la Directiva o la Administración; nunca a sí misma ni a un rol entero. Si nadie más está habilitado, no hay una salida automática.';
/** P-A B1: qué hace la sustitución, para el diálogo de confirmación (lámina 15.6). */
export const SUBSTITUTION_IMPLICATIONS = [
  'La nueva responsable administrará la convocatoria y podrá conceder permisos.',
  'No verá nombres ni cantidades hasta que cada agricultor la autorice desde su aplicación.',
  'Los permisos anteriores quedan suspendidos hasta que ella los revise.',
  'Confirmar un permiso anterior no sustituye la autorización de cada agricultor.',
  'No reabre la convocatoria ni cambia su fecha límite, los pedidos, las cantidades ni el consolidado.',
  'La responsable anterior no recupera nada aunque vuelva a estar habilitada.',
];
/** Lámina 14: lo que la sucesora puede y no puede hacer. */
export const NEW_RESPONSIBLE_POINTS = [
  'Puede administrar la convocatoria.',
  'Las participaciones que no la autorizaron siguen restringidas.',
  'Los permisos anteriores siguen suspendidos hasta que usted los revise.',
  'Confirmar un permiso no sustituye la autorización de cada agricultor.',
];
/**
 * P-A, decisión del autor del 2026-11-12: quien sustituye no puede nombrarse
 * como nueva responsable (el servidor responde `SUCCESSOR_NOT_ELIGIBLE`).
 * Otra persona habilitada con el permiso puede nombrarla.
 */
export const SELF_SUBSTITUTION_TEXT =
  'Usted no aparece en la lista: quien sustituye no puede nombrarse como nueva persona responsable. Si debe serlo, otra persona habilitada con el permiso «Sustituir responsable» tiene que nombrarle.';
/** P-A: nadie más es elegible. Sin excepción automática ni accesos nuevos. */
export const SUBSTITUTION_NO_CANDIDATES_TEXT =
  'No hay otra persona activa de la Directiva o la Administración que pueda ser responsable. No hay una salida automática: una persona Administrador debe habilitar a alguien. Mientras tanto, nadie gana acceso y, si la convocatoria está abierta, se cierra sola al vencer la fecha límite.';
/** P-A: la única persona elegible es quien sustituye. */
export const SUBSTITUTION_ONLY_SELF_TEXT =
  'La única persona que podría ser responsable es usted, y quien sustituye no puede nombrarse como responsable. Otra persona habilitada con el permiso «Sustituir responsable» debe hacerlo; una persona Administrador puede concederlo. No hay una salida automática: mientras tanto, nadie gana acceso y, si la convocatoria está abierta, se cierra sola al vencer la fecha límite.';
/** P-A C1: participaciones a la espera de que su agricultor autorice a la responsable actual, si el servidor no lo envió. */
export function pendingAuthorizationText(count: number): string {
  return count === 1
    ? '1 participación aún no autorizó a la persona responsable actual. Sus datos siguen restringidos: cada agricultor lo decide desde su aplicación.'
    : `${count} participaciones aún no autorizaron a la persona responsable actual. Sus datos siguen restringidos: cada agricultor lo decide desde su aplicación.`;
}

/** §10.6: aviso de participaciones autorizadas sólo para la persona responsable, si el servidor no lo envió. */
export function hiddenParticipantsText(count: number): string {
  return count === 1
    ? '1 participación autorizada sólo para la persona responsable: sólo la ve ella.'
    : `${count} participaciones autorizadas sólo para la persona responsable: sólo las ve ella.`;
}
export const PROVISIONAL_NOTE = 'Puede cambiar hasta el cierre';
/** Lo que es un consolidado (E2-D13); también va al pie del consolidado al cierre. */
export const NOT_A_PURCHASE_TEXT = 'Son cantidades solicitadas: no son compras, entregas ni deudas.';
/** Nota al pie del detalle (láminas 10–20). */
export const CALL_FOOTNOTE = 'Una convocatoria no es una compra: no genera pagos ni deudas.';
/** «Qué sigue» al cierre (lámina 12). */
export const WHAT_NEXT_TEXT = 'El consolidado queda fijo. La compra, el pago y la entrega se coordinan fuera de Agrocuentas.';
/** Al abrir (lámina 15.2). La línea de la persona responsable la añade la vista. */
export const OPEN_IMPLICATIONS = [
  'Los agricultores la verán en su aplicación y podrán pedir.',
  'Al abrirla, el nombre, la fecha límite y los productos dejan de ser editables.',
  'El cambio de responsable requiere el procedimiento autorizado de sustitución.',
];
/** Al cerrar (lámina 15.3). */
export const CLOSE_IMPLICATION = 'Se consolidan los pedidos recibidos hasta este momento, con la hora del servidor.';
export const CLOSE_IMPLICATIONS = [CLOSE_IMPLICATION, 'No se puede reabrir.', 'No es una compra: no genera pagos ni deudas.'];
/** «Cómo funciona el acceso» (láminas 10–20): texto fijo, sin datos. */
export function accessRules(threshold: number): { term: string; text: string }[] {
  return [
    { term: 'Administrar', text: 'gestionar la convocatoria. No da acceso a datos de cada persona.' },
    { term: 'Consultar participantes', text: 'ver nombres y cantidades, sólo de quienes lo autorizaron.' },
    { term: 'Autorización del agricultor', text: 'cada uno decide en su aplicación quién ve su pedido.' },
    {
      term: 'Totales',
      text: `sin permiso, no se ven mientras está abierta; al cierre se ven si lo pidieron ${threshold} o más personas. El servidor decide en cada consulta.`,
    },
  ];
}

/**
 * 05 §13: estado del total de un producto en una convocatoria. Nunca se
 * muestra 0: fuera de `VISIBLE` va el texto del estado (chip punteado) y, si
 * ayuda, una línea con el motivo.
 */
export const UNDER_THRESHOLD_TEXT = 'Oculto por umbral';
export const RESTRICTED_TOTAL_TEXT = 'Restringido para su acceso';
export const RESPONSIBLE_ONLY_OPEN_TEXT = 'No disponible mientras esté abierta';
/** §10.3: el total incluye participaciones que quien consulta no puede ver (abierta o cerrada), o el motivo no consta. */
export const RESPONSIBLE_ONLY_HIDDEN_TEXT = 'Total no disponible para su acceso actual';
export function totalState(
  visibility: JointPurchaseCallTotalVisibility,
  threshold: number | null | undefined,
  hidden = false,
): { label: string; note: string | null } {
  const k = threshold ?? 3;
  if (visibility === 'RESTRICTED') return { label: RESTRICTED_TOTAL_TEXT, note: 'Faltan autorizaciones de agricultores' };
  if (visibility === 'UNDER_THRESHOLD') return { label: UNDER_THRESHOLD_TEXT, note: `Lo pidieron menos de ${k} personas` };
  if (visibility === 'RESPONSIBLE_ONLY' && !hidden) return { label: RESPONSIBLE_ONLY_OPEN_TEXT, note: null };
  return { label: RESPONSIBLE_ONLY_HIDDEN_TEXT, note: null };
}

/** «12 nov, 08:00»; con el año si no es el de hoy (o si se pide), «12 nov 2026, 08:00». Hora de 24 h del navegador. */
export function fmtWhen(iso: string | null | undefined, withYear: 'auto' | 'always' = 'auto'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const showYear = withYear === 'always' || date.getFullYear() !== new Date().getFullYear();
  const day = date.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', ...(showYear ? { year: 'numeric' } : {}) }).replace(/\./g, '').replace(/ de /g, ' ');
  const time = date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${day}, ${time}`;
}

/** «12 nov 2026»: sólo la fecha. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(/ de /g, ' ');
}

/** «1 persona» / «N personas». */
export function peopleText(count: number): string {
  return count === 1 ? '1 persona' : `${count} personas`;
}

/** «En litros» o «En kilogramos» (unidad base de la API). */
export function unitText(unit: BaseUnit | string): string {
  return unit === 'G' || unit === 'KG' ? 'En kilogramos' : 'En litros';
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
  PROPOSAL_NOT_FOUND: 'El borrador de compra no existe o no pertenece a su organización.',
  PROPOSAL_CAMPAIGN_MISMATCH: 'El borrador de compra es de otra campaña: elija uno de esta campaña.',
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
  PARTICIPANTS_FORBIDDEN: PARTICIPANTS_FORBIDDEN_ERROR,
  MANAGE_FORBIDDEN: `No tiene permiso para administrar esta convocatoria. ${MANAGE_ONLY_TEXT}`,
  COLLABORATORS_FORBIDDEN: 'Sólo la persona responsable de esta convocatoria puede conceder o retirar permisos.',
  COLLABORATOR_NOT_ELIGIBLE:
    'Esa persona no puede recibir o perder este permiso: debe ser otro usuario activo de la Directiva o la Administración, distinto de la persona responsable y de usted. Los permisos de la persona responsable no se retiran.',
  SUBSTITUTION_FORBIDDEN:
    'No tiene el permiso «Sustituir responsable», o ya no está habilitada. Sólo una persona Administrador habilitada lo concede o lo retira.',
  GRANTEE_NOT_ELIGIBLE:
    'Esa persona no puede recibir el permiso: debe ser otro usuario activo de la Directiva o la Administración de su organización, distinto de usted.',
  RESPONSIBLE_STILL_ELIGIBLE:
    'La persona responsable sigue habilitada: sólo se sustituye a una responsable que ya no lo está. Ceder la responsabilidad es otra operación.',
  SUCCESSOR_NOT_ELIGIBLE:
    'Esa persona no puede ser la nueva responsable: debe ser otro usuario activo de la Directiva o la Administración, distinto de usted y de la responsable actual. Quien sustituye no puede nombrarse; otra persona con el permiso «Sustituir responsable» puede hacerlo.',
  RESPONSIBLE_CHANGED: 'Otra persona sustituyó a la responsable mientras tanto. Recargue la página y revise la situación actual.',
  REQUEST_ID_REUSED: 'Esa sustitución ya se había enviado con otros datos. Recargue la página.',
  DELEGATION_NOT_PENDING: 'Ese permiso ya no está pendiente de revisión. Recargue la página.',
  AUTHORIZATION_REQUIRED: 'El agricultor aún no autorizó a la persona responsable actual.',
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
  PROPOSAL_LINE_NOT_FOUND: 'Una de las líneas elegidas ya no está en el borrador de compra.',
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
    ? `Creada desde el borrador de compra del ${fmtWhen(origin.proposal_generated_at, 'always')}`
    : 'Creada desde un borrador de compra';
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
 * Cifra de la línea del borrador de compra, como referencia (E2-D14): sólo la
 * necesidad declarada ya publicada en el borrador; nunca una cantidad comprometida.
 */
export function referenceText(
  ref: { status: string; quantity_base: string | null; quantity_presentation?: string | null },
  unit: BaseUnit,
): string {
  const figure = ref.status === 'DISCLOSED' ? formatQuantity(ref.quantity_base, unit, ref.quantity_presentation ?? null) : null;
  return figure ? `Necesidad declarada en el borrador: ${figure}` : 'Sin cifra publicada en el borrador';
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
