import { Link } from 'react-router-dom';
import { fmtDateTime } from '../../lib/collective-text';
import type { Coverage } from '../../types/collective';
import { linkClass, ProgressBar, surfaceClass } from '../ui';

const COUNT = new Intl.NumberFormat('es-BO');

/**
 * «Participación» del detalle de campaña (lámina 29). Mismos datos y
 * definiciones que `CoverageCard` (F06 contrato:93-95; F10-SEC-02), con la
 * presentación de la lámina: «N de M» grande y una barra sin porcentaje.
 *
 * - `linked_members`: agricultores con vínculo y cuenta activos, aporten o no.
 * - `members_with_contribution`: quienes están dentro de alguna cifra publicada.
 * - `suppressed_cells`: alguna fila no tiene cifra; sin conteo.
 * - `null` (política pendiente): «Cobertura no disponible», nunca «0 de 0».
 *
 * Sin umbrales de color: una cobertura alta no significa datos completos.
 */
export function ParticipationCard({ coverage, sealedAt, link }: { coverage: Coverage | null; sealedAt?: string | null; link: string }) {
  const title = sealedAt ? `Participación al sellar (${fmtDateTime(sealedAt)})` : 'Participación';
  return (
    <section className={`${surfaceClass} min-w-0 px-5 py-6 sm:px-8`} aria-labelledby="participation-title" data-testid="coverage">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="participation-title" className="font-display text-2xl font-bold text-ink">
          {title}
        </h2>
        <Link to={link} className={linkClass}>
          Ver cobertura
        </Link>
      </div>
      {!coverage ? (
        <div className="mt-3">
          <p className="font-display text-2xl font-bold text-ink">Cobertura no disponible</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">Sin política de divulgación aprobada el servidor no publica conteos. Eso no significa cero.</p>
        </div>
      ) : (
        <Figures coverage={coverage} sealed={Boolean(sealedAt)} />
      )}
    </section>
  );
}

function Figures({ coverage, sealed }: { coverage: Coverage; sealed: boolean }) {
  const { linked_members: linked, members_with_contribution: within } = coverage;
  return (
    <>
      <p className="mt-3">
        <span className="block font-display text-6xl font-extrabold leading-none tracking-tight text-ink tabular-nums" data-testid="coverage-value">
          {COUNT.format(within)} de {COUNT.format(linked)}
        </span>{' '}
        <span className="mt-2 block text-base text-ink-muted">{linked === 1 ? 'agricultor vinculado' : 'agricultores vinculados'} con cifras publicadas</span>
      </p>
      {linked > 0 && (
        <div className="mt-4">
          <ProgressBar value={within} max={linked} label="Participación" valueText={`${COUNT.format(within)} de ${COUNT.format(linked)}`} />
        </div>
      )}
      <dl className="mt-4 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm leading-relaxed">
        <dt className="font-semibold text-ink">Vinculados ({COUNT.format(linked)})</dt>
        <dd className="text-ink-muted">Tienen vínculo y cuenta activos en el sindicato, aporten o no. No es el padrón del sindicato.</dd>
        <dt className="font-semibold text-ink">Con cifras ({COUNT.format(within)})</dt>
        <dd className="text-ink-muted">
          Están dentro de alguna cifra publicada. Quien no figura es desconocido, no cero. Mide participación, no que los datos estén completos ni que
          sean suficientes.
        </dd>
      </dl>
      {(linked === 0 || sealed || coverage.suppressed_cells) && (
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {linked === 0 && 'Hoy no hay agricultores vinculados activos. '}
          {sealed && 'Fijada al sellar; no se recalcula. '}
          {coverage.suppressed_cells && 'Hay filas sin cifra (por la política F07-POL-01, en revisión o retiradas) cuyos aportes no se cuentan.'}
        </p>
      )}
    </>
  );
}
