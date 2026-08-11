import type { ApiDateString, DecimalString, UserSummary } from './common';
import type { ProductRefPayload } from './inventory';

export type PurchasePaymentMode = 'CONTADO' | 'CREDITO';
export type PurchaseStatus =
  | 'BORRADOR'
  | 'PROGRAMADA'
  | 'CONFIRMADA'
  | 'RECIBIDA_PARCIAL'
  | 'RECIBIDA'
  | 'CERRADA'
  | 'CANCELADA';
export type PurchaseType = 'INDIVIDUAL' | 'CONJUNTA';

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt?: ApiDateString;
  updatedAt?: ApiDateString;
}

export interface SupplierReferencePayload {
  supplierId?: string;
  supplierName?: string;
  phone?: string;
  address?: string;
}

export interface CreateSupplierPayload {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export type UpdateSupplierPayload = Partial<CreateSupplierPayload>;

export interface CreatePurchaseItemPayload {
  product: ProductRefPayload;
  quantity: number;
  unitCost: number;
  discountAmount?: number;
  receivedQuantity?: number;
  lotNumber?: string;
  expirationDate?: string;
}

export interface CreatePurchasePayload {
  supplier: SupplierReferencePayload;
  campaignId?: string;
  paymentMode: PurchasePaymentMode;
  status?: PurchaseStatus;
  items: CreatePurchaseItemPayload[];
  purchasedAt?: string;
  expectedAt?: string;
  dueDate?: string;
  warehouseName?: string;
  warehouseId?: string;
  notes?: string;
}

export interface JointPurchaseAllocationPayload {
  userId: string;
  quantity: number;
}

export interface CreateJointPurchaseItemPayload extends CreatePurchaseItemPayload {
  allocations: JointPurchaseAllocationPayload[];
}

export interface JointPurchasePayload extends Omit<CreatePurchasePayload, 'items'> {
  items: CreateJointPurchaseItemPayload[];
}

export interface PurchaseItem {
  id: string;
  product: { id: string; name: string; unit: string };
  quantity: DecimalString;
  unitCost: DecimalString;
  discountAmount: DecimalString;
  subtotal: DecimalString;
}

export interface Purchase {
  id: string;
  campaignId: string | null;
  campaign: { id: string; name: string; status: string; isActive: boolean } | null;
  type: PurchaseType;
  supplier: Pick<Supplier, 'id' | 'name' | 'phone'>;
  createdBy: UserSummary | null;
  paymentMode: PurchasePaymentMode;
  status: PurchaseStatus;
  totalAmount: DecimalString;
  discountAmount: DecimalString;
  purchasedAt: ApiDateString;
  expectedAt: ApiDateString | null;
  receivedAt: ApiDateString | null;
  notes: string | null;
  items: PurchaseItem[];
  participants: Array<{
    id: string;
    user: Pick<UserSummary, 'id' | 'name' | 'email'>;
    status: 'PENDIENTE' | 'CONFIRMADO' | 'ENTREGADO' | 'CANCELADO';
    requestedAmount: DecimalString;
    allocatedAmount: DecimalString;
  }>;
  payables: Array<{
    id: string;
    campaignId: string | null;
    responsibleUser: Pick<UserSummary, 'id' | 'name' | 'email'> | null;
    dueDate: ApiDateString;
    totalAmount: DecimalString;
    paidAmount: DecimalString;
    status: string;
  }>;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
}

export interface ListPurchasesQuery {
  supplierId?: string;
  status?: PurchaseStatus;
  paymentMode?: PurchasePaymentMode;
  type?: PurchaseType;
  from?: string;
  to?: string;
}

export interface CreatePurchaseResult {
  message: string;
  purchase: {
    id: string;
    campaignId: string | null;
    supplier: { id: string; name: string };
    paymentMode: PurchasePaymentMode;
    status: PurchaseStatus;
    totalAmount: DecimalString;
    discountAmount: DecimalString;
    purchasedAt: ApiDateString;
    expectedAt: ApiDateString | null;
    receivedAt: ApiDateString | null;
  };
  items: PurchaseItem[];
  lots: unknown[];
  movements: unknown[];
  payable: {
    id: string;
    campaignId: string | null;
    dueDate: ApiDateString;
    totalAmount: DecimalString;
    paidAmount: DecimalString;
    status: string;
  } | null;
}
