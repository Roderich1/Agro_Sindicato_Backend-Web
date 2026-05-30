import { api } from '../lib/axios';
import type {
  CreateAdjustmentPayload,
  CreateProductPayload,
  CreatePurchasePayload,
  CreateSupplierPayload,
  InventoryAlertResponse,
  InventoryCriticality,
  InventoryLot,
  JointPurchasePayload,
  OfflineOperation,
  PayableAccount,
  Product,
  StockLot,
  Supplier,
  UpdateLotPayload,
  UpdateProductPayload,
  UpdateSupplierPayload,
} from '../types/inventory';

// HU-16: Productos agroquímicos
export const productsService = {
  list: (params?: { search?: string; category?: string }) =>
    api.get<Product[]>('/inventory/products', { params }).then((r) => r.data),
  create: (payload: CreateProductPayload) =>
    api.post<Product>('/inventory/products', payload).then((r) => r.data),
  update: (id: string, payload: UpdateProductPayload) =>
    api.patch<Product>(`/inventory/products/${id}`, payload).then((r) => r.data),
};

// HU-17: Lotes y vencimientos
export const lotsService = {
  list: (params?: { productId?: string }) =>
    api.get<InventoryLot[]>('/inventory/lots', { params }).then((r) => r.data),
  update: (id: string, payload: UpdateLotPayload) =>
    api.patch<InventoryLot>(`/inventory/lots/${id}`, payload).then((r) => r.data),
};

// HU-18: Ajustes de inventario
export const adjustmentsService = {
  create: (payload: CreateAdjustmentPayload) =>
    api.post('/inventory/adjustments', payload).then((r) => r.data),
};

// HU-19: Proveedores
export const suppliersService = {
  list: (params?: { search?: string }) =>
    api.get<Supplier[]>('/suppliers', { params }).then((r) => r.data),
  create: (payload: CreateSupplierPayload) =>
    api.post<Supplier>('/suppliers', payload).then((r) => r.data),
  update: (id: string, payload: UpdateSupplierPayload) =>
    api.patch<Supplier>(`/suppliers/${id}`, payload).then((r) => r.data),
};

// Inventario existente (stock, alertas, configuración)
export const inventoryService = {
  initialStock: (payload: unknown) => api.post('/inventory/initial-stock', payload),
  entry: (payload: unknown) => api.post('/inventory/entries', payload),
  exit: (payload: unknown) => api.post('/inventory/exits', payload),
  stock: (params?: {
    search?: string;
    productId?: string;
    category?: string;
    criticality?: InventoryCriticality;
    orderBy?: 'name' | 'stock' | 'expiration';
    orderDirection?: 'asc' | 'desc';
  }) => api.get<StockLot[]>('/inventory/stock', { params }).then((r) => r.data),
  globalStock: (params?: {
    search?: string;
    ownerUserId?: string;
    category?: string;
    criticality?: InventoryCriticality;
    orderBy?: 'name' | 'stock' | 'expiration';
    orderDirection?: 'asc' | 'desc';
  }) => api.get<StockLot[]>('/inventory/global-stock', { params }).then((r) => r.data),
  alerts: () => api.get<InventoryAlertResponse>('/inventory/alerts').then((r) => r.data),
  updateProductSettings: (
    productId: string,
    payload: { category?: string; minimumStock?: number; expirationWarningDays?: number },
  ) => api.patch(`/inventory/products/${productId}/settings`, payload),
};

// Compras
export const purchasesService = {
  create: (payload: CreatePurchasePayload) => api.post('/purchases', payload),
  createJoint: (payload: JointPurchasePayload) => api.post('/purchases/joint', payload),
};

// HU-20: Cuentas por pagar (pagos parciales y totales)
export const payablesService = {
  list: (params?: { status?: string; supplierId?: string }) =>
    api.get<PayableAccount[]>('/accounts-payable', { params }).then((r) => r.data),
  registerPayment: (id: string, payload: { amount: number; paidAt?: string; notes?: string }) =>
    api.post(`/accounts-payable/${id}/payments`, payload),
  payTotal: (id: string, payload?: { notes?: string }) =>
    api.post(`/accounts-payable/${id}/pay-total`, payload ?? {}),
};

// Sincronización offline
export const syncService = {
  syncOperations: (payload: { clientId: string; operations: OfflineOperation[] }) =>
    api.post('/sync/operations', payload),
  listOperations: (params?: { clientId?: string }) => api.get('/sync/operations', { params }),
};
