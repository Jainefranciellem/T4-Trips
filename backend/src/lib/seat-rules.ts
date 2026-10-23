import type { ReservationStatus } from '@prisma/client';
import type { LayoutData } from '../schemas/vehicle.schema.js';
import { isConfirmed, isEnded } from './reservation-rules.js';

// Capacidade do layout = assentos que podem receber passageiro.
export const layoutCapacity = (layout: LayoutData) => layout.seats.filter((s) => !s.blocked).length;

// Copia o layout para os assentos da viagem (snapshot).
export function seatsFromLayout(layout: LayoutData) {
  return layout.seats.map((s) => ({
    seat_number: s.number,
    floor: s.floor,
    row: s.row,
    col: s.col,
    seat_type: s.type,
    accessible: s.accessible,
    status: s.blocked ? ('BLOQUEADO' as const) : ('LIVRE' as const),
    blocked_reason: s.blocked ? 'Bloqueado no layout' : null,
  }));
}

export type SeatDisplayStatus = 'LIVRE' | 'BLOQUEADO' | 'RESERVADO' | 'CONFIRMADO';

// spec 6.13: o status mostrado sai do bloqueio e da reserva que ocupa o assento.
export function seatDisplayStatus(seat: { status: 'LIVRE' | 'BLOQUEADO' }, occupant: { reservation_status: ReservationStatus } | null): SeatDisplayStatus {
  if (occupant) return isConfirmed(occupant.reservation_status) ? 'CONFIRMADO' : 'RESERVADO';
  return seat.status;
}

export interface AssignCheck {
  reservation: { reservation_status: ReservationStatus; trip_id: string };
  seat: { status: 'LIVRE' | 'BLOQUEADO'; trip_id: string; vehicle_active: boolean };
  occupiedBy: string | null; // reservation_id de quem está no assento
  reservationId: string;
  swap: boolean;
  // Passageiros já sentados no veículo de destino, sem contar este.
  vehicleOccupied: number;
  vehicleCapacity: number;
  movingWithinVehicle: boolean;
}

export type AssignError =
  | 'RESERVATION_INACTIVE'
  | 'WAITLIST'
  | 'OTHER_TRIP'
  | 'SEAT_BLOCKED'
  | 'VEHICLE_INACTIVE'
  | 'SEAT_TAKEN'
  | 'VEHICLE_FULL'
  | 'SAME_SEAT';

// RN-003 / RN-004 / CA-004 / CA-005.
export function checkSeatAssignment(c: AssignCheck): AssignError | null {
  if (isEnded(c.reservation.reservation_status)) return 'RESERVATION_INACTIVE';
  if (c.reservation.reservation_status === 'LISTA_ESPERA') return 'WAITLIST';
  if (c.seat.trip_id !== c.reservation.trip_id) return 'OTHER_TRIP';
  if (!c.seat.vehicle_active) return 'VEHICLE_INACTIVE';
  if (c.seat.status === 'BLOQUEADO') return 'SEAT_BLOCKED';
  if (c.occupiedBy === c.reservationId) return 'SAME_SEAT';
  if (c.occupiedBy && !c.swap) return 'SEAT_TAKEN';
  // Troca e mudança dentro do mesmo veículo não aumentam a ocupação.
  if (!c.occupiedBy && !c.movingWithinVehicle && c.vehicleOccupied + 1 > c.vehicleCapacity) return 'VEHICLE_FULL';
  return null;
}

export const assignErrorMessage: Record<AssignError, string> = {
  RESERVATION_INACTIVE: 'Reserva cancelada não ocupa assento',
  WAITLIST: 'Passageiro na lista de espera ainda não tem assento',
  OTHER_TRIP: 'Este assento é de outra viagem',
  SEAT_BLOCKED: 'Assento bloqueado',
  VEHICLE_INACTIVE: 'Veículo desativado nesta viagem',
  SEAT_TAKEN: 'Assento já ocupado',
  VEHICLE_FULL: 'O veículo atingiu a capacidade operacional',
  SAME_SEAT: 'O passageiro já está neste assento',
};

// Ordem natural: 2 antes de 10, "12A" depois de "12".
export const compareSeatNumbers = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
