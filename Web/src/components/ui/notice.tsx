import type { ReactNode } from 'react';
import { ICON } from './icon-paths';
import { Icon } from './icons';
import type { NoticeKind } from './types';

/** Fondos llenos de las láminas (05, 30): aviso ámbar, error rosado, correcto lima, información gris. */
const NOTICE: Record<NoticeKind, { cls: string; icon: string }> = {
  ok: { cls: 'bg-lime-soft text-lime-ink', icon: ICON.tick },
  error: { cls: 'bg-danger-bg text-danger-ink', icon: ICON.warn },
  warn: { cls: 'bg-warn-bg text-warn-ink', icon: ICON.warn },
  info: { cls: 'bg-sunken text-ink', icon: ICON.info },
};

/**
 * Aviso con icono decorativo + texto; el texto lleva el significado.
 * `title` añade una primera línea en negrita y `action` un botón propio de la vista.
 */
export function Notice({ kind, children, compact = false, title, action }: { kind: NoticeKind; children: ReactNode; compact?: boolean; title?: ReactNode; action?: ReactNode }) {
  const config = NOTICE[kind];
  return (
    <div className={`flex items-start gap-3 ${compact ? 'rounded-[14px] px-3 py-2 text-xs' : 'rounded-[18px] px-4 py-3.5 text-sm'} leading-relaxed ${config.cls}`} data-kind={kind}>
      <Icon d={config.icon} className={compact ? 'mt-px h-4 w-4' : 'mt-0.5 h-5 w-5'} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children}
        {action && <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}
