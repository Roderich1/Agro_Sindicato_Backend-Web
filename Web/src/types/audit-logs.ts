import type { ApiDateString, UserSummary } from './common';
import type { CampaignStatus } from './campaigns';

export type AuditAction =
  | 'CREAR'
  | 'ACTUALIZAR'
  | 'INACTIVAR'
  | 'ELIMINAR'
  | 'ABRIR_CAMPANA'
  | 'CERRAR_CAMPANA'
  | 'AJUSTAR_STOCK'
  | 'REGISTRAR_PAGO'
  | 'SINCRONIZAR'
  | 'OTRO'
  | string;

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

export interface AuditLog {
  id: string;
  campaignId: string | null;
  campaign?: AuditCampaignSummary | null;
  ownerUserId: string | null;
  owner?: UserSummary | null;
  actorUserId: string | null;
  actor?: UserSummary | null;
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
