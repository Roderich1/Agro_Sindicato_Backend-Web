import type { CampaignStatus } from '../../types/campaigns';

export const MANAGER_ROLES = ['DIRECTIVA', 'ADMINISTRADOR'];

export const STATUS_FILTER_TEXT: Record<CampaignStatus, string> = {
  PLANIFICADA: 'Planificada',
  ABIERTA: 'Abierta',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};
