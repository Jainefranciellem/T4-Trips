import { apiFetch } from './api';
import type { Accommodation, AccommodationRoom, RoomType, TripAccommodation } from '@/types';

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface AccommodationInput {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface RoomInput {
  identifier: string;
  name: string | null;
  room_type: RoomType;
  capacity: number;
  beds: number;
  floor: string | null;
  notes: string | null;
}

export const listAccommodations = () => apiFetch<Accommodation[]>('/accommodations');
export const createAccommodation = (payload: AccommodationInput) => apiFetch<Accommodation>('/accommodations', json('POST', payload));
export const updateAccommodation = (id: string, payload: Partial<AccommodationInput & { status: 'ATIVO' | 'INATIVO' }>) =>
  apiFetch<Accommodation>(`/accommodations/${id}`, json('PATCH', payload));
export const createRoom = (accommodationId: string, payload: RoomInput) =>
  apiFetch<AccommodationRoom>(`/accommodations/${accommodationId}/rooms`, json('POST', payload));
export const updateRoom = (id: string, payload: Partial<RoomInput & { status: 'ATIVO' | 'INATIVO' }>) =>
  apiFetch<AccommodationRoom>(`/rooms/${id}`, json('PATCH', payload));

// As operações da viagem devolvem a lista inteira já atualizada.
export const listTripAccommodations = (tripId: string) => apiFetch<TripAccommodation[]>(`/trips/${tripId}/accommodations`);
export const addTripAccommodation = (tripId: string, payload: { accommodation_id: string; room_ids?: string[]; notes?: string | null }) =>
  apiFetch<TripAccommodation[]>(`/trips/${tripId}/accommodations`, json('POST', payload));
export const updateTripAccommodation = (id: string, payload: { notes?: string | null; status?: 'ATIVO' | 'INATIVO' }) =>
  apiFetch<TripAccommodation[]>(`/trip-accommodations/${id}`, json('PATCH', payload));
export const removeTripAccommodation = (id: string) => apiFetch<TripAccommodation[]>(`/trip-accommodations/${id}`, json('DELETE'));
export const addTripRooms = (id: string, roomIds: string[]) =>
  apiFetch<TripAccommodation[]>(`/trip-accommodations/${id}/rooms`, json('POST', { room_ids: roomIds }));
export const updateTripRoom = (id: string, payload: { capacity_override?: number | null; notes?: string | null; status?: 'ATIVO' | 'INATIVO' }) =>
  apiFetch<TripAccommodation[]>(`/trip-rooms/${id}`, json('PATCH', payload));
export const assignRoom = (reservationId: string, tripRoomId: string, transfer = false) =>
  apiFetch<TripAccommodation[]>(`/reservations/${reservationId}/room-assignment`, json('POST', { trip_room_id: tripRoomId, transfer }));
export const unassignRoom = (reservationId: string) =>
  apiFetch<TripAccommodation[]>(`/reservations/${reservationId}/room-assignment`, json('DELETE'));
export const addGuests = (tripRoomId: string, reservationIds: string[], transfer: boolean) =>
  apiFetch<TripAccommodation[]>(`/trip-rooms/${tripRoomId}/guests`, json('POST', { reservation_ids: reservationIds, transfer }));
