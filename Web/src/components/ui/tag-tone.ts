import type { TagTone } from './types';

/**
 * Clases de cada tono. Contrastes (texto/fondo): lima-tinta 9,9:1; aviso 11:1;
 * peligro 7:1; neutro 13:1; oculto (tinta tenue sobre blanco) 6,3:1.
 */
export const TAG_TONE: Record<TagTone, string> = {
  neutral: 'bg-sunken text-ink',
  positive: 'bg-lime-soft text-lime-ink',
  attention: 'bg-warn-bg text-warn-ink',
  danger: 'bg-danger-bg text-danger-ink',
  hidden: 'ui-dashed bg-transparent text-ink-muted',
  dark: 'bg-ink text-white',
  lime: 'bg-lime text-ink',
  'on-dark': 'bg-ink-raised text-on-ink',
};
