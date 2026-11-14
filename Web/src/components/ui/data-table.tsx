import { useLayoutEffect, useRef, type Key, type ReactNode } from 'react';

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
  /** Modo declarativo: `data-testid` de cada fila (`<tr>`). */
  rowTestId?: (row: T, index: number) => string | undefined;
  /**
   * Por debajo de 640 px cada fila es una tarjeta y cada celda repite su
   * encabezado. `true` por defecto en modo declarativo; `false` por defecto en
   * modo libre. En modo libre, las celdas sin `data-label` lo toman del texto
   * de su `<th>` de `<thead>` (respetando `colSpan`). Con `false`, desplazamiento
   * horizontal interno.
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
 * Con `stack` (por defecto en modo declarativo), en estrecho cada fila es una
 * tarjeta que conserva la asociación encabezado→valor (`data-label`).
 */
export function DataTable<T>({ caption, minWidth, maxHeight, children, columns, rows, rowKey, rowTestId, stack, testId }: DataTableProps<T>) {
  const declarative = columns !== undefined && rows !== undefined;
  const stacked = stack ?? declarative;
  const tableRef = useRef<HTMLTableElement>(null);

  // Modo libre apilado: cada celda repite el texto de su encabezado (`data-label`), sin tocar las que ya lo traen.
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table || declarative || !stacked) return;
    const headers: string[] = [];
    table.querySelectorAll('thead tr:last-child th').forEach((th) => {
      const span = (th as HTMLTableCellElement).colSpan || 1;
      for (let i = 0; i < span; i++) headers.push((th.textContent ?? '').replace(/\s+/g, ' ').trim());
    });
    table.querySelectorAll('tbody tr').forEach((tr) => {
      let column = 0;
      Array.from(tr.children).forEach((cell) => {
        const label = headers[column];
        if (label && !cell.hasAttribute('data-label')) cell.setAttribute('data-label', label);
        column += (cell as HTMLTableCellElement).colSpan || 1;
      });
    });
  });
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
      <table ref={tableRef} className={stacked ? 'ui-table ui-table-stack' : 'ui-table'} style={minWidth !== undefined ? { minWidth } : undefined}>
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
                <tr key={rowKey ? rowKey(row, index) : index} data-testid={rowTestId?.(row, index)}>
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
