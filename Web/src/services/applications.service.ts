import { api } from '../lib/axios';
import type {
  AgrochemicalApplication,
  CancelApplicationPayload,
  CancelApplicationResult,
  CreateApplicationPayload,
  CreateApplicationResult,
  ListApplicationsQuery,
} from '../types/applications';

export const applicationsService = {
  list: (params?: ListApplicationsQuery) =>
    api.get<AgrochemicalApplication[]>('/applications', { params }).then((r) => r.data),
  get: (id: string) => api.get<AgrochemicalApplication>(`/applications/${id}`).then((r) => r.data),
  create: (payload: CreateApplicationPayload) =>
    api.post<CreateApplicationResult>('/applications', payload).then((r) => r.data),
  cancel: (id: string, payload: CancelApplicationPayload) =>
    api.post<CancelApplicationResult>(`/applications/${id}/cancel`, payload).then((r) => r.data),
};
