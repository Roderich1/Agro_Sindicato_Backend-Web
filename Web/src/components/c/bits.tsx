import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { unitInfo } from './unit';

/**
 * Piezas pequeñas de la sesión C (catálogo y administración). Son widgets
 * privados: usan los tokens de BASE y no duplican componentes de `ui`.
 */

/**
 * Recuadro de la unidad delante de un producto (láminas 21, 22 y 24): «kg» en
 * ámbar y «L» en gris. Es decorativo: la unidad va también en texto para
 * lectores de pantalla (`sr-only`).
 */
export function UnitBadge({ unit }: { unit: string }) {
  const info = unitInfo(unit);
  const tone = info.short === 'kg' ? 'bg-warn-bg text-warn-ink' : 'bg-sunken text-ink';
  return (
    <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-sm font-bold ${tone}`}>
      <span aria-hidden="true" className="max-w-full truncate px-1">
        {info.short}
      </span>
      <span className="sr-only">Unidad: {info.long}</span>
    </span>
  );
}

/** Acción de fila con aspecto de enlace subrayado («Editar», «Inactivar», «Contraseña»), 44 px de alto táctil. */
export function RowLink({ className = '', tone = 'ink', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'ink' | 'muted' | 'danger' }) {
  const color = tone === 'danger' ? 'text-danger-ink' : tone === 'muted' ? 'text-ink-muted' : 'text-ink';
  return (
    <button
      type="button"
      {...rest}
      className={`ui-press inline-flex min-h-11 items-center rounded-control px-2 text-sm font-semibold underline underline-offset-4 hover:bg-sunken focus-visible:outline-2 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-55 ${color} ${className}`}
    />
  );
}

/** Rótulo en mayúsculas pequeñas sobre una lista («ANTERIORES · 11 CERRADAS», «HOY · 12 NOV 2026»). */
export function Overline({ children, as: Tag = 'h2', id }: { children: ReactNode; as?: 'h2' | 'h3' | 'p'; id?: string }) {
  return (
    <Tag id={id} className="font-sans text-sm font-semibold uppercase tracking-[0.08em] text-ink-muted">
      {children}
    </Tag>
  );
}

/** Fila de datos «término / valor» (detalle de una solicitud, «Qué pasó», «Separar»). */
export function Facts({ rows, className = '' }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={`grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm sm:text-base ${className}`}>
      {rows.map(([term, value], index) => (
        <div key={index} className="contents">
          <dt className="text-ink-muted">{term}</dt>
          <dd className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
