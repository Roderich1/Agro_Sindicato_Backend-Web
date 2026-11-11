import { useId, type ReactNode } from 'react';
import { surfaceClass } from './classes';

export interface SectionHeaderProps {
  title: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  /** id del <h2>, para `aria-labelledby`. */
  headingId?: string;
}

/** Cabecera de una sección en tarjeta: título breve y, si hace falta, una línea de contexto. */
export function SectionHeader({ title, note, actions, badge, headingId }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-ink" id={headingId}>
            {title}
          </h2>
          {badge}
        </div>
        {note && <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{note}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface SectionProps extends Partial<Omit<SectionHeaderProps, 'headingId'>> {
  children: ReactNode;
  /** Nombre accesible de la región cuando `title` no es texto. */
  label?: string;
  testId?: string;
}

/** Tarjeta de sección con borde y fondo sólido; con `title`, se etiqueta con su <h2>. */
export function Section({ title, note, actions, badge, children, label, testId }: SectionProps) {
  const headingId = useId();
  const hasHeader = title !== undefined && title !== null;
  return (
    <section
      className={`${surfaceClass} overflow-hidden`}
      aria-labelledby={hasHeader && !label ? headingId : undefined}
      aria-label={label}
      data-testid={testId}
    >
      {hasHeader && <SectionHeader title={title} note={note} actions={actions} badge={badge} headingId={headingId} />}
      {children}
    </section>
  );
}
