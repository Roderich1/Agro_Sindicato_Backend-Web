import type { ReactNode } from 'react';
import { Dialog, StatusChip } from '../ui';
import { ROLE_BADGE_COLORS, ROLE_LABELS } from './app-shell.helpers';

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="skeleton h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function EmptyState({ icon, title, description, compact = false }: { icon?: ReactNode; title: string; description?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-7' : 'py-16'}`}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-sunken text-ink" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>}
    </div>
  );
}

/**
 * Tarjeta de cifra de las vistas heredadas (bitácora). `color` se conserva en
 * la firma pero no tiñe el icono (un solo acento).
 */
export function StatCard({ label, value, icon, trend }: { label: string; value: string | number; icon?: ReactNode; trend?: string; color?: 'emerald' | 'red' | 'amber' | 'sky' | 'violet' | 'slate' }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-ink tabular-nums">{value}</p>
          {trend && <p className="mt-1 text-xs font-medium text-ink-muted">{trend}</p>}
        </div>
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-sunken text-ink" aria-hidden="true">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/** Unificado en `StatusChip` (components/ui): mismos textos, motivo de divulgación en `title`. */
export function StatusBadge({ status }: { status: string }) {
  return <StatusChip status={status} />;
}

export function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_BADGE_COLORS[role] ?? 'bg-sunken text-ink ring-ink/15';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>{ROLE_LABELS[role] ?? role}</span>;
}

/**
 * Diálogo heredado: ahora delega en `Dialog` (components/ui), con foco inicial,
 * trampa de foco, Esc, retorno del foco y hoja inferior en el teléfono.
 */
export function Modal({ title, children, onClose, size = 'md' }: { title: string; children: ReactNode; onClose: () => void; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Dialog title={title} label={title} onClose={onClose} size={size}>
      <div className="pb-6">{children}</div>
    </Dialog>
  );
}
