import type { ButtonSize, ButtonVariant } from './types';

/*
 * Clases compartidas con los tokens del rediseño. `ui-press` (index.css) da la
 * respuesta al pulsar: scale(0.98) en 120 ms, sin escala con movimiento
 * reducido. Los hovers de Tailwind 4 ya sólo se aplican con `(hover: hover)`.
 */

const BUTTON_BASE =
  'ui-press inline-flex items-center justify-center gap-2 rounded-control font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'min-h-10 px-4 py-2 text-sm',
  sm: 'min-h-8 px-3 py-1.5 text-xs',
};

/** Texto blanco sólo sobre brand-700 o más oscuro (contraste AA). */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:outline-brand-700',
  secondary: 'border border-slate-300 bg-surface text-slate-800 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-brand-700',
  ghost: 'text-brand-800 hover:bg-brand-50 focus-visible:outline-brand-700',
  danger: 'border border-red-200 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100 focus-visible:outline-red-700',
};

export function buttonClassFor(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return `${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANT[variant]}`;
}

export const buttonClass = buttonClassFor('primary');
export const secondaryButtonClass = buttonClassFor('secondary');
export const ghostButtonClass = buttonClassFor('ghost');
export const dangerButtonClass = buttonClassFor('danger');

export const inputClass =
  'w-full rounded-control border border-slate-300 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder-slate-500 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/25 disabled:bg-slate-50 disabled:text-slate-500';

export const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600';

export const cardClass = 'glass-card p-5';

/** Superficie de tarjeta (Section, Collapsible): borde, fondo sólido, sombra suave. */
export const surfaceClass = 'rounded-card border border-line bg-surface shadow-card';
