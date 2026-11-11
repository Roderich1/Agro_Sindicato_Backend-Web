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
  testId?: string;
}

/**
 * Cabecera de una vista: título y contexto; debajo, la campaña a la izquierda
 * y la acción a la derecha. En pantallas estrechas se apilan sin truncar.
 */
export function PageHeader({ title, subtitle, campaign, actions, headingLevel = 1, testId }: PageHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header className="flex flex-col gap-3" data-testid={testId}>
      <div className="min-w-0">
        <Heading className="text-xl font-bold leading-tight text-ink sm:text-2xl">{title}</Heading>
        {subtitle && <div className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{subtitle}</div>}
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
