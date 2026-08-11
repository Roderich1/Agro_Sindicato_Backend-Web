import type { ApiDateString, DecimalString, UserSummary } from './common';
import type { CampaignStatus } from './campaigns';
import type { StockMovement } from './inventory';

export type AgrochemicalApplicationStatus = 'REGISTRADA' | 'ANULADA';

export interface AgrochemicalApplication {
  id: string;
  campaignId: string;
  campaign: { id: string; name: string; status: CampaignStatus; isActive: boolean } | null;
  plotId: string;
  plot: { id: string; name: string; location: string | null } | null;
  cropId: string;
  crop: { id: string; name: string; variety: string | null } | null;
  plotCropAssignmentId: string | null;
  productId: string;
  product: {
    id: string;
    name: string;
    unit: string;
    toxicologicalCategory: string | null;
  } | null;
  inventoryLotId: string | null;
  inventoryLot: { id: string; lotNumber: string | null; expirationDate: ApiDateString | null } | null;
  ownerUserId: string;
  owner: UserSummary | null;
  appliedById: string | null;
  appliedBy: UserSummary | null;
  quantity: DecimalString;
  dose: string | null;
  targetPest: string | null;
  weatherConditions: string | null;
  responsibleName: string | null;
  status: AgrochemicalApplicationStatus;
  appliedAt: ApiDateString;
  notes: string | null;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
}

export interface CreateApplicationResult {
  message: string;
  application: AgrochemicalApplication;
  movements: StockMovement[];
}

export interface CancelApplicationResult {
  message: string;
  application: AgrochemicalApplication;
}

export interface ListApplicationsQuery {
  campaignId?: string;
  plotId?: string;
  productId?: string;
  ownerUserId?: string;
  status?: AgrochemicalApplicationStatus;
}

export interface CreateApplicationPayload {
  campaignId?: string;
  plotId: string;
  productId: string;
  inventoryLotId?: string;
  quantity: number;
  dose?: string | null;
  targetPest?: string | null;
  weatherConditions?: string | null;
  responsibleName?: string | null;
  appliedAt?: string;
  notes?: string | null;
}

export interface CancelApplicationPayload {
  reason: string;
}
