import type { ReactNode } from 'react';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  /** Recuento ya calculado por la vista o el servidor; el componente no cuenta. */
  count?: ReactNode;
}

export interface FilterChipsProps<T extends string> {
  /** Nombre del grupo para lectores de pantalla («Filtrar por unidad»). */
  label: string;
  options: FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testId?: string;
}

/**
 * Filtros de una lista (Todos / Litros / Kilogramos / Ocultas, lámina 03): uno
 * elegido a la vez, botones con `aria-pressed`, el elegido en tinta. Se parten
 * en líneas en pantallas estrechas (lámina 35). Cambiar de filtro no se anima.
 */
export function FilterChips<T extends string>({ label, options, value, onChange, testId }: FilterChipsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label} data-testid={testId}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`ui-press inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${
              active ? 'bg-ink text-white' : 'border border-line bg-surface text-ink hover:border-ink'
            }`}
          >
            {option.label}
            {/* Espacio para el nombre accesible («Litros 4»); el flex lo ignora visualmente. */}
            {option.count !== undefined && option.count !== null && ' '}
            {option.count !== undefined && option.count !== null && (
              <span className={`tabular-nums ${active ? 'text-on-ink-muted' : 'text-ink-muted'}`}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
