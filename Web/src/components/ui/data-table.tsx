import type { ReactNode } from 'react';

export interface DataTableProps {
  /** Título de la tabla para lectores de pantalla y nombre de la región desplazable. */
  caption?: string;
  /** Ancho mínimo de la tabla en px; por debajo, desplazamiento horizontal interno. */
  minWidth?: number;
  /** Alto máximo del contenedor; con él, la cabecera queda fija al desplazar. */
  maxHeight?: number | string;
  /** <thead> y <tbody>. */
  children: ReactNode;
  testId?: string;
}

/**
 * Tabla legible: desplazamiento horizontal dentro del contenedor (la página no
 * se desplaza a lo ancho en un teléfono), región enfocable con teclado,
 * cabecera pegajosa, cifras en `tabular-nums` (`ui-num` alinea a la derecha).
 */
export function DataTable({ caption, minWidth, maxHeight, children, testId }: DataTableProps) {
  return (
    <div
      className="ui-table-scroll"
      role="region"
      aria-label={caption ?? 'Tabla'}
      // Enfocable para desplazarla con el teclado cuando no cabe.
      tabIndex={0}
      style={maxHeight !== undefined ? { maxHeight } : undefined}
      data-testid={testId}
    >
      <table className="ui-table" style={minWidth !== undefined ? { minWidth } : undefined}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
