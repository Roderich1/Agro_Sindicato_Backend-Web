/**
 * Cifra grande con la unidad en pequeño («771,2 kg» de las láminas 03, 06 y
 * 26). Recibe el texto ya formateado por `formatQuantity`/`formatDecimalQuantity`
 * («1.046,7 KG») y sólo lo parte en número y unidad para darles tamaños
 * distintos: no calcula, no redondea ni cambia la unidad. El texto accesible
 * (y `textContent`) sigue siendo el mismo, con su espacio: «1.046,7 KG».
 */
export function QuantityFigure({
  text,
  size = 'lg',
  prefix,
  className = '',
}: {
  text: string;
  /** `xl` en la cabecera, `lg` en filas, `md` en listas compactas y `sm` en notas. */
  size?: 'xl' | 'lg' | 'md' | 'sm';
  /** Signo delante, p. ej. «≈ » en una estimación (no cambia la cifra). */
  prefix?: string;
  className?: string;
}) {
  const cut = text.lastIndexOf(' ');
  const number = cut > 0 ? text.slice(0, cut) : text;
  const unit = cut > 0 ? text.slice(cut + 1) : '';
  const cls = SIZE[size];
  return (
    <span className={`min-w-0 font-display [overflow-wrap:anywhere] font-extrabold leading-none tracking-tight text-ink tabular-nums ${cls.number} ${className}`} data-figure>
      {prefix}
      {number}
      {unit && <span className={`font-sans font-bold tracking-normal ${cls.unit}`}> {unit}</span>}
    </span>
  );
}

const SIZE = {
  xl: { number: 'text-5xl sm:text-6xl', unit: 'text-2xl' },
  lg: { number: 'text-[1.75rem]', unit: 'text-sm' },
  md: { number: 'text-xl', unit: 'text-xs' },
  sm: { number: 'text-base', unit: 'text-xs' },
} as const;
