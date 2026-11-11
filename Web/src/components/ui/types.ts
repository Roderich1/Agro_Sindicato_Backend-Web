/** Tipos de presentación de `components/ui` (no son tipos de la API). */

/** Los ocho estados de datos y permisos del §4 del contrato compartido. */
export type DataStateKind =
  | 'loading'
  | 'empty'
  | 'no-match'
  | 'error'
  | 'forbidden'
  | 'restricted'
  | 'insufficient'
  | 'stale';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';
export type NoticeKind = 'ok' | 'error' | 'info' | 'warn';
export type KpiTone = 'default' | 'muted' | 'attention';
