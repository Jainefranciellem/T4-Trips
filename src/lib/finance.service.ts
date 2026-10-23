import { apiFetch } from './api';
import type {
  CostType,
  ExpenseCategory,
  FileRef,
  FinanceDashboard,
  LedgerEntry,
  PaymentMethod,
  Receivable,
  ReservationFinance,
  TripExpense,
} from '@/types';

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface PaymentInput {
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  receipt_file_id: string | null;
  confirm_overpayment?: boolean;
}

export const uploadReceipt = (file: File) => {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<FileRef & { size: number }>('/files', { method: 'POST', body });
};
export const getFileUrl = (id: string) => apiFetch<{ url: string; expires_in: number }>(`/files/${id}/url`);

export const getReservationFinance = (id: string) => apiFetch<ReservationFinance>(`/reservations/${id}/finance`);
export const savePaymentPlan = (id: string, installments: { due_date: string; amount: number }[]) =>
  apiFetch<ReservationFinance>(`/reservations/${id}/payment-plan`, json('POST', { installments }));
export const registerPayment = (id: string, payload: PaymentInput) =>
  apiFetch<ReservationFinance>(`/reservations/${id}/payments`, json('POST', payload));
export const reversePayment = (id: string, reason: string) => apiFetch<ReservationFinance>(`/payments/${id}/reverse`, json('POST', { reason }));
export const registerRefund = (id: string, payload: Omit<PaymentInput, 'receipt_file_id' | 'confirm_overpayment'> & { reason: string }) =>
  apiFetch<ReservationFinance>(`/reservations/${id}/refunds`, json('POST', payload));

export const listReceivables = (tripId: string) => apiFetch<Receivable[]>(`/trips/${tripId}/receivables`);
export const listTripPayments = (tripId: string) => apiFetch<LedgerEntry[]>(`/trips/${tripId}/payments`);
export const getFinanceDashboard = (tripId: string) => apiFetch<FinanceDashboard>(`/trips/${tripId}/finance-dashboard`);

export interface ExpenseInput {
  category_id: string;
  description: string;
  supplier_name: string | null;
  cost_type: CostType;
  planned_amount: number;
  due_date: string | null;
  notes: string | null;
  receipt_file_id: string | null;
}

export const listExpenseCategories = () => apiFetch<ExpenseCategory[]>('/expense-categories');
export const createExpenseCategory = (name: string) => apiFetch<ExpenseCategory>('/expense-categories', json('POST', { name }));
export const listExpenses = (tripId: string) => apiFetch<TripExpense[]>(`/trips/${tripId}/expenses`);
export const createExpense = (tripId: string, payload: ExpenseInput) => apiFetch<TripExpense>(`/trips/${tripId}/expenses`, json('POST', payload));
export const updateExpense = (id: string, payload: Partial<ExpenseInput>) => apiFetch<TripExpense>(`/expenses/${id}`, json('PATCH', payload));
export const cancelExpense = (id: string, reason: string) => apiFetch<TripExpense>(`/expenses/${id}/cancel`, json('POST', { reason }));
export const payExpense = (id: string, payload: PaymentInput) => apiFetch<TripExpense>(`/expenses/${id}/payments`, json('POST', payload));
export const reverseExpensePayment = (id: string, reason: string) => apiFetch<TripExpense>(`/expense-payments/${id}/reverse`, json('POST', { reason }));
