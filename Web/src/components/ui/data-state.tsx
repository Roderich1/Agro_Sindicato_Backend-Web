import type { ReactNode } from 'react';
import { statusReason } from '../../lib/collective-text';
import type { AnyStatus } from '../../types/collective';
import { buttonClassFor } from './classes';
import { ICON } from './icon-paths';
import { Icon } from './icons';
import type { DataStateKind } from './types';

/**
 * Textos por defecto de los ocho estados (§4 del contrato). Ninguno escribe
 * una cifra: la ausencia de datos nunca se presenta como cero.
 */
const DEFAULTS: Record<DataStateKind, { title: string; description: string | null; icon: string | null; cls: string }> = {
  loading: { title: 'Cargando…', description: null, icon: null, cls: 'text-slate-700' },
  empty: {
    title: 'Sin registros',
    description: 'Todavía no hay registros para mostrar aquí. Eso no significa cero.',
    icon: ICON.inbox,
    cls: 'text-slate-700',
  },
  'no-match': {
    title: 'Sin coincidencias',
    description: 'Ningún registro coincide con el filtro aplicado.',
    icon: ICON.search,
    cls: 'text-slate-700',
  },
  error: {
    title: 'No se pudo cargar la información',
    description: 'Vuelva a intentarlo en un momento.',
    icon: ICON.alert,
    cls: 'text-red-800',
  },
  forbidden: {
    title: 'Sin permiso',
    description: 'Su rol no tiene acceso a esta información.',
    icon: ICON.lock,
    cls: 'text-slate-700',
  },
  restricted: {
    title: 'Información restringida',
    description: 'Esta cifra no se publica.',
    icon: ICON.eyeOff,
    cls: 'text-slate-700',
  },
  insufficient: {
    title: 'Datos insuficientes',
    description: 'El servidor indica que no hay datos suficientes. No significa cero.',
    icon: ICON.chart,
    cls: 'text-amber-900',
  },
  stale: {
    title: 'Resultado desactualizado',
    description: 'Este resultado corresponde a una ejecución anterior.',
    icon: ICON.clock,
    cls: 'text-amber-900',
  },
};

export interface DataStateProps {
  state: DataStateKind;
  /** Sustituye el título por defecto del estado. */
  title?: string;
  /** Sustituye la explicación por defecto (p. ej. el texto de `collectiveError`). */
  description?: ReactNode;
  /** Muestra «Reintentar» (en todos los estados salvo `loading`). */
  onRetry?: () => void;
  /** Sólo `no-match`: muestra «Quitar filtros». */
  onClearFilters?: () => void;
  /** Sólo `restricted`: la explicación por defecto pasa a ser `statusReason(status, threshold)`. */
  status?: AnyStatus;
  threshold?: number | null;
  /** Acción adicional propia de la vista (un enlace, por ejemplo). */
  action?: ReactNode;
  /** Versión en línea para una celda, tarjeta o fila. */
  compact?: boolean;
  testId?: string;
}

function Spinner({ className }: { className: string }) {
  return (
    <svg className={`shrink-0 animate-spin motion-reduce:animate-none ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Un solo componente para cargando, sin registros, sin coincidencias, error,
 * sin permiso, información restringida, datos insuficientes y resultado
 * desactualizado: icono + título + explicación, nunca un «0».
 */
export function DataState({ state, title, description, onRetry, onClearFilters, status, threshold, action, compact = false, testId }: DataStateProps) {
  const base = DEFAULTS[state];
  const fallback = state === 'restricted' && status ? (statusReason(status, threshold) ?? base.description) : base.description;
  const text = description ?? fallback;
  const role = state === 'loading' ? 'status' : state === 'error' ? 'alert' : undefined;
  const iconSize = compact ? 'h-4 w-4' : 'h-6 w-6';
  const buttons =
    (onRetry && state !== 'loading') || (onClearFilters && state === 'no-match') || action ? (
      <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'mt-3 justify-center'}`}>
        {onClearFilters && state === 'no-match' && (
          <button type="button" className={buttonClassFor('secondary', 'sm')} onClick={onClearFilters}>
            Quitar filtros
          </button>
        )}
        {onRetry && state !== 'loading' && (
          <button type="button" className={buttonClassFor('secondary', 'sm')} onClick={onRetry}>
            Reintentar
          </button>
        )}
        {action}
      </div>
    ) : null;

  if (compact) {
    return (
      <div
        className={`flex flex-wrap items-start gap-x-2 gap-y-1 text-xs leading-snug ${base.cls}`}
        role={role}
        aria-live={state === 'loading' ? 'polite' : undefined}
        data-state={state}
        data-testid={testId}
      >
        {state === 'loading' ? <Spinner className={`mt-px ${iconSize}`} /> : <Icon d={base.icon!} className={`mt-px ${iconSize}`} />}
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{title ?? base.title}</span>
          {text && <span className="text-slate-600"> {text}</span>}
        </span>
        {buttons}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center px-5 py-8 text-center ${base.cls}`}
      role={role}
      aria-live={state === 'loading' ? 'polite' : undefined}
      data-state={state}
      data-testid={testId}
    >
      {state === 'loading' ? <Spinner className={iconSize} /> : <Icon d={base.icon!} className={iconSize} />}
      <p className="mt-2 text-sm font-semibold">{title ?? base.title}</p>
      {text && <div className="mt-1 max-w-prose text-sm leading-relaxed text-slate-600">{text}</div>}
      {buttons}
    </div>
  );
}
