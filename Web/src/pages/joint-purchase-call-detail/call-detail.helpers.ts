import axios from 'axios';
import type { CallHeroFact } from '../../components/b/call-hero';
import { CLOSE_MODE_LABEL, callErrorCode, fmtWhen, GRANT_LABEL, peopleText } from '../../lib/joint-purchase-call-text';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallCollaborators,
  JointPurchaseCallDetail,
  JointPurchaseCallGrant,
  JointPurchaseCallUserRef,
} from '../../types/joint-purchase-calls';

export type DialogState =
  | { kind: 'edit' | 'open' | 'close' | 'cancel' | 'grant' | 'substitute' }
  | { kind: 'revoke'; user: JointPurchaseCallUserRef; grant: JointPurchaseCallGrant; self: boolean }
  | { kind: 'review'; user: JointPurchaseCallUserRef; grant: JointPurchaseCallGrant; decision: 'CONFIRM' | 'RETIRE' };

export const MAX_REASON = 280;
/** E4 §6.4: mientras se muestran participantes, el acceso se vuelve a comprobar cada 60 s. */
export const PARTICIPANTS_RECHECK_MS = 60_000;
/** Recuperar el foco dispara `focus` y `visibilitychange` a la vez: una sola comprobación. */
export const FOCUS_RECHECK_GAP_MS = 2_000;
/** E4 §2: el único permiso operativo que se concede, retira o revisa. */
export const MANAGE: JointPurchaseCallGrant = 'MANAGE';

export type Problem = { message: string; forbidden: boolean };
export type PermissionLostCode = 'MANAGE_FORBIDDEN' | 'COLLABORATORS_FORBIDDEN';

/** Un `MANAGE` propio que ya no se tiene: el último evento de esa persona y ese permiso es un retiro (láminas 17 y 48). */
export interface RevokedGrant {
  grant: JointPurchaseCallGrant;
  at: string;
  actor: JointPurchaseCallUserRef;
  self: boolean;
}

/** «12 nov»: el día sin hora ni año (chip «Usted es responsable desde…»). */
export function fmtShortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }).replace(/\./g, '');
}

/** Datos clave de la cabecera según el estado (láminas 10–20); el primero va en lima. */
export function heroFacts(call: JointPurchaseCallDetail, closing: JointPurchaseCallClosing | null): CallHeroFact[] {
  const responsible: CallHeroFact[] = call.is_responsible
    ? []
    : [{ key: 'responsible', label: 'Responsable', value: call.responsible.name, testId: 'hero-responsible' }];
  if (call.status === 'DRAFT') {
    return [
      { key: 'deadline', label: 'Fecha límite', value: fmtWhen(call.deadline_at) },
      ...responsible,
      { key: 'farmers', label: 'Los agricultores', value: 'Aún no la ven' },
    ];
  }
  if (call.status === 'OPEN') {
    return [
      { key: 'deadline', label: 'Recibe pedidos hasta', value: fmtWhen(call.deadline_at) },
      ...responsible,
      { key: 'participants', label: 'Participan', value: peopleText(call.participant_count) },
      { key: 'opened', label: 'Abierta el', value: fmtWhen(call.opened_at) },
    ];
  }
  if (call.status === 'CLOSED') {
    return [
      { key: 'closed', label: 'Cerrada el', value: fmtWhen(call.closed_at) },
      ...responsible,
      ...(closing ? [{ key: 'participants', label: 'Participaron', value: peopleText(closing.participant_count), testId: 'closing-participants' }] : []),
      { key: 'opened', label: 'Abierta el', value: fmtWhen(call.opened_at) },
      ...(closing ? [{ key: 'mode', label: 'Cierre', value: CLOSE_MODE_LABEL[closing.mode] ?? closing.mode, testId: 'closing-mode' }] : []),
    ];
  }
  return [
    { key: 'cancelled', label: 'Cancelada el', value: fmtWhen(call.cancelled_at) },
    ...(call.cancelled_by ? [{ key: 'by', label: 'Por', value: call.cancelled_by.name }] : []),
    { key: 'responsible', label: 'Responsable', value: call.responsible.name, testId: 'hero-responsible' },
  ];
}

/** E4 §6.4: el consolidado sin el detalle por persona (los totales por producto no son datos identificados). */
export function withoutIdentifiedDetail(closing: JointPurchaseCallClosing): JointPurchaseCallClosing {
  return { ...closing, can_view_participants: false, participants: null };
}

export function isParticipantsForbidden(err: unknown): boolean {
  return callErrorCode(err) === 'PARTICIPANTS_FORBIDDEN' || (axios.isAxiosError(err) && err.response?.status === 403);
}

/** `MANAGE` propio retirado, según el historial de colaboradores (E4 §3.1). */
export function myRevokedGrants(view: JointPurchaseCallCollaborators | null, userId: string | null, isResponsible: boolean): RevokedGrant[] {
  if (!view || !userId || isResponsible) return [];
  if ((view.collaborators.find((person) => person.user_ref === userId)?.grants ?? []).some((grant) => grant.grant === MANAGE)) return [];
  const last = [...view.history].reverse().find((event) => event.user.user_ref === userId && event.grant === MANAGE && !event.retired);
  return last?.action === 'REVOKED' ? [{ grant: MANAGE, at: last.at, actor: last.actor, self: last.actor.user_ref === userId }] : [];
}

export function grantsText(grants: JointPurchaseCallGrant[] | null | undefined, responsible: boolean): string {
  const labels = (grants ?? []).map((grant) => GRANT_LABEL[grant] ?? grant);
  if (labels.length === 0) return 'Ninguno';
  return responsible ? `${labels.join(' y ')} (persona responsable)` : labels.join(' y ');
}

export function accessActionText(action: 'GRANTED' | 'REVOKED' | 'SUSPENDED' | 'CONFIRMED', bySelf: boolean): string {
  if (action === 'GRANTED') return 'Concedido';
  if (action === 'SUSPENDED') return 'Suspendido al sustituir a la responsable';
  if (action === 'CONFIRMED') return 'Confirmado por la nueva responsable';
  return bySelf ? 'Renuncia' : 'Retirado';
}
