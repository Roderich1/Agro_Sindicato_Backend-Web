import type { ReactNode } from 'react';
import { ICON } from './icon-paths';
import { Icon } from './icons';

export interface HeroSelectProps {
  /** Nombre accesible del selector («Campaña»). */
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  id?: string;
}

export interface HeroStat {
  key?: string;
  label: ReactNode;
  /** Ya formateado por la vista; puede ser un `PrivacyChip` o un texto de estado, nunca un cero inventado. */
  value: ReactNode;
}

export interface HeroPanelProps {
  /** Título de la vista (texto). Con `select`, queda como `<h1>` sólo para lectores de pantalla. */
  title: string;
  headingLevel?: 1 | 2;
  /** Migas sobre el título («Sindicato DEMO · Resumen de la campaña»), armadas por la vista con datos reales. */
  breadcrumb?: ReactNode;
  /** El título es un selector (campaña): un `<select>` nativo grande con chevron. */
  select?: HeroSelectProps;
  /** Chips de estado junto al título (`StatusChip`, `Chip tone="on-dark"` «Campaña activa»…). */
  chips?: ReactNode;
  /** Arriba a la derecha (una etiqueta corta). El armazón ya muestra «Datos sintéticos»: no lo repita aquí. */
  corner?: ReactNode;
  /** Acciones secundarias a la derecha (`IconButton variant="on-dark"`, `Button variant="on-dark"`). */
  actions?: ReactNode;
  /** Acción principal bajo el título (`Button variant="accent"`). */
  primaryAction?: ReactNode;
  /** Cifra grande en lima con su etiqueta y explicación («Cobertura», «14 de 15», «agricultores…»). */
  figure?: { label: ReactNode; value: ReactNode; caption?: ReactNode };
  /** Indicadores pequeños a la derecha de la cifra (en teléfono, en fila bajo ella). */
  stats?: HeroStat[];
  /** Contenido adicional al pie de la cabecera. */
  children?: ReactNode;
  /**
   * En teléfono (< 1024 px) se pega a la barra superior oscura del armazón: sin
   * margen superior ni lateral y con sólo las esquinas inferiores redondeadas
   * (lámina 35). Úselo sólo si la cabecera es lo primero de la vista.
   */
  attachToHeader?: boolean;
  testId?: string;
}

/**
 * Cabecera oscura de las láminas 03 y 35: migas, título grande (o selector de
 * campaña), chips de estado, acciones y, si la vista la tiene, una cifra grande
 * en lima con indicadores. No calcula nada: todo llega formateado por la vista.
 * El foco dentro de la cabecera es lima (`ui-on-ink`).
 */
export function HeroPanel({ title, headingLevel = 1, breadcrumb, select, chips, corner, actions, primaryAction, figure, stats, children, attachToHeader = false, testId }: HeroPanelProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const selectId = select?.id ?? 'hero-select';
  return (
    <section
      className={`ui-on-ink min-w-0 bg-ink px-5 py-6 text-white sm:px-8 sm:py-7 ${attachToHeader ? 'ui-hero-attach' : 'rounded-hero'}`}
      aria-label={title}
      data-testid={testId}
    >
      {(breadcrumb || corner) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {breadcrumb ? <div className="min-w-0 text-sm text-on-ink-muted">{breadcrumb}</div> : <span />}
          {corner}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {select ? (
            <>
              <Heading className="sr-only">{title}</Heading>
              <div className="relative min-w-0 max-w-full">
                <label htmlFor={selectId} className="sr-only">
                  {select.label}
                </label>
                <select
                  id={selectId}
                  value={select.value}
                  // El nombre completo, aunque el cuadro cerrado lo recorte en un teléfono.
                  title={select.options.find((option) => option.value === select.value)?.label}
                  onChange={(event) => select.onChange(event.target.value)}
                  className="block w-full max-w-full cursor-pointer appearance-none truncate rounded-full bg-ink-raised py-2.5 pl-5 pr-12 font-display text-2xl font-extrabold text-white sm:py-3 sm:pl-7 sm:text-4xl"
                >
                  {select.options.map((option) => (
                    <option key={option.value} value={option.value} className="bg-surface font-sans text-base font-normal text-ink">
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lime sm:right-5">
                  <Icon d={ICON.chevronDown} className="h-6 w-6" />
                </span>
              </div>
            </>
          ) : (
            <Heading className="min-w-0 break-words text-3xl font-extrabold leading-[1.1] text-white sm:text-[2.5rem]">{title}</Heading>
          )}
          {chips && <div className="flex flex-wrap items-center gap-2">{chips}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {primaryAction && <div className="mt-5 flex flex-wrap gap-3">{primaryAction}</div>}
      {(figure || (stats && stats.length > 0)) && (
        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-5 border-t border-ink-raised pt-5">
          {figure && (
            <div className="min-w-0">
              <p className="text-sm text-on-ink-muted">{figure.label}</p>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                <p className="font-display text-5xl font-extrabold leading-none tracking-tight text-lime tabular-nums sm:text-7xl">{figure.value}</p>
                {figure.caption && <p className="max-w-[16rem] pb-1 text-base leading-snug text-on-ink">{figure.caption}</p>}
              </div>
            </div>
          )}
          {stats && stats.length > 0 && (
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              {stats.map((stat, index) => (
                <div key={stat.key ?? index} className="min-w-0">
                  <dt className="text-sm text-on-ink-muted">{stat.label}</dt>
                  <dd className="mt-0.5 font-display text-lg font-bold leading-tight text-white tabular-nums sm:text-xl">{stat.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}
