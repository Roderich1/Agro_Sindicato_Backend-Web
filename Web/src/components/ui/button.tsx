import type { ButtonHTMLAttributes } from 'react';
import { buttonClassFor } from './classes';
import type { ButtonSize, ButtonVariant } from './types';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Botón con las variantes del rediseño; `type="button"` salvo que se indique otro. */
export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={className ? `${buttonClassFor(variant, size)} ${className}` : buttonClassFor(variant, size)} {...rest} />;
}
