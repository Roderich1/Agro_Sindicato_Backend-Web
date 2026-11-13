import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fmtDateTime } from '../../lib/collective-text';
import { fmtPercent } from '../../lib/format';
import type { Coverage } from '../../types/collective';

const COUNT = new Intl.NumberFormat('es-BO');

export interface HeroStatItem {
  key: string;
  label: ReactNode;
  value: ReactNode;
  testId?: string;
}

/**
 * Cobertura en la cabecera oscura (láminas 03, 04 y 35): «14 de 15» grande en
 * lima con su explicación y, a la derecha (debajo en teléfono), los
 * indicadores de la vista. Va como `children` de `HeroPanel` porque la cifra
 * lleva su propio enlace y sus notas; el aspecto es el de `HeroPanel.figure`.
 *
 * Definición del contrato (F06 :93-95, F10-SEC-02): `linked_members` son los
 * agricultores con vínculo y cuenta activos; `members_with_contribution`, los
 * que están dentro de alguna cifra publicada. Sin umbrales de color ni
 * «datos suficientes»; sin porcentaje si no hay vinculados.
 */
export function HeroCoverage({
  coverage,
  sealedAt,
  link,
  stats = [],
  bar = false,
  plain = false,
  testId = 'coverage',
}: {
  /** `null` bajo `POLICY_PENDING`: no se dibuja la cifra (sólo los indicadores). */
  coverage: Coverage | null;
  sealedAt?: string | null;
  /** Enlace «Ver cobertura». */
  link?: string;
  stats?: HeroStatItem[];
  /** Barra de proporción bajo la cifra (lámina 04). */
  bar?: boolean;
  /** Sin la línea superior (cuando no va bajo el título de `HeroPanel`). */
  plain?: boolean;
  testId?: string;
}) {
  if (!coverage && stats.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-10 gap-y-5 ${plain ? '' : 'border-t border-ink-raised pt-5'}`}>
      {coverage && <CoverageBlock coverage={coverage} sealedAt={sealedAt} link={link} bar={bar} testId={testId} />}
      {stats.length > 0 && (
        <dl className="flex flex-wrap gap-x-10 gap-y-4" data-testid="hero-stats">
          {stats.map((stat) => (
            <div key={stat.key} className="min-w-0" data-testid={stat.testId}>
              <dt className="text-sm text-on-ink-muted">{stat.label}</dt>
              <dd className="mt-0.5 font-display text-lg font-bold leading-tight text-white tabular-nums sm:text-xl">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function CoverageBlock({ coverage, sealedAt, link, bar, testId }: { coverage: Coverage; sealedAt?: string | null; link?: string; bar: boolean; testId: string }) {
  const { linked_members: linked, members_with_contribution: within } = coverage;
  const percent = fmtPercent(within, linked);
  const share = linked > 0 ? Math.min(100, Math.max(0, (within / linked) * 100)) : null;
  return (
    <div className={`min-w-0 ${bar ? 'w-full' : ''}`} data-testid={testId}>
      <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-on-ink-muted">
        <span>{sealedAt ? `Cobertura al sellar (${fmtDateTime(sealedAt)})` : 'Cobertura'}</span>
        {link && (
          <Link to={link} className="font-semibold text-lime underline underline-offset-2">
            Ver cobertura
          </Link>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <p className={`font-display font-extrabold leading-none tracking-tight text-lime tabular-nums ${bar ? 'text-6xl sm:text-8xl' : 'text-5xl sm:text-7xl'}`} data-testid="coverage-value">
          {COUNT.format(within)} de {COUNT.format(linked)}
        </p>
        <p className="max-w-[18rem] pb-1 text-base leading-snug text-on-ink sm:text-lg">
          {' '}
          {linked === 1 ? 'agricultor vinculado' : 'agricultores vinculados'} con cifras publicadas
          {percent && <span className="text-on-ink-muted tabular-nums"> ({percent})</span>}
        </p>
      </div>
      {bar && share !== null && (
        <div className="mt-6 h-3 rounded-full bg-ink-raised" aria-hidden="true" data-bar-track>
          <div className="h-3 rounded-full bg-lime" style={{ width: `${share}%` }} />
        </div>
      )}
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-on-ink-muted">
        {linked === 0 && 'Hoy no hay agricultores vinculados activos: no se calcula porcentaje. '}
        {sealedAt && 'Fijada al sellar; no se recalcula. '}
        {coverage.suppressed_cells && 'Hay filas sin cifra (por la política F07-POL-01, en revisión o retiradas) cuyos aportes no se cuentan. '}
        Ausencia de aporte = desconocido, no cero. No es el total del sindicato.
      </p>
    </div>
  );
}
