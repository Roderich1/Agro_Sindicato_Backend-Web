import type { ReactNode } from 'react';
import { ICON } from './icon-paths';
import { Icon } from './icons';
import { TAG_TONE } from './tag-tone';
import type { TagTone } from './types';

export interface ChipProps {
  children: ReactNode;
  tone?: TagTone;
  /** Trazo de `ICON` (p. ej. `ICON.lock`) o un nodo; siempre decorativo. */
  icon?: string | ReactNode;
  /** Punto delante del texto (estado «Abierta» de las láminas); decorativo. */
  dot?: boolean;
  size?: 'sm' | 'md';
  /** Información adicional; nunca la única fuente del significado. */
  title?: string;
  testId?: string;
}

/**
 * Etiqueta corta de estado o categoría, siempre con texto. El tono acompaña;
 * el texto dice el estado. Para estados de la API use `StatusChip`.
 */
export function Chip({ children, tone = 'neutral', icon, dot = false, size = 'sm', title, testId }: ChipProps) {
  const sizeCls = size === 'md' ? 'min-h-8 px-3.5 py-1 text-sm' : 'min-h-6 px-2.5 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-semibold leading-tight ${sizeCls} ${TAG_TONE[tone]}`}
      title={title}
      data-tone={tone}
      data-testid={testId}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {typeof icon === 'string' ? <Icon d={icon} className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} /> : icon}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** Alias: en el contrato de las láminas, «Tag» y «Chip» son lo mismo. */
export const Tag = Chip;

/**
 * «Oculta por privacidad»: candado + borde discontinuo (lámina 03). Oculta no
 * es cero. El texto se puede acortar («Oculta» en teléfono) o ajustar al
 * género del sustantivo («Oculto por privacidad»).
 */
export function PrivacyChip({ label = 'Oculta por privacidad', title, size = 'sm', testId }: { label?: string; title?: string; size?: 'sm' | 'md'; testId?: string }) {
  return (
    <Chip tone="hidden" icon={ICON.lock} size={size} title={title} testId={testId}>
      {label}
    </Chip>
  );
}
