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
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-base font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-7 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="ml-auto text-sm font-semibold text-link group-open:hidden">Ver</span>
        <span className="ml-auto hidden text-sm font-semibold text-ink-muted group-open:inline">Ocultar</span>
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}
