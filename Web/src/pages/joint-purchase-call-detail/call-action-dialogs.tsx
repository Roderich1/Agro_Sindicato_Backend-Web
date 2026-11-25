import { useState } from 'react';
import { ConfirmDialog, type ConfirmDialogProps } from '../../components/ui';
import {
  callError,
  callErrorCode,
  CLOSE_IMPLICATIONS,
  fmtWhen,
  GRANT_ACCESS_NOTE,
  GRANT_LABEL,
  GRANT_LOSS,
  OPEN_ACCESS_LINE,
  OPEN_IMPLICATIONS,
} from '../../lib/joint-purchase-call-text';
import { jointPurchaseCallsService } from '../../services/joint-purchase-calls.service';
import type { JointPurchaseCallCollaborators, JointPurchaseCallDetail } from '../../types/joint-purchase-calls';
import { JointPurchaseCallForm } from '../joint-purchase-call-form';
import { GrantDialog, SubstituteDialog } from './call-delegation-dialogs';
import { MAX_REASON, type DialogState, type PermissionLostCode } from './call-detail.helpers';

/** Confirmación de una acción (H-16, láminas 15, 34.2 y 46) sobre `ConfirmDialog`. */
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

export function CallDetailDialogs({
  call,
  dialog,
  userId,
  onClose,
  onDone,
  onLostPermission,
  onCollaboratorsChanged,
  onReloadAfterSubstitute,
  onSubstituteDone,
}: {
  call: JointPurchaseCallDetail;
  dialog: DialogState | null;
  userId: string | null;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
  onLostPermission: (code: PermissionLostCode) => Promise<void>;
  onCollaboratorsChanged: (view: JointPurchaseCallCollaborators, text: string) => Promise<void>;
  onReloadAfterSubstitute: (text: string) => void;
  onSubstituteDone: (text: string) => void;
}) {
  return (
    <>
      {dialog?.kind === 'edit' && (
        <JointPurchaseCallForm
          campaignId={call.campaign.campaign_ref}
          campaignName={call.campaign.name}
          call={call}
          onClose={onClose}
          onSaved={({ text }) => void onDone(text)}
          onManageForbidden={() => void onLostPermission('MANAGE_FORBIDDEN')}
        />
      )}
      {dialog?.kind === 'open' && (
        <ActionDialog
          title="Abrir la convocatoria"
          confirmLabel="Abrir convocatoria"
          acknowledgement={`Confirmo que se abre «${call.name}».`}
          onCancel={onClose}
          onPermissionLost={(code) => void onLostPermission(code)}
          run={async () => {
            await jointPurchaseCallsService.open(call.call_id);
            await onDone('Convocatoria abierta. Los agricultores la verán al actualizar su aplicación.');
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
          onCancel={onClose}
          onPermissionLost={(code) => void onLostPermission(code)}
          run={async () => {
            await jointPurchaseCallsService.close(call.call_id);
            await onDone('Convocatoria cerrada. El consolidado al cierre ya no cambia.');
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
          onCancel={onClose}
          onPermissionLost={(code) => void onLostPermission(code)}
          run={async (reason) => {
            await jointPurchaseCallsService.cancel(call.call_id, reason);
            await onDone('Convocatoria cancelada.');
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
          onClose={onClose}
          onGranted={(view, text) => void onCollaboratorsChanged(view, text)}
          onForbidden={() => void onLostPermission('COLLABORATORS_FORBIDDEN')}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <ActionDialog
          title={dialog.self ? 'Renunciar a este permiso' : 'Retirar el permiso'}
          confirmLabel={dialog.self ? 'Renunciar a este permiso' : 'Retirar permiso'}
          tone="danger"
          acknowledgement={dialog.self ? 'Confirmo que renuncio a este permiso.' : 'Confirmo que retiro este permiso.'}
          onCancel={onClose}
          onPermissionLost={(code) => void onLostPermission(code)}
          run={async () => {
            const view = await jointPurchaseCallsService.revoke(call.call_id, dialog.user.user_ref, dialog.grant);
            await onCollaboratorsChanged(
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
          onCancel={onClose}
          onPermissionLost={(code) => void onLostPermission(code)}
          run={async () => {
            const view = await jointPurchaseCallsService.reviewDelegation(call.call_id, dialog.user.user_ref, dialog.grant, dialog.decision);
            await onCollaboratorsChanged(
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
          onClose={onClose}
          onDone={onSubstituteDone}
          onChanged={onReloadAfterSubstitute}
        />
      )}
    </>
  );
}
