import type { ButtonSize, ButtonVariant } from './types';

/*
 * Clases compartidas con los tokens del rediseño v2. `ui-press` (index.css) da
 * la respuesta al pulsar: scale(0.98) en 120 ms, sin escala con movimiento
 * reducido. Los hovers de Tailwind 4 ya sólo se aplican con `(hover: hover)`.
 * Botones en forma de píldora, como en las láminas.
 */

const BUTTON_BASE =
  'ui-press inline-flex items-center justify-center gap-2 rounded-full text-center font-semibold leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55';

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-xs',
  md: 'min-h-11 px-5 py-2 text-sm',
  lg: 'min-h-12 px-6 py-3 text-base',
};

/** Contrastes: blanco sobre tinta 15,6:1; tinta sobre lima 11,7:1; blanco sobre rojo 6,5:1. */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-raised',
  accent: 'bg-lime text-ink hover:bg-lime-soft',
  secondary: 'border border-ink bg-surface text-ink hover:bg-canvas',
  'on-dark': 'border border-on-ink-muted text-white hover:bg-ink-raised',
  ghost: 'text-ink hover:bg-sunken',
  danger: 'bg-danger text-white hover:bg-danger-ink',
};

export function buttonClassFor(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return `${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANT[variant]}`;
}

/** Botón cuadrado sólo con icono (IconButton): mismas variantes, 36 o 44 px. */
export function iconButtonClassFor(variant: ButtonVariant = 'ghost', size: Extract<ButtonSize, 'sm' | 'md'> = 'md'): string {
  return `${BUTTON_BASE} ${size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'} shrink-0 p-0 ${BUTTON_VARIANT[variant]}`;
}

export const buttonClass = buttonClassFor('primary');
export const secondaryButtonClass = buttonClassFor('secondary');
export const ghostButtonClass = buttonClassFor('ghost');
export const dangerButtonClass = buttonClassFor('danger');

/**
 * Campo de texto, selector o área: fondo claro, borde de 3,2:1 sobre el fondo
 * (WCAG 1.4.11), radio de 14 px. `aria-invalid` lo pinta en rojo.
 */
export const inputClass =
  'block w-full min-h-11 rounded-field border border-field-border bg-field px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/25 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/25';

export const labelClass = 'mb-1.5 block text-sm font-semibold text-ink';

/** Texto de ayuda bajo un campo. */
export const helpClass = 'mt-1.5 text-xs leading-relaxed text-ink-muted';

export const cardClass = 'glass-card p-5';

/** Superficie de tarjeta (Section, Card, Collapsible): blanca, muy redondeada, borde suave. */
export const surfaceClass = 'rounded-card border border-line bg-surface shadow-card';

/** Enlace de texto dentro de un párrafo (verde oscuro subrayado, 6,5:1). */
export const linkClass = 'font-semibold text-link underline underline-offset-2 hover:text-ink';
