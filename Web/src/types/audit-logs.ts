import type { ApiDateString, UserSummary } from './common';
import type { CampaignStatus } from './campaigns';

export type AuditAction =
  | (string & {})
  | 'CREAR'
  | 'ACTUALIZAR'
  | 'INACTIVAR'
  | 'ELIMINAR'
  | 'ABRIR_CAMPANA'
  | 'CERRAR_CAMPANA'
  | 'AJUSTAR_STOCK'
  | 'REGISTRAR_PAGO'
  | 'SINCRONIZAR'
  | 'OTRO';

export type AuditJsonValue =
  | string
  | number
  | boolean
  | null
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };

export interface AuditCampaignSummary {
  id: string;
  name: string;
  status: CampaignStatus;
}

/** RNF-05, F10-SEC-02: la Bitácora nombra a las personas; nunca trae su correo. */
export type AuditPerson = Omit<UserSummary, 'email'>;

export interface AuditLog {
  id: string;
  campaignId: string | null;
  campaign?: AuditCampaignSummary | null;
  ownerUserId: string | null;
  owner?: AuditPerson | null;
  actorUserId: string | null;
  actor?: AuditPerson | null;
  action: AuditAction;
  entityName: string;
  entityId: string | null;
  summary: string | null;
  before: AuditJsonValue;
  after: AuditJsonValue;
  metadata: AuditJsonValue;
  createdAt: ApiDateString;
}

export interface ListAuditLogsQuery {
  campaignId?: string;
  ownerUserId?: string;
  actorUserId?: string;
  action?: AuditAction;
  entityName?: string;
  from?: string;
  to?: string;
}
