import { apiFetch } from './api';
import type { ManualReservationStatus, PublicReservation, Reservation } from '@/types';

export interface ReservationInput {
  reservation_status: ManualReservationStatus;
  package_price: number;
  discount_amount: number;
  surcharge_amount: number;
  is_courtesy: boolean;
  payment_due_date: string | null;
  notes: string | null;
}

export const listReservations = (tripId: string, status = 'TODAS') =>
  apiFetch<Reservation[]>(`/trips/${tripId}/reservations?status=${status}`);

export const createReservation = (tripId: string, payload: ReservationInput & { customer_id: string }) =>
  apiFetch<{ reservation: Reservation; public_url: string }>(`/trips/${tripId}/reservations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateReservation = (id: string, payload: Partial<ReservationInput> & { reason?: string | null }) =>
  apiFetch<Reservation>(`/reservations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const cancelReservation = (id: string, reason: string) =>
  apiFetch<Reservation>(`/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });

export const regeneratePublicLink = (id: string) =>
  apiFetch<{ reservation: Reservation; public_url: string }>(`/reservations/${id}/regenerate-public-link`, {
    method: 'POST',
  });

export const revokePublicLink = (id: string) =>
  apiFetch<Reservation>(`/reservations/${id}/revoke-public-link`, { method: 'POST' });

export const getPublicReservation = (token: string) => apiFetch<PublicReservation>(`/public/reservations/${token}`);
