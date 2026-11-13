import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ICON } from './icon-paths';
import { Icon } from './icons';

export interface AttentionItem {
  id: string;
  text: ReactNode;
  /** Ruta interna: el ítem es un enlace con flecha. */
  to?: string;
  /** Acción en la misma vista: el ítem es un botón con flecha. */
  onClick?: () => void;
  /** Color del punto (decorativo): ámbar por defecto, rojo o gris. */
  tone?: 'attention' | 'danger' | 'neutral';
}

export interface AttentionListProps {
  /** «Para atender» por defecto. */
  title?: string;
  items: AttentionItem[];
  headingLevel?: 2 | 3;
  testId?: string;
}

const DOT = { attention: 'bg-[#c77700]', danger: 'bg-danger', neutral: 'bg-ink-muted' } as const;

/**
 * Lista «Para atender» (lámina 03): asuntos que la vista ya detectó con datos
 * del servidor, cada uno con un punto de color decorativo y, si lleva a algún
 * sitio, una flecha. Sin ítems no se dibuja nada (no inventa «todo en orden»).
 */
export function AttentionList({ title = 'Para atender', items, headingLevel = 2, testId }: AttentionListProps) {
  const headingId = useId();
  if (items.length === 0) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={headingId} data-testid={testId}>
      <Heading id={headingId} className="mb-3 text-xl font-bold text-ink sm:text-2xl">
        {title}
      </Heading>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface px-2 shadow-card">
        {items.map((item) => {
          const body = (
            <>
              <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.tone ?? 'attention']}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-base leading-snug text-ink">{item.text}</span>
              {(item.to || item.onClick) && <Icon d={ICON.chevronRight} className="mt-0.5 h-5 w-5 text-ink" />}
            </>
          );
          const cls = 'flex w-full items-start gap-3 rounded-[16px] px-3 py-4 text-left';
          return (
            <li key={item.id}>
              {item.to ? (
                <Link to={item.to} className={`${cls} hover:bg-canvas`}>
                  {body}
                </Link>
              ) : item.onClick ? (
                <button type="button" onClick={item.onClick} className={`${cls} hover:bg-canvas`}>
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
