import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';
import { Checkbox, Textarea } from './field';
import { Notice } from './notice';

export interface ConfirmReason {
  /** «Motivo» por defecto. */
  label?: string;
  /** «Obligatorio. Queda en el historial.» por defecto si es obligatorio; si no, «Opcional.». */
  help?: string;
  /** true por defecto: la acción no se habilita sin un motivo (sin contar espacios). */
  required?: boolean;
  maxLength?: number;
}

export interface ConfirmDialogProps {
  title: ReactNode;
  /** Consecuencias de la acción (lista o párrafo), escritas por la vista. */
  children?: ReactNode;
  confirmLabel: string;
  /** «Volver» por defecto. */
  cancelLabel?: string;
  /** `danger` para acciones destructivas (cancelar, inactivar): botón rojo y `alertdialog`. */
  tone?: 'primary' | 'danger';
  /** Pide un motivo (campo de texto). */
  reason?: ConfirmReason;
  /** Casilla «Confirmo que…»: la acción no se habilita hasta marcarla. */
  acknowledgement?: ReactNode;
  /** Envío en curso: deshabilita los botones y bloquea el cierre. */
  busy?: boolean;
  /** Error del servidor, mostrado dentro del diálogo; el motivo escrito se conserva. */
  error?: ReactNode;
  /** Recibe el motivo sin espacios sobrantes ('' si no se pidió). La vista hace la llamada real. */
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  testId?: string;
}

/**
 * Confirmación de una acción con consecuencias (láminas 15, 30, 34 y 46): texto
 * de consecuencias, motivo opcional u obligatorio, casilla «Confirmo que…» y dos
 * botones («Volver» y la acción). No llama a la API: entrega el motivo a la
 * vista. Un motivo escrito cuenta como borrador: Esc o el velo no lo pierden
 * sin preguntar. En teléfono es una hoja inferior con la acción arriba.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Volver',
  tone = 'primary',
  reason,
  acknowledgement,
  busy = false,
  error,
  onConfirm,
  onCancel,
  testId,
}: ConfirmDialogProps) {
  const [text, setText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const reasonRequired = reason ? reason.required !== false : false;
  const trimmed = text.trim();
  const ready = (!reasonRequired || trimmed.length > 0) && (!acknowledgement || acknowledged);
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      dirty={text.length > 0}
      busy={busy}
      hideCloseButton
      role={tone === 'danger' ? 'alertdialog' : 'dialog'}
      testId={testId}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => onConfirm(trimmed)} disabled={!ready} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-base leading-relaxed text-ink [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
        {reason && (
          <Textarea
            label={reason.label ?? 'Motivo'}
            help={reason.help ?? (reasonRequired ? 'Obligatorio. Queda en el historial.' : 'Opcional.')}
            required={reasonRequired}
            maxLength={reason.maxLength}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={busy}
          />
        )}
        {acknowledgement && (
          <Checkbox label={acknowledgement} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} />
        )}
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}
