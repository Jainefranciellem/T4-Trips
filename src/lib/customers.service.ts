import { apiFetch } from './api';
import type { Customer } from '@/types';

export interface CustomerList {
  total: number;
  page: number;
  page_size: number;
  items: Customer[];
}

export type CustomerInput = Partial<Omit<Customer, 'id' | 'status'>> & { full_name: string };

export const listCustomers = (params: { q?: string; status?: string; page?: number }) => {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.status) sp.set('status', params.status);
  if (params.page) sp.set('page', String(params.page));
  return apiFetch<CustomerList>(`/customers?${sp.toString()}`);
};

export const createCustomer = (payload: CustomerInput, confirmDuplicate = false) =>
  apiFetch<Customer>('/customers', {
    method: 'POST',
    body: JSON.stringify({ ...payload, confirm_duplicate: confirmDuplicate }),
  });

export const updateCustomer = (id: string, payload: Partial<CustomerInput>) =>
  apiFetch<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const archiveCustomer = (id: string) =>
  apiFetch<Customer>(`/customers/${id}/archive`, { method: 'POST' });

export const restoreCustomer = (id: string) =>
  apiFetch<Customer>(`/customers/${id}/restore`, { method: 'POST' });
