import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HeroPanel, ICON, Icon } from '../ui';

export interface CallHeroFact {
  key: string;
  label: string;
  value: ReactNode;
  testId?: string;
}

/**
 * Cabecera oscura del detalle de una convocatoria (láminas 10–20, 38, 48 y 50),
 * sobre `HeroPanel` de BASE: «← Compras conjuntas», migas con la campaña,
 * chips de estado a la derecha, el nombre y una fila de datos clave (el primero
 * en lima) con las acciones. No calcula nada: los valores llegan formateados.
 */
export function CallHero({
  title,
  backTo,
  eyebrow,
  chips,
  facts,
  actions,
}: {
  title: string;
  backTo: string;
  eyebrow: ReactNode;
  chips: ReactNode;
  facts: CallHeroFact[];
  actions?: ReactNode;
}) {
  return (
    <HeroPanel
      attachToHeader
      title={title}
      testId="call-hero"
      breadcrumb={
        <div className="flex flex-col items-start gap-3 sm:gap-4">
          <Link
            to={backTo}
            className="ui-press inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-ink-raised px-3 text-sm font-semibold text-white hover:bg-ink-line focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4"
          >
            <Icon d={ICON.arrowRight} className="h-5 w-5 rotate-180" />
            <span className="sr-only sm:not-sr-only">Compras conjuntas</span>
          </Link>
          {/* En teléfono (lámina 38) sólo la flecha y los chips: las migas se ocultan para no empujarlos a otra línea. */}
          <span className="hidden text-sm text-on-ink-muted sm:block">{eyebrow}</span>
        </div>
      }
      corner={<div className="flex flex-wrap items-center justify-end gap-2">{chips}</div>}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-t border-ink-raised pt-5">
        <dl className="flex min-w-0 flex-wrap gap-x-10 gap-y-4" data-testid="call-key-facts">
          {facts.map((fact, index) => (
            <div key={fact.key} className="min-w-0" data-testid={fact.testId}>
              <dt className="text-sm text-on-ink-muted">{fact.label}</dt>
              <dd
                className={
                  index === 0
                    ? 'mt-0.5 font-display text-2xl font-extrabold leading-tight text-lime tabular-nums sm:text-[1.75rem]'
                    : 'mt-1 font-display text-lg font-bold leading-tight text-white [overflow-wrap:anywhere]'
                }
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
        {actions && <div className="flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">{actions}</div>}
      </div>
    </HeroPanel>
  );
}

/** «Cancelar convocatoria…» en la cabecera oscura: texto salmón (9,6:1 sobre la tinta), sin relleno (láminas 10, 11 y 38). */
export function HeroDangerButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-press inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-[#ffb4a9] hover:bg-ink-raised focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {children}
    </button>
  );
}
