import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { CallHero, HeroDangerButton } from '../components/b/call-hero';
import { ActivityTimeline, CallCard, LockLine } from '../components/b/call-ui';
import { Button, buttonClassFor, Chip, DataState, Notice, StatusChip } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import {
  CALL_STATUS_CHIP,
  fmtWhen,
  GRANT_LABEL,
  NEW_RESPONSIBLE_POINTS,
  RESPONSIBLE_INELIGIBLE_TITLE,
  RESPONSIBLE_INELIGIBLE_WHO,
  responsibleIneligibleBody,
  WHAT_NEXT_TEXT,
} from '../lib/joint-purchase-call-text';
import { CallDetailDialogs } from './joint-purchase-call-detail/call-action-dialogs';
import { CollaboratorsSection } from './joint-purchase-call-detail/call-collaborators-section';
import { fmtShortDay, heroFacts, myRevokedGrants } from './joint-purchase-call-detail/call-detail.helpers';
import { ClosingPanel, ParticipantsPanel } from './joint-purchase-call-detail/call-participants-closing';
import { CallFootnote, ProductsCard } from './joint-purchase-call-detail/call-products-and-footnote';
import { useCallDetail } from './joint-purchase-call-detail/use-call-detail';

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

function CallDetail({ id, userId, userName }: { id: string; userId: string | null; userName: string }) {
  const vm = useCallDetail(id);

  if (vm.problem || !vm.call) {
    return (
      <AppShell title="Convocatoria" section="Colectivo">
        <div className="space-y-4">
          <Link to={vm.backTo} className={buttonClassFor('secondary', 'sm')}>
            Volver a las convocatorias
          </Link>
          {vm.problem ? (
            <DataState
              state={vm.problem.forbidden ? 'forbidden' : 'error'}
              description={vm.problem.message}
              onRetry={vm.problem.forbidden ? undefined : () => void vm.refresh()}
              testId="call-error"
            />
          ) : (
            <DataState state="loading" skeletonRows={4} testId="call-loading" />
          )}
        </div>
      </AppShell>
    );
  }

  const call = vm.call;
  const canManage = call.can_manage === true;
  const canEnd = canManage || call.can_cancel_or_close === true;
  const active = call.status === 'DRAFT' || call.status === 'OPEN';
  const responsibleIneligible = call.responsible.eligible === false && call.status !== 'CANCELLED';
  const lastChange = call.responsible_changes.at(-1) ?? null;
  const newResponsible = call.is_responsible && lastChange !== null && lastChange.next.user_ref === userId;
  const revokedGrants = myRevokedGrants(vm.collaborators, userId, call.is_responsible);
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
      {active && canEnd && <HeroDangerButton onClick={() => vm.setDialog({ kind: 'cancel' })}>Cancelar convocatoria…</HeroDangerButton>}
      {call.status === 'DRAFT' && canManage && (
        <>
          <Button variant="on-dark" onClick={() => vm.setDialog({ kind: 'edit' })}>
            Editar
          </Button>
          <Button variant="accent" onClick={() => vm.setDialog({ kind: 'open' })}>
            Abrir convocatoria…
          </Button>
        </>
      )}
      {call.status === 'OPEN' && canEnd && (
        <Button variant="accent" onClick={() => vm.setDialog({ kind: 'close' })}>
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
          backTo={vm.backTo}
          eyebrow={`Compra conjunta · ${call.campaign.name}`}
          chips={chips}
          facts={heroFacts(call, vm.closing)}
          actions={hasActions ? actions : undefined}
        />

        {vm.alert && (
          <Notice kind="warn">
            <span data-testid="call-alert">{vm.alert}</span>
          </Notice>
        )}
        {vm.message && <Notice kind="ok">{vm.message}</Notice>}
        {responsibleIneligible && (
          <Notice
            kind="warn"
            action={
              call.can_substitute_responsible ? (
                <Button onClick={() => vm.setDialog({ kind: 'substitute' })} data-testid="substitute-open">
                  Sustituir responsable…
                </Button>
              ) : undefined
            }
          >
            <span data-testid="responsible-ineligible">
              <strong>{RESPONSIBLE_INELIGIBLE_TITLE}</strong> {responsibleIneligibleBody(call.status)}
            </span>
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
              <ClosingPanel call={call} data={vm.closing} problem={vm.closingProblem} revoked={vm.revoked} onRetry={() => void vm.refresh()} />
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
                  <ParticipantsPanel call={call} data={vm.participants} problem={vm.participantsProblem} revoked={vm.revoked} onRetry={() => void vm.refresh()} />
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
              view={vm.collaborators}
              problem={vm.collaboratorsProblem}
              userId={userId}
              revokedGrants={revokedGrants}
              userName={userName}
              onRetry={() => void vm.loadCollaborators()}
              onGrant={() => vm.setDialog({ kind: 'grant' })}
              onRevoke={(user, grant) => vm.setDialog({ kind: 'revoke', user, grant, self: user.user_ref === userId })}
              onReview={(user, grant, decision) => vm.setDialog({ kind: 'review', user, grant, decision })}
            />
          </div>

          <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-start-2">
            <ActivityTimeline history={call.history} changes={call.responsible_changes} />
            <CallFootnote call={call} canManage={canManage} responsibleIneligible={responsibleIneligible} />
          </div>
        </div>
      </div>

      <CallDetailDialogs
        call={call}
        dialog={vm.dialog}
        userId={userId}
        onClose={() => vm.setDialog(null)}
        onDone={vm.done}
        onLostPermission={vm.lostPermission}
        onCollaboratorsChanged={vm.collaboratorsChanged}
        onSubstituteDone={(text) => void Promise.all([vm.done(text), vm.loadCollaborators()])}
        onReloadAfterSubstitute={(text) => {
          vm.setDialog(null);
          vm.setMessage(null);
          vm.setAlert(text);
          void Promise.all([vm.refresh(), vm.loadCollaborators()]);
        }}
      />
    </AppShell>
  );
}
