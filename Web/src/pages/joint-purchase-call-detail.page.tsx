import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { CallHero, HeroDangerButton, type CallHeroFact } from '../components/b/call-hero';
import {
  AccessRules,
  ActivityTimeline,
  CallCard,
  CallTotal,
  DisclosureLink,
  LockLine,
  ParticipantsTable,
  ProductLines,
  type ParticipantEntry,
} from '../components/b/call-ui';
import {
  Avatar,
  Button,
  buttonClassFor,
  Checkbox,
  Chip,
  ConfirmDialog,
  DataState,
  Dialog,
  Notice,
  Select,
  StatusChip,
  Textarea,
  type ConfirmDialogProps,
} from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import {
  CALL_FOOTNOTE,
  CALL_STATUS_CHIP,
  CLOSE_IMPLICATIONS,
  CLOSE_MODE_LABEL,
  callError,
  callErrorCode,
  callOriginEditedText,
  callOriginText,
  COLLABORATORS_LOST_TEXT,
  fmtDay,
  fmtWhen,
  GRANT_ACCESS_NOTE,
  GRANT_DESCRIPTION,
  GRANT_LABEL,
  GRANT_LOSS,
  MANAGE_LOST_TEXT,
  MANAGE_ONLY_TEXT,
  NEW_RESPONSIBLE_POINTS,
  NOT_A_PURCHASE_TEXT,
  OPEN_ACCESS_LINE,
  OPEN_IMPLICATIONS,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PARTICIPANTS_REVOKED_TEXT,
  participantsCountText,
  peopleText,
  PENDING_CONSENT_HOW,
  pendingConsentDetailText,
  pendingConsentText,
  PROVISIONAL_NOTE,
  referenceText,
  RESPONSIBLE_INELIGIBLE_TITLE,
  RESPONSIBLE_INELIGIBLE_WHO,
  responsibleIneligibleBody,
  RETIRED_GRANTS_NOTE,
  RETIRED_GRANTS_TITLE,
  ROLE_LABEL,
  SELF_SUBSTITUTION_TEXT,
  SUBSTITUTION_IMPLICATIONS,
  SUBSTITUTION_NO_CANDIDATES_TEXT,
  SUBSTITUTION_ONLY_SELF_TEXT,
  SUBSTITUTION_WHO_TEXT,
  unitText,
  WHAT_NEXT_TEXT,
  WHY_VISIBLE_TEXT,
} from '../lib/joint-purchase-call-text';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import type {
  EligibleResponsible,
  JointPurchaseCallClosing,
  JointPurchaseCallCollaborators,
  JointPurchaseCallCollaboratorGrant,
  JointPurchaseCallDetail,
  JointPurchaseCallGrant,
  JointPurchaseCallParticipants,
  JointPurchaseCallUserRef,
} from '../types/joint-purchase-calls';
import { JointPurchaseCallForm } from './joint-purchase-call-form';

type DialogState =
  | { kind: 'edit' | 'open' | 'close' | 'cancel' | 'grant' | 'substitute' }
  | { kind: 'revoke'; user: JointPurchaseCallUserRef; grant: JointPurchaseCallGrant; self: boolean }
  | { kind: 'review'; user: JointPurchaseCallUserRef; grant: JointPurchaseCallGrant; decision: 'CONFIRM' | 'RETIRE' };
const MAX_REASON = 280;
/** E4 §6.4: mientras se muestran participantes, el acceso se vuelve a comprobar cada 60 s. */
const PARTICIPANTS_RECHECK_MS = 60_000;
/** Recuperar el foco dispara `focus` y `visibilitychange` a la vez: una sola comprobación. */
const FOCUS_RECHECK_GAP_MS = 2_000;
/** E4 §2: el único permiso operativo que se concede, retira o revisa. */
const MANAGE: JointPurchaseCallGrant = 'MANAGE';

type Problem = { message: string; forbidden: boolean };
type PermissionLostCode = 'MANAGE_FORBIDDEN' | 'COLLABORATORS_FORBIDDEN';

/** Un `MANAGE` propio que ya no se tiene: el último evento de esa persona y ese permiso es un retiro (láminas 17 y 48). */
interface RevokedGrant {
  grant: JointPurchaseCallGrant;
  at: string;
  actor: JointPurchaseCallUserRef;
  self: boolean;
}

/**
 * E2 §6 con E4 §2: detalle de una convocatoria
 * (`/colectivo/compras-conjuntas/:id`, láminas 10–20, 38, 48 y 50). La
 * Directiva y la Administración ven los mismos datos de la convocatoria y los
 * mismos totales (regla T); sólo la Administración recibe el detalle
 * identificado. La vista se monta de nuevo al cambiar de convocatoria o de
 * identidad (usuario, tenant o rol): lo que respondan las peticiones del
 * contexto anterior se descarta.
 */
export function JointPurchaseCallDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const context = `${user?.id ?? ''}|${user?.tenantId ?? ''}|${user?.role ?? ''}|${id}`;
  return <CallDetail key={context} id={id} userId={user?.id ?? null} userName={user?.name ?? ''} />;
}

/**
 * Acciones de estado sólo con `can_manage` (o cancelar y cerrar con
 * `can_cancel_or_close`); el servidor decide igualmente (403
 * `MANAGE_FORBIDDEN`). Los participantes identificados sólo se piden con
 * `can_view_participants` (Administración habilitada, E4 §2); mientras se
 * muestran, el acceso se vuelve a comprobar al recuperar el foco y cada 60 s,
 * y si se perdió (cambio de rol o deshabilitación) se borran de la página los
 * nombres y las cantidades. Nada de esto se guarda en el navegador. Tras cada
 * acción se recargan el detalle y los colaboradores (U.6).
 */
function CallDetail({ id, userId, userName }: { id: string; userId: string | null; userName: string }) {
  const location = useLocation();
  const [params] = useSearchParams();
  const [call, setCall] = useState<JointPurchaseCallDetail | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [message, setMessage] = useState<string | null>(() => (location.state as { message?: string } | null)?.message ?? null);
  const [alert, setAlert] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [participants, setParticipants] = useState<JointPurchaseCallParticipants | null>(null);
  const [participantsProblem, setParticipantsProblem] = useState<string | null>(null);
  const [closing, setClosing] = useState<JointPurchaseCallClosing | null>(null);
  const [closingProblem, setClosingProblem] = useState<string | null>(null);
  /** Se tuvo el acceso al detalle identificado en esta vista y ya no (E4 §6.4). */
  const [revoked, setRevoked] = useState(false);
  const [collaborators, setCollaborators] = useState<JointPurchaseCallCollaborators | null>(null);
  const [collaboratorsProblem, setCollaboratorsProblem] = useState<string | null>(null);

  // Cada carga lleva un número; sólo se aplica la respuesta de la última (y nunca tras desmontar).
  const aliveRef = useRef(true);
  const seqRef = useRef(0);
  const collaboratorsSeqRef = useRef(0);
  const hadPermissionRef = useRef(false);
  const shownRef = useRef(false);
  const lastFocusCheckRef = useRef(0);
  /** Permisos propios y número de colaboradores de la última lectura del detalle. */
  const permissionsKeyRef = useRef<string | null>(null);
  const [collaboratorsTick, setCollaboratorsTick] = useState(0);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    shownRef.current = call !== null;
  }, [call]);

  /**
   * Quita de la página nombres y cantidades por persona (E4 §6.4). Los totales
   * por producto no son datos identificados: siguen la regla T y se renuevan
   * con la siguiente respuesta del detalle.
   */
  const forgetParticipants = useCallback(() => {
    setParticipants(null);
    setClosing((prev) => (prev ? withoutIdentifiedDetail(prev) : prev));
    setRevoked(true);
    setCall((prev) => (prev ? { ...prev, can_view_participants: false } : prev));
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    const current = () => aliveRef.current && seqRef.current === seq;
    let detail: JointPurchaseCallDetail;
    try {
      detail = await jointPurchaseCallsService.get(id);
    } catch (err) {
      if (!current()) return;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // Un fallo pasajero no quita la vista; sin acceso (401/403) o sin convocatoria (404) no queda nada a la vista.
      if (shownRef.current && status !== 401 && status !== 403 && status !== 404) return;
      setCall(null);
      setParticipants(null);
      setClosing(null);
      setCollaborators(null);
      setProblem({ message: callError(err, 'No fue posible cargar la convocatoria.'), forbidden: status === 403 });
      return;
    }
    if (!current()) return;
    setProblem(null);
    // Si cambiaron los permisos propios o el número de colaboradores (p. ej. una revocación detectada al
    // recuperar el foco), la lista de colaboradores mostrada ya no es válida: se vuelve a pedir.
    const permissionsKey = `${[...(detail.my_grants ?? [])].sort().join(',')}|${detail.collaborator_count ?? ''}`;
    if (permissionsKeyRef.current !== null && permissionsKeyRef.current !== permissionsKey) setCollaboratorsTick((tick) => tick + 1);
    permissionsKeyRef.current = permissionsKey;
    if (detail.can_view_participants) {
      hadPermissionRef.current = true;
      setRevoked(false);
    } else if (hadPermissionRef.current) {
      setParticipants(null);
      setClosing((prev) => (prev ? withoutIdentifiedDetail(prev) : prev));
      setRevoked(true);
    }
    setCall(detail);

    if (detail.status === 'OPEN' || detail.status === 'CANCELLED') {
      if (!detail.can_view_participants) {
        setParticipants(null);
        return;
      }
      try {
        const list = await jointPurchaseCallsService.participants(id);
        if (!current()) return;
        setParticipants(list);
        setParticipantsProblem(null);
      } catch (err) {
        if (!current()) return;
        if (isParticipantsForbidden(err)) forgetParticipants();
        else setParticipantsProblem(callError(err, 'No fue posible cargar los participantes.'));
      }
    } else if (detail.status === 'CLOSED') {
      try {
        const snapshot = await jointPurchaseCallsService.closing(id);
        if (!current()) return;
        if (!snapshot.can_view_participants && hadPermissionRef.current) setRevoked(true);
        // El detalle por persona sólo se muestra si el detalle y el consolidado coinciden en el acceso.
        setClosing(snapshot.can_view_participants && detail.can_view_participants ? snapshot : withoutIdentifiedDetail(snapshot));
        setClosingProblem(null);
      } catch (err) {
        if (!current()) return;
        setClosingProblem(callError(err, 'No fue posible cargar el consolidado al cierre.'));
      }
    }
  }, [id, forgetParticipants]);

  const loadCollaborators = useCallback(async () => {
    const seq = ++collaboratorsSeqRef.current;
    const current = () => aliveRef.current && collaboratorsSeqRef.current === seq;
    try {
      const view = await jointPurchaseCallsService.collaborators(id);
      if (!current()) return;
      setCollaborators(view);
      setCollaboratorsProblem(null);
    } catch (err) {
      if (current()) setCollaboratorsProblem(callError(err, 'No fue posible cargar quién más puede administrarla.'));
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void refresh();
      void loadCollaborators();
    });
  }, [refresh, loadCollaborators]);

  useEffect(() => {
    if (collaboratorsTick > 0) void Promise.resolve().then(loadCollaborators);
  }, [collaboratorsTick, loadCollaborators]);

  // E4 §6.4: con participantes a la vista, volver a comprobar el acceso al recuperar el foco y cada 60 s.
  const watching = Boolean(call?.can_view_participants && call.status !== 'DRAFT');
  useEffect(() => {
    if (!watching) return;
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastFocusCheckRef.current < FOCUS_RECHECK_GAP_MS) return;
      lastFocusCheckRef.current = now;
      void refresh();
    };
    const timer = window.setInterval(() => void refresh(), PARTICIPANTS_RECHECK_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [watching, refresh]);

  const done = async (text: string) => {
    setDialog(null);
    setAlert(null);
    setMessage(text);
    await refresh();
  };

  /** El servidor dijo que el permiso cambió: se explica y se vuelve a cargar con los permisos actuales. */
  const lostPermission = async (code: PermissionLostCode) => {
    setDialog(null);
    setMessage(null);
    setAlert(code === 'MANAGE_FORBIDDEN' ? MANAGE_LOST_TEXT : COLLABORATORS_LOST_TEXT);
    await Promise.all([refresh(), loadCollaborators()]);
  };

  const collaboratorsChanged = async (view: JointPurchaseCallCollaborators, text: string) => {
    collaboratorsSeqRef.current += 1;
    setCollaborators(view);
    setCollaboratorsProblem(null);
    await done(text);
  };

  const campaignId = call?.campaign.campaign_ref ?? params.get('campaign');
  const backTo = `${COLLECTIVE_PATHS.jointPurchaseCalls}${campaignId ? `?campaign=${encodeURIComponent(campaignId)}` : ''}`;

  if (problem || !call) {
    return (
      <AppShell title="Convocatoria" section="Colectivo">
        <div className="space-y-4">
          <Link to={backTo} className={buttonClassFor('secondary', 'sm')}>
            Volver a las convocatorias
          </Link>
          {problem ? (
            <DataState
              state={problem.forbidden ? 'forbidden' : 'error'}
              description={problem.message}
              onRetry={problem.forbidden ? undefined : () => void refresh()}
              testId="call-error"
            />
          ) : (
            <DataState state="loading" skeletonRows={4} testId="call-loading" />
          )}
        </div>
      </AppShell>
    );
  }

  const canManage = call.can_manage === true;
  const canEnd = canManage || call.can_cancel_or_close === true;
  const active = call.status === 'DRAFT' || call.status === 'OPEN';
  const responsibleIneligible = call.responsible.eligible === false && call.status !== 'CANCELLED';
  const lastChange = call.responsible_changes.at(-1) ?? null;
  const newResponsible = call.is_responsible && lastChange !== null && lastChange.next.user_ref === userId;
  const revokedGrants = myRevokedGrants(collaborators, userId, call.is_responsible);
  const pendingReviews = call.is_responsible ? call.pending_delegation_reviews : 0;
  const reviewFirst = pendingReviews > 0 || newResponsible;

  const chips = (
    <>
      <StatusChip status={CALL_STATUS_CHIP[call.status] ?? call.status} testId="call-status" />
      {responsibleIneligible ? (
        <Chip tone="attention" dot testId="responsible-ineligible-chip">
          Responsable no habilitada
        </Chip>
      ) : call.is_responsible ? (
        <Chip tone="on-dark">{newResponsible && lastChange ? `Usted es responsable desde el ${fmtShortDay(lastChange.at)}` : 'Usted es responsable'}</Chip>
      ) : canManage ? (
        <Chip tone="on-dark">Puede administrarla</Chip>
      ) : (
        <Chip tone="on-dark">Solo consulta</Chip>
      )}
    </>
  );

  const actions = (
    <>
      {active && canEnd && <HeroDangerButton onClick={() => setDialog({ kind: 'cancel' })}>Cancelar convocatoria…</HeroDangerButton>}
      {call.status === 'DRAFT' && canManage && (
        <>
          <Button variant="on-dark" onClick={() => setDialog({ kind: 'edit' })}>
            Editar
          </Button>
          <Button variant="accent" onClick={() => setDialog({ kind: 'open' })}>
            Abrir convocatoria…
          </Button>
        </>
      )}
      {call.status === 'OPEN' && canEnd && (
        <Button variant="accent" onClick={() => setDialog({ kind: 'close' })}>
          Cerrar y consolidar…
        </Button>
      )}
    </>
  );
  const hasActions = (active && canEnd) || (call.status === 'DRAFT' && canManage);

  return (
    <AppShell title={call.name} section="Colectivo">
      <div className="flex flex-col gap-5 pb-4">
        <CallHero
          title={call.name}
          backTo={backTo}
          eyebrow={`Compra conjunta · ${call.campaign.name}`}
          chips={chips}
          facts={heroFacts(call, closing)}
          actions={hasActions ? actions : undefined}
        />

        {alert && (
          <Notice kind="warn">
            <span data-testid="call-alert">{alert}</span>
          </Notice>
        )}
        {message && <Notice kind="ok">{message}</Notice>}
        {responsibleIneligible && (
          <Notice
            kind="warn"
            action={
              call.can_substitute_responsible ? (
                <Button onClick={() => setDialog({ kind: 'substitute' })} data-testid="substitute-open">
                  Sustituir responsable…
                </Button>
              ) : undefined
            }
          >
            <span data-testid="responsible-ineligible">
              <strong>{RESPONSIBLE_INELIGIBLE_TITLE}</strong> {responsibleIneligibleBody(call.status)}
            </span>
            {/* E4 §2: la Directiva no sustituye; se le dice a quién pedírselo. */}
            {!call.can_substitute_responsible && <span data-testid="responsible-ineligible-who"> {RESPONSIBLE_INELIGIBLE_WHO}</span>}
          </Notice>
        )}
        {call.status === 'CANCELLED' && call.cancel_reason && (
          <Notice kind="error">
            <span data-testid="cancel-reason">
              <strong>Motivo de la cancelación:</strong> {call.cancel_reason}
            </span>
          </Notice>
        )}
        {!call.is_responsible &&
          call.status !== 'CANCELLED' &&
          revokedGrants.map((entry) => (
            <Notice kind="warn" key={entry.grant}>
              <span data-testid={`access-revoked-${entry.grant}`}>
                <strong>
                  {entry.self
                    ? `Renunció a su permiso «${GRANT_LABEL[entry.grant]}» el ${fmtWhen(entry.at)}.`
                    : `Su permiso «${GRANT_LABEL[entry.grant]}» se retiró el ${fmtWhen(entry.at)}.`}
                </strong>{' '}
                Ya no puede administrarla.
              </span>
            </Notice>
          ))}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,25rem)] lg:grid-rows-[auto_1fr] lg:items-start">
          <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {call.status === 'CLOSED' ? (
              <ClosingPanel call={call} data={closing} problem={closingProblem} revoked={revoked} onRetry={() => void refresh()} />
            ) : (
              <>
                <ProductsCard call={call} />
                {call.status === 'DRAFT' ? (
                  <CallCard title="Quién pidió" testId="draft-requests">
                    <LockLine icon="info">
                      {canManage ? 'Nadie puede pedir todavía. Los pedidos empiezan cuando usted la abra.' : 'Nadie puede pedir todavía. Los pedidos empiezan cuando se abra.'}
                    </LockLine>
                  </CallCard>
                ) : (
                  <ParticipantsPanel call={call} data={participants} problem={participantsProblem} revoked={revoked} onRetry={() => void refresh()} />
                )}
              </>
            )}
          </div>

          <div className={`min-w-0 space-y-5 lg:col-start-2 lg:row-start-1 ${reviewFirst ? 'order-first lg:order-none' : ''}`}>
            {call.status === 'CLOSED' && (
              <CallCard title="Qué sigue" testId="what-next">
                <LockLine icon="info">{WHAT_NEXT_TEXT}</LockLine>
              </CallCard>
            )}
            {newResponsible && (
              <CallCard title="Su acceso como nueva responsable" testId="new-responsible">
                <ul className="list-disc space-y-1.5 pl-5 pt-3 text-base leading-relaxed text-ink">
                  {NEW_RESPONSIBLE_POINTS.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </CallCard>
            )}
            <CollaboratorsSection
              call={call}
              view={collaborators}
              problem={collaboratorsProblem}
              userId={userId}
              revokedGrants={revokedGrants}
              userName={userName}
              onRetry={() => void loadCollaborators()}
              onGrant={() => setDialog({ kind: 'grant' })}
              onRevoke={(user, grant) => setDialog({ kind: 'revoke', user, grant, self: user.user_ref === userId })}
              onReview={(user, grant, decision) => setDialog({ kind: 'review', user, grant, decision })}
            />
          </div>

          <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-start-2">
            <ActivityTimeline history={call.history} changes={call.responsible_changes} />
            <CallFootnote call={call} canManage={canManage} responsibleIneligible={responsibleIneligible} />
          </div>
        </div>
      </div>

      {dialog?.kind === 'edit' && (
        <JointPurchaseCallForm
          campaignId={call.campaign.campaign_ref}
          campaignName={call.campaign.name}
          call={call}
          onClose={() => setDialog(null)}
          onSaved={({ text }) => void done(text)}
          onManageForbidden={() => void lostPermission('MANAGE_FORBIDDEN')}
        />
      )}
      {dialog?.kind === 'open' && (
        <ActionDialog
          title="Abrir la convocatoria"
          confirmLabel="Abrir convocatoria"
          acknowledgement={`Confirmo que se abre «${call.name}».`}
          onCancel={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          run={async () => {
            await jointPurchaseCallsService.open(call.call_id);
            await done('Convocatoria abierta. Los agricultores la verán al actualizar su aplicación.');
          }}
        >
          <ul data-testid="open-implications">
            {OPEN_IMPLICATIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li data-testid="open-access-line">{OPEN_ACCESS_LINE}</li>
            <li>Fecha límite: {fmtWhen(call.deadline_at, 'always')}. El plazo se cumple con el reloj del servidor.</li>
          </ul>
        </ActionDialog>
      )}
      {dialog?.kind === 'close' && (
        <ActionDialog
          title="Cerrar y consolidar"
          confirmLabel="Cerrar convocatoria"
          acknowledgement={`Confirmo que se cierra «${call.name}».`}
          onCancel={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          run={async () => {
            await jointPurchaseCallsService.close(call.call_id);
            await done('Convocatoria cerrada. El consolidado al cierre ya no cambia.');
          }}
        >
          <ul>
            {CLOSE_IMPLICATIONS.map((line, index) => (
              <li key={line} data-testid={index === 0 ? 'close-implication' : undefined}>
                {line}
              </li>
            ))}
          </ul>
        </ActionDialog>
      )}
      {dialog?.kind === 'cancel' && (
        <ActionDialog
          title="Cancelar la convocatoria"
          confirmLabel="Cancelar convocatoria"
          tone="danger"
          reason={{ maxLength: MAX_REASON }}
          acknowledgement={`Confirmo que se cancela «${call.name}». No se puede deshacer.`}
          onCancel={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          run={async (reason) => {
            await jointPurchaseCallsService.cancel(call.call_id, reason);
            await done('Convocatoria cancelada.');
          }}
        >
          <p>
            {call.status === 'OPEN'
              ? 'Los pedidos quedan sin efecto y no habrá consolidado; lo recibido queda en el historial. Los agricultores lo verán en su aplicación y los productos quedan libres para otra convocatoria.'
              : 'El borrador no se podrá abrir. Los agricultores nunca lo vieron.'}
          </p>
        </ActionDialog>
      )}
      {dialog?.kind === 'grant' && (
        <GrantDialog
          call={call}
          userId={userId}
          onClose={() => setDialog(null)}
          onGranted={(view, text) => void collaboratorsChanged(view, text)}
          onForbidden={() => void lostPermission('COLLABORATORS_FORBIDDEN')}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <ActionDialog
          title={dialog.self ? 'Renunciar a este permiso' : 'Retirar el permiso'}
          confirmLabel={dialog.self ? 'Renunciar a este permiso' : 'Retirar permiso'}
          tone="danger"
          acknowledgement={dialog.self ? 'Confirmo que renuncio a este permiso.' : 'Confirmo que retiro este permiso.'}
          onCancel={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          run={async () => {
            const view = await jointPurchaseCallsService.revoke(call.call_id, dialog.user.user_ref, dialog.grant);
            await collaboratorsChanged(
              view,
              dialog.self ? `Renunció al permiso «${GRANT_LABEL[dialog.grant]}».` : `Permiso «${GRANT_LABEL[dialog.grant]}» retirado a ${dialog.user.name}.`,
            );
          }}
        >
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1">
            <dt className="text-ink-muted">Persona</dt>
            <dd className="font-semibold [overflow-wrap:anywhere]">{dialog.user.name}</dd>
            <dt className="text-ink-muted">Permiso</dt>
            <dd className="font-semibold">{GRANT_LABEL[dialog.grant]}</dd>
          </dl>
          <p className="text-ink-muted">
            {dialog.self ? GRANT_LOSS[dialog.grant].replace('Dejará', 'Usted dejará') : GRANT_LOSS[dialog.grant]}{' '}
            {dialog.self
              ? 'Rige desde la próxima consulta. Sólo la persona responsable puede volver a concederlo.'
              : 'Rige desde su próxima consulta. Lo que haya copiado, impreso o capturado antes no se puede retirar desde aquí.'}
          </p>
        </ActionDialog>
      )}
      {dialog?.kind === 'review' && (
        <ActionDialog
          title={dialog.decision === 'CONFIRM' ? 'Confirmar el permiso' : 'Retirar el permiso'}
          confirmLabel={dialog.decision === 'CONFIRM' ? 'Confirmar permiso' : 'Retirar permiso'}
          tone={dialog.decision === 'CONFIRM' ? 'primary' : 'danger'}
          acknowledgement={
            dialog.decision === 'CONFIRM'
              ? `Confirmo que ${dialog.user.name} conserva «${GRANT_LABEL[dialog.grant]}», ahora concedido por mí.`
              : `Confirmo que retiro «${GRANT_LABEL[dialog.grant]}» a ${dialog.user.name}.`
          }
          onCancel={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          run={async () => {
            const view = await jointPurchaseCallsService.reviewDelegation(call.call_id, dialog.user.user_ref, dialog.grant, dialog.decision);
            await collaboratorsChanged(
              view,
              dialog.decision === 'CONFIRM' ? `Permiso «${GRANT_LABEL[dialog.grant]}» de ${dialog.user.name} confirmado.` : `Permiso «${GRANT_LABEL[dialog.grant]}» retirado a ${dialog.user.name}.`,
            );
          }}
        >
          <p data-testid="review-implication">
            {dialog.decision === 'CONFIRM'
              ? `Lo concedió la responsable anterior y quedó suspendido al sustituirla. Si lo confirma, rige otra vez desde la próxima consulta de esa persona. ${GRANT_ACCESS_NOTE}`
              : 'Lo concedió la responsable anterior. Si lo retira, queda registrado y esa persona no lo recupera salvo que usted se lo conceda de nuevo.'}
          </p>
        </ActionDialog>
      )}
      {dialog?.kind === 'substitute' && (
        <SubstituteDialog
          call={call}
          userId={userId}
          onClose={() => setDialog(null)}
          onDone={(text) => void Promise.all([done(text), loadCollaborators()])}
          onChanged={(text) => {
            setDialog(null);
            setMessage(null);
            setAlert(text);
            void Promise.all([refresh(), loadCollaborators()]);
          }}
        />
      )}
    </AppShell>
  );
}

/** «12 nov»: el día sin hora ni año (chip «Usted es responsable desde…»). */
function fmtShortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }).replace(/\./g, '');
}

/** Datos clave de la cabecera según el estado (láminas 10–20); el primero va en lima. */
function heroFacts(call: JointPurchaseCallDetail, closing: JointPurchaseCallClosing | null): CallHeroFact[] {
  const responsible: CallHeroFact[] = call.is_responsible ? [] : [{ key: 'responsible', label: 'Responsable', value: call.responsible.name, testId: 'hero-responsible' }];
  if (call.status === 'DRAFT')
    return [
      { key: 'deadline', label: 'Fecha límite', value: fmtWhen(call.deadline_at) },
      ...responsible,
      { key: 'farmers', label: 'Los agricultores', value: 'Aún no la ven' },
    ];
  if (call.status === 'OPEN')
    return [
      { key: 'deadline', label: 'Recibe pedidos hasta', value: fmtWhen(call.deadline_at) },
      ...responsible,
      { key: 'participants', label: 'Participan', value: peopleText(call.participant_count) },
      { key: 'opened', label: 'Abierta el', value: fmtWhen(call.opened_at) },
    ];
  if (call.status === 'CLOSED')
    return [
      { key: 'closed', label: 'Cerrada el', value: fmtWhen(call.closed_at) },
      ...responsible,
      ...(closing ? [{ key: 'participants', label: 'Participaron', value: peopleText(closing.participant_count), testId: 'closing-participants' }] : []),
      { key: 'opened', label: 'Abierta el', value: fmtWhen(call.opened_at) },
      ...(closing ? [{ key: 'mode', label: 'Cierre', value: CLOSE_MODE_LABEL[closing.mode] ?? closing.mode, testId: 'closing-mode' }] : []),
    ];
  return [
    { key: 'cancelled', label: 'Cancelada el', value: fmtWhen(call.cancelled_at) },
    ...(call.cancelled_by ? [{ key: 'by', label: 'Por', value: call.cancelled_by.name }] : []),
    { key: 'responsible', label: 'Responsable', value: call.responsible.name, testId: 'hero-responsible' },
  ];
}

/** E4 §6.4: el consolidado sin el detalle por persona (los totales por producto no son datos identificados). */
function withoutIdentifiedDetail(closing: JointPurchaseCallClosing): JointPurchaseCallClosing {
  return { ...closing, can_view_participants: false, participants: null };
}

function isParticipantsForbidden(err: unknown): boolean {
  return callErrorCode(err) === 'PARTICIPANTS_FORBIDDEN' || (axios.isAxiosError(err) && err.response?.status === 403);
}

/**
 * `MANAGE` propio retirado, según el historial de colaboradores (lo lee
 * cualquier DIRECTIVA o ADMINISTRADOR del tenant). Los eventos de
 * `PARTICIPANTS` son historia retirada y no cuentan (E4 §3.1).
 */
function myRevokedGrants(view: JointPurchaseCallCollaborators | null, userId: string | null, isResponsible: boolean): RevokedGrant[] {
  if (!view || !userId || isResponsible) return [];
  if ((view.collaborators.find((person) => person.user_ref === userId)?.grants ?? []).some((grant) => grant.grant === MANAGE)) return [];
  const last = [...view.history].reverse().find((event) => event.user.user_ref === userId && event.grant === MANAGE && !event.retired);
  return last?.action === 'REVOKED' ? [{ grant: MANAGE, at: last.at, actor: last.actor, self: last.actor.user_ref === userId }] : [];
}

function grantsText(grants: JointPurchaseCallGrant[] | null | undefined, responsible: boolean): string {
  const labels = (grants ?? []).map((grant) => GRANT_LABEL[grant] ?? grant);
  if (labels.length === 0) return 'Ninguno';
  return responsible ? `${labels.join(' y ')} (persona responsable)` : labels.join(' y ');
}

/** Pie de la columna derecha (lámina 11): origen (E3-P2), permisos propios, sustitución y la nota «no es una compra». */
function CallFootnote({ call, canManage, responsibleIneligible }: { call: JointPurchaseCallDetail; canManage: boolean; responsibleIneligible: boolean }) {
  const origin = callOriginText(call.origin);
  const lastChange = call.responsible_changes.at(-1);
  const active = call.status === 'DRAFT' || call.status === 'OPEN';
  const row = '[&>dd]:ml-1 [&>dd]:inline [&>dt]:inline';
  return (
    <div className="space-y-2 px-1 text-sm leading-relaxed text-ink-muted">
      <dl className="space-y-1.5" data-testid="call-facts">
        {origin && (
          <div className={row}>
            <dt className="font-semibold text-ink">Origen:</dt>
            <dd className="[overflow-wrap:anywhere]" data-testid="call-origin">
              {origin}
              {call.origin && call.origin_differs_from_current && (
                <span className="block" data-testid="call-origin-edited">
                  {callOriginEditedText(call.origin)}
                </span>
              )}
            </dd>
          </div>
        )}
        {Array.isArray(call.my_grants) && (
          <div className={row}>
            <dt className="font-semibold text-ink">Sus permisos:</dt>
            <dd>{grantsText(call.my_grants, call.is_responsible)}</dd>
          </div>
        )}
        {lastChange && (
          <div className={row}>
            <dt className="font-semibold text-ink">Sustitución:</dt>
            <dd className="[overflow-wrap:anywhere]" data-testid="responsible-change">
              {`${lastChange.next.name} sustituyó a ${lastChange.previous.name} el ${fmtWhen(lastChange.at, 'always')}, por decisión de ${lastChange.actor.name}. Motivo: ${lastChange.reason}`}
            </dd>
          </div>
        )}
      </dl>
      {active && !canManage && !responsibleIneligible && <p data-testid="manage-note">{MANAGE_ONLY_TEXT}</p>}
      {/* Cerrada: el consolidado ya dice qué son las cantidades y «Qué sigue» lo completa. */}
      {call.status !== 'CLOSED' && <p data-testid="call-footnote">{CALL_FOOTNOTE}</p>}
    </div>
  );
}

/** Productos de un borrador, de una abierta («Pedido hasta ahora», total provisional) o de una cancelada (láminas 10, 11, 13 y 16–20). */
function ProductsCard({ call }: { call: JointPurchaseCallDetail }) {
  const open = call.status === 'OPEN';
  const draft = call.status === 'DRAFT';
  const sourceDate = call.origin?.proposal_generated_at ?? null;
  const note = open
    ? PROVISIONAL_NOTE
    : draft
      ? call.source_proposal_ref
        ? sourceDate
          ? `Tomados del borrador de compra del ${fmtDay(sourceDate)}`
          : 'Tomados de un borrador de compra'
        : 'Elegidos del catálogo'
      : 'Los pedidos quedaron sin efecto';
  return (
    <CallCard title={open ? 'Pedido hasta ahora' : 'Productos'} note={<span data-testid="products-note">{note}</span>} testId="call-products">
      {call.products.length === 0 ? (
        <div className="pt-3">
          <DataState compact state="empty" title="Sin productos" description="El borrador todavía no tiene productos." />
        </div>
      ) : (
        <ProductLines
          caption="Productos de la convocatoria"
          valueHeader={open ? 'Total provisional solicitado' : draft ? 'Referencia del borrador de compra' : undefined}
          lines={call.products.map((product) => ({
            key: product.product_ref,
            testId: `call-product-${product.product_ref}`,
            name: product.name,
            sub: open && product.totals.participant_count > 0 ? `${unitText(product.unit)} · ${peopleText(product.totals.participant_count)}` : unitText(product.unit),
            value: open ? (
              <CallTotal total={product.totals} baseUnit={product.base_unit} open />
            ) : draft ? (
              <span className="text-sm text-ink-muted">{product.reference ? referenceText(product.reference, product.base_unit) : 'Del catálogo, sin referencia'}</span>
            ) : null,
          }))}
        />
      )}
      {open && <PendingConsentLine count={call.pending_consent_count} />}
      {draft && <p className="border-t border-line pt-3 text-sm text-ink-muted">Al abrirla, el nombre, la fecha límite y los productos dejan de ser editables.</p>}
    </CallCard>
  );
}

/**
 * E4 §3.1: recuento de participaciones con una autorización anterior, para la
 * Directiva y la Administración, junto a los totales. Nunca nombres.
 */
function PendingConsentLine({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <LockLine>
      <span data-testid="pending-consent-count">{pendingConsentText(count)}</span> <span className="text-sm">{PENDING_CONSENT_HOW}</span>
    </LockLine>
  );
}

/**
 * E4 §3.1: aviso claro a la Administración de las participaciones que no ve por
 * nombre porque su agricultor aún no dio la autorización nueva. El texto lo
 * envía el servidor, sin nombres.
 */
function PendingConsentNotice({ count, notice }: { count: number; notice: string | null }) {
  if (count <= 0) return null;
  return (
    <div className="pt-3">
      <Notice kind="warn" compact>
        <span data-testid="pending-consent-notice">{notice ?? pendingConsentDetailText(count)}</span> <span>{PENDING_CONSENT_HOW}</span>
      </Notice>
    </div>
  );
}

/** El acceso se perdió mientras la página mostraba participantes (E4 §6.4). */
function RevokedNotice() {
  return (
    <div className="pt-3">
      <Notice kind="warn" compact>
        <span data-testid="participants-revoked">{PARTICIPANTS_REVOKED_TEXT}</span>
      </Notice>
    </div>
  );
}

function rowsFooter(participants: ParticipantEntry[]): string {
  const lines = participants.reduce((sum, participant) => sum + Math.max(participant.lines.length, 1), 0);
  const people = peopleText(participants.length);
  const head = `${lines === 1 ? '1 pedido' : `${lines} pedidos`} de ${people}.`;
  return lines > participants.length ? `${head} Una persona puede aparecer en varias filas.` : head;
}

/**
 * «Quién pidió» de una convocatoria abierta o cancelada (láminas 11, 13, 14, 16,
 * 17, 20). La Directiva ve sólo cuántas personas participan; la
 * Administración (`can_view_participants`) ve nombres y cantidades de quienes
 * lo autorizaron y el aviso de las que esperan la autorización nueva.
 */
function ParticipantsPanel({
  call,
  data,
  problem,
  revoked,
  onRetry,
}: {
  call: JointPurchaseCallDetail;
  data: JointPurchaseCallParticipants | null;
  problem: string | null;
  revoked: boolean;
  onRetry: () => void;
}) {
  const allowed = call.can_view_participants;
  const open = call.status === 'OPEN';
  const productName = (ref: string, fallback: string) => fallback || call.products.find((product) => product.product_ref === ref)?.name || '—';
  if (revoked || !allowed) {
    return (
      <CallCard title="Quién pidió" testId="participants-panel">
        {revoked ? (
          <RevokedNotice />
        ) : !open ? (
          <LockLine icon="info" testId="participants-cancelled">
            No hay consolidado: la convocatoria se canceló antes del cierre.
          </LockLine>
        ) : (
          <LockLine>
            <span className="text-ink" data-testid="participants-forbidden">
              {PARTICIPANTS_FORBIDDEN_TEXT}
            </span>
          </LockLine>
        )}
        {open && (
          <p className="pt-2 text-sm text-ink-muted" data-testid="participants-count">
            {participantsCountText(call.participant_count)}
          </p>
        )}
      </CallCard>
    );
  }
  // El aviso del servidor («Lista provisional…» mientras está abierta) manda.
  const notice = data?.notice ?? null;
  const pending = data?.pending_consent_count ?? 0;
  return (
    <CallCard
      title="Quién pidió"
      note={notice ? <span data-testid="provisional-note">{notice}</span> : open ? undefined : 'Sin efecto: se canceló antes del cierre'}
      testId="participants-panel"
    >
      {problem ? (
        <div className="pt-3">
          <DataState compact state="error" description={problem} onRetry={onRetry} />
        </div>
      ) : !data ? (
        <div className="pt-3">
          <DataState compact state="loading" />
        </div>
      ) : (
        <>
          {data.participants.length > 0 && <LockLine>{WHY_VISIBLE_TEXT}</LockLine>}
          <PendingConsentNotice count={pending} notice={data.pending_consent_notice} />
          {data.participants.length === 0 ? (
            pending > 0 ? null : <LockLine icon="info">Todavía nadie confirmó su participación.</LockLine>
          ) : (
            <>
              <ParticipantsTable caption="Participantes de la convocatoria" participants={data.participants} productName={productName} />
              <p className="border-t border-line pt-3 text-sm text-ink-muted">{rowsFooter(data.participants)}</p>
            </>
          )}
        </>
      )}
    </CallCard>
  );
}

/**
 * «Consolidado al cierre» (E2-D13) y «Detalle por participante» (láminas 12, 18
 * y 19): cantidades solicitadas hasta el corte, fijadas al cierre. Los totales
 * siguen la regla T; el detalle por persona sólo para la Administración.
 */
function ClosingPanel({
  call,
  data,
  problem,
  revoked,
  onRetry,
}: {
  call: JointPurchaseCallDetail;
  data: JointPurchaseCallClosing | null;
  problem: string | null;
  revoked: boolean;
  onRetry: () => void;
}) {
  const closing = data;
  const productName = (ref: string, fallback: string) => fallback || call.products.find((product) => product.product_ref === ref)?.name || '—';
  const full = call.can_view_participants && closing?.can_view_participants === true && Array.isArray(closing.participants);
  return (
    <div className="space-y-5" data-testid="closing-panel">
      <CallCard
        title="Consolidado al cierre"
        note={
          closing ? (
            <>
              <span data-testid="closing-fixed">Fijado al cierre · </span>
              <span data-testid="closing-cutoff">Pedidos recibidos hasta el {fmtWhen(closing.cutoff_at, 'always')}</span>
            </>
          ) : undefined
        }
      >
        {problem ? (
          <div className="pt-3">
            <DataState compact state="error" description={problem} onRetry={onRetry} />
          </div>
        ) : !closing ? (
          <div className="space-y-3 pt-3">
            {revoked && <RevokedNotice />}
            <DataState compact state="loading" />
          </div>
        ) : (
          <>
            {closing.lines.length === 0 ? (
              <div className="pt-3">
                <DataState compact state="empty" title="Sin cantidades solicitadas" description="Nadie tenía una participación vigente al corte." />
              </div>
            ) : (
              <ProductLines
                caption="Cantidades solicitadas por producto"
                valueHeader="Cantidad solicitada (total)"
                lines={closing.lines.map((line) => ({
                  key: line.product_ref,
                  testId: `closing-line-${line.product_ref}`,
                  name: line.product_name,
                  sub: line.participant_count > 0 ? `${unitText(line.base_unit)} · ${peopleText(line.participant_count)}` : `${unitText(line.base_unit)} · Nadie lo pidió`,
                  value: <CallTotal total={line} baseUnit={line.base_unit} />,
                }))}
              />
            )}
            <PendingConsentLine count={closing.pending_consent_count} />
            <p className="border-t border-line pt-3 text-sm text-ink-muted">
              {/* El rótulo del servidor repite el título de la tarjeta: queda para lectores de pantalla. */}
              <span className="sr-only">
                <span data-testid="closing-label">{closing.label}</span>.{' '}
              </span>
              <span data-testid="not-a-purchase">{NOT_A_PURCHASE_TEXT}</span>
            </p>
          </>
        )}
      </CallCard>
      {closing && (
        <CallCard title="Detalle por participante" testId="closing-detail">
          {revoked ? (
            <RevokedNotice />
          ) : full && closing.participants ? (
            <>
              {closing.participants.length > 0 && <LockLine>{WHY_VISIBLE_TEXT}</LockLine>}
              <PendingConsentNotice count={closing.pending_consent_count} notice={closing.pending_consent_notice} />
              {closing.participants.length === 0 ? (
                closing.pending_consent_count > 0 ? null : <LockLine icon="info">Nadie tenía una participación vigente al corte.</LockLine>
              ) : (
                <>
                  <ParticipantsTable caption="Detalle por participante al cierre" participants={closing.participants} productName={productName} />
                  <p className="border-t border-line pt-3 text-sm text-ink-muted">{rowsFooter(closing.participants)}</p>
                </>
              )}
            </>
          ) : (
            <LockLine testId="closing-detail-hidden">
              <span className="text-ink">{PARTICIPANTS_FORBIDDEN_TEXT}</span> No se muestran nombres ni cantidades de cada persona.
            </LockLine>
          )}
        </CallCard>
      )}
    </div>
  );
}

function grantLine(grant: JointPurchaseCallCollaboratorGrant, userId: string | null): string {
  if (grant.status === 'PENDING_REVIEW' || grant.status === 'SUSPENDED') return `Lo concedió ${grant.granted_by.name} el ${fmtWhen(grant.granted_at)}`;
  return grant.granted_by.user_ref === userId ? `Usted lo concedió el ${fmtWhen(grant.granted_at)}` : `Concedido por ${grant.granted_by.name} el ${fmtWhen(grant.granted_at)}`;
}

/**
 * Quién más puede administrar la convocatoria (láminas 10–12, 14, 16, 17 y 20),
 * con E4 §2: sólo `MANAGE`. Lo concede (`DRAFT`, `OPEN` o `CLOSED`) y retira la
 * persona responsable; un colaborador renuncia al suyo (también suspendido); la
 * nueva responsable revisa los de la anterior. Los permisos de visualización
 * guardados antes de E4 se muestran plegados, como historia de sólo lectura.
 */
function CollaboratorsSection({
  call,
  view,
  problem,
  userId,
  revokedGrants,
  userName,
  onRetry,
  onGrant,
  onRevoke,
  onReview,
}: {
  call: JointPurchaseCallDetail;
  view: JointPurchaseCallCollaborators | null;
  problem: string | null;
  userId: string | null;
  revokedGrants: RevokedGrant[];
  userName: string;
  onRetry: () => void;
  onGrant: () => void;
  onRevoke: (user: JointPurchaseCallUserRef, grant: JointPurchaseCallGrant) => void;
  onReview: (user: JointPurchaseCallUserRef, grant: JointPurchaseCallGrant, decision: 'CONFIRM' | 'RETIRE') => void;
}) {
  const canGrant = view?.can_grant === true;
  const canReview = view?.can_review === true;
  const grantable = canGrant && call.status !== 'CANCELLED';
  const people = [...(view?.collaborators ?? [])].sort((a, b) => Number(b.user_ref === userId) - Number(a.user_ref === userId));
  const allGrants = people.flatMap((person) => person.grants);
  const pending = allGrants.filter((grant) => grant.status === 'PENDING_REVIEW').length;
  const suspended = allGrants.filter((grant) => grant.status === 'SUSPENDED').length;
  const retired = view?.retired_grants ?? [];
  const mine = people.some((person) => person.user_ref === userId) || revokedGrants.length > 0;
  const final = call.status === 'CLOSED' || call.status === 'CANCELLED';
  // Cerrada o cancelada, sin nada que mostrar a quien no es responsable (láminas 13, 18 y 19): no se dibuja.
  if (view && final && !call.is_responsible && people.length === 0 && revokedGrants.length === 0 && !problem) return null;

  const title =
    call.delegations_suspended && suspended > 0
      ? `Permisos suspendidos · ${suspended}`
      : canReview && pending > 0
        ? `Permisos por revisar · ${pending}`
        : !call.is_responsible && mine
          ? 'Su acceso'
          : 'Quién más puede administrarla';
  const pendingReviews = call.is_responsible ? call.pending_delegation_reviews : 0;
  const emptyText = call.is_responsible
    ? final
      ? 'Nadie más puede administrarla.'
      : 'Solo usted.'
    : mine
      ? 'No hay permisos vigentes en esta convocatoria.'
      : 'Sólo la persona responsable la administra.';

  return (
    <CallCard title={title} testId="collaborators-panel">
      {problem ? (
        <div className="pt-3">
          <DataState compact state="error" description={problem} onRetry={onRetry} />
        </div>
      ) : !view ? (
        <div className="pt-3">
          <DataState compact state="loading" />
        </div>
      ) : (
        <div className="space-y-1">
          {pendingReviews > 0 && (
            <p className="pt-3 text-sm text-ink-muted" data-testid="pending-delegation-reviews">
              {pendingReviews === 1
                ? '1 permiso concedido por la responsable anterior espera su revisión: confírmelo o retírelo. Mientras tanto no se ejerce.'
                : `${pendingReviews} permisos concedidos por la responsable anterior esperan su revisión: confírmelos o retírelos. Mientras tanto no se ejercen.`}
            </p>
          )}
          {people.length === 0 ? (
            revokedGrants.length === 0 && (
              <p className="flex items-center gap-2 pt-3 text-base text-ink-muted" data-testid="collaborators-empty">
                {emptyText}
              </p>
            )
          ) : (
            <ul className="divide-y divide-line" aria-label="Personas que pueden administrar esta convocatoria">
              {people.map((person) => {
                const self = person.user_ref === userId;
                return (
                  <li key={person.user_ref} className="flex gap-3 py-4" data-testid={`collaborator-${person.user_ref}`}>
                    <Avatar name={person.name} tone="soft" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink [overflow-wrap:anywhere]">
                        {person.name}
                        {self ? ' (usted)' : ''}
                        {person.role && <span className="font-normal text-ink-muted"> · {ROLE_LABEL[person.role] ?? person.role}</span>}
                      </p>
                      <ul className="mt-2 space-y-3">
                        {person.grants.map((grant) => (
                          <li key={grant.grant} className="space-y-1.5" data-testid={`collaborator-grant-${person.user_ref}-${grant.grant}`}>
                            <Chip tone={grant.status === 'PENDING_REVIEW' ? 'attention' : grant.status === 'SUSPENDED' ? 'neutral' : 'positive'} size="md">
                              {GRANT_LABEL[grant.grant] ?? grant.label}
                            </Chip>
                            <p className="text-xs text-ink-muted">{grantLine(grant, userId)}</p>
                            {grant.status !== 'IN_FORCE' && (
                              <p className="text-xs font-semibold text-caution" data-testid={`grant-status-${person.user_ref}-${grant.grant}`}>
                                {grant.status === 'PENDING_REVIEW'
                                  ? 'Suspendido: espera la revisión de la actual responsable.'
                                  : 'Suspendido: la responsable no está habilitada.'}
                              </p>
                            )}
                            {grant.status === 'PENDING_REVIEW' && canReview ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                  size="sm"
                                  aria-label={`Confirmar «${GRANT_LABEL[grant.grant]}» de ${person.name}`}
                                  onClick={() => onReview({ user_ref: person.user_ref, name: person.name }, grant.grant, 'CONFIRM')}
                                >
                                  Confirmar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  aria-label={`Retirar «${GRANT_LABEL[grant.grant]}» a ${person.name}`}
                                  onClick={() => onReview({ user_ref: person.user_ref, name: person.name }, grant.grant, 'RETIRE')}
                                >
                                  Retirar
                                </Button>
                              </div>
                            ) : self ? (
                              <div className="pt-1">
                                <Button size="sm" variant="secondary" aria-label="Renunciar a este permiso" onClick={() => onRevoke({ user_ref: person.user_ref, name: person.name }, grant.grant)}>
                                  Renunciar
                                </Button>
                              </div>
                            ) : (
                              canGrant && (
                                <div className="pt-1">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    aria-label={`Retirar «${GRANT_LABEL[grant.grant]}» a ${person.name}`}
                                    onClick={() => onRevoke({ user_ref: person.user_ref, name: person.name }, grant.grant)}
                                  >
                                    Retirar
                                  </Button>
                                </div>
                              )
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {revokedGrants.length > 0 && (
            <ul className={people.length > 0 ? 'divide-y divide-line border-t border-line' : 'divide-y divide-line'} aria-label="Sus permisos retirados">
              {revokedGrants.map((entry) => (
                <li key={entry.grant} className="flex gap-3 py-4" data-testid={`my-revoked-${entry.grant}`}>
                  <Avatar name={userName || 'Usted'} tone="soft" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="font-semibold text-ink [overflow-wrap:anywhere]">{userName ? `${userName} (usted)` : 'Usted'}</p>
                    <Chip size="md">{GRANT_LABEL[entry.grant]}</Chip>
                    <p className="text-xs text-ink-muted">{entry.self ? `Renunció el ${fmtWhen(entry.at)}` : `Retirado por ${entry.actor.name} el ${fmtWhen(entry.at)}`}</p>
                  </div>
                </li>
              ))}
              {people.length === 0 && (
                <li className="sr-only" data-testid="collaborators-empty">
                  {emptyText}
                </li>
              )}
            </ul>
          )}
          {grantable && (
            <div className="pt-2">
              <Button variant="secondary" block onClick={onGrant}>
                Conceder «{GRANT_LABEL.MANAGE}»
              </Button>
            </div>
          )}
          {canGrant && call.status === 'CANCELLED' && <p className="pt-2 text-xs text-ink-muted">Una convocatoria cancelada no admite permisos nuevos; los vigentes se pueden retirar.</p>}
          {retired.length > 0 && (
            <DisclosureLink label={`Ver ${RETIRED_GRANTS_TITLE.toLowerCase()} (${retired.length})`} testId="retired-grants">
              <div className="space-y-2 pb-2">
                <p className="text-sm text-ink-muted">{RETIRED_GRANTS_NOTE}</p>
                <ol className="space-y-2" aria-label={RETIRED_GRANTS_TITLE}>
                  {retired.map((entry, index) => (
                    <li key={`${entry.user.user_ref}-${entry.granted_at}-${index}`} className="text-sm" data-testid="retired-grant">
                      <span className="font-semibold text-ink">«{entry.label || GRANT_LABEL.PARTICIPANTS}»</span>
                      <span className="text-ink"> · {entry.user.name}</span>
                      <span className="text-xs text-ink-muted">
                        {' '}
                        · {entry.granted_by ? `concedido por ${entry.granted_by.name}` : 'concedido por el sistema a la responsable'} · {fmtWhen(entry.granted_at, 'always')}
                      </span>
                      <p className="text-xs text-ink-muted">{entry.notice}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </DisclosureLink>
          )}
          <DisclosureLink label="Ver historial de permisos" testId="access-history">
            {view.history.length === 0 ? (
              <p className="pb-2 text-sm text-ink-muted">Nadie concedió ni retiró permisos en esta convocatoria.</p>
            ) : (
              <ol className="space-y-2 pb-2" aria-label="Historial de permisos">
                {view.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-sm" data-testid="access-history-event">
                    <span className="font-semibold text-ink">{accessActionText(entry.action, entry.user.user_ref === entry.actor.user_ref)}</span>
                    <span className="text-ink">
                      {' '}
                      «{GRANT_LABEL[entry.grant] ?? entry.grant}» · {entry.user.name}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {' '}
                      · por {entry.actor.name} · {fmtWhen(entry.at, 'always')}
                    </span>
                    {entry.retired && (
                      <p className="text-xs text-ink-muted" data-testid="access-history-retired">
                        {entry.notice ?? RETIRED_GRANTS_NOTE}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </DisclosureLink>
          <AccessRules />
        </div>
      )}
    </CallCard>
  );
}

function accessActionText(action: 'GRANTED' | 'REVOKED' | 'SUSPENDED' | 'CONFIRMED', bySelf: boolean): string {
  if (action === 'GRANTED') return 'Concedido';
  if (action === 'SUSPENDED') return 'Suspendido al sustituir a la responsable';
  if (action === 'CONFIRMED') return 'Confirmado por la nueva responsable';
  return bySelf ? 'Renuncia' : 'Retirado';
}

/**
 * Confirmación de una acción (H-16, láminas 15, 34.2 y 46) sobre `ConfirmDialog`
 * de BASE: el botón queda desactivado hasta marcar la casilla (y escribir el
 * motivo, si se pide). El error del servidor se muestra dentro sin perder el
 * motivo; 403 `MANAGE_FORBIDDEN`/`COLLABORATORS_FORBIDDEN` lo explica la vista.
 */
function ActionDialog({
  run,
  onPermissionLost,
  ...props
}: Omit<ConfirmDialogProps, 'onConfirm' | 'busy' | 'error'> & {
  run: (reason: string) => Promise<void>;
  onPermissionLost?: (code: PermissionLostCode) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (reason: string) => {
    setBusy(true);
    setError(null);
    try {
      await run(reason);
    } catch (err) {
      const code = callErrorCode(err);
      if (onPermissionLost && (code === 'MANAGE_FORBIDDEN' || code === 'COLLABORATORS_FORBIDDEN')) {
        onPermissionLost(code);
        return;
      }
      setError(callError(err, 'No fue posible completar la acción.'));
      setBusy(false);
    }
  };
  return <ConfirmDialog {...props} busy={busy} error={error} onConfirm={(reason) => void submit(reason)} />;
}

/**
 * P-A B1 con E4 §6.3 (láminas 15.6 y 49): sustituir a una responsable que ya
 * no está habilitada. Lo hace la Administración habilitada, sin permiso
 * adicional (`can_substitute_responsible`); el servidor revalida todo. La sucesora es
 * otra persona activa de la Directiva o la Administración, distinta de quien
 * sustituye (decisión del autor) y de la responsable actual. Motivo de 1 a 280
 * caracteres y confirmación. El identificador de la solicitud se fija al abrir
 * el diálogo: reintentar no duplica nada.
 */
function SubstituteDialog({
  call,
  userId,
  onClose,
  onDone,
  onChanged,
}: {
  call: JointPurchaseCallDetail;
  userId: string | null;
  onClose: () => void;
  onDone: (text: string) => void;
  /** 409 `RESPONSIBLE_CHANGED` o `RESPONSIBLE_STILL_ELIGIBLE`: la situación cambió; se explica y se recarga. */
  onChanged: (text: string) => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  // El foco empieza en el texto: primero se leen las consecuencias (en teléfono, la hoja no salta al campo).
  const introRef = useRef<HTMLParagraphElement>(null);
  const [users, setUsers] = useState<EligibleResponsible[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userRef, setUserRef] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await jointPurchaseCallsService.eligibleResponsibles());
      setUsersError(null);
    } catch (err) {
      setUsersError(callError(err, 'No fue posible cargar los usuarios de la Directiva y la Administración.'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadUsers);
  }, [loadUsers]);

  const candidates = (users ?? []).filter((user) => user.user_ref !== call.responsible.user_ref && user.user_ref !== userId);
  // Decisión del autor (2026-11-12): quien sustituye no se nombra a sí; se explica en vez de ocultarlo sin más.
  const selfEligible = (users ?? []).some((user) => user.user_ref === userId && user.user_ref !== call.responsible.user_ref);
  const chosen = candidates.find((user) => user.user_ref === userRef) ?? null;
  const ready = chosen !== null && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      await jointPurchaseCallsService.substituteResponsible(call.call_id, {
        requestId,
        expectedVersion: call.responsible.version,
        newResponsibleRef: chosen.user_ref,
        reason: reason.trim(),
      });
      onDone(`${chosen.name} es ahora la persona responsable. Los permisos «${GRANT_LABEL.MANAGE}» anteriores quedan suspendidos hasta su revisión.`);
    } catch (err) {
      const code = callErrorCode(err);
      if (code === 'RESPONSIBLE_CHANGED' || code === 'RESPONSIBLE_STILL_ELIGIBLE' || code === 'SUBSTITUTION_FORBIDDEN') {
        onChanged(callError(err, 'La situación de la convocatoria cambió.'));
        return;
      }
      setError(callError(err, 'No fue posible sustituir a la persona responsable.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Sustituir a la responsable"
      description={<span className="[overflow-wrap:anywhere]">«{call.name}»</span>}
      onClose={onClose}
      dirty={reason.length > 0 || userRef !== ''}
      busy={busy}
      size="lg"
      hideCloseButton
      testId="substitute-dialog"
      fullScreenOnPhone
      initialFocusRef={introRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Volver
          </Button>
          <Button onClick={() => void submit()} disabled={!ready} busy={busy}>
            Sustituir responsable
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-base leading-relaxed text-ink">
        {/* Texto enfocable sólo por programa: sin anillo (el estilo global de :focus-visible no está en capa). */}
        <p ref={introRef} tabIndex={-1} style={{ outline: 'none' }}>
          <strong className="[overflow-wrap:anywhere]">{call.responsible.name}</strong> <span className="text-ink-muted">ya no está habilitada.</span>
        </p>
        <ul className="list-disc space-y-1.5 pl-5" data-testid="substitute-implications">
          {SUBSTITUTION_IMPLICATIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted" data-testid="substitute-who">
          {SUBSTITUTION_WHO_TEXT}
        </p>
        {usersError ? (
          <DataState compact state="error" description={usersError} onRetry={() => void loadUsers()} />
        ) : users && candidates.length === 0 ? (
          <DataState
            compact
            state="empty"
            title="Sin personas disponibles"
            description={selfEligible ? SUBSTITUTION_ONLY_SELF_TEXT : SUBSTITUTION_NO_CANDIDATES_TEXT}
            testId="substitute-no-candidates"
          />
        ) : (
          <Select
            id="substitute-user"
            label="Nueva persona responsable"
            value={userRef}
            onChange={(event) => {
              setUserRef(event.target.value);
              setConfirmed(false);
            }}
            help={
              selfEligible && candidates.length > 0 ? (
                <span data-testid="substitute-self-note">{SELF_SUBSTITUTION_TEXT}</span>
              ) : (
                'Otra persona activa de la Directiva o la Administración, distinta de usted y de la responsable actual.'
              )
            }
          >
            <option value="">{users ? 'Seleccione…' : 'Cargando…'}</option>
            {candidates.map((user) => (
              <option key={user.user_ref} value={user.user_ref}>
                {user.name}
                {ROLE_LABEL[user.role] ? ` · ${ROLE_LABEL[user.role]}` : ''}
              </option>
            ))}
          </Select>
        )}
        <Textarea
          id="substitute-reason"
          label="Motivo"
          help="Obligatorio. Queda en el historial y en la bitácora."
          maxLength={MAX_REASON}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
        <Checkbox
          label={
            chosen
              ? `Confirmo que ${chosen.name} sustituye a ${call.responsible.name} como persona responsable de «${call.name}».`
              : 'Elija a la nueva persona responsable para confirmar.'
          }
          checked={confirmed}
          disabled={!chosen || busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

/**
 * Conceder «Administrar la convocatoria» (lámina 15.5, E4 §2: el único permiso
 * que se concede): otro usuario activo de la Directiva o la Administración,
 * distinto de quien concede y de la persona responsable (el servidor lo vuelve
 * a comprobar: 422 `COLLABORATOR_NOT_ELIGIBLE`).
 */
function GrantDialog({
  call,
  userId,
  onClose,
  onGranted,
  onForbidden,
}: {
  call: JointPurchaseCallDetail;
  userId: string | null;
  onClose: () => void;
  onGranted: (view: JointPurchaseCallCollaborators, text: string) => void;
  onForbidden: () => void;
}) {
  const [users, setUsers] = useState<EligibleResponsible[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userRef, setUserRef] = useState('');
  const grant = MANAGE;
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await jointPurchaseCallsService.eligibleResponsibles());
      setUsersError(null);
    } catch (err) {
      setUsersError(callError(err, 'No fue posible cargar los usuarios de la Directiva y la Administración.'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadUsers);
  }, [loadUsers]);

  const candidates = (users ?? []).filter((user) => user.user_ref !== call.responsible.user_ref && user.user_ref !== userId);
  const chosen = candidates.find((user) => user.user_ref === userRef) ?? null;
  const ready = chosen !== null && confirmed && !busy;

  const submit = async () => {
    if (!ready || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      const view = await jointPurchaseCallsService.grant(call.call_id, chosen.user_ref, grant);
      onGranted(view, `Permiso «${GRANT_LABEL[grant]}» concedido a ${chosen.name}.`);
    } catch (err) {
      if (callErrorCode(err) === 'COLLABORATORS_FORBIDDEN') {
        onForbidden();
        return;
      }
      setError(callError(err, 'No fue posible conceder el permiso.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Conceder «${GRANT_LABEL.MANAGE}»`}
      onClose={onClose}
      dirty={userRef !== ''}
      busy={busy}
      hideCloseButton
      testId="grant-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Volver
          </Button>
          <Button onClick={() => void submit()} disabled={!ready} busy={busy}>
            Conceder permiso
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {usersError ? (
          <DataState compact state="error" description={usersError} onRetry={() => void loadUsers()} />
        ) : users && candidates.length === 0 ? (
          <DataState compact state="empty" title="Sin personas disponibles" description="No hay otros usuarios activos de la Directiva o la Administración a quienes conceder permisos." />
        ) : (
          <Select
            id="grant-user"
            label="Persona"
            help="Otra persona de la Directiva o la Administración, distinta de usted y de la persona responsable."
            value={userRef}
            onChange={(event) => {
              setUserRef(event.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">{users ? 'Seleccione…' : 'Cargando…'}</option>
            {candidates.map((user) => (
              <option key={user.user_ref} value={user.user_ref}>
                {user.name}
                {ROLE_LABEL[user.role] ? ` · ${ROLE_LABEL[user.role]}` : ''}
              </option>
            ))}
          </Select>
        )}
        <p className="text-sm leading-relaxed text-ink-muted" data-testid="grant-description">
          {GRANT_DESCRIPTION[grant]}
        </p>
        <Checkbox
          label={chosen ? `Confirmo que concedo «${GRANT_LABEL[grant]}» a ${chosen.name} en «${call.name}».` : 'Elija a la persona para confirmar.'}
          checked={confirmed}
          disabled={!chosen || busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

