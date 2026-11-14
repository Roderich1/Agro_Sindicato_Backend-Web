import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton } from './button';
import { ICON } from './icon-paths';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  /** Título del diálogo (`<h2>`), que también es su nombre accesible. */
  title: ReactNode;
  /** Texto introductorio; queda como descripción accesible (`aria-describedby`). */
  description?: ReactNode;
  children?: ReactNode;
  /** Botones del pie, en orden de lectura: primero «Volver»/«Cancelar», después la acción. En teléfono se apilan con la acción arriba. */
  footer?: ReactNode;
  /** Cierre pedido por Esc, el velo o la «X». Con `dirty`, antes se pregunta si descartar. */
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  /** Hay un borrador sin guardar: Esc, el velo y la «X» no cierran sin confirmar el descarte. */
  dirty?: boolean;
  /** Bloquea todo cierre (p. ej. mientras se envía). */
  busy?: boolean;
  /** Control que recibe el foco al abrir; si falta, el primer campo y, si no hay, el panel. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Oculta la «X» cuando el pie ya tiene «Volver» o «Cancelar». */
  hideCloseButton?: boolean;
  /** `alertdialog` para confirmaciones destructivas. */
  role?: 'dialog' | 'alertdialog';
  /** Nombre accesible explícito (`aria-label`) en lugar del título; lo usa `Modal` por compatibilidad. */
  label?: string;
  /** Teléfono (< 640 px): pantalla completa en lugar de hoja inferior (formularios largos, láminas 45 y 49). */
  fullScreenOnPhone?: boolean;
  testId?: string;
}

/**
 * Diálogo modal accesible (láminas 15, 30, 33, 34 y 46).
 * - Foco: al abrir, en `initialFocusRef`, el primer campo o el panel; Tab y
 *   Mayús+Tab no salen del diálogo; al cerrar vuelve al control que lo abrió.
 * - Cierre: Esc, el velo o la «X» (si se muestra); el pie decide sus botones.
 *   Con `dirty`, esos cierres piden confirmar el descarte del borrador.
 * - Teléfono (< 640 px): hoja inferior a todo el ancho, con el pie apilado.
 * - Se dibuja en un portal sobre `document.body` y bloquea el desplazamiento de la página.
 */
export function Dialog({
  title,
  description,
  children,
  footer,
  onClose,
  size = 'md',
  dirty = false,
  busy = false,
  initialFocusRef,
  hideCloseButton = false,
  role = 'dialog',
  label,
  fullScreenOnPhone = false,
  testId,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const titleId = `${uid}-titulo`;
  const descId = description ? `${uid}-desc` : undefined;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Último estado leído por los manejadores sin volver a registrar los efectos.
  const state = useRef({ dirty, busy, onClose });
  useEffect(() => {
    state.current = { dirty, busy, onClose };
  });

  const requestClose = useCallback(() => {
    if (state.current.busy) return;
    if (state.current.dirty) setConfirmDiscard(true);
    else state.current.onClose();
  }, []);

  useEffect(() => {
    if (confirmDiscard) keepRef.current?.focus();
  }, [confirmDiscard]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>('[data-autofocus], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])');
    (initialFocusRef?.current ?? firstField ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key === 'Tab' && panel) {
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (opener && opener.isConnected) opener.focus();
    };
    // Sólo al abrir y cerrar: `requestClose` y la referencia son estables.
  }, [requestClose, initialFocusRef]);

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' } as const;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" data-testid={testId}>
      <div className="modal-backdrop absolute inset-0" aria-hidden="true" onClick={requestClose} />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={label ? undefined : titleId}
        aria-label={label}
        aria-describedby={descId}
        tabIndex={-1}
        className={`ui-dialog-panel ui-safe-bottom relative flex w-full flex-col bg-surface shadow-raised focus:outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-card ${
          fullScreenOnPhone ? 'ui-safe-top h-dvh max-h-dvh sm:h-auto' : 'max-h-[92dvh] rounded-t-[28px]'
        } ${widths[size]}`}
        data-fullscreen-phone={fullScreenOnPhone || undefined}
      >
        {/* Asa decorativa de la hoja inferior (lámina 46); no en pantalla completa. */}
        {!fullScreenOnPhone && <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-track sm:hidden" aria-hidden="true" />}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 sm:px-8 sm:pt-8">
          <h2 id={titleId} className="min-w-0 text-2xl font-extrabold leading-tight text-ink sm:text-[1.75rem]">
            {title}
          </h2>
          {!hideCloseButton && <IconButton label="Cerrar" icon={ICON.close} size="sm" onClick={requestClose} disabled={busy} className="-mr-2 -mt-1" />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-2 pt-4 sm:px-8">
          {description && (
            <div id={descId} className="mb-4 text-base leading-relaxed text-ink-muted">
              {description}
            </div>
          )}
          {children}
        </div>
        {confirmDiscard && (
          <div role="alert" className="mx-6 mb-2 rounded-[18px] bg-warn-bg px-4 py-3 text-sm text-warn-ink sm:mx-8">
            <p className="font-semibold">Hay cambios sin guardar. ¿Descartarlos?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button ref={keepRef} size="sm" variant="secondary" onClick={() => setConfirmDiscard(false)}>
                Seguir editando
              </Button>
              <Button size="sm" variant="danger" onClick={() => onClose()}>
                Descartar cambios
              </Button>
            </div>
          </div>
        )}
        {footer && <div className="flex flex-col-reverse gap-3 px-6 pb-6 pt-4 sm:flex-row sm:flex-wrap sm:justify-end sm:px-8 sm:pb-8 [&>*]:w-full sm:[&>*]:w-auto">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
