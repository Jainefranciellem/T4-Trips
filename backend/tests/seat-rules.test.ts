import { describe, expect, it } from 'vitest';
import { checkSeatAssignment, compareSeatNumbers, layoutCapacity, seatDisplayStatus, seatsFromLayout, type AssignCheck } from '../src/lib/seat-rules.js';
import { layoutDataSchema } from '../src/schemas/vehicle.schema.js';

const layout = {
  floors: [{ floor: 1, rows: 2, cols: 3 }],
  seats: [
    { floor: 1, row: 0, col: 0, number: '1' },
    { floor: 1, row: 0, col: 2, number: '2' },
    { floor: 1, row: 1, col: 0, number: '3', blocked: true },
  ],
};

describe('layout (spec 6.11)', () => {
  it('aceita layout válido e calcula a capacidade sem os bloqueados', () => {
    const parsed = layoutDataSchema.parse(layout);
    expect(layoutCapacity(parsed)).toBe(2);
    expect(seatsFromLayout(parsed).find((s) => s.seat_number === '3')?.status).toBe('BLOQUEADO');
  });

  it('recusa número repetido, posição repetida e assento fora da grade', () => {
    const dup = { ...layout, seats: [...layout.seats, { floor: 1, row: 1, col: 2, number: '1' }] };
    const samePos = { ...layout, seats: [...layout.seats, { floor: 1, row: 0, col: 0, number: '9' }] };
    const outside = { ...layout, seats: [{ floor: 1, row: 5, col: 0, number: '1' }] };
    for (const bad of [dup, samePos, outside]) expect(layoutDataSchema.safeParse(bad).success).toBe(false);
  });

  it('ordena números de assento naturalmente', () => {
    expect(['10', '2', '1', '12A', '12'].sort(compareSeatNumbers)).toEqual(['1', '2', '10', '12', '12A']);
  });
});

describe('status do assento (spec 6.13)', () => {
  it('reservado ou confirmado conforme a reserva', () => {
    expect(seatDisplayStatus({ status: 'LIVRE' }, null)).toBe('LIVRE');
    expect(seatDisplayStatus({ status: 'LIVRE' }, { reservation_status: 'RESERVADA' })).toBe('RESERVADO');
    expect(seatDisplayStatus({ status: 'LIVRE' }, { reservation_status: 'PAGA' })).toBe('CONFIRMADO');
  });
});

describe('checkSeatAssignment (RN-003 / RN-004)', () => {
  const base: AssignCheck = {
    reservation: { reservation_status: 'CONFIRMADA', trip_id: 't1' },
    seat: { status: 'LIVRE', trip_id: 't1', vehicle_active: true },
    occupiedBy: null,
    reservationId: 'r1',
    swap: false,
    vehicleOccupied: 0,
    vehicleCapacity: 10,
    movingWithinVehicle: false,
  };

  it('libera assento livre', () => expect(checkSeatAssignment(base)).toBeNull());
  it('bloqueia assento ocupado sem troca (CA-004)', () => expect(checkSeatAssignment({ ...base, occupiedBy: 'r2' })).toBe('SEAT_TAKEN'));
  it('aceita troca explícita', () => expect(checkSeatAssignment({ ...base, occupiedBy: 'r2', swap: true })).toBeNull());
  it('bloqueia assento bloqueado', () => expect(checkSeatAssignment({ ...base, seat: { ...base.seat, status: 'BLOQUEADO' } })).toBe('SEAT_BLOCKED'));
  it('respeita a capacidade do veículo (CA-005)', () => {
    expect(checkSeatAssignment({ ...base, vehicleOccupied: 10 })).toBe('VEHICLE_FULL');
    expect(checkSeatAssignment({ ...base, vehicleOccupied: 10, movingWithinVehicle: true })).toBeNull();
  });
  it('recusa cancelada, lista de espera e outra viagem', () => {
    expect(checkSeatAssignment({ ...base, reservation: { ...base.reservation, reservation_status: 'CANCELADA' } })).toBe('RESERVATION_INACTIVE');
    expect(checkSeatAssignment({ ...base, reservation: { ...base.reservation, reservation_status: 'LISTA_ESPERA' } })).toBe('WAITLIST');
    expect(checkSeatAssignment({ ...base, seat: { ...base.seat, trip_id: 't2' } })).toBe('OTHER_TRIP');
  });
});
