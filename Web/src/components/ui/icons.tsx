/** Iconos de trazo (24×24) decorativos: el significado siempre va en el texto. */
export function Icon({ d, className = 'h-5 w-5', strokeWidth = 2 }: { d: string; className?: string; strokeWidth?: number }) {
  return (
    <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true" focusable="false">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
