import type { ReactNode } from 'react';
import { Button } from './button';
import { ICON } from './icon-paths';
import { Icon } from './icons';
import { SyntheticDataChip } from './synthetic-chip';

/** Acción principal de una cabecera pegada: lima a todo el ancho en teléfono, tinta con «+» en escritorio. */
export interface PageHeaderAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  /** Muestra «+» delante en escritorio (crear algo nuevo). true por defecto. */
  plusIcon?: boolean;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Normalmente un <CampaignSelector />; va a la izquierda de la barra. */
  campaign?: ReactNode;
  /** Una sola acción primaria (y, como mucho, una secundaria); va a la derecha. */
  actions?: ReactNode;
  /** 1 por defecto: es el título de la vista. Use 2 si la vista ya tiene un <h1>. */
  headingLevel?: 1 | 2;
  /** Línea pequeña sobre el título (migas: «Catálogo · Productos»). */
  eyebrow?: ReactNode;
  /** Muestra `eyebrow` sólo por debajo de 1024 px (p. ej. el nombre del sindicato en la barra oscura del teléfono). */
  eyebrowPhoneOnly?: boolean;
  /**
   * Muestra «Datos sintéticos» arriba a la derecha cuando el servidor lo declara.
   * Por defecto, sólo en la cabecera principal (`headingLevel` 1): una vista
   * anidada con `headingLevel={2}` no lo repite.
   */
  showSynthetic?: boolean;
  /**
   * Por debajo de 1024 px la cabecera es oscura y continúa la barra superior del
   * armazón (láminas 37, 39, 41, 42 y 44); en escritorio es la cabecera clara.
   * Un solo bloque y un solo `<h1>`: sólo cambian los colores con el ancho.
   * Úselo sólo si la cabecera es lo primero de la vista. Dentro, `actions` y
   * `campaign` se ven sobre tinta en teléfono: use `primaryAction` para la
   * acción principal y controles que funcionen en ambos fondos (p. ej.
   * `SegmentedControl` o `Tabs variant="pill"`, que son blancos).
   */
  attachToHeader?: boolean;
  /** Acción principal integrada (sobre todo con `attachToHeader`): lima a todo el ancho en teléfono, tinta en escritorio. */
  primaryAction?: PageHeaderAction;
  testId?: string;
}

/**
 * Cabecera de una vista (lámina 21: «Catálogo»): título grande en Bricolage y
 * contexto; debajo, la campaña a la izquierda y la acción a la derecha. En
 * pantallas estrechas se apilan sin truncar. Con `attachToHeader`, oscura en
 * teléfono y clara en escritorio. Para la cabecera oscura con cifra grande
 * (Resumen), use `HeroPanel`.
 */
export function PageHeader({
  title,
  subtitle,
  campaign,
  actions,
  headingLevel = 1,
  eyebrow,
  eyebrowPhoneOnly = false,
  showSynthetic,
  attachToHeader = false,
  primaryAction,
  testId,
}: PageHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const synthetic = showSynthetic ?? headingLevel === 1;
  const dark = attachToHeader;
  const action = primaryAction && (
    <Button
      variant={dark ? 'accent' : 'primary'}
      size={dark ? 'lg' : 'md'}
      onClick={primaryAction.onClick}
      disabled={primaryAction.disabled}
      data-testid={primaryAction.testId}
      icon={primaryAction.plusIcon === false ? undefined : <Icon d={ICON.plus} className={dark ? 'hidden h-5 w-5 lg:block' : 'h-5 w-5'} />}
      className={dark ? 'w-full lg:w-auto lg:bg-ink lg:text-white lg:hover:bg-ink-raised' : undefined}
    >
      {primaryAction.label}
    </Button>
  );
  const inlineAction = !!action && !campaign && !actions;
  return (
    <header
      className={
        dark
          ? 'ui-hero-attach ui-on-ink flex flex-col gap-4 bg-ink px-5 pb-6 pt-4 text-white lg:bg-transparent lg:p-0 lg:text-ink lg:[--color-focus:var(--color-ink)]'
          : 'flex flex-col gap-4'
      }
      data-testid={testId}
      data-attached={dark || undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className={`mb-1 text-sm font-medium ${dark ? 'text-on-ink-muted lg:text-ink-muted' : 'text-ink-muted'} ${eyebrowPhoneOnly ? 'lg:hidden' : ''}`}>{eyebrow}</div>
          )}
          <Heading className={`break-words text-3xl font-extrabold leading-[1.1] sm:text-4xl ${dark ? 'text-white lg:text-ink' : 'text-ink'}`}>{title}</Heading>
          {subtitle && <div className={`mt-2 max-w-3xl text-base leading-relaxed ${dark ? 'text-on-ink-muted lg:text-ink-muted' : 'text-ink-muted'}`}>{subtitle}</div>}
        </div>
        {inlineAction ? (
          // Sólo la acción principal (láminas 21, 28 y 31): en escritorio, a la altura del título;
          // en teléfono, debajo y a todo el ancho. Un solo botón en el DOM.
          <div className="flex w-full flex-wrap items-center justify-end gap-3 lg:w-auto">
            {synthetic && <SyntheticDataChip />}
            {action}
          </div>
        ) : (
          // En teléfono el chip va en su propia línea, encima del título, para no estrecharlo.
          synthetic && (
            <div className="order-first basis-full lg:order-none lg:basis-auto">
              <SyntheticDataChip />
            </div>
          )
        )}
      </div>
      {(campaign || actions || (action && !inlineAction)) && (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          {campaign && <div className="min-w-0 flex-1 basis-64">{campaign}</div>}
          {/* En estrecho, las acciones (p. ej. el SegmentedControl «Vista») se alinean a la izquierda, con su etiqueta en el margen (H4). */}
          {(actions || (action && !inlineAction)) && (
            <div className={`flex flex-wrap items-center gap-2 sm:ml-auto ${dark ? 'w-full lg:w-auto' : ''}`}>
              {actions}
              {!inlineAction && action}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
