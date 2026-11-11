import type { ReactNode } from 'react';
import { ICON } from './icon-paths';
import { Icon } from './icons';
import type { NoticeKind } from './types';

const NOTICE: Record<NoticeKind, { cls: string; icon: string }> = {
  ok: { cls: 'border-brand-100 bg-brand-50 text-brand-800', icon: ICON.check },
  error: { cls: 'border-red-200 bg-red-50 text-red-800', icon: ICON.alert },
  warn: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: ICON.warn },
  info: { cls: 'border-slate-200 bg-slate-50 text-slate-800', icon: ICON.info },
};

/** Aviso con icono decorativo + texto; el texto lleva el significado. */
export function Notice({ kind, children, compact = false }: { kind: NoticeKind; children: ReactNode; compact?: boolean }) {
  const config = NOTICE[kind];
  return (
    <div className={`flex items-start gap-3 rounded-card border ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} ${config.cls}`} data-kind={kind}>
      <Icon d={config.icon} className={compact ? 'mt-px h-4 w-4' : 'h-5 w-5'} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
