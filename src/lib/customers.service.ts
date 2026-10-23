import { apiFetch, apiFetchFile } from './api';
import type { Customer, CustomerLink, CustomerTrip, PassengerGroup } from '@/types';

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

export const listCustomerLinks = (id: string) => apiFetch<CustomerLink[]>(`/customers/${id}/relationships`);
export const addCustomerLink = (id: string, payload: { related_customer_id: string; relationship_type: string; group_name: string | null }) =>
  apiFetch(`/customers/${id}/relationships`, { method: 'POST', body: JSON.stringify(payload) });
export const removeCustomerLink = (linkId: string) => apiFetch<void>(`/customer-relationships/${linkId}`, { method: 'DELETE' });
export const listCustomerTrips = (id: string) => apiFetch<CustomerTrip[]>(`/customers/${id}/trips`);
export const listTripGroups = (tripId: string) => apiFetch<PassengerGroup[]>(`/trips/${tripId}/groups`);

// LGPD: baixa o arquivo com todos os dados do titular.
export async function exportCustomerData(id: string) {
  const { blob, filename } = await apiFetchFile(`/customers/${id}/export`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export const anonymizeCustomer = (id: string, reason: string) =>
  apiFetch<{ ok: true }>(`/customers/${id}/anonymize`, { method: 'POST', body: JSON.stringify({ reason }) });
