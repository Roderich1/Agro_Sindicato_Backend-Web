export type OfflineOperationType =
  | 'INITIAL_STOCK'
  | 'PLOT_CREATE'
  | 'PLOT_UPDATE'
  | 'PLOT_DEACTIVATE'
  | 'PLOT_CROP_ASSIGN'
  | 'STOCK_ENTRY'
  | 'STOCK_EXIT'
  | 'AGROCHEMICAL_APPLICATION'
  | 'PAYMENT_CREATE';

export type SyncOperationStatus = 'PENDIENTE' | 'APLICADA' | 'CONFLICTO' | 'RECHAZADA';

export interface OfflineOperationPayloadMap {
  INITIAL_STOCK: import('./inventory').RegisterInitialStockPayload;
  PLOT_CREATE: import('./plots').CreatePlotPayload;
  PLOT_UPDATE: import('./plots').UpdatePlotPayload & { id: string };
  PLOT_DEACTIVATE: { id: string };
  PLOT_CROP_ASSIGN: import('./plots').CreatePlotCropAssignmentPayload;
  STOCK_ENTRY: import('./inventory').RegisterStockEntryPayload;
  STOCK_EXIT: import('./inventory').RegisterStockExitPayload;
  AGROCHEMICAL_APPLICATION: import('./applications').CreateApplicationPayload;
  PAYMENT_CREATE: import('./accounts-payable').RegisterPaymentPayload & { payableId: string };
}

export type OfflineOperation<T extends OfflineOperationType = OfflineOperationType> = {
  [K in T]: {
    clientOperationId: string;
    operation: K;
    payload: OfflineOperationPayloadMap[K];
  };
}[T];

export interface SyncOperationsPayload {
  clientId: string;
  operations: OfflineOperation[];
}

export interface SyncedOperation {
  id: string;
  clientId: string;
  clientOperationId: string;
  operation: OfflineOperationType;
  status: SyncOperationStatus;
  errorMessage: string | null;
  createdAt: string;
  appliedAt: string | null;
  conflicts?: SyncConflict[];
}

export interface SyncConflict {
  id: string;
  serverSnapshot: Record<string, unknown>;
  clientSnapshot: Record<string, unknown>;
  resolvedAt: string | null;
}

export interface SyncOperationResult {
  clientOperationId: string;
  operation: OfflineOperationType;
  status: SyncOperationStatus;
  syncOperationId: string;
  duplicate?: boolean;
  errorMessage?: string;
  result?: Record<string, unknown>;
}

export interface SyncOperationsResponse {
  message: string;
  clientId: string;
  total: number;
  applied: number;
  conflicts: number;
  rejected: number;
  results: SyncOperationResult[];
}

export interface ListSyncOperationsQuery {
  clientId?: string;
}
