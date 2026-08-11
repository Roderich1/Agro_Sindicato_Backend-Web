import type { ApiDateString, UserSummary } from './common';
import type { CampaignStatus } from './campaigns';

export type PlotStatus = 'ACTIVA' | 'INACTIVA';
export type CropAssignmentStatus = 'PLANIFICADO' | 'ACTIVO' | 'CAMBIADO' | 'FINALIZADO';

export interface Plot {
  id: string;
  ownerUserId: string;
  owner: UserSummary | null;
  name: string;
  location: string | null;
  area: number | null;
  areaUnit: string;
  status: PlotStatus;
  notes: string | null;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
  summary: {
    cropAssignments: number;
    agrochemicalApplications: number;
  };
}

export interface Crop {
  id: string;
  name: string;
  variety: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
  summary: {
    cropAssignments: number;
    agrochemicalApplications: number;
  };
}

export interface PlotCropAssignment {
  id: string;
  campaignId: string;
  campaign: { id: string; name: string; status: CampaignStatus; isActive: boolean } | null;
  plotId: string;
  plot: { id: string; name: string; status: PlotStatus; area: number | null; areaUnit: string } | null;
  cropId: string;
  crop: { id: string; name: string; variety: string | null; isActive: boolean } | null;
  ownerUserId: string;
  owner: UserSummary | null;
  status: CropAssignmentStatus;
  plantedArea: number | null;
  plantedAt: ApiDateString | null;
  changedAt: ApiDateString | null;
  notes: string | null;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
}

export interface ListPlotsQuery {
  search?: string;
  status?: PlotStatus;
  ownerUserId?: string;
}

export interface CreatePlotPayload {
  name: string;
  location?: string | null;
  area?: number | null;
  areaUnit?: string;
  notes?: string | null;
}

export type UpdatePlotPayload = Partial<CreatePlotPayload>;

export interface ListCropsQuery {
  search?: string;
  isActive?: boolean;
}

export interface CreateCropPayload {
  name: string;
  variety?: string | null;
  notes?: string | null;
}

export interface UpdateCropPayload extends Partial<CreateCropPayload> {
  isActive?: boolean;
}

export interface ListPlotCropAssignmentsQuery {
  campaignId?: string;
  plotId?: string;
  ownerUserId?: string;
  status?: CropAssignmentStatus;
}

export interface CreatePlotCropAssignmentPayload {
  campaignId?: string;
  plotId: string;
  cropId: string;
  plantedArea?: number | null;
  plantedAt?: string | null;
  notes?: string | null;
}

export interface UpdatePlotCropAssignmentPayload {
  cropId?: string;
  status?: CropAssignmentStatus;
  plantedArea?: number | null;
  plantedAt?: string | null;
  notes?: string | null;
}
