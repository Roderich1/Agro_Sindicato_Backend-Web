/** Tipos de presentación de `components/ui` (no son tipos de la API). */

/**
 * Los ocho estados de datos y permisos del §4 del contrato compartido, más tres
 * de la lámina 05 (rediseño v2): sin conexión, servidor ocupado (429) y
 * política de publicación pendiente.
 */
export type DataStateKind =
  | 'loading'
  | 'empty'
  | 'no-match'
  | 'error'
  | 'forbidden'
  | 'restricted'
  | 'insufficient'
  | 'stale'
  | 'offline'
  | 'busy'
  | 'policy-pending';

/**
 * - `primary`: oscura sobre fondo claro (la acción principal de una vista o diálogo).
 * - `accent`: lima, para la acción principal sobre una superficie oscura (HeroPanel).
 * - `secondary`: con borde, fondo claro («Volver», «Cancelar»).
 * - `on-dark`: con borde claro, sobre superficie oscura («Descargar Excel» en la cabecera).
 * - `ghost`: sin borde ni fondo.
 * - `danger`: roja, para la acción destructiva de una confirmación.
 */
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'on-dark' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type NoticeKind = 'ok' | 'error' | 'info' | 'warn';
export type KpiTone = 'default' | 'muted' | 'attention' | 'inverse';

/**
 * Tonos de `Chip`. `hidden` es el estado «oculto» (borde discontinuo): no es
 * cero ni error. `on-dark` y `lime` son para la cabecera oscura.
 */
export type TagTone = 'neutral' | 'positive' | 'attention' | 'danger' | 'hidden' | 'dark' | 'lime' | 'on-dark';
