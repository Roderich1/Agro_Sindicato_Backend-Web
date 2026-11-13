import type { ReactNode } from 'react';
import { Button, Icon, ICON, SyntheticDataChip } from '../ui';

export interface ViewHeaderAction {
  label: string;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
}

export interface ViewHeaderProps {
  title: string;
  /** 1 por defecto. Use 2 cuando la vista vive dentro de otra que ya tiene su `<h1>`. */
  headingLevel?: 1 | 2;
  /** Línea pequeña sobre el título («Sindicato DEMO»). Sólo en teléfono, salvo `eyebrowOnDesktop`. */
  eyebrow?: ReactNode;
  eyebrowOnDesktop?: boolean;
  subtitle?: ReactNode;
  /** La acción principal de la vista («Nuevo producto»): lima a todo el ancho en teléfono, tinta con «+» en escritorio. */
  action?: ViewHeaderAction;
  /** Otros controles a la derecha del título (p. ej. «Actualizar» o las pestañas de «Por identificar»). */
  aside?: ReactNode;
  testId?: string;
}

/**
 * Cabecera de las vistas de la sesión C (láminas 21–24, 28, 31, 32 y sus
 * versiones de teléfono 39, 41, 42, 44 y 47): un solo bloque que en teléfono y
 * tableta (< 1024 px) continúa la barra superior oscura del armazón (como
 * `HeroPanel attachToHeader`) y en escritorio es la cabecera clara de
 * `PageHeader`. Es un solo `<h1>` y una sola acción: sólo cambian los colores
 * con la anchura, sin duplicar nada en el DOM.
 *
 * «Datos sintéticos» (`SyntheticDataChip`) lo pone la cabecera de nivel 1,
 * como `PageHeader`; las vistas no lo añaden.
 *
 * Widget privado de C: el orquestador decide si se promueve a `components/ui`.
 */
export function ViewHeader({ title, headingLevel = 1, eyebrow, eyebrowOnDesktop = false, subtitle, action, aside, testId }: ViewHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header
      className="ui-hero-attach ui-on-ink bg-ink px-5 pb-6 pt-4 text-white lg:bg-transparent lg:p-0 lg:text-ink lg:[--color-focus:var(--color-ink)]"
      data-testid={testId}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className={`mb-1 text-sm text-on-ink-muted lg:text-ink-muted ${eyebrowOnDesktop ? '' : 'lg:hidden'}`}>{eyebrow}</div>}
          <Heading className="break-words font-display text-3xl font-extrabold leading-[1.1] text-white sm:text-4xl lg:text-5xl lg:text-ink">{title}</Heading>
          {subtitle && <div className="mt-2 max-w-4xl text-sm leading-relaxed text-on-ink-muted sm:text-base lg:text-ink-muted">{subtitle}</div>}
        </div>
        {(action || aside || headingLevel === 1) && (
          <div className="flex min-w-0 flex-col items-start gap-3 empty:hidden lg:shrink-0 lg:flex-row lg:items-center [&>*:not(span)]:w-full lg:[&>*:not(span)]:w-auto">
            {headingLevel === 1 && <SyntheticDataChip />}
            {aside}
            {action && (
              <Button
                variant="accent"
                size="lg"
                onClick={action.onClick}
                disabled={action.disabled}
                data-testid={action.testId}
                icon={<Icon d={ICON.plus} className="hidden h-5 w-5 lg:block" />}
                className="w-full lg:w-auto lg:bg-ink lg:text-white lg:hover:bg-ink-raised"
              >
                {action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
