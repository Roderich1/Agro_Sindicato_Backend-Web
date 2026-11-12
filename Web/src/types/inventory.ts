import type { ApiDateString, DecimalString, UserSummary } from './common';

export type StockMovementType = 'ENTRADA' | 'SALIDA' | 'AJUSTE';
export type InventoryCriticality = 'BAJO_MINIMO' | 'VENCIDO' | 'POR_VENCER' | 'OK';
export type StockMovementReasonType =
  | 'COMPRA'
  | 'ENTRADA_SIMPLE'
  | 'APLICACION'
  | 'PERDIDA_DERRAME'
  | 'VENCIMIENTO'
  | 'PRESTAMO_ENTREGA'
  | 'DEVOLUCION'
  | 'AJUSTE'
  | 'OTRO';

export interface ProductRefPayload {
  productId?: string;
  productName?: string;
  activeIngredient?: string;
  category?: string;
  unit?: string;
  minimumStock?: number;
  expirationWarningDays?: number;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  commercialName: string | null;
  activeIngredient: string | null;
  category: string | null;
  toxicologicalCategory: string | null;
  safetyDataSheetUrl: string | null;
  safetyDataSheetName: string | null;
  safetyInstructions: string | null;
  qrCodeValue: string | null;
  unit: string;
  minimumStock: DecimalString;
  expirationWarningDays: number;
  isActive: boolean;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
}

export interface CreateProductPayload {
  name: string;
  commercialName?: string;
  activeIngredient?: string;
  category?: string;
  toxicologicalCategory?: string | null;
  safetyDataSheetUrl?: string | null;
  safetyDataSheetName?: string | null;
  safetyInstructions?: string | null;
  qrCodeValue?: string | null;
  unit: string;
  minimumStock?: number;
  expirationWarningDays?: number;
}

export interface UpdateProductPayload {
  name?: string;
  commercialName?: string;
  activeIngredient?: string;
  category?: string;
  toxicologicalCategory?: string | null;
  safetyDataSheetUrl?: string | null;
  safetyDataSheetName?: string | null;
  safetyInstructions?: string | null;
  qrCodeValue?: string | null;
  unit?: string;
  minimumStock?: number;
  expirationWarningDays?: number;
}

export interface InventoryLot {
  id: string;
  productId: string;
  product: { id: string; name: string; unit: string; category: string | null };
  lotNumber: string | null;
  expirationDate: ApiDateString | null;
  warehouseName: string | null;
  currentQuantity: DecimalString;
  criticality: InventoryCriticality;
}

export interface StockLot {
  id: string;
  ownerUserId: string;
  owner?: UserSummary;
  product: {
    id: string;
    name: string;
    activeIngredient: string | null;
    category: string | null;
    unit: string;
    minimumStock: DecimalString;
    expirationWarningDays: number;
  };
  supplier: { id: string; name: string } | null;
  warehouse: { id: string; name: string; location: string | null } | null;
  lotNumber: string | null;
  expirationDate: ApiDateString | null;
  initialQuantity: DecimalString;
  currentQuantity: DecimalString;
  productTotalStock: DecimalString;
  criticality: InventoryCriticality;
  alerts: InventoryCriticality[];
  receivedAt: ApiDateString;
}

export interface ListProductsQuery {
  search?: string;
  category?: string;
  isActive?: boolean;
}

export interface ListStockQuery {
  search?: string;
  productId?: string;
  category?: string;
  criticality?: InventoryCriticality;
  orderBy?: 'name' | 'stock' | 'expiration';
  orderDirection?: 'asc' | 'desc';
}

export interface ListGlobalStockQuery extends ListStockQuery {
  ownerUserId?: string;
}

export interface StockMovement {
  id: string;
  campaignId: string | null;
  ownerUserId: string;
  type: StockMovementType;
  reasonType: StockMovementReasonType | null;
  reason: string | null;
  quantity: DecimalString;
  product: { id: string; name: string; unit: string };
  lot: { id: string; lotNumber: string | null; expirationDate: ApiDateString | null } | null;
  warehouse: { id: string; name: string } | null;
  registeredBy: { id: string; name: string; email: string } | null;
  occurredAt: ApiDateString;
  createdAt: ApiDateString;
}

export type { PayableAccount, PayableStatus } from './accounts-payable';
export type {
  JointPurchasePayload,
  PurchasePaymentMode,
  Supplier,
} from './procurement';
