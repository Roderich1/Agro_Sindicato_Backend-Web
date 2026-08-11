import { api } from '../lib/axios';
import type {
  ListSyncOperationsQuery,
  SyncOperationsPayload,
  SyncOperationsResponse,
  SyncedOperation,
} from '../types/sync';

export const syncService = {
  syncOperations: (payload: SyncOperationsPayload) =>
    api.post<SyncOperationsResponse>('/sync/operations', payload).then((r) => r.data),
  listOperations: (params?: ListSyncOperationsQuery) =>
    api.get<SyncedOperation[]>('/sync/operations', { params }).then((r) => r.data),
};
