import type { ReactNode } from 'react';

export interface StepperStep {
  key: string;
  label: string;
}

export interface StepperProps {
  /** Nombre de la secuencia («Versión de las cifras»). */
  label: string;
  steps: StepperStep[];
  /** Índice del paso actual (el que dice el servidor); -1 si ninguno. */
  current: number;
  /** Explicación bajo los pasos. */
  note?: ReactNode;
  testId?: string;
}

/**
 * Secuencia de estados (Abierta → Cerrada → Sellada, lámina 03). El paso actual
 * lleva `aria-current="step"`, círculo relleno con anillo lima y texto en
 * negrita; los anteriores, círculo relleno; los siguientes, círculo vacío. No
 * deduce el estado: lo recibe.
 */
export function Stepper({ label, steps, current, note, testId }: StepperProps) {
  return (
    <div data-testid={testId}>
      <div className="relative">
        {/* Una sola línea del primer círculo al último: pasa por todos (lámina 03, «Versión de las cifras»). */}
        {steps.length > 1 && <span aria-hidden="true" className="pointer-events-none absolute left-3 right-3 top-[11px] h-0.5 bg-track" data-testid={testId ? `${testId}-line` : undefined} />}
        <ol aria-label={label} className="relative flex items-start">
          {steps.map((step, index) => {
            const done = index < current;
            const isCurrent = index === current;
            const last = index === steps.length - 1;
            return (
              <li key={step.key} aria-current={isCurrent ? 'step' : undefined} className={`relative flex min-w-0 flex-1 flex-col ${last ? 'items-end text-right' : index === 0 ? 'items-start' : 'items-center text-center'}`}>
                <span
                  className={`relative z-[1] h-6 w-6 rounded-full border-2 ${
                    isCurrent ? 'border-ink bg-ink ring-4 ring-lime' : done ? 'border-ink bg-ink' : 'border-ink-muted bg-surface'
                  }`}
                  aria-hidden="true"
                />
                <span className={`mt-2 text-sm ${isCurrent ? 'font-bold text-ink' : 'text-ink-muted'}`}>
                  {step.label}
                  {done && <span className="sr-only"> (completado)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {note && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{note}</p>}
    </div>
  );
}
