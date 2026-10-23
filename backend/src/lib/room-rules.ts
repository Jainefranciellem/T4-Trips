import type { ReservationStatus } from '@prisma/client';
import { isEnded } from './reservation-rules.js';

export const roomCapacity = (room: { capacity_override: number | null; accommodation_room: { capacity: number } }) =>
  room.capacity_override ?? room.accommodation_room.capacity;

export type RoomOccupancy = 'VAZIO' | 'PARCIAL' | 'COMPLETO';

// RF-012: quartos vazios, parcialmente ocupados e completos.
export function roomOccupancy(guests: number, capacity: number): RoomOccupancy {
  if (guests === 0) return 'VAZIO';
  return guests >= capacity ? 'COMPLETO' : 'PARCIAL';
}

export interface RoomAssignCheck {
  reservation: { reservation_status: ReservationStatus; trip_id: string };
  room: { trip_id: string; active: boolean; capacity: number; guests: number };
  // Quarto atual da reserva, se tiver.
  currentRoomId: string | null;
  targetRoomId: string;
  transfer: boolean;
}

export type RoomAssignError = 'RESERVATION_INACTIVE' | 'WAITLIST' | 'OTHER_TRIP' | 'ROOM_INACTIVE' | 'SAME_ROOM' | 'ALREADY_IN_ROOM' | 'ROOM_FULL';

// RN-005 / CA-007 / CA-008.
export function checkRoomAssignment(c: RoomAssignCheck): RoomAssignError | null {
  if (isEnded(c.reservation.reservation_status)) return 'RESERVATION_INACTIVE';
  if (c.reservation.reservation_status === 'LISTA_ESPERA') return 'WAITLIST';
  if (c.room.trip_id !== c.reservation.trip_id) return 'OTHER_TRIP';
  if (!c.room.active) return 'ROOM_INACTIVE';
  if (c.currentRoomId === c.targetRoomId) return 'SAME_ROOM';
  if (c.currentRoomId && !c.transfer) return 'ALREADY_IN_ROOM';
  if (c.room.guests + 1 > c.room.capacity) return 'ROOM_FULL';
  return null;
}

export const roomErrorMessage: Record<RoomAssignError, string> = {
  RESERVATION_INACTIVE: 'Reserva cancelada não ocupa quarto',
  WAITLIST: 'Passageiro na lista de espera ainda não tem quarto',
  OTHER_TRIP: 'Este quarto é de outra viagem',
  ROOM_INACTIVE: 'Quarto desativado nesta viagem',
  SAME_ROOM: 'O hóspede já está neste quarto',
  ALREADY_IN_ROOM: 'O hóspede já está em outro quarto. Confirme a transferência.',
  ROOM_FULL: 'O quarto atingiu a capacidade',
};
