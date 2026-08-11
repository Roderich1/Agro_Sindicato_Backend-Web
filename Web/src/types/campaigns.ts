import type { ApiDateString } from './common';

export type CampaignStatus = 'PLANIFICADA' | 'ABIERTA' | 'CERRADA' | 'CANCELADA';

export interface CampaignSummary {
  plotCropAssignments: number;
  purchases: number;
  stockMovements: number;
  agrochemicalApplications: number;
  payableAccounts: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  isActive: boolean;
  startDate: ApiDateString;
  estimatedEndDate: ApiDateString | null;
  closedAt: ApiDateString | null;
  notes: string | null;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
  summary: CampaignSummary;
}

export interface ListCampaignsQuery {
  status?: CampaignStatus;
  search?: string;
}

export interface CreateCampaignPayload {
  name: string;
  startDate: string;
  estimatedEndDate?: string | null;
  notes?: string | null;
}

export type UpdateCampaignPayload = Partial<CreateCampaignPayload>;

export interface CloseCampaignPayload {
  notes?: string | null;
}
