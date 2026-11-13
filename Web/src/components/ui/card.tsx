import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  /** `surface` (blanca, por defecto), `sunken` (gris de las notas) o `ink` (oscura, texto claro). */
  tone?: 'surface' | 'sunken' | 'ink';
  /** Relleno interior: `none` para listas que llegan al borde. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Elemento: `section` y `article` necesitan `label` o un título dentro. */
  as?: 'div' | 'section' | 'article' | 'li';
  /** Nombre accesible de la región (sólo con `section`/`article`). */
  label?: string;
  className?: string;
  testId?: string;
}

const TONE = {
  surface: 'border border-line bg-surface shadow-card text-ink',
  sunken: 'bg-sunken text-ink',
  ink: 'ui-on-ink bg-ink text-white',
} as const;

const PADDING = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' } as const;

/** Tarjeta genérica muy redondeada (24 px). Para una sección con título use `Section`. */
export function Card({ children, tone = 'surface', padding = 'md', as: Tag = 'div', label, className, testId }: CardProps) {
  return (
    <Tag className={`min-w-0 rounded-card ${TONE[tone]} ${PADDING[padding]} ${className ?? ''}`} aria-label={label} data-testid={testId}>
      {children}
    </Tag>
  );
}
