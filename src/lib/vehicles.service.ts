import { apiFetch } from './api';
import type { LayoutData, SeatLayout, TripVehicle, VehicleCategory, VehicleTemplate } from '@/types';

export interface VehicleTemplateInput {
  name: string;
  category: VehicleCategory;
  code: string | null;
  aisle_config: string | null;
  description: string | null;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const listVehicleTemplates = () => apiFetch<VehicleTemplate[]>('/vehicle-templates');
export const createVehicleTemplate = (payload: VehicleTemplateInput & { layout: { name: string; layout_data: LayoutData } }) =>
  apiFetch<VehicleTemplate>('/vehicle-templates', json('POST', payload));
export const updateVehicleTemplate = (id: string, payload: Partial<VehicleTemplateInput & { status: 'ATIVO' | 'INATIVO' }>) =>
  apiFetch<VehicleTemplate>(`/vehicle-templates/${id}`, json('PATCH', payload));
export const createLayout = (templateId: string, payload: { name: string; layout_data: LayoutData; is_default: boolean }) =>
  apiFetch<SeatLayout>(`/vehicle-templates/${templateId}/layouts`, json('POST', payload));
export const updateLayout = (id: string, payload: Partial<{ name: string; layout_data: LayoutData; is_default: true }>) =>
  apiFetch<SeatLayout>(`/seat-layouts/${id}`, json('PATCH', payload));
export const duplicateLayout = (id: string) => apiFetch<SeatLayout>(`/seat-layouts/${id}/duplicate`, json('POST'));

export interface TripVehicleInput {
  seat_layout_id: string;
  operational_name: string;
  identifier: string | null;
  driver_name: string | null;
  operational_capacity?: number;
  notes: string | null;
}

// As operações de assento devolvem o mapa inteiro já atualizado.
export const listTripVehicles = (tripId: string) => apiFetch<TripVehicle[]>(`/trips/${tripId}/vehicles`);
export const addTripVehicle = (tripId: string, payload: TripVehicleInput) =>
  apiFetch<TripVehicle>(`/trips/${tripId}/vehicles`, json('POST', payload));
export const updateTripVehicle = (id: string, payload: Partial<Omit<TripVehicleInput, 'seat_layout_id'> & { status: 'ATIVO' | 'INATIVO' }>) =>
  apiFetch<TripVehicle>(`/trip-vehicles/${id}`, json('PATCH', payload));
export const removeTripVehicle = (id: string) => apiFetch<void>(`/trip-vehicles/${id}`, json('DELETE'));
export const assignSeat = (reservationId: string, tripSeatId: string, swap = false) =>
  apiFetch<TripVehicle[]>(`/reservations/${reservationId}/seat-assignment`, json('POST', { trip_seat_id: tripSeatId, swap }));
export const unassignSeat = (reservationId: string) =>
  apiFetch<TripVehicle[]>(`/reservations/${reservationId}/seat-assignment`, json('DELETE'));
export const blockSeat = (seatId: string, reason: string) => apiFetch<TripVehicle[]>(`/trip-seats/${seatId}/block`, json('POST', { reason }));
export const unblockSeat = (seatId: string) => apiFetch<TripVehicle[]>(`/trip-seats/${seatId}/unblock`, json('POST'));
