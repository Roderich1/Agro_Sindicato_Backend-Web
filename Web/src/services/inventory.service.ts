import { api } from '../lib/axios';
import { payablesService } from './accounts-payable.service';
import { purchasesService, suppliersService } from './procurement.service';
import { syncService } from './sync.service';
import type {
  CreateAdjustmentPayload,
  CreateProductPayload,
  InventoryAlertResponse,
  InventoryLot,
  ListGlobalStockQuery,
  ListLotsQuery,
  ListProductsQuery,
  ListStockMovementsQuery,
  ListStockQuery,
  Product,
  RegisterInitialStockPayload,
  RegisterStockEntryPayload,
  RegisterStockExitPayload,
  StockLot,
  StockMovement,
  StockOperationResult,
  UpdateLotPayload,
  UpdateProductPayload,
  UpdateProductSettingsPayload,
} from '../types/inventory';

export const productsService = {
  list: (params?: ListProductsQuery) =>
    api.get<Product[]>('/inventory/products', { params }).then((r) => r.data),
  create: (payload: CreateProductPayload) =>
    api.post<Product>('/inventory/products', payload).then((r) => r.data),
  update: (id: string, payload: UpdateProductPayload) =>
    api.patch<Product>(`/inventory/products/${id}`, payload).then((r) => r.data),
  deactivate: (id: string) =>
    api.post<Product>(`/inventory/products/${id}/deactivate`).then((r) => r.data),
};

export const lotsService = {
  list: (params?: ListLotsQuery) =>
    api.get<InventoryLot[]>('/inventory/lots', { params }).then((r) => r.data),
  update: (id: string, payload: UpdateLotPayload) =>
    api.patch<InventoryLot>(`/inventory/lots/${id}`, payload).then((r) => r.data),
};

export const adjustmentsService = {
  create: (payload: CreateAdjustmentPayload) =>
    api.post<StockOperationResult>('/inventory/adjustments', payload).then((r) => r.data),
};

export const inventoryService = {
  initialStock: (payload: RegisterInitialStockPayload) =>
    api.post<StockOperationResult>('/inventory/initial-stock', payload).then((r) => r.data),
  entry: (payload: RegisterStockEntryPayload) =>
    api.post<StockOperationResult>('/inventory/entries', payload).then((r) => r.data),
  exit: (payload: RegisterStockExitPayload) =>
    api.post<StockOperationResult>('/inventory/exits', payload).then((r) => r.data),
  stock: (params?: ListStockQuery) =>
    api.get<StockLot[]>('/inventory/stock', { params }).then((r) => r.data),
  globalStock: (params?: ListGlobalStockQuery) =>
    api.get<StockLot[]>('/inventory/global-stock', { params }).then((r) => r.data),
  alerts: () => api.get<InventoryAlertResponse>('/inventory/alerts').then((r) => r.data),
  movements: (params?: ListStockMovementsQuery) =>
    api.get<StockMovement[]>('/inventory/movements', { params }).then((r) => r.data),
  updateProductSettings: (productId: string, payload: UpdateProductSettingsPayload) =>
    api.patch<Product>(`/inventory/products/${productId}/settings`, payload).then((r) => r.data),
};

export { payablesService, purchasesService, suppliersService, syncService };
