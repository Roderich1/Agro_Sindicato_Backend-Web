import { api } from '../lib/axios';
import type {
  ListPayablesQuery,
  PayTotalPayload,
  PayableAccount,
  PaymentResult,
  RegisterPaymentPayload,
} from '../types/accounts-payable';

export const payablesService = {
  list: (params?: ListPayablesQuery) =>
    api.get<PayableAccount[]>('/accounts-payable', { params }).then((r) => r.data),
  registerPayment: (id: string, payload: RegisterPaymentPayload) =>
    api.post<PaymentResult>(`/accounts-payable/${id}/payments`, payload).then((r) => r.data),
  payTotal: (id: string, payload?: PayTotalPayload) =>
    api.post<PaymentResult>(`/accounts-payable/${id}/pay-total`, payload ?? {}).then((r) => r.data),
};
