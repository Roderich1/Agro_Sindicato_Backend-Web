import { api } from '../lib/axios';
import type {
  CreatePurchaseResult,
  CreatePurchasePayload,
  CreateSupplierPayload,
  JointPurchasePayload,
  ListPurchasesQuery,
  Purchase,
  Supplier,
  UpdateSupplierPayload,
} from '../types/procurement';

export const suppliersService = {
  list: (params?: { search?: string }) =>
    api.get<Supplier[]>('/suppliers', { params }).then((r) => r.data),
  create: (payload: CreateSupplierPayload) =>
    api.post<Supplier>('/suppliers', payload).then((r) => r.data),
  update: (id: string, payload: UpdateSupplierPayload) =>
    api.patch<Supplier>(`/suppliers/${id}`, payload).then((r) => r.data),
};

export const purchasesService = {
  list: (params?: ListPurchasesQuery) =>
    api.get<Purchase[]>('/purchases', { params }).then((r) => r.data),
  create: (payload: CreatePurchasePayload) =>
    api.post<CreatePurchaseResult>('/purchases', payload).then((r) => r.data),
  createJoint: (payload: JointPurchasePayload) =>
    api.post<CreatePurchaseResult>('/purchases/joint', payload).then((r) => r.data),
  get: (id: string) => api.get<Purchase>(`/purchases/${id}`).then((r) => r.data),
};

export type { CreateJointPurchaseItemPayload } from '../types/procurement';
