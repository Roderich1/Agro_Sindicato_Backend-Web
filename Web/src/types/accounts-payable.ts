import type { ApiDateString, DecimalString, UserSummary } from './common';
import type { Supplier } from './procurement';

export type PayableStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA';

export interface PayableAccount {
  id: string;
  purchaseId: string;
  campaignId?: string | null;
  responsibleUserId: string | null;
  responsibleUser: Pick<UserSummary, 'id' | 'name' | 'email'> | null;
  supplier: Pick<Supplier, 'id' | 'name' | 'phone'>;
  dueDate: ApiDateString;
  totalAmount: DecimalString;
  paidAmount: DecimalString;
  balance: DecimalString;
  status: PayableStatus;
  items: Array<{
    id: string;
    product: { id: string; name: string; unit: string };
    quantity: DecimalString;
    unitCost: DecimalString;
    subtotal: DecimalString;
  }>;
  payments: Array<{
    id: string;
    campaignId: string | null;
    amount: DecimalString;
    paidAt: ApiDateString;
    notes: string | null;
  }>;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
}

export interface ListPayablesQuery {
  status?: PayableStatus;
  supplierId?: string;
  campaignId?: string;
  ownerUserId?: string;
}

export interface RegisterPaymentPayload {
  amount: number;
  paidAt?: string;
  notes?: string;
}

export interface PayTotalPayload {
  notes?: string;
}

export interface PaymentResult {
  message: string;
  payment: {
    id: string;
    campaignId: string | null;
    amount: DecimalString;
    paidAt: ApiDateString;
    notes: string | null;
  };
  payable: PayableAccount;
}
