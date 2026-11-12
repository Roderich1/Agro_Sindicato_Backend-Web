import axios from 'axios';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { AppShell, Modal } from '../components/app-shell';
import {
  Button,
  Collapsible,
  DataState,
  DataTable,
  inputClass,
  KpiTile,
  labelClass,
  Notice,
  PageHeader,
  Section,
  StatusChip,
} from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { fmtDateTime } from '../lib/collective-text';
import {
  CALL_EVENT_LABEL,
  CALL_STATUS_CHIP,
  CLOSE_IMPLICATION,
  CLOSE_MODE_LABEL,
  callError,
  callErrorCode,
  COLLABORATORS_LOST_TEXT,
  GRANT_DESCRIPTION,
  GRANT_LABEL,
  hiddenParticipantsText,
  MANAGE_LOST_TEXT,
  MANAGE_ONLY_TEXT,
  NOT_A_PURCHASE_TEXT,
  OPEN_IMPLICATIONS,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PARTICIPANTS_REVOKED_TEXT,
  PARTICIPATION_STATUS_LABEL,
  PROVISIONAL_NOTE,
  quantityText,
  referenceText,
  RESPONSIBLE_INELIGIBLE_TEXT,
  ROLE_LABEL,
  withheldTotalText,
} from '../lib/joint-purchase-call-text';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import type { BaseUnit } from '../lib/quantity';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import type {
  EligibleResponsible,
  JointPurchaseCallClosing,
  JointPurchaseCallCollaborators,
  JointPurchaseCallDetail,
  JointPurchaseCallGrant,
  JointPurchaseCallParticipants,
  JointPurchaseCallProductTotal,
  JointPurchaseCallUserRef,
  JointPurchaseParticipantLine,
  JointPurchaseParticipationStatus,
} from '../types/joint-purchase-calls';
import { JointPurchaseCallForm } from './joint-purchase-call-form';

type Dialog =
  | { kind: 'edit' | 'open' | 'close' | 'cancel' | 'grant' }
  | { kind: 'revoke'; user: JointPurchaseCallUserRef; grant: JointPurchaseCallGrant; self: boolean };
const MAX_REASON = 280;
/** §10.2: mientras se muestran participantes, el permiso se vuelve a comprobar cada 60 s. */
const PARTICIPANTS_RECHECK_MS = 60_000;
/** Recuperar el foco dispara `focus` y `visibilitychange` a la vez: una sola comprobación. */
const FOCUS_RECHECK_GAP_MS = 2_000;
const GRANTS: JointPurchaseCallGrant[] = ['PARTICIPANTS', 'MANAGE'];

type Problem = { message: string; forbidden: boolean };

/**
 * E2 §6 y §10.2/§10.3: detalle de una convocatoria
 * (`/colectivo/compras-conjuntas/:id`). La vista se monta de nuevo al cambiar
 * de convocatoria o de identidad (usuario, tenant o rol): lo que respondan las
 * peticiones del contexto anterior se descarta.
 */
export function JointPurchaseCallDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const context = `${user?.id ?? ''}|${user?.tenantId ?? ''}|${user?.role ?? ''}|${id}`;
  return <CallDetail key={context} id={id} userId={user?.id ?? null} />;
}

/**
 * Acciones de estado sólo con `can_manage` (o cancelar y cerrar con
 * `can_cancel_or_close`); el servidor decide igualmente (403
 * `MANAGE_FORBIDDEN`). Los participantes identificados sólo se piden con
 * `can_view_participants`; mientras se muestran, el permiso se vuelve a
 * comprobar al recuperar el foco y cada 60 s, y si se perdió se borran de la
 * página los nombres y las cantidades. Nada de esto se guarda en el navegador.
 */
function CallDetail({ id, userId }: { id: string; userId: string | null }) {
  const location = useLocation();
  const [params] = useSearchParams();
  const [call, setCall] = useState<JointPurchaseCallDetail | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [message, setMessage] = useState<string | null>(() => (location.state as { message?: string } | null)?.message ?? null);
  const [alert, setAlert] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [participants, setParticipants] = useState<JointPurchaseCallParticipants | null>(null);
  const [participantsProblem, setParticipantsProblem] = useState<string | null>(null);
  const [closing, setClosing] = useState<JointPurchaseCallClosing | null>(null);
  const [closingProblem, setClosingProblem] = useState<string | null>(null);
  /** Se tuvo `PARTICIPANTS` en esta vista y ya no. */
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

  /** Quita de la página nombres y cantidades por persona, y los totales que dependían del permiso. */
  const forgetParticipants = useCallback(() => {
    setParticipants(null);
    setClosing(null);
    setRevoked(true);
    setCall((prev) => (prev ? withoutParticipantsPermission(prev) : prev));
    // La lista de colaboradores también mostraba ese permiso.
    setCollaboratorsTick((tick) => tick + 1);
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
      setClosing(null);
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
        setClosing(snapshot);
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
      if (current()) setCollaboratorsProblem(callError(err, 'No fue posible cargar los colaboradores.'));
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

  // §10.2: con participantes a la vista, volver a comprobar el permiso al recuperar el foco y cada 60 s.
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
  const lostPermission = async (code: 'MANAGE_FORBIDDEN' | 'COLLABORATORS_FORBIDDEN') => {
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
  const back = (
    <Link to={backTo} className="text-sm font-semibold text-brand-800 underline-offset-2 hover:underline">
      Volver a las convocatorias
    </Link>
  );

  if (problem || !call) {
    return (
      <AppShell title="Convocatoria" section="Colectivo">
        <div className="space-y-4">
          {back}
          <Section>
            {problem ? (
              <DataState
                compact
                state={problem.forbidden ? 'forbidden' : 'error'}
                description={problem.message}
                onRetry={problem.forbidden ? undefined : () => void refresh()}
                testId="call-error"
              />
            ) : (
              <DataState compact state="loading" testId="call-loading" />
            )}
          </Section>
        </div>
      </AppShell>
    );
  }

  const canManage = call.can_manage === true;
  const canEnd = canManage || call.can_cancel_or_close === true;
  const active = call.status === 'DRAFT' || call.status === 'OPEN';
  const actions = (
    <div className="flex flex-wrap gap-2">
      {call.status === 'DRAFT' && canManage && (
        <>
          <Button variant="secondary" onClick={() => setDialog({ kind: 'edit' })}>
            Editar
          </Button>
          <Button onClick={() => setDialog({ kind: 'open' })}>Abrir</Button>
        </>
      )}
      {call.status === 'OPEN' && canEnd && <Button onClick={() => setDialog({ kind: 'close' })}>Cerrar</Button>}
      {active && canEnd && (
        <Button variant="danger" onClick={() => setDialog({ kind: 'cancel' })}>
          Cancelar convocatoria
        </Button>
      )}
    </div>
  );

  return (
    <AppShell title={call.name} section="Colectivo">
      <div className="space-y-5">
        {back}
        <PageHeader
          title={call.name}
          subtitle={<StatusChip status={CALL_STATUS_CHIP[call.status] ?? call.status} testId="call-status" />}
          actions={actions}
        />
        {alert && (
          <Notice kind="warn">
            <span data-testid="call-alert">{alert}</span>
          </Notice>
        )}
        {message && <Notice kind="ok">{message}</Notice>}
        {active && !canManage && (
          <Notice kind="info" compact>
            <span data-testid="manage-note">{canEnd ? RESPONSIBLE_INELIGIBLE_TEXT : MANAGE_ONLY_TEXT}</span>
          </Notice>
        )}

        <Section title="Datos de la convocatoria">
          <CallFacts call={call} />
        </Section>

        <Section
          title="Productos"
          note={
            call.status === 'OPEN'
              ? 'Total de cantidades solicitadas hasta ahora; puede cambiar hasta el cierre.'
              : call.source_proposal_ref
                ? 'Tomados de un borrador de propuesta: su cifra es sólo la referencia divulgada en ese borrador.'
                : undefined
          }
        >
          <ProductsTable call={call} />
        </Section>

        {(call.status === 'OPEN' || call.status === 'CANCELLED') && (
          <ParticipantsPanel call={call} data={participants} problem={participantsProblem} revoked={revoked} onRetry={() => void refresh()} />
        )}
        {call.status === 'CLOSED' && (
          <ClosingPanel call={call} data={closing} problem={closingProblem} revoked={revoked} onRetry={() => void refresh()} />
        )}

        <CollaboratorsSection
          call={call}
          view={collaborators}
          problem={collaboratorsProblem}
          userId={userId}
          onRetry={() => void loadCollaborators()}
          onGrant={() => setDialog({ kind: 'grant' })}
          onRevoke={(user, grant) => setDialog({ kind: 'revoke', user, grant, self: user.user_ref === userId })}
        />

        <Collapsible title="Historial" testId="call-history">
          {call.history.length === 0 ? (
            <DataState compact state="empty" title="Sin eventos" description="El servidor no registra eventos para esta convocatoria." />
          ) : (
            <ol className="divide-y divide-slate-100" aria-label="Historial de la convocatoria">
              {call.history.map((event, index) => (
                <li key={`${event.at}-${index}`} className="px-5 py-2 text-sm" data-testid="call-history-event">
                  <p>
                    <span className="font-semibold text-slate-900">{CALL_EVENT_LABEL[event.kind] ?? event.kind}</span>
                    <span className="ml-2 text-xs text-slate-600">{fmtDateTime(event.at)}</span>
                    <span className="ml-2 text-xs text-slate-600">· {event.actor?.name ?? 'Automático (servidor)'}</span>
                  </p>
                  {event.detail && <p className="text-xs text-slate-700 [overflow-wrap:anywhere]">{event.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </Collapsible>
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
        <ConfirmDialog
          title="Abrir la convocatoria"
          actionLabel="Abrir convocatoria"
          confirmText={`Confirmo que se abre «${call.name}» con ${call.responsible.name} como responsable.`}
          onClose={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          onConfirm={async () => {
            await jointPurchaseCallsService.open(call.call_id);
            await done('Convocatoria abierta. Los agricultores la verán al actualizar su aplicación.');
          }}
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700" data-testid="open-implications">
            {OPEN_IMPLICATIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>
              {call.responsible.name} podrá ver el nombre y las cantidades de quienes participen y autorizar a otras personas para
              coordinarla; el resto de la Directiva verá sólo cuántas personas participan.
            </li>
            <li>Fecha límite: {fmtDateTime(call.deadline_at)} (hora del servidor del sindicato).</li>
          </ul>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'close' && (
        <ConfirmDialog
          title="Cerrar la convocatoria"
          actionLabel="Cerrar convocatoria"
          confirmText={`Confirmo que se cierra «${call.name}».`}
          onClose={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          onConfirm={async () => {
            await jointPurchaseCallsService.close(call.call_id);
            await done('Convocatoria cerrada. El consolidado al cierre ya no cambia.');
          }}
        >
          <p className="text-sm text-slate-700" data-testid="close-implication">
            {CLOSE_IMPLICATION}
          </p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'cancel' && (
        <ConfirmDialog
          title="Cancelar la convocatoria"
          actionLabel="Cancelar convocatoria"
          variant="danger"
          withReason
          confirmText={`Confirmo que se cancela «${call.name}». No se puede deshacer.`}
          onClose={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          onConfirm={async (reason) => {
            await jointPurchaseCallsService.cancel(call.call_id, reason);
            await done('Convocatoria cancelada.');
          }}
        >
          <p className="text-sm text-slate-700">
            {call.status === 'OPEN'
              ? 'Los agricultores la verán como cancelada. Las participaciones recibidas se conservan, sin consolidado, y los productos quedan libres para otra convocatoria.'
              : 'El borrador no se podrá abrir. Los agricultores nunca lo vieron.'}
          </p>
        </ConfirmDialog>
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
        <ConfirmDialog
          title={dialog.self ? 'Renunciar a este permiso' : 'Retirar el permiso'}
          actionLabel={dialog.self ? 'Renunciar a este permiso' : 'Retirar permiso'}
          variant="danger"
          confirmText={
            dialog.self
              ? `Confirmo que renuncio al permiso «${GRANT_LABEL[dialog.grant]}» en «${call.name}».`
              : `Confirmo que retiro el permiso «${GRANT_LABEL[dialog.grant]}» a ${dialog.user.name} en «${call.name}».`
          }
          onClose={() => setDialog(null)}
          onPermissionLost={(code) => void lostPermission(code)}
          onConfirm={async () => {
            const view = await jointPurchaseCallsService.revoke(call.call_id, dialog.user.user_ref, dialog.grant);
            await collaboratorsChanged(
              view,
              dialog.self
                ? `Renunció al permiso «${GRANT_LABEL[dialog.grant]}».`
                : `Permiso «${GRANT_LABEL[dialog.grant]}» retirado a ${dialog.user.name}.`,
            );
          }}
        >
          <p className="text-sm text-slate-700">
            {dialog.self
              ? 'Rige desde la próxima consulta. Sólo la persona responsable puede volver a concederlo.'
              : 'Rige desde la próxima consulta de esa persona. Lo que haya copiado, impreso o capturado antes no se puede retirar desde aquí.'}
          </p>
        </ConfirmDialog>
      )}
    </AppShell>
  );
}

/** Sin `PARTICIPANTS`: ningún total por producto que dependiera del permiso queda a la vista hasta la próxima respuesta. */
function withoutParticipantsPermission(call: JointPurchaseCallDetail): JointPurchaseCallDetail {
  return {
    ...call,
    can_view_participants: false,
    my_grants: (call.my_grants ?? []).filter((grant) => grant !== 'PARTICIPANTS'),
    products: call.products.map((product) => ({
      ...product,
      totals: { participant_count: product.totals.participant_count, total_quantity_base: null, visibility: 'RESPONSIBLE_ONLY' },
    })),
  };
}

function isParticipantsForbidden(err: unknown): boolean {
  return callErrorCode(err) === 'PARTICIPANTS_FORBIDDEN' || (axios.isAxiosError(err) && err.response?.status === 403);
}

function grantsText(grants: JointPurchaseCallGrant[] | null | undefined, responsible: boolean): string {
  const labels = (grants ?? []).map((grant) => GRANT_LABEL[grant] ?? grant);
  if (labels.length === 0) return 'Ninguno';
  return responsible ? `${labels.join(' y ')} (persona responsable)` : labels.join(' y ');
}

function CallFacts({ call }: { call: JointPurchaseCallDetail }) {
  const facts: [string, ReactNode][] = [
    ['Campaña', call.campaign.name],
    ['Responsable', call.responsible.eligible === false ? `${call.responsible.name} (ya no está activa)` : call.responsible.name],
    ['Fecha límite', `${fmtDateTime(call.deadline_at)} (hora del servidor)`],
    ['Abierta el', call.opened_at ? fmtDateTime(call.opened_at) : 'Todavía no se abrió'],
  ];
  if (call.closed_at) facts.push(['Cerrada el', fmtDateTime(call.closed_at)]);
  if (call.cancelled_at) facts.push(['Cancelada el', fmtDateTime(call.cancelled_at)]);
  if (call.cancel_reason) facts.push(['Motivo de la cancelación', call.cancel_reason]);
  facts.push(['Participantes', participantsText(call.participant_count)]);
  if (typeof call.collaborator_count === 'number') facts.push(['Colaboradores', peopleText(call.collaborator_count)]);
  if (Array.isArray(call.my_grants)) facts.push(['Sus permisos', grantsText(call.my_grants, call.is_responsible)]);
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2" data-testid="call-facts">
      {facts.map(([term, value]) => (
        <div key={term} className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-slate-500">{term}:</dt>
          <dd className="min-w-0 text-slate-800 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function participantsText(count: number | null | undefined): string {
  if (count === null || count === undefined) return '—';
  return count === 1 ? '1 persona' : `${count} personas`;
}

function peopleText(count: number): string {
  return count === 0 ? 'Ninguno' : participantsText(count);
}

function ProductsTable({ call }: { call: JointPurchaseCallDetail }) {
  const showTotals = call.status === 'OPEN';
  if (call.products.length === 0) return <DataState compact state="empty" title="Sin productos" description="El borrador todavía no tiene productos." />;
  return (
    <DataTable caption="Productos de la convocatoria" minWidth={showTotals ? 720 : 520}>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Unidad</th>
          <th>Referencia</th>
          {showTotals && <th>Total solicitado</th>}
        </tr>
      </thead>
      <tbody>
        {call.products.map((product) => (
          <tr key={product.product_ref} data-testid={`call-product-${product.product_ref}`}>
            <td className="[overflow-wrap:anywhere]">{product.name}</td>
            <td>{product.unit}</td>
            <td className="text-xs text-slate-700">{product.reference ? referenceText(product.reference, product.base_unit) : 'Del catálogo, sin referencia'}</td>
            {showTotals && (
              <td className="text-sm">
                {/* Con `PARTICIPANTS`, un total retenido sólo puede deberse a participaciones ocultas (§10.3). */}
                <TotalCell
                  total={product.totals}
                  baseUnit={product.base_unit}
                  threshold={call.totals_threshold}
                  hidden={call.can_view_participants === true}
                  withCount
                />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/**
 * Total solicitado de un producto (E2-D7 / E2-P1 / §10.3). Si el servidor lo
 * retiene (`total_quantity_base: null`), se explica por qué; nunca se muestra
 * 0. El número de personas es un conteo y se muestra siempre.
 */
function TotalCell({
  total,
  baseUnit,
  threshold,
  hidden = false,
  withCount = false,
}: {
  total: JointPurchaseCallProductTotal;
  baseUnit: BaseUnit;
  threshold: number;
  /** `RESPONSIBLE_ONLY` por participaciones ocultas para quien consulta, no por E2-P1. */
  hidden?: boolean;
  withCount?: boolean;
}) {
  const count = withCount ? <span className="ml-1 text-xs text-slate-600">· {participantsText(total.participant_count)}</span> : null;
  if (total.visibility === 'VISIBLE' && total.total_quantity_base !== null) {
    return (
      <>
        <span className="tabular-nums">{quantityText(total.total_quantity_base, baseUnit)}</span>
        {count}
      </>
    );
  }
  return (
    <>
      <span className="text-xs text-slate-600" data-testid="hidden-total">
        {withheldTotalText(total.visibility, threshold, hidden)}
      </span>
      {count}
    </>
  );
}

interface ParticipantRow {
  participation_ref: string;
  name: string;
  /** Ausente en el consolidado al cierre: ahí sólo están las participaciones vigentes al corte. */
  status?: JointPurchaseParticipationStatus;
  accepted_at: string;
  lines: JointPurchaseParticipantLine[];
}

/** Tabla de participantes identificados: nombre, producto, cantidad solicitada, estado y hora de aceptación. Nada más. */
function ParticipantsTable({ participants, call, caption }: { participants: ParticipantRow[]; call: JointPurchaseCallDetail; caption: string }) {
  const showStatus = participants.some((participant) => participant.status !== undefined);
  const nameOf = (ref: string, fallback: string) => fallback || call.products.find((product) => product.product_ref === ref)?.name || '—';
  return (
    <DataTable caption={caption} minWidth={720}>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Producto</th>
          <th className="ui-num">Cantidad solicitada</th>
          {showStatus && <th>Estado</th>}
          <th>Aceptada el</th>
        </tr>
      </thead>
      <tbody>
        {participants.flatMap((participant) => {
          const lines = participant.lines.length > 0 ? participant.lines : [null];
          return lines.map((line, index) => (
            <tr key={`${participant.participation_ref}-${line?.product_ref ?? 'none'}`} data-testid="participant-row">
              <td className="[overflow-wrap:anywhere]">{index === 0 ? participant.name : ''}</td>
              <td className="[overflow-wrap:anywhere]">{line ? nameOf(line.product_ref, line.product_name) : 'Sin productos'}</td>
              <td className="ui-num">{line ? quantityText(line.quantity_base, line.base_unit) : '—'}</td>
              {showStatus && <td>{participant.status ? (PARTICIPATION_STATUS_LABEL[participant.status] ?? participant.status) : ''}</td>}
              <td>{fmtDateTime(participant.accepted_at)}</td>
            </tr>
          ));
        })}
      </tbody>
    </DataTable>
  );
}

/** §10.2: aviso de las participaciones con un consentimiento anterior, que sólo ve la persona responsable. */
function HiddenParticipantsNotice({ count, notice }: { count: number | null | undefined; notice: string | null | undefined }) {
  if (!count || count <= 0) return null;
  return (
    <Notice kind="info" compact>
      <span data-testid="hidden-participants-notice">{notice ?? hiddenParticipantsText(count)}</span>
    </Notice>
  );
}

/** El permiso se perdió mientras la página mostraba participantes (§10.2). */
function RevokedNotice() {
  return (
    <Notice kind="warn" compact>
      <span data-testid="participants-revoked">{PARTICIPANTS_REVOKED_TEXT}</span>
    </Notice>
  );
}

/** Participantes de una convocatoria abierta o cancelada; sólo con `can_view_participants`. */
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
  const allowed = call.can_view_participants === true;
  const open = call.status === 'OPEN';
  if (revoked || !allowed) {
    return (
      <Section title="Participantes" testId="participants-panel">
        <div className="px-5 py-4">
          {revoked ? (
            <RevokedNotice />
          ) : (
            <Notice kind="info" compact>
              <span data-testid="participants-forbidden">{PARTICIPANTS_FORBIDDEN_TEXT}</span>
            </Notice>
          )}
          <p className="mt-2 text-xs text-slate-600">Número de participantes: {participantsText(call.participant_count)}.</p>
        </div>
      </Section>
    );
  }
  const title = open ? 'Participantes (lista provisional)' : 'Participantes (convocatoria cancelada, sin consolidado)';
  // El aviso del servidor («Lista provisional…» mientras está abierta) manda; si no llegó, el propio.
  const notice = data?.notice ?? (open ? PROVISIONAL_NOTE : null);
  const hidden = data?.hidden_participant_count ?? 0;
  return (
    <Section title={title} note={notice ? <span data-testid="provisional-note">{notice}</span> : undefined} testId="participants-panel">
      {problem ? (
        <DataState compact state="error" description={problem} onRetry={onRetry} />
      ) : !data ? (
        <DataState compact state="loading" />
      ) : (
        <>
          {hidden > 0 && (
            <div className="px-5 pt-4">
              <HiddenParticipantsNotice count={hidden} notice={data.hidden_notice} />
            </div>
          )}
          {data.participants.length === 0 ? (
            <DataState
              compact
              state="empty"
              title="Sin participantes"
              description={hidden > 0 ? 'No hay participaciones que usted pueda ver.' : 'Todavía nadie confirmó su participación.'}
            />
          ) : (
            <ParticipantsTable participants={data.participants} call={call} caption="Participantes de la convocatoria" />
          )}
        </>
      )}
    </Section>
  );
}

/** «Consolidado al cierre» (E2-D13): cantidades solicitadas hasta el corte; detalle por persona según §10.3. */
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
  return (
    <Section
      title="Consolidado al cierre"
      note="Cantidades solicitadas hasta el corte, con la hora del servidor. No cambia después del cierre."
      testId="closing-panel"
    >
      {problem ? (
        <DataState compact state="error" description={problem} onRetry={onRetry} />
      ) : !closing ? (
        <div className="space-y-3 px-5 py-4">
          {revoked && <RevokedNotice />}
          <DataState compact state="loading" />
        </div>
      ) : (
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900" data-testid="closing-label">
            {closing.label}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiTile label="Corte" value={fmtDateTime(closing.cutoff_at)} note={`Cerrada el ${fmtDateTime(closing.closed_at)}`} testId="closing-cutoff" />
            <KpiTile
              label="Modo de cierre"
              value={CLOSE_MODE_LABEL[closing.mode] ?? closing.mode}
              note={closing.closed_by ? `Por ${closing.closed_by.name}` : 'Por el servidor'}
              testId="closing-mode"
            />
            <KpiTile label="Participantes" value={participantsText(closing.participant_count)} note="Cada persona cuenta una vez." testId="closing-participants" />
          </div>
          <p className="text-sm text-slate-700" data-testid="not-a-purchase">
            {NOT_A_PURCHASE_TEXT}
          </p>
          {closing.lines.length === 0 ? (
            <DataState compact state="empty" title="Sin cantidades solicitadas" description="Nadie tenía una participación vigente al corte." />
          ) : (
            <DataTable caption="Cantidades solicitadas por producto" minWidth={560}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="ui-num">Cantidad solicitada (total)</th>
                  <th className="ui-num">Personas</th>
                </tr>
              </thead>
              <tbody>
                {closing.lines.map((line) => (
                  <tr key={line.product_ref} data-testid={`closing-line-${line.product_ref}`}>
                    <td className="[overflow-wrap:anywhere]">{line.product_name}</td>
                    <td className="ui-num">
                      {/* En el consolidado, `RESPONSIBLE_ONLY` sólo se debe a participaciones ocultas para quien consulta (§10.3). */}
                      <TotalCell total={line} baseUnit={line.base_unit} threshold={closing.totals_threshold} hidden />
                    </td>
                    <td className="ui-num">{line.participant_count}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          {revoked ? (
            <RevokedNotice />
          ) : Array.isArray(closing.participants) && call.can_view_participants ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Detalle por participante</h3>
              <HiddenParticipantsNotice count={closing.hidden_participant_count} notice={closing.hidden_notice} />
              {closing.participants.length === 0 ? (
                <DataState
                  compact
                  state="empty"
                  title="Sin participantes"
                  description={
                    (closing.hidden_participant_count ?? 0) > 0
                      ? 'No hay participaciones que usted pueda ver.'
                      : 'Nadie tenía una participación vigente al corte.'
                  }
                />
              ) : (
                <ParticipantsTable participants={closing.participants} call={call} caption="Detalle por participante al cierre" />
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600" data-testid="closing-detail-hidden">
              El detalle por participante sólo lo ven la persona responsable de esta convocatoria y quienes ella autorice.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/**
 * §10.2: colaboradores vigentes e historial de concesiones y revocaciones.
 * Sólo la persona responsable concede (`DRAFT`, `OPEN` o `CLOSED`) y retira;
 * un colaborador puede renunciar a su propio permiso.
 */
function CollaboratorsSection({
  call,
  view,
  problem,
  userId,
  onRetry,
  onGrant,
  onRevoke,
}: {
  call: JointPurchaseCallDetail;
  view: JointPurchaseCallCollaborators | null;
  problem: string | null;
  userId: string | null;
  onRetry: () => void;
  onGrant: () => void;
  onRevoke: (user: JointPurchaseCallUserRef, grant: JointPurchaseCallGrant) => void;
}) {
  const canGrant = view?.can_grant === true;
  const grantable = canGrant && call.status !== 'CANCELLED';
  return (
    <Section
      title="Colaboradores"
      note="Personas de la Directiva o la Administración a quienes la persona responsable autorizó para esta convocatoria. Ningún rol concede permisos por sí solo."
      actions={grantable ? <Button onClick={onGrant}>Conceder permiso</Button> : undefined}
      testId="collaborators-panel"
    >
      {problem ? (
        <DataState compact state="error" description={problem} onRetry={onRetry} />
      ) : !view ? (
        <DataState compact state="loading" />
      ) : (
        <div className="space-y-3 pb-4">
          {view.collaborators.length === 0 ? (
            <DataState
              compact
              state="empty"
              title="Sin colaboradores"
              description="Sólo la persona responsable tiene permisos en esta convocatoria."
              testId="collaborators-empty"
            />
          ) : (
            <DataTable caption="Colaboradores de la convocatoria" minWidth={640}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Permisos</th>
                </tr>
              </thead>
              <tbody>
                {view.collaborators.map((person) => {
                  const self = person.user_ref === userId;
                  return (
                    <tr key={person.user_ref} data-testid={`collaborator-${person.user_ref}`}>
                      <td className="[overflow-wrap:anywhere]">
                        {person.name}
                        {self ? ' (usted)' : ''}
                      </td>
                      <td>{person.role ? (ROLE_LABEL[person.role] ?? person.role) : '—'}</td>
                      <td>
                        <ul className="space-y-2">
                          {person.grants.map((grant) => (
                            <li key={grant.grant} className="flex flex-wrap items-center gap-2" data-testid={`collaborator-grant-${person.user_ref}-${grant.grant}`}>
                              <span className="min-w-0">
                                <span className="font-semibold text-slate-900">{GRANT_LABEL[grant.grant] ?? grant.label}</span>
                                <span className="block text-xs text-slate-600">
                                  Concedido por {grant.granted_by.name} el {fmtDateTime(grant.granted_at)}
                                </span>
                              </span>
                              {self ? (
                                <Button size="sm" variant="secondary" onClick={() => onRevoke({ user_ref: person.user_ref, name: person.name }, grant.grant)}>
                                  Renunciar a este permiso
                                </Button>
                              ) : (
                                canGrant && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    aria-label={`Retirar «${GRANT_LABEL[grant.grant]}» a ${person.name}`}
                                    onClick={() => onRevoke({ user_ref: person.user_ref, name: person.name }, grant.grant)}
                                  >
                                    Retirar
                                  </Button>
                                )
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
          {canGrant && call.status === 'CANCELLED' && (
            <p className="px-5 text-xs text-slate-600">Una convocatoria cancelada no admite permisos nuevos; los vigentes se pueden retirar.</p>
          )}
          <div className="px-5">
            <Collapsible title="Historial de permisos" testId="access-history">
              {view.history.length === 0 ? (
                <DataState compact state="empty" title="Sin cambios" description="Nadie concedió ni retiró permisos en esta convocatoria." />
              ) : (
                <ol className="divide-y divide-slate-100" aria-label="Historial de permisos">
                  {view.history.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="px-5 py-2 text-sm" data-testid="access-history-event">
                      <span className="font-semibold text-slate-900">{accessActionText(entry.action, entry.user.user_ref === entry.actor.user_ref)}</span>
                      <span className="ml-2">
                        «{GRANT_LABEL[entry.grant] ?? entry.grant}» · {entry.user.name}
                      </span>
                      <span className="ml-2 text-xs text-slate-600">
                        · por {entry.actor.name} · {fmtDateTime(entry.at)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Collapsible>
          </div>
        </div>
      )}
    </Section>
  );
}

function accessActionText(action: 'GRANTED' | 'REVOKED', bySelf: boolean): string {
  if (action === 'GRANTED') return 'Concedido';
  return bySelf ? 'Renuncia' : 'Retirado';
}

/**
 * Conceder un permiso (§10.2): otro usuario activo de la Directiva o la
 * Administración, distinto de quien concede y de la persona responsable (el
 * servidor lo vuelve a comprobar: 422 `COLLABORATOR_NOT_ELIGIBLE`).
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
  const [grant, setGrant] = useState<JointPurchaseCallGrant>('PARTICIPANTS');
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
    <Modal title="Conceder permiso" onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className={labelClass} htmlFor="grant-user">
            Persona
          </label>
          {usersError ? (
            <DataState compact state="error" description={usersError} onRetry={() => void loadUsers()} />
          ) : users && candidates.length === 0 ? (
            <DataState
              compact
              state="empty"
              title="Sin personas disponibles"
              description="No hay otros usuarios activos de la Directiva o la Administración a quienes conceder permisos."
            />
          ) : (
            <select
              id="grant-user"
              className={inputClass}
              value={userRef}
              disabled={!users}
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
            </select>
          )}
          <p className="mt-1 text-xs text-slate-600">Otra persona de la Directiva o la Administración, distinta de usted y de la persona responsable.</p>
        </div>
        <fieldset className="space-y-2">
          <legend className={labelClass}>Permiso</legend>
          {GRANTS.map((option) => (
            <label key={option} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="grant"
                className="mt-0.5 shrink-0"
                checked={grant === option}
                onChange={() => {
                  setGrant(option);
                  setConfirmed(false);
                }}
              />
              <span className="min-w-0">
                <span className="font-semibold text-slate-900">{GRANT_LABEL[option]}</span>
                <span className="block text-xs text-slate-600">{GRANT_DESCRIPTION[option]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 shrink-0"
            checked={confirmed}
            disabled={!chosen}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {chosen
              ? `Confirmo que concedo «${GRANT_LABEL[grant]}» a ${chosen.name} en «${call.name}».`
              : 'Elija a la persona para confirmar.'}
          </span>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button onClick={() => void submit()} disabled={!ready}>
            {busy ? 'Guardando…' : 'Conceder permiso'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Confirmación (y motivo, si aplica) antes de una acción; el error del servidor se muestra aquí mismo. */
function ConfirmDialog({
  title,
  actionLabel,
  confirmText,
  variant = 'primary',
  withReason = false,
  children,
  onClose,
  onConfirm,
  onPermissionLost,
}: {
  title: string;
  actionLabel: string;
  confirmText: string;
  variant?: 'primary' | 'danger';
  withReason?: boolean;
  children: ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  /** §10.2: 403 `MANAGE_FORBIDDEN` o `COLLABORATORS_FORBIDDEN`: el permiso cambió; quien abrió el diálogo explica y recarga. */
  onPermissionLost?: (code: 'MANAGE_FORBIDDEN' | 'COLLABORATORS_FORBIDDEN') => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirmed && (!withReason || reason.trim().length > 0) && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
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

  return (
    <Modal title={title} onClose={onClose} size="lg">
      <div className="space-y-4">
        {children}
        {error && <Notice kind="error">{error}</Notice>}
        {withReason && (
          <div>
            <label className={labelClass} htmlFor="call-reason">
              Motivo
            </label>
            <textarea
              id="call-reason"
              className={inputClass}
              maxLength={MAX_REASON}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="call-reason-count"
            />
            <p id="call-reason-count" className="mt-1 text-xs text-slate-500">
              {reason.length} de {MAX_REASON} caracteres. Queda en el historial y en la bitácora.
            </p>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{confirmText}</span>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button variant={variant} onClick={() => void submit()} disabled={!ready}>
            {busy ? 'Guardando…' : actionLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
