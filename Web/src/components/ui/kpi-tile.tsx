import type { ReactNode } from 'react';
import type { KpiTone } from './types';

const TONE: Record<KpiTone, { box: string; label: string; value: string; note: string }> = {
  default: { box: 'border border-line bg-surface shadow-card', label: 'text-ink-muted', value: 'text-ink', note: 'text-ink-muted' },
  muted: { box: 'bg-sunken', label: 'text-ink-muted', value: 'text-ink', note: 'text-ink-muted' },
  attention: { box: 'bg-warn-bg', label: 'text-warn-ink', value: 'text-warn-ink', note: 'text-warn-ink' },
  /** Sobre la cabecera oscura (HeroPanel): etiqueta tenue y cifra blanca. */
  inverse: { box: '', label: 'text-on-ink-muted', value: 'text-white', note: 'text-on-ink-muted' },
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

/** Indicador: etiqueta, cifra grande (Bricolage) y una línea de contexto. Sin contadores animados. */
export function KpiTile({ label, value, note, tone = 'default', testId }: KpiTileProps) {
  const t = TONE[tone];
  return (
    <div className={`min-w-0 rounded-card ${tone === 'inverse' ? '' : 'px-5 py-4'} ${t.box}`} data-testid={testId} data-tone={tone}>
      <p className={`text-sm font-medium ${t.label}`}>{label}</p>
      <p className={`mt-1 break-words font-display text-2xl font-bold leading-tight tabular-nums sm:text-[1.75rem] ${t.value}`}>{value}</p>
      {note && <p className={`mt-1 text-xs leading-relaxed ${t.note}`}>{note}</p>}
    </div>
  );
}
