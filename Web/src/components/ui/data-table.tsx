import type { Key, ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  /** Encabezado de la columna. */
  header: ReactNode;
  /** Texto del encabezado que se repite en cada tarjeta (pantalla estrecha); obligatorio si `header` no es texto. */
  label?: string;
  cell: (row: T) => ReactNode;
  /** Cifra: alineada a la derecha y en `tabular-nums` (`ui-num`). */
  numeric?: boolean;
  /** La celda nombra la fila (`<th scope="row">`), normalmente la primera. */
  rowHeader?: boolean;
}

export interface DataTableProps<T = unknown> {
  /** Título de la tabla para lectores de pantalla y nombre de la región desplazable. */
  caption?: string;
  /** Ancho mínimo de la tabla en px; por debajo, desplazamiento horizontal interno (salvo en modo apilado). */
  minWidth?: number;
  /** Alto máximo del contenedor; con él, la cabecera queda fija al desplazar. */
  maxHeight?: number | string;
  /** Modo libre: <thead> y <tbody> escritos por la vista. */
  children?: ReactNode;
  /** Modo declarativo: columnas y filas. Con él, en estrecho cada fila pasa a tarjeta (ver `stack`). */
  columns?: DataTableColumn<T>[];
  rows?: readonly T[];
  rowKey?: (row: T, index: number) => Key;
  /**
   * Sólo en modo declarativo. `true` por defecto: por debajo de 640 px cada fila
   * es una tarjeta y cada celda repite su encabezado. `false`: desplazamiento
   * horizontal interno, como en el modo libre.
   */
  stack?: boolean;
  testId?: string;
}

function headerText(column: DataTableColumn<unknown>): string {
  if (column.label) return column.label;
  return typeof column.header === 'string' || typeof column.header === 'number' ? String(column.header) : column.key;
}

/**
 * Tabla legible: desplazamiento horizontal dentro del contenedor (la página no
 * se desplaza a lo ancho en un teléfono), región enfocable con teclado,
 * cabecera pegajosa, cifras en `tabular-nums` (`ui-num` alinea a la derecha).
 * En modo declarativo (`columns` + `rows`), en estrecho cada fila es una
 * tarjeta que conserva la asociación encabezado→valor (`data-label`).
 */
export function DataTable<T>({ caption, minWidth, maxHeight, children, columns, rows, rowKey, stack = true, testId }: DataTableProps<T>) {
  const declarative = columns !== undefined && rows !== undefined;
  const stacked = declarative && stack;
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
      <table className={stacked ? 'ui-table ui-table-stack' : 'ui-table'} style={minWidth !== undefined ? { minWidth } : undefined}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {declarative ? (
          <>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className={column.numeric ? 'ui-num' : undefined}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={rowKey ? rowKey(row, index) : index}>
                  {columns.map((column) => {
                    const label = headerText(column as DataTableColumn<unknown>);
                    const cls = column.numeric ? 'ui-num' : undefined;
                    return column.rowHeader ? (
                      <th key={column.key} scope="row" data-label={label} className={cls}>
                        {column.cell(row)}
                      </th>
                    ) : (
                      <td key={column.key} data-label={label} className={cls}>
                        {column.cell(row)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </>
        ) : (
          children
        )}
      </table>
    </div>
  );
}
