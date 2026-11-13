import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { buttonClassFor, iconButtonClassFor } from './classes';
import { Icon } from './icons';
import type { ButtonSize, ButtonVariant } from './types';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icono decorativo antes del texto (p. ej. `<Icon d={ICON.download} />`). */
  icon?: ReactNode;
  /** Icono decorativo después del texto (p. ej. la flecha de «Revisar borrador»). */
  iconEnd?: ReactNode;
  /** Ocupa todo el ancho disponible. */
  block?: boolean;
  /** Acción en curso: deshabilita el botón, añade `aria-busy` y un indicador. El texto no cambia. */
  busy?: boolean;
}

function Spinner() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Botón con las variantes del rediseño; `type="button"` salvo que se indique otro. */
export function Button({ variant = 'primary', size = 'md', className, type = 'button', icon, iconEnd, block = false, busy = false, disabled, children, ...rest }: ButtonProps) {
  const classes = [buttonClassFor(variant, size), block ? 'w-full' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <Spinner /> : icon}
      {children}
      {iconEnd}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  ref?: Ref<HTMLButtonElement>;
  /** Nombre accesible obligatorio (el botón no tiene texto visible). */
  label: string;
  /** Trazo de `ICON` o un nodo propio. */
  icon: string | ReactNode;
  variant?: Extract<ButtonVariant, 'ghost' | 'secondary' | 'on-dark' | 'accent' | 'primary'>;
  size?: Extract<ButtonSize, 'sm' | 'md'>;
}

/**
 * Botón sólo con icono (actualizar, plegar la barra, cerrar). El nombre va en
 * `aria-label`; no hay información que dependa de pasar el ratón.
 */
export function IconButton({ label, icon, variant = 'ghost', size = 'md', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} className={className ? `${iconButtonClassFor(variant, size)} ${className}` : iconButtonClassFor(variant, size)} {...rest}>
      {typeof icon === 'string' ? <Icon d={icon} className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} /> : icon}
    </button>
  );
}
