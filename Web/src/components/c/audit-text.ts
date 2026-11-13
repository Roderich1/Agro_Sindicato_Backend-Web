import type { AuditJsonValue, AuditLog } from '../../types/audit-logs';
import { ICON } from '../ui/icon-paths';

/**
 * Bitácora (láminas 32, 33.4 y 42): agrupación en el navegador de las filas que
 * ya devolvió `GET /audit-logs` (H-28). El filtro del servidor admite un solo
 * `entityName`; «Permisos» abarca dos (el permiso «Sustituir responsable» y los
 * permisos dentro de una convocatoria), así que se agrupa aquí, con datos del
 * propio registro, sin pedir nada más. H-08: sólo se muestra lo que el servidor
 * registra; nada se completa.
 */
export type AuditCategory = 'convocatorias' | 'permisos' | 'catalogo' | 'campanas' | 'borradores' | 'otras';

export const AUDIT_CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: 'convocatorias', label: 'Convocatorias' },
  { value: 'permisos', label: 'Permisos' },
  { value: 'catalogo', label: 'Catálogo' },
  { value: 'campanas', label: 'Campañas' },
  { value: 'borradores', label: 'Borradores' },
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
      return 'catalogo';
    case 'AgriculturalCampaign':
    case 'CollectiveSeal':
      return 'campanas';
    case 'JointPurchaseProposalSelection':
      return 'borradores';
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
  otras: ICON.document,
};

const SCOPE: Partial<Record<AuditCategory, string>> = { catalogo: 'Catálogo' };

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
