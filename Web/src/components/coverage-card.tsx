import { Link } from 'react-router-dom';
import { fmtDateTime } from '../lib/collective-text';
import type { Coverage } from '../types/collective';

/**
 * Cobertura de participación de una campaña (F06 contrato:93-95; F10-SEC-02),
 * compartida por el Resumen, el detalle de campaña y la vista de Cobertura.
 *
 * - Denominador `linked_members`: agricultores con vínculo y cuenta activos en
 *   el sindicato, aporten o no. No es el padrón ni la población del sindicato.
 * - Numerador `members_with_contribution`: quienes están dentro de alguna cifra
 *   publicada (necesidad o consumo). Los aportes a filas sin cifra no se cuentan.
 * - `suppressed_cells`: alguna fila no tiene cifra; sin conteo.
 *
 * Sin umbrales de color: una cobertura alta no significa datos completos ni
 * suficientes. Sin porcentaje cuando no hay vinculados (denominador 0).
 */
export function CoverageCard({
  coverage,
  sealedAt,
  link,
  variant = 'compact',
  testId = 'coverage',
}: {
  /** `null` bajo `POLICY_PENDING`: el servidor no publica conteos. */
  coverage: Coverage | null;
  /** Versión sellada: la cobertura es la del sellado y no se recalcula. */
  sealedAt?: string | null;
  /** Enlace «Ver cobertura». */
  link?: string;
  /** `full`: con las definiciones completas (vista de Cobertura y detalle). */
  variant?: 'compact' | 'full';
  testId?: string;
}) {
  const title = sealedAt ? `Cobertura al sellar (${fmtDateTime(sealedAt)})` : 'Cobertura';
  if (!coverage) {
    // ui: DataState state="restricted"
    return (
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-5 py-4" data-testid={testId}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{title}</p>
        <p className="mt-1 text-sm font-semibold text-slate-800">Cobertura no disponible</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          Sin política de divulgación aprobada el servidor no publica conteos. Eso no significa cero.
        </p>
      </div>
    );
  }
  const { linked_members: linked, members_with_contribution: within } = coverage;
  const percent = percentOrNull(within, linked);
  return (
    <div className="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-5 py-4" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-900/70">{title}</p>
        {link && (
          <Link to={link} className="shrink-0 text-sm font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-900">
            Ver cobertura
          </Link>
        )}
      </div>
      <p className="mt-1 text-slate-900">
        <span className="text-3xl font-bold leading-tight tabular-nums" data-testid={`${testId}-value`}>
          {fmtCount(within)} de {fmtCount(linked)}
        </span>{' '}
        <span className="text-sm font-semibold">
          {linked === 1 ? 'agricultor vinculado' : 'agricultores vinculados'} con cifras publicadas
        </span>
        {percent && <span className="text-sm text-slate-600 tabular-nums"> ({percent})</span>}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        {linked === 0 && 'Hoy no hay agricultores vinculados activos: no se calcula porcentaje. '}
        {sealedAt && 'Fijada al sellar; no se recalcula. '}
        {coverage.suppressed_cells && 'Hay filas sin cifra (ocultas o en revisión) cuyos aportes no se cuentan. '}
        Ausencia de aporte = desconocido, no cero. No es el total del sindicato.
      </p>
      {variant === 'full' && (
        <dl className="mt-3 grid gap-2 border-t border-emerald-100 pt-3 text-xs leading-relaxed text-slate-600 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="font-semibold text-slate-800">Vinculados ({fmtCount(linked)})</dt>
            <dd>Agricultores con vínculo y cuenta activos en el sindicato, aporten o no. No es el padrón del sindicato.</dd>
          </div>
          <div className="min-w-0">
            <dt className="font-semibold text-slate-800">Con cifras publicadas ({fmtCount(within)})</dt>
            <dd>
              Quienes están dentro de alguna cifra publicada (necesidad o consumo). Mide participación, no que los datos
              estén completos ni que sean suficientes.
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

const COUNT = new Intl.NumberFormat('es-BO');

function fmtCount(value: number): string {
  return COUNT.format(value);
}

const PERCENT = new Intl.NumberFormat('es-BO', { style: 'percent', maximumFractionDigits: 0 });

// ui: fmtPercent (lib/format.ts, sesión A) sustituirá a esta función con la misma regla.
function percentOrNull(numerator: number, denominator: number): string | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return PERCENT.format(numerator / denominator);
}
