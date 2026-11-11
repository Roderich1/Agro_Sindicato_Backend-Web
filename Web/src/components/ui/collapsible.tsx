import type { ReactNode } from 'react';
import { surfaceClass } from './classes';

export interface CollapsibleProps {
  title: string;
  children: ReactNode;
  testId?: string;
  /** Nombre accesible; `title` por defecto. */
  label?: string;
  defaultOpen?: boolean;
}

/** Sección secundaria plegada: lo que no hace falta para decidir, a un clic. Sin animación. */
export function Collapsible({ title, children, testId, label, defaultOpen = false }: CollapsibleProps) {
  return (
    <details className={`${surfaceClass} group overflow-hidden`} data-testid={testId} aria-label={label ?? title} open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700">
        {title}
        <span className="text-xs font-medium text-brand-800 group-open:hidden">Ver</span>
        <span className="hidden text-xs font-medium text-slate-600 group-open:inline">Ocultar</span>
      </summary>
      <div className="border-t border-slate-100">{children}</div>
    </details>
  );
}
