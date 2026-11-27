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
/** `cls`: tono del recuadro del icono (lámina 05); el título y el texto van siempre en tinta. */
const DEFAULTS: Record<DataStateKind, { title: string; description: string | null; icon: string | null; cls: string }> = {
  loading: { title: 'Cargando…', description: null, icon: null, cls: 'bg-sunken text-ink' },
  empty: {
    title: 'Sin registros',
    description: 'Todavía no hay registros para mostrar aquí. Eso no significa cero.',
    icon: ICON.inbox,
    cls: 'bg-sunken text-ink',
  },
  'no-match': {
    title: 'Sin coincidencias',
    description: 'Ningún registro coincide con el filtro aplicado.',
    icon: ICON.search,
    cls: 'bg-sunken text-ink',
  },
  error: {
    title: 'No se pudo cargar la información',
    description: 'Vuelva a intentarlo en un momento.',
    icon: ICON.warn,
    cls: 'bg-danger-bg text-danger-ink',
  },
  forbidden: {
    title: 'Sin permiso',
    description: 'Su rol no tiene acceso a esta información.',
    icon: ICON.lock,
    cls: 'bg-sunken text-ink',
  },
  restricted: {
    title: 'Información restringida',
    description: 'Esta cifra no se publica.',
    icon: ICON.lock,
    cls: 'bg-sunken text-ink',
  },
  insufficient: {
    title: 'Datos insuficientes',
    description: 'El servidor indica que no hay datos suficientes. No significa cero.',
    icon: ICON.chart,
    cls: 'bg-warn-bg text-warn-ink',
  },
  stale: {
    title: 'Resultado desactualizado',
    description: 'Este resultado corresponde a una ejecución anterior.',
    icon: ICON.clock,
    cls: 'bg-warn-bg text-warn-ink',
  },
  offline: {
    title: 'Sin conexión con el servidor',
    description: 'La Web no guarda cambios para después. Vuelva a intentarlo cuando tenga conexión.',
    icon: ICON.warn,
    cls: 'bg-danger-bg text-danger-ink',
  },
  busy: {
    title: 'El servidor está ocupado',
    description: 'Su sesión sigue abierta. Espere un momento y vuelva a intentarlo.',
    icon: ICON.info,
    cls: 'bg-warn-bg text-warn-ink',
  },
  'policy-pending': {
    title: 'Sin datos disponibles',
    description: '',
    icon: ICON.lock,
    cls: 'bg-warn-bg text-warn-ink',
  },
};

const STATE_ROLES: Partial<Record<DataStateKind, 'status' | 'alert'>> = {
  loading: 'status',
  error: 'alert',
  offline: 'alert',
  busy: 'alert',
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
  /** Sólo `restricted`: la explicación por defecto pasa a ser `statusReason(status)`. */
  status?: AnyStatus;
  /** Acción adicional propia de la vista (un enlace, por ejemplo). */
  action?: ReactNode;
  /** Versión en línea para una celda, tarjeta o fila. */
  compact?: boolean;
  /** Alineación de la versión completa: a la izquierda (láminas) o centrada. */
  align?: 'start' | 'center';
  /** Sólo `loading`: barras grises estáticas en lugar del texto solo (lámina 05). */
  skeletonRows?: number;
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

function DataStateActions({ retry, clear, action, compact, centered }: Readonly<{
  retry?: () => void;
  clear?: () => void;
  action?: ReactNode;
  compact: boolean;
  centered: boolean;
}>) {
  if (!retry && !clear && !action) return null;
  const size = compact ? 'sm' : 'md';
  const alignment = centered ? 'mt-4 justify-center' : 'mt-4';
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : alignment}`}>
      {clear && <button type="button" className={buttonClassFor('secondary', size)} onClick={clear}>Quitar filtros</button>}
      {retry && <button type="button" className={buttonClassFor('secondary', size)} onClick={retry}>Reintentar</button>}
      {action}
    </div>
  );
}

function DataStateSkeleton({ rows }: Readonly<{ rows: number }>) {
  return (
    <div className="mt-4 w-full space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-6">
          <div className="skeleton h-3.5" style={{ width: `${[46, 36, 40][index % 3]}%` }} />
          <div className="skeleton h-3.5 w-[16%]" />
        </div>
      ))}
    </div>
  );
}

/**
 * Un solo componente para cargando, sin registros, sin coincidencias, error,
 * sin permiso, información restringida, datos insuficientes y resultado
 * desactualizado: icono en un recuadro de color + título + explicación, nunca
 * un «0». El color acompaña; el título dice el estado.
 */
export function DataState({ state, title, description, onRetry, onClearFilters, status, action, compact = false, align = 'start', skeletonRows, testId }: Readonly<DataStateProps>) {
  const base = DEFAULTS[state];
  const fallback = state === 'restricted' && status ? (statusReason(status) ?? base.description) : base.description;
  const text = description ?? fallback;
  const loading = state === 'loading';
  const role = STATE_ROLES[state];
  const live = loading ? 'polite' : undefined;
  const centered = align === 'center';
  const buttons = (
    <DataStateActions
      retry={loading ? undefined : onRetry}
      clear={state === 'no-match' ? onClearFilters : undefined}
      action={action}
      compact={compact}
      centered={centered}
    />
  );

  if (compact) {
    return (
      <div
        className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs leading-snug text-ink"
        role={role}
        aria-live={live}
        data-state={state}
        data-testid={testId}
      >
        {loading ? <Spinner className="mt-px h-4 w-4" /> : <Icon d={base.icon!} className={`mt-px h-4 w-4 ${state === 'error' || state === 'offline' ? 'text-danger-ink' : ''}`} />}
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{title ?? base.title}</span>
          {text && <span className="text-ink-muted"> {text}</span>}
        </span>
        {buttons}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col px-6 py-6 ${centered ? 'items-center text-center' : 'items-start text-left'}`}
      role={role}
      aria-live={live}
      data-state={state}
      data-testid={testId}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-[14px] ${base.cls}`}>
        {loading ? <Spinner className="h-5 w-5" /> : <Icon d={base.icon!} className="h-5 w-5" />}
      </span>
      <p className="mt-3 font-display text-lg font-bold leading-snug text-ink">{title ?? base.title}</p>
      {text && <div className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">{text}</div>}
      {loading && skeletonRows !== undefined && skeletonRows > 0 && <DataStateSkeleton rows={skeletonRows} />}
      {buttons}
    </div>
  );
}
