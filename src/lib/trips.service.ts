import { apiFetch } from './api';
import type { Role, Trip, TripInput } from '@/types';

export interface TripFilters {
  q?: string;
  status?: string;
}

const qs = (filters: TripFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
  const s = params.toString();
  return s ? `?${s}` : '';
};

export const listTrips = (filters: TripFilters = {}) => apiFetch<Trip[]>(`/trips${qs(filters)}`);
export const getTrip = (id: string) => apiFetch<Trip>(`/trips/${id}`);

export const createTrip = (payload: TripInput) =>
  apiFetch<Trip>('/trips', { method: 'POST', body: JSON.stringify(payload) });

export const updateTrip = (id: string, payload: Partial<TripInput>) =>
  apiFetch<Trip>(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const duplicateTrip = (id: string) => apiFetch<Trip>(`/trips/${id}/duplicate`, { method: 'POST' });
export const archiveTrip = (id: string) => apiFetch<Trip>(`/trips/${id}/archive`, { method: 'POST' });
export const restoreTrip = (id: string) => apiFetch<Trip>(`/trips/${id}/restore`, { method: 'POST' });

export const cancelTrip = (id: string, reason: string) =>
  apiFetch<Trip>(`/trips/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });

export interface TripAccess {
  user_id: string;
  access_level: 'VISUALIZAR' | 'OPERAR';
  user: { id: string; name: string; role: Role };
}

export const getTripUsers = (id: string) => apiFetch<TripAccess[]>(`/trips/${id}/users`);

export const setTripUsers = (
  id: string,
  users: { user_id: string; access_level: 'VISUALIZAR' | 'OPERAR' }[],
) => apiFetch<void>(`/trips/${id}/users`, { method: 'PUT', body: JSON.stringify({ users }) });

export const listUserOptions = () =>
  apiFetch<{ id: string; name: string; role: Role }[]>('/users/options');
