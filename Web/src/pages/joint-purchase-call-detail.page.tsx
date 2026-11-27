import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { CallHero, HeroDangerButton } from '../components/b/call-hero';
import { ActivityTimeline, CallCard, LockLine } from '../components/b/call-ui';
import { Button, buttonClassFor, DataState, Notice, StatusChip } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { CALL_STATUS_CHIP } from '../lib/joint-purchase-call-text';
import type { JointPurchaseCallDetail } from '../types/joint-purchase-calls';
import { CallDetailDialogs } from './joint-purchase-call-detail/call-action-dialogs';
import { heroFacts, type DialogState } from './joint-purchase-call-detail/call-detail.helpers';
import { ClosingPanel, ParticipantsPanel } from './joint-purchase-call-detail/call-participants-closing';
import { CallProvenance, ProductsCard } from './joint-purchase-call-detail/call-products-and-footnote';
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
  return <CallDetail key={context} id={id} />;
}

function CallDetail({ id }: Readonly<{ id: string }>) {
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

  return (
    <AppShell title={call.name} section="Colectivo">
      <div className="flex flex-col gap-5 pb-4">
        <CallHero
          title={call.name}
          backTo={vm.backTo}
          eyebrow={`Compra conjunta · ${call.campaign.name}`}
          chips={<StatusChip status={CALL_STATUS_CHIP[call.status] ?? call.status} testId="call-status" />}
          facts={heroFacts(call, vm.closing)}
          actions={callActions(call, vm.setDialog)}
        />

        {vm.alert && (
          <Notice kind="warn">
            <span data-testid="call-alert">{vm.alert}</span>
          </Notice>
        )}
        {vm.message && <Notice kind="ok">{vm.message}</Notice>}
        {call.status === 'CANCELLED' && call.cancel_reason && (
          <Notice kind="error">
            <span data-testid="cancel-reason">{call.cancel_reason}</span>
          </Notice>
        )}
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

          <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-start-1">
            <CallProvenance call={call} />
            <ActivityTimeline history={call.history} changes={call.responsible_changes} />
          </div>
        </div>
      </div>

      <CallDetailDialogs
        call={call}
        dialog={vm.dialog}
        onClose={() => vm.setDialog(null)}
        onDone={vm.done}
        onLostPermission={vm.lostPermission}
      />
    </AppShell>
  );
}

function callActions(call: JointPurchaseCallDetail, openDialog: (dialog: DialogState) => void) {
  const canManage = call.can_manage === true;
  const canEnd = canManage || call.can_cancel_or_close === true;
  if (!canEnd || (call.status !== 'DRAFT' && call.status !== 'OPEN')) return;

  return (
    <>
      <HeroDangerButton onClick={() => openDialog({ kind: 'cancel' })}>Cancelar convocatoria…</HeroDangerButton>
      {call.status === 'DRAFT' && canManage && (
        <>
          <Button variant="on-dark" onClick={() => openDialog({ kind: 'edit' })}>
            Editar
          </Button>
          <Button variant="accent" onClick={() => openDialog({ kind: 'open' })}>
            Abrir convocatoria…
          </Button>
        </>
      )}
      {call.status === 'OPEN' && (
        <Button variant="accent" onClick={() => openDialog({ kind: 'close' })}>
          Cerrar y consolidar…
        </Button>
      )}
    </>
  );
}
