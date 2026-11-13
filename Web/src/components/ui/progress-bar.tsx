export interface ProgressBarProps {
  /** Valor ya recibido del servidor (o ya formateado en `valueText`). */
  value: number;
  /** Referencia de la barra llena (p. ej. la mayor cifra publicada de la misma unidad). */
  max: number;
  /** Nombre accesible («Necesidad declarada de Urea DEMO»). */
  label: string;
  /** Texto que se lee en lugar del número («771,2 kg»). Recomendado: la vista ya lo muestra formateado. */
  valueText?: string;
  /** `meter` (medida, por defecto) o `progressbar` (avance de una tarea). */
  kind?: 'meter' | 'progressbar';
  tone?: 'ink' | 'lime' | 'attention';
  size?: 'sm' | 'md';
  testId?: string;
}

const TONE = { ink: 'bg-ink', lime: 'bg-lime', attention: 'bg-caution' } as const;

/**
 * Barra de magnitud (necesidades de la lámina 03): pista gris y relleno
 * proporcional `value / max`, sin animación ni contador. Sólo dibuja: no suma,
 * no compara unidades distintas ni muestra porcentajes. Con `max` ≤ 0 o un
 * valor no finito, la pista queda vacía (sin inventar una proporción). La cifra
 * va siempre escrita al lado por la vista.
 */
export function ProgressBar({ value, max, label, valueText, kind = 'meter', tone = 'ink', size = 'md', testId }: ProgressBarProps) {
  const valid = Number.isFinite(value) && Number.isFinite(max) && max > 0 && value >= 0;
  const ratio = valid ? Math.min(value / max, 1) : 0;
  return (
    <div
      role={kind}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={valid ? max : undefined}
      aria-valuenow={valid ? value : undefined}
      aria-valuetext={valueText}
      className={`w-full overflow-hidden rounded-full bg-track ${size === 'sm' ? 'h-1.5' : 'h-2'}`}
      data-testid={testId}
    >
      {/* Un mínimo visible para cifras pequeñas pero publicadas (lámina 03: Mancozeb). */}
      {valid && value > 0 && <div className={`h-full rounded-full ${TONE[tone]}`} style={{ width: `max(${(ratio * 100).toFixed(2)}%, 0.5rem)` }} />}
    </div>
  );
}
