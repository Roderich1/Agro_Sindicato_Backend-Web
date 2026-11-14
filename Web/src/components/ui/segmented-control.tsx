import { labelClass } from './classes';

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Oculta la etiqueta visualmente (lámina 21: «Por categoría / Por unidad / Sin agrupar»); sigue siendo el nombre del grupo. */
  hideLabel?: boolean;
  testId?: string;
}

/**
 * Dos a cuatro opciones visibles a la vez, en una píldora blanca con la
 * elegida en tinta (lámina 21). Cada opción es un botón con `aria-pressed`.
 * Cambiar de opción no se anima (se usa decenas de veces al día).
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange, hideLabel = false, testId }: SegmentedControlProps<T>) {
  return (
    <div className="min-w-0">
      <p className={hideLabel ? 'sr-only' : labelClass}>{label}</p>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-[22px] border border-line bg-surface p-1" role="group" aria-label={label} data-testid={testId}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`min-h-10 rounded-full px-4 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 ${
                active ? 'bg-ink text-white' : 'text-ink hover:bg-sunken'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
