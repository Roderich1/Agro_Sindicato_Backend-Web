import type { ReactNode } from 'react';
import type { KpiTone } from './types';

const TONE: Record<KpiTone, string> = {
  default: 'border-line bg-surface',
  muted: 'border-line bg-slate-50',
  attention: 'border-amber-300 bg-amber-50',
};

export interface KpiTileProps {
  label: string;
  /** Ya formateado por la vista (formatQuantity, Intl…); este componente no calcula. */
  value: ReactNode;
  note?: ReactNode;
  /** El tono nunca es el único portador del significado: acompáñelo de `note`. */
  tone?: KpiTone;
  testId?: string;
}

/** Indicador: etiqueta, cifra grande y una línea de contexto. Sin contadores animados. */
export function KpiTile({ label, value, note, tone = 'default', testId }: KpiTileProps) {
  return (
    <div className={`rounded-card border px-5 py-4 shadow-card ${TONE[tone]}`} data-testid={testId} data-tone={tone}>
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold leading-tight text-ink tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs leading-relaxed text-slate-600">{note}</p>}
    </div>
  );
}
