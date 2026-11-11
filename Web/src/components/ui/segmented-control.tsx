import { labelClass } from './classes';

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testId?: string;
}

/**
 * Dos o tres opciones visibles a la vez (en lugar de un desplegable), manejables
 * con teclado: cada opción es un botón con `aria-pressed`. Cambiar de opción no
 * se anima (se usa decenas de veces al día).
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange, testId }: SegmentedControlProps<T>) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <div className="inline-flex flex-wrap rounded-control border border-slate-300 bg-surface p-0.5" role="group" aria-label={label} data-testid={testId}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`min-h-9 rounded-[6px] px-3.5 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700 ${
                active ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-ink'
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
