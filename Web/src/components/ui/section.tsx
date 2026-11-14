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

/** Cabecera de una sección en tarjeta: título (Bricolage) y, si hace falta, una línea de contexto y acciones. */
export function SectionHeader({ title, note, actions, badge, headingId }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-5 sm:px-7 sm:pt-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold leading-tight text-ink sm:text-2xl" id={headingId}>
            {title}
          </h2>
          {badge}
        </div>
        {note && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{note}</p>}
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

/** Tarjeta de sección blanca, muy redondeada (láminas 03 y 21); con `title`, se etiqueta con su <h2>. */
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
