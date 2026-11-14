import type { AuditJsonValue, AuditLog } from '../../types/audit-logs';
import { ICON } from '../ui/icon-paths';

/**
 * Bitácora (láminas 32, 33.4 y 42): agrupación en el navegador de las filas que
 * ya devolvió `GET /audit-logs` (H-28). El filtro del servidor admite un solo
 * `entityName`; «Permisos» abarca dos (el permiso «Sustituir responsable» y los
 * permisos dentro de una convocatoria), así que se agrupa aquí, con datos del
 * propio registro, sin pedir nada más. H-08: sólo se muestra lo que el servidor
 * registra; nada se completa. D-01 (RF-02, RF-25): el servidor también registra
 * los cambios de cuentas, de nombres equivalentes y del catálogo.
 */
export type AuditCategory = 'convocatorias' | 'permisos' | 'catalogo' | 'campanas' | 'borradores' | 'cuentas' | 'otras';

export const AUDIT_CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: 'convocatorias', label: 'Convocatorias' },
  { value: 'permisos', label: 'Permisos' },
  { value: 'catalogo', label: 'Catálogo' },
  { value: 'campanas', label: 'Campañas' },
  { value: 'borradores', label: 'Borradores' },
  { value: 'cuentas', label: 'Cuentas' },
  { value: 'otras', label: 'Otras' },
];

const isObject = (value: AuditJsonValue): value is { [key: string]: AuditJsonValue } => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Categoría de una fila según su `entityName` (y, en una convocatoria, si el registro es de un permiso: `metadata.grant`). */
export function auditCategory(log: Pick<AuditLog, 'entityName' | 'metadata'>): AuditCategory {
  switch (log.entityName) {
    case 'JointPurchaseSubstitutionGrant':
      return 'permisos';
    case 'JointPurchaseCall':
      return isObject(log.metadata) && typeof log.metadata.grant === 'string' ? 'permisos' : 'convocatorias';
    case 'ProductIdentificationRequest':
    case 'InventoryProduct':
    case 'Product':
    case 'ProductCanonicalAssociation':
      return 'catalogo';
    case 'AgriculturalCampaign':
    case 'CollectiveSeal':
      return 'campanas';
    case 'JointPurchaseProposalSelection':
      return 'borradores';
    case 'User':
      return 'cuentas';
    default:
      return 'otras';
  }
}

export const CATEGORY_ICON: Record<AuditCategory, string> = {
  convocatorias: ICON.megaphone,
  permisos: ICON.users,
  catalogo: ICON.archive,
  campanas: ICON.calendar,
  borradores: ICON.clipboard,
  cuentas: ICON.lock,
  otras: ICON.document,
};

const SCOPE: Partial<Record<AuditCategory, string>> = { catalogo: 'Catálogo', cuentas: 'Cuentas' };

/**
 * D-01: texto de cada código que el servidor guarda en `metadata.event`. Un
 * código desconocido no se muestra: nunca aparece el código crudo.
 */
const EVENT_LABEL: Record<string, string> = {
  USER_CREATED: 'Cuenta creada',
  USER_UPDATED: 'Nombre de la cuenta cambiado',
  USER_ROLE_CHANGED: 'Cambio de rol',
  USER_DEACTIVATED: 'Cuenta desactivada',
  USER_REACTIVATED: 'Cuenta reactivada',
  USER_PASSWORD_RESET: 'Contraseña restablecida',
  PRODUCT_ALIAS_ASSOCIATED: 'Nombres unidos',
  PRODUCT_ALIAS_CORRECTED: 'Unión de nombres corregida',
  PRODUCT_ALIAS_UNDONE: 'Unión de nombres deshecha',
  PRODUCT_CREATED: 'Producto creado',
  PRODUCT_UPDATED: 'Producto editado',
  PRODUCT_DEACTIVATED: 'Producto inactivado',
};

/** «Tipo»: el texto del código `metadata.event`, o nada si no hay código o no se conoce. */
export function auditEventLabel(log: Pick<AuditLog, 'metadata'>): string | null {
  if (!isObject(log.metadata) || typeof log.metadata.event !== 'string') return null;
  return Object.hasOwn(EVENT_LABEL, log.metadata.event) ? EVENT_LABEL[log.metadata.event] : null;
}

/** «Dónde»: la campaña del registro o, si no tiene, el ámbito por su categoría (H-08). */
export function auditScope(log: AuditLog, campaignName: string | null): string | null {
  return campaignName ?? SCOPE[auditCategory(log)] ?? null;
}

/** «Nota»: el motivo o la nota que el servidor guardó en `metadata` (sustitución, identificación, permisos). */
export function auditNote(log: Pick<AuditLog, 'metadata'>): string | null {
  if (!isObject(log.metadata)) return null;
  const { reason, note } = log.metadata;
  if (typeof reason === 'string' && reason.trim()) return reason;
  if (typeof note === 'string' && note.trim()) return note;
  return null;
}
