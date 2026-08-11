import { api } from '../lib/axios';
import type {
  CreateCropPayload,
  CreatePlotCropAssignmentPayload,
  CreatePlotPayload,
  Crop,
  ListCropsQuery,
  ListPlotCropAssignmentsQuery,
  ListPlotsQuery,
  Plot,
  PlotCropAssignment,
  UpdateCropPayload,
  UpdatePlotCropAssignmentPayload,
  UpdatePlotPayload,
} from '../types/plots';

export const plotsService = {
  list: (params?: ListPlotsQuery) => api.get<Plot[]>('/plots', { params }).then((r) => r.data),
  create: (payload: CreatePlotPayload) => api.post<Plot>('/plots', payload).then((r) => r.data),
  update: (id: string, payload: UpdatePlotPayload) =>
    api.patch<Plot>(`/plots/${id}`, payload).then((r) => r.data),
  deactivate: (id: string) => api.post<Plot>(`/plots/${id}/deactivate`).then((r) => r.data),
};

export const cropsService = {
  list: (params?: ListCropsQuery) => api.get<Crop[]>('/crops', { params }).then((r) => r.data),
  create: (payload: CreateCropPayload) => api.post<Crop>('/crops', payload).then((r) => r.data),
  update: (id: string, payload: UpdateCropPayload) =>
    api.patch<Crop>(`/crops/${id}`, payload).then((r) => r.data),
};

export const plotCropAssignmentsService = {
  list: (params?: ListPlotCropAssignmentsQuery) =>
    api.get<PlotCropAssignment[]>('/plot-crop-assignments', { params }).then((r) => r.data),
  create: (payload: CreatePlotCropAssignmentPayload) =>
    api.post<PlotCropAssignment>('/plot-crop-assignments', payload).then((r) => r.data),
  update: (id: string, payload: UpdatePlotCropAssignmentPayload) =>
    api.patch<PlotCropAssignment>(`/plot-crop-assignments/${id}`, payload).then((r) => r.data),
};
