import axios from 'axios';
import type {
  JointPurchaseCallCloseMode,
  JointPurchaseCallEventKind,
  JointPurchaseCallGrant,
  JointPurchaseCallHistoryGrant,
  JointPurchaseCallOrigin,
  JointPurchaseCallProductTotal,
  JointPurchaseCallStatus,
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

/**
 * Nombres de los permisos como los publica el servidor (`GRANT_LABEL`).
 * `PARTICIPANTS` sólo aparece en el historial: se retiró con E4 y no da acceso.
 */
export const GRANT_LABEL: Record<JointPurchaseCallHistoryGrant, string> = {
  PARTICIPANTS: 'Consultar participantes y cantidades',
  MANAGE: 'Administrar la convocatoria',
};

/** Qué permite «Administrar la convocatoria» (lámina 15). */
export const GRANT_DESCRIPTION: Record<JointPurchaseCallGrant, string> = {
  MANAGE: 'Edita, abre, cierra y cancela la convocatoria. No da acceso a participantes ni a cantidades individuales.',
};

/** Qué deja de hacer quien pierde el permiso (lámina 34.2). */
export const GRANT_LOSS: Record<JointPurchaseCallGrant, string> = {
  MANAGE: 'Dejará de poder editarla, abrirla, cerrarla o cancelarla.',
};

/** E4 §2: el detalle identificado depende del rol y de la autorización de cada agricultor, nunca de un permiso de la convocatoria. */
export const GRANT_ACCESS_NOTE = 'Este permiso no da acceso a nombres ni a cantidades de cada persona.';

/** E4 §3.1: título del historial de los permisos de visualización guardados antes de E4. */
export const RETIRED_GRANTS_TITLE = 'Permisos de visualización retirados';
/** Explicación fija del historial retirado (el aviso con la fecha lo envía el servidor en cada fila). */
export const RETIRED_GRANTS_NOTE =
  'Se conservan sólo como historia: ya no dan acceso. El detalle identificado lo consulta la Administración, con la autorización de cada agricultor.';

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
 * E4 §6.1: la responsabilidad sólo indica quién coordina; no da acceso a
 * nombres ni cantidades (eso lo consulta la Administración, con la
 * autorización de cada agricultor).
 */
export const RESPONSIBLE_NOTICE =
  'Coordinará la convocatoria y podrá autorizar a otras personas de la Directiva o la Administración para administrarla. Ser responsable no da acceso a nombres ni cantidades. No se cambia después de abrir, salvo con la sustitución por la Administración.';
/**
 * H-14 (E2-D4): el plazo es un instante del reloj del servidor; la API no
 * tiene zona horaria del sindicato. El campo se lee en la hora del navegador.
 */
export const DEADLINE_HELP = 'El plazo se cumple con el reloj del servidor. La fecha se escribe y se muestra en la hora de este equipo.';
/** Pie del formulario de creación (lámina 15.1). */
export const CREATE_AS_DRAFT_NOTE = 'Se crea como borrador: los agricultores no la ven hasta que la abra.';
/**
 * P-B (aviso previo al creador, 2026-11-12). Editar, abrir, cancelar y cerrar
 * exigen ser la persona responsable o tener «Administrar» (403
 * `MANAGE_FORBIDDEN`). Quien guarda un borrador nombrando a otra persona
 * responsable pierde eso salvo que ella se lo conceda; nadie lo concede
 * automáticamente. El detalle identificado no depende de la responsabilidad
 * (E4 §6.1), así que no forma parte de lo que se pierde.
 */
export function handOverText(responsibleName: string): { lead: string; losses: string[]; closing: string } {
  return {
    lead: `Eligió a ${responsibleName} como responsable. Si guarda así, usted deja de administrar esta convocatoria:`,
    losses: ['no podrá editar el borrador;', 'no podrá abrir la convocatoria;', 'no podrá cancelarla ni cerrarla.'],
    closing: `Nadie se lo concede automáticamente: sólo ${responsibleName}, como responsable, puede devolverle «${GRANT_LABEL.MANAGE}».`,
  };
}

/** E4 §2: quien no es Administración (la Directiva, también siendo la responsable) no ve el detalle identificado. */
export const PARTICIPANTS_FORBIDDEN_TEXT = 'El detalle identificado sólo lo consulta la Administración, con la autorización de cada agricultor.';
/** Respuesta 403 `PARTICIPANTS_FORBIDDEN` del servidor. */
const PARTICIPANTS_FORBIDDEN_ERROR = `No puede ver a los participantes de esta convocatoria. ${PARTICIPANTS_FORBIDDEN_TEXT}`;
/** E4 §6.4: el rol o la habilitación cambiaron mientras la página mostraba participantes (403 en la consulta siguiente). */
export const PARTICIPANTS_REVOKED_TEXT =
  'Ya no puede ver el detalle identificado de esta convocatoria: su cuenta ya no es de la Administración habilitada. Lo que se haya copiado, impreso o capturado antes no se puede retirar desde aquí.';
/** E4 §2: por qué la Administración ve nombres y cantidades (láminas 11 y 12). */
export const WHY_VISIBLE_TEXT =
  'Usted ve nombres y cantidades por ser de la Administración, y sólo de quienes autorizaron ese acceso desde su aplicación.';
/** Lo que ve la Directiva en «Quién pidió»: el recuento, sin nombres. */
export function participantsCountText(count: number): string {
  return `Participan ${peopleText(count)}; sus nombres y cantidades no se muestran.`;
}
/** §10.2: sin `can_manage` ni `can_cancel_or_close` no hay acciones de estado. */
export const MANAGE_ONLY_TEXT =
  'Sólo la persona responsable o quien tenga el permiso «Administrar la convocatoria» puede editarla, abrirla, cancelarla o cerrarla.';
/**
 * m6 (2026-11-12) con E4 §6.3: la responsable dejó de estar habilitada. Nadie
 * cancela ni cierra por su rol; los `MANAGE` que concedió quedan suspendidos;
 * la salida es la sustitución por una persona de la Administración habilitada.
 * El cierre automático por plazo se mantiene.
 */
export const RESPONSIBLE_INELIGIBLE_TITLE = 'Nadie puede administrarla.';
const RESPONSIBLE_INELIGIBLE_BODY =
  'La responsable ya no tiene una cuenta habilitada: los permisos «Administrar la convocatoria» que concedió quedan suspendidos y ningún cargo la administra por sí solo.';
const RESPONSIBLE_INELIGIBLE_CLOSES = 'Si no se hace nada, se cerrará sola al vencer el plazo.';
/** Texto del aviso con la convocatoria abierta (lámina 20). */
export const RESPONSIBLE_INELIGIBLE_TEXT = `${RESPONSIBLE_INELIGIBLE_TITLE} ${RESPONSIBLE_INELIGIBLE_BODY} ${RESPONSIBLE_INELIGIBLE_CLOSES}`;
/** El cierre automático sólo existe con la convocatoria abierta. */
export function responsibleIneligibleBody(status: JointPurchaseCallStatus): string {
  return status === 'OPEN' ? `${RESPONSIBLE_INELIGIBLE_BODY} ${RESPONSIBLE_INELIGIBLE_CLOSES}` : RESPONSIBLE_INELIGIBLE_BODY;
}
/** E4 §2: quien consulta no puede sustituir (la Directiva): se dice a quién pedírselo. */
export const RESPONSIBLE_INELIGIBLE_WHO =
  'Para nombrar a otra persona responsable, pida la intervención de una persona de la Administración del sindicato.';
/** El servidor respondió `MANAGE_FORBIDDEN`: el permiso cambió mientras la página estaba abierta. */
export const MANAGE_LOST_TEXT =
  'Ya no puede administrar esta convocatoria: el permiso cambió. Se volvió a cargar con sus permisos actuales.';
/** El servidor respondió `COLLABORATORS_FORBIDDEN`: quien consulta ya no es la persona responsable. */
export const COLLABORATORS_LOST_TEXT =
  'Ya no puede conceder ni retirar permisos en esta convocatoria: sólo la persona responsable puede hacerlo. Se volvió a cargar con sus permisos actuales.';

/** E4 §3.2: el permiso del sindicato «Sustituir responsable» ya no se usa; sólo queda su historia. */
export const SUBSTITUTION_PERMISSION_LABEL = 'Sustituir responsable';
/** Explicación fija del historial (el servidor envía además su aviso y la fecha de retiro). */
export const SUBSTITUTION_HISTORY_NOTE =
  'Se conserva sólo como historia: no da ningún poder. Hoy sustituye a una responsable no habilitada cualquier persona de la Administración habilitada, sin permiso adicional.';
/** E4 §6.3: qué hace la sustitución, para el diálogo de confirmación (lámina 15.6). */
export const SUBSTITUTION_IMPLICATIONS = [
  'La nueva responsable coordinará la convocatoria y podrá conceder «Administrar la convocatoria».',
  'Ser responsable no da acceso a nombres ni cantidades: el detalle identificado lo consulta la Administración, con la autorización de cada agricultor.',
  'Los permisos «Administrar la convocatoria» anteriores quedan suspendidos hasta que ella los revise.',
  'No reabre la convocatoria ni cambia su fecha límite, los pedidos, las cantidades ni el consolidado.',
  'No pide ninguna autorización nueva a los agricultores.',
  'La responsable anterior no recupera nada aunque vuelva a estar habilitada.',
];
/** E4 §6.3: quién puede sustituir. */
export const SUBSTITUTION_WHO_TEXT =
  'Lo hace una persona de la Administración habilitada, sin permiso adicional. Quien sustituye no puede nombrarse a sí misma.';
/** Lámina 14: lo que la sucesora puede y no puede hacer. */
export const NEW_RESPONSIBLE_POINTS = [
  'Puede administrar la convocatoria.',
  'Ser responsable no le da acceso a nombres ni cantidades de cada persona.',
  'Los permisos «Administrar la convocatoria» anteriores siguen suspendidos hasta que usted los revise.',
];
/**
 * P-A, decisión del autor del 2026-11-12: quien sustituye no puede nombrarse
 * como nueva responsable (el servidor responde `SUCCESSOR_NOT_ELIGIBLE`).
 * Otra persona de la Administración habilitada puede nombrarla.
 */
export const SELF_SUBSTITUTION_TEXT =
  'Usted no aparece en la lista: quien sustituye no puede nombrarse como nueva persona responsable. Si debe serlo, otra persona de la Administración habilitada tiene que nombrarle.';
/** P-A: nadie más es elegible. Sin excepción automática ni accesos nuevos. */
export const SUBSTITUTION_NO_CANDIDATES_TEXT =
  'No hay otra persona activa de la Directiva o la Administración que pueda ser responsable. No hay una salida automática: la Administración debe habilitar a alguien en Usuarios. Mientras tanto, nadie gana acceso y, si la convocatoria está abierta, se cierra sola al vencer la fecha límite.';
/** P-A: la única persona elegible es quien sustituye. */
export const SUBSTITUTION_ONLY_SELF_TEXT =
  'La única persona que podría ser responsable es usted, y quien sustituye no puede nombrarse como responsable. Otra persona de la Administración habilitada debe hacerlo. No hay una salida automática: mientras tanto, nadie gana acceso y, si la convocatoria está abierta, se cierra sola al vencer la fecha límite.';

/**
 * E4 §3.1: participaciones vigentes cuyo consentimiento no cubre el detalle
 * identificado (`pending_consent_count`): una autorización anterior a CONV-4
 * o una retirada a «sólo totales» (`TOTALS_ONLY`). Un recuento, nunca nombres.
 * El texto no afirma cuál de las dos es (el servidor no lo distingue en el
 * recuento) ni que haya totales pendientes: eso lo dice cada producto.
 */
export function pendingConsentText(count: number): string {
  return count === 1
    ? '1 participación no autoriza que la Administración vea su nombre y su cantidad: tiene una autorización anterior o su agricultor la limitó a los totales. Si algún total figura como pendiente, se mostrará cuando todas las participaciones de ese producto lo permitan.'
    : `${count} participaciones no autorizan que la Administración vea su nombre y su cantidad: tienen una autorización anterior o su agricultor la limitó a los totales. Si algún total figura como pendiente, se mostrará cuando todas las participaciones de ese producto lo permitan.`;
}
/** Cómo se resuelve un pendiente: lo decide cada agricultor en su aplicación. */
export const PENDING_CONSENT_HOW = 'Cada agricultor lo decide en su aplicación, en «Revisar quién puede ver mi participación».';
/** Aviso del servidor sobre participaciones sin la autorización nueva, si no lo envió. */
export function pendingConsentDetailText(count: number): string {
  return count === 1
    ? '1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.'
    : `${count} participaciones sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.`;
}

/** E4 §5.2: «total provisional» mientras está abierta; puede cambiar hasta el cierre. */
export const PROVISIONAL_NOTE = 'Total provisional: puede cambiar hasta el cierre';
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
/** Al abrir: quién ve qué (E4 §2). */
export const OPEN_ACCESS_LINE =
  'La Directiva verá los totales por producto, sin nombres; la Administración verá además nombres y cantidades, sólo de quienes lo autoricen desde su aplicación.';

/** «Cómo funciona el acceso» (láminas 10–20, E4 §2 y §5.2): texto fijo, sin datos. */
export const ACCESS_RULES: { term: string; text: string }[] = [
  { term: 'Administrar', text: 'gestionar la convocatoria. Lo tiene la responsable y quien ella autorice. No da acceso a datos de cada persona.' },
  { term: 'Directiva', text: 've los productos, los estados y los totales por producto, sin nombres.' },
  { term: 'Administración', text: 've además nombres y cantidades, sólo de quienes lo autorizaron desde su aplicación.' },
  {
    term: 'Totales',
    text: 'se muestran aunque participe una sola persona cuando todas las participaciones del producto los autorizan; si falta una autorización nueva, quedan pendientes. El servidor decide en cada consulta.',
  },
];

/**
 * 05 §13 con E4 §5.2: estado del total de un producto. Nunca se muestra 0 en
 * lugar de un total pendiente: fuera de `VISIBLE` va el texto del estado
 * (chip punteado) y su motivo.
 */
export const PENDING_CONSENT_TOTAL_TEXT = 'Pendiente de autorización';
export const PENDING_CONSENT_TOTAL_NOTE = 'Falta la autorización nueva de algún agricultor';
/** `PREVIOUS_POLICY_K3`: el consolidado ya era visible con la regla anterior (E4 §5.2, punto 2). */
export const PREVIOUS_POLICY_TOTAL_NOTE = 'Visible por la regla anterior: lo pidieron 3 o más personas';
export function totalState(total: Pick<JointPurchaseCallProductTotal, 'visibility' | 'totals_basis'>): { label: string | null; note: string | null } {
  if (total.visibility === 'PENDING_CONSENT') return { label: PENDING_CONSENT_TOTAL_TEXT, note: PENDING_CONSENT_TOTAL_NOTE };
  if (total.totals_basis === 'PREVIOUS_POLICY_K3') return { label: null, note: PREVIOUS_POLICY_TOTAL_NOTE };
  return { label: null, note: null };
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
    'Sólo una persona de la Administración habilitada puede sustituir a la responsable. Si su rol o su cuenta cambiaron, la página se volvió a cargar con su acceso actual.',
  GRANTEE_NOT_ELIGIBLE:
    'Esa persona no puede recibir el permiso: debe ser otro usuario activo de la Directiva o la Administración de su organización, distinto de usted.',
  RESPONSIBLE_STILL_ELIGIBLE:
    'La persona responsable sigue habilitada: sólo se sustituye a una responsable que ya no lo está. Ceder la responsabilidad es otra operación.',
  SUCCESSOR_NOT_ELIGIBLE:
    'Esa persona no puede ser la nueva responsable: debe ser otro usuario activo de la Directiva o la Administración, distinto de usted y de la responsable actual. Quien sustituye no puede nombrarse; otra persona de la Administración habilitada puede hacerlo.',
  // E4 §3: acciones retiradas. La Web ya no las ofrece; si llegan (otra pestaña sin actualizar), se explican.
  GRANT_RETIRED:
    'El permiso para consultar participantes ya no existe: el detalle identificado lo consulta la Administración, con la autorización de cada agricultor. Recargue la página.',
  SUBSTITUTION_PERMISSION_RETIRED:
    'El permiso «Sustituir responsable» ya no se usa: sustituye a una responsable no habilitada cualquier persona de la Administración habilitada. Recargue la página.',
  CONSENT_VERSION_RETIRED: 'Esa autorización ya no está vigente: el agricultor debe revisar quién puede ver su participación desde la aplicación actualizada.',
  APP_UPDATE_REQUIRED: 'El agricultor debe actualizar la aplicación para cambiar esta participación.',
  RESPONSIBLE_CHANGED: 'Otra persona sustituyó a la responsable mientras tanto. Recargue la página y revise la situación actual.',
  REQUEST_ID_REUSED: 'Esa sustitución ya se había enviado con otros datos. Recargue la página.',
  DELEGATION_NOT_PENDING: 'Ese permiso ya no está pendiente de revisión. Recargue la página.',
  AUTHORIZATION_REQUIRED: 'Falta una autorización del agricultor.',
  PARTICIPATION_REQUIRED: 'El agricultor no tiene una participación en esta convocatoria.',
  WIDENING_NOT_ALLOWED: 'Una convocatoria cancelada no admite cambios en la autorización.',
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
