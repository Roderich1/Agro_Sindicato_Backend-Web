import type { ReactNode } from 'react';

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
  testId?: string;
}

/**
 * Cabecera clara de una vista (lámina 21: «Catálogo»): título grande en
 * Bricolage y contexto; debajo, la campaña a la izquierda y la acción a la
 * derecha. En pantallas estrechas se apilan sin truncar. Para la cabecera
 * oscura con cifra grande (Resumen), use `HeroPanel`.
 */
export function PageHeader({ title, subtitle, campaign, actions, headingLevel = 1, eyebrow, testId }: PageHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header className="flex flex-col gap-4" data-testid={testId}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm font-medium text-ink-muted">{eyebrow}</div>}
        <Heading className="break-words text-3xl font-extrabold leading-[1.1] text-ink sm:text-4xl">{title}</Heading>
        {subtitle && <div className="mt-2 max-w-3xl text-base leading-relaxed text-ink-muted">{subtitle}</div>}
      </div>
      {(campaign || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          {campaign && <div className="min-w-0 flex-1 basis-64">{campaign}</div>}
          {/* En estrecho, las acciones (p. ej. el SegmentedControl «Vista») se alinean a la izquierda, con su etiqueta en el margen (H4). */}
          {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
        </div>
      )}
    </header>
  );
}
