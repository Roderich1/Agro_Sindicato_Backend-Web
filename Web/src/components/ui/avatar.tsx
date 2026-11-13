import { initialsOf } from './initials';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  /** `lime` (sobre oscuro, barra lateral), `ink` (sobre claro, menú «Más») o `soft`. */
  tone?: 'lime' | 'ink' | 'soft';
}

const SIZE = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' } as const;
const TONE = { lime: 'bg-lime text-ink', ink: 'bg-ink text-lime', soft: 'bg-sunken text-ink' } as const;

/** Círculo con iniciales; decorativo (el nombre va escrito al lado). */
export function Avatar({ name, size = 'md', tone = 'lime' }: AvatarProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${SIZE[size]} ${TONE[tone]}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
