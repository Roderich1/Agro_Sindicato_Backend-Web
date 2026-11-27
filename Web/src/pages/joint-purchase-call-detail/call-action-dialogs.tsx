import { useState } from 'react';
import { ConfirmDialog, type ConfirmDialogProps } from '../../components/ui';
import {
  callError,
  callErrorCode,
  CLOSE_IMPLICATIONS,
  fmtWhen,
  OPEN_ACCESS_LINE,
  OPEN_IMPLICATIONS,
} from '../../lib/joint-purchase-call-text';
import { jointPurchaseCallsService } from '../../services/joint-purchase-calls.service';
import type { JointPurchaseCallDetail } from '../../types/joint-purchase-calls';
import { JointPurchaseCallForm } from '../joint-purchase-call-form';
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
  onClose,
  onDone,
  onLostPermission,
}: {
  call: JointPurchaseCallDetail;
  dialog: DialogState | null;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
  onLostPermission: (code: PermissionLostCode) => Promise<void>;
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
    </>
  );
}
