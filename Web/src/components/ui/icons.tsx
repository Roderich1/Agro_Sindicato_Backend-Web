/** Iconos de trazo (24×24) decorativos: el significado siempre va en el texto. */
export function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
