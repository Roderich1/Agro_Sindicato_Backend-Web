import { api } from '../lib/axios';
import type {
  CreatePurchaseResult,
  JointPurchasePayload,
  ListPurchasesQuery,
  Purchase,
} from '../types/procurement';

export const purchasesService = {
  list: (params?: ListPurchasesQuery) =>
    api.get<Purchase[]>('/purchases', { params }).then((r) => r.data),
  createJoint: (payload: JointPurchasePayload) =>
    api.post<CreatePurchaseResult>('/purchases/joint', payload).then((r) => r.data),
};

export type { CreateJointPurchaseItemPayload } from '../types/procurement';
