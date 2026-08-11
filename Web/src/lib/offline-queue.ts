import type { OfflineOperation, SyncOperationResult, SyncOperationStatus } from '../types/sync';

export const OFFLINE_QUEUE_KEY = 'agro_offline_queue_v2';
const LEGACY_QUEUE_KEY = 'agro_offline_queue_v1';
const CLIENT_ID_KEY = 'agro_client_id_v1';
const QUEUE_EVENT = 'agro-offline-queue-change';

export type QueuedOfflineOperation = OfflineOperation & {
  queuedAt: string;
  lastStatus?: SyncOperationStatus;
  errorMessage?: string;
  syncOperationId?: string;
  lastSyncedAt?: string;
};

export function getOfflineClientId() {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const created = `web-${crypto.randomUUID()}`;
  localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

export function readOfflineQueue(): QueuedOfflineOperation[] {
  const raw = localStorage.getItem(OFFLINE_QUEUE_KEY) ?? localStorage.getItem(LEGACY_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OfflineOperation[];
    return parsed.map((item) => ({
      ...item,
      queuedAt: 'queuedAt' in item && typeof item.queuedAt === 'string'
        ? item.queuedAt
        : new Date().toISOString(),
    })) as QueuedOfflineOperation[];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(queue: QueuedOfflineOperation[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  localStorage.removeItem(LEGACY_QUEUE_KEY);
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { count: queue.length } }));
}

export function queueOfflineOperation(operation: OfflineOperation) {
  const next = [...readOfflineQueue(), { ...operation, queuedAt: new Date().toISOString() }];
  writeOfflineQueue(next);
  return next;
}

export function plainOfflineOperation(item: QueuedOfflineOperation): OfflineOperation {
  return {
    clientOperationId: item.clientOperationId,
    operation: item.operation,
    payload: item.payload,
  } as OfflineOperation;
}

export function applySyncResults(
  queue: QueuedOfflineOperation[],
  results: SyncOperationResult[],
) {
  const byId = new Map(results.map((result) => [result.clientOperationId, result]));
  const now = new Date().toISOString();

  return queue.flatMap((item) => {
    const result = byId.get(item.clientOperationId);
    if (!result) return [item];
    if (result.status === 'APLICADA') return [];
    return [{
      ...item,
      lastStatus: result.status,
      errorMessage: result.errorMessage,
      syncOperationId: result.syncOperationId,
      lastSyncedAt: now,
    }];
  });
}

export function subscribeOfflineQueue(onChange: (count: number) => void) {
  const handler = () => onChange(readOfflineQueue().length);
  window.addEventListener(QUEUE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(QUEUE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
