import { api } from '../lib/axios';
import type {
  Campaign,
  CloseCampaignPayload,
  CreateCampaignPayload,
  ListCampaignsQuery,
  UpdateCampaignPayload,
} from '../types/campaigns';

export const campaignsService = {
  list: (params?: ListCampaignsQuery) =>
    api.get<Campaign[]>('/campaigns', { params }).then((r) => r.data),
  active: () => api.get<Campaign | null>('/campaigns/active').then((r) => r.data),
  create: (payload: CreateCampaignPayload) =>
    api.post<Campaign>('/campaigns', payload).then((r) => r.data),
  update: (id: string, payload: UpdateCampaignPayload) =>
    api.patch<Campaign>(`/campaigns/${id}`, payload).then((r) => r.data),
  open: (id: string) => api.post<Campaign>(`/campaigns/${id}/open`).then((r) => r.data),
  close: (id: string, payload?: CloseCampaignPayload) =>
    api.post<Campaign>(`/campaigns/${id}/close`, payload ?? {}).then((r) => r.data),
};
