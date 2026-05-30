export type StockMovementType = 'ENTRADA' | 'SALIDA' | 'AJUSTE';
export type InventoryCriticality = 'BAJO_MINIMO' | 'VENCIDO' | 'POR_VENCER' | 'OK';
export type PurchasePaymentMode = 'CONTADO' | 'CREDITO';
export type PayableStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA';
export type OfflineOperationType = 'INITIAL_STOCK' | 'STOCK_ENTRY' | 'STOCK_EXIT';
export type AdjustmentDirection = 'INCREMENTO' | 'DECREMENTO';
export type AdjustmentReasonType = 'PERDIDA' | 'DANO' | 'CORRECCION';

export interface ProductRefPayload {
  productId?: string;
  productName?: string;
  activeIngredient?: string;
  category?: string;
  unit?: string;
  minimumStock?: number;
  expirationWarningDays?: number;
}

// HU-16: Producto agroquímico
export interface Product {
  id: string;
  name: string;
  commercialName: string | null;
  activeIngredient: string | null;
  category: string | null;
  unit: string;
  minimumStock: number;
  expirationWarningDays: number;
}

export interface CreateProductPayload {
  name: string;
  commercialName?: string;
  activeIngredient?: string;
  category?: string;
  unit: string;
  minimumStock: number;
  expirationWarningDays?: number;
}

export interface UpdateProductPayload {
  commercialName?: string;
  activeIngredient?: string;
  category?: string;
  unit?: string;
  minimumStock?: number;
  expirationWarningDays?: number;
}

// HU-17: Lote
export interface InventoryLot {
  id: string;
  productId: string;
  product: { id: string; name: string; unit: string; category: string | null };
  lotNumber: string | null;
  expirationDate: string | null;
  warehouseName: string | null;
  currentQuantity: string;
  criticality: InventoryCriticality;
}

export interface UpdateLotPayload {
  lotNumber?: string;
  expirationDate?: string;
  warehouseName?: string;
}

// HU-18: Ajuste de inventario
export interface CreateAdjustmentPayload {
  productId: string;
  inventoryLotId?: string;
  direction: AdjustmentDirection;
  reasonType: AdjustmentReasonType;
  quantity: number;
  reason?: string;
  lotNumber?: string;
  expirationDate?: string;
  warehouseName?: string;
}

// HU-19: Proveedor
export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export interface CreateSupplierPayload {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export interface UpdateSupplierPayload {
  name?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

// Stock
export interface StockLot {
  id: string;
  ownerUserId: string;
  owner?: { id: string; name: string; email: string; role: string };
  product: {
    id: string;
    name: string;
    activeIngredient: string | null;
    category: string | null;
    unit: string;
    minimumStock: string;
    expirationWarningDays: number;
  };
  supplier: { id: string; name: string } | null;
  warehouse: { id: string; name: string; location: string | null } | null;
  lotNumber: string | null;
  expirationDate: string | null;
  initialQuantity: string;
  currentQuantity: string;
  productTotalStock: string;
  criticality: InventoryCriticality;
  alerts: InventoryCriticality[];
  receivedAt: string;
}

export interface InventoryAlertResponse {
  stockMinimum: Array<{
    type: 'BAJO_MINIMO';
    product: { id: string; name: string; unit: string; minimumStock: string; currentStock: string };
    message: string;
  }>;
  expiration: Array<{
    type: 'VENCIDO' | 'POR_VENCER';
    product: { id: string; name: string; unit: string };
    lot: { id: string; lotNumber: string | null; expirationDate: string | null; currentQuantity: string };
    message: string;
  }>;
  total: number;
}

export interface CreatePurchasePayload {
  supplier: { supplierId?: string; supplierName?: string; phone?: string; address?: string };
  paymentMode: PurchasePaymentMode;
  dueDate?: string;
  purchasedAt?: string;
  warehouseName?: string;
  notes?: string;
  items: Array<{
    product: ProductRefPayload;
    quantity: number;
    unitCost: number;
    discountAmount?: number;
    lotNumber?: string;
    expirationDate?: string;
  }>;
}

// HU-20: Cuenta por pagar
export interface PayableAccount {
  id: string;
  purchaseId: string;
  supplier: { id: string; name: string; phone: string | null };
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
  status: PayableStatus;
  items: Array<{
    id: string;
    product: { id: string; name: string; unit: string };
    quantity: string;
    unitCost: string;
    subtotal: string;
  }>;
  payments: Array<{ id: string; amount: string; paidAt: string; notes: string | null }>;
}

export interface JointPurchasePayload extends CreatePurchasePayload {
  items: Array<CreatePurchasePayload['items'][number] & {
    allocations: Array<{ userId: string; quantity: number }>;
  }>;
}

export interface OfflineOperation {
  clientOperationId: string;
  operation: OfflineOperationType;
  payload: Record<string, unknown>;
}
