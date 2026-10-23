import { describe, expect, it } from 'vitest';
import { checkRoomAssignment, roomCapacity, roomOccupancy, type RoomAssignCheck } from '../src/lib/room-rules.js';

const base: RoomAssignCheck = {
  reservation: { reservation_status: 'CONFIRMADA', trip_id: 't1' },
  room: { trip_id: 't1', active: true, capacity: 2, guests: 0 },
  currentRoomId: null,
  targetRoomId: 'q1',
  transfer: false,
};

describe('quartos (RN-005)', () => {
  it('capacidade da viagem sobrepõe a do cadastro', () => {
    expect(roomCapacity({ capacity_override: null, accommodation_room: { capacity: 2 } })).toBe(2);
    expect(roomCapacity({ capacity_override: 3, accommodation_room: { capacity: 2 } })).toBe(3);
  });

  it('classifica vazio, parcial e completo', () => {
    expect([roomOccupancy(0, 2), roomOccupancy(1, 2), roomOccupancy(2, 2)]).toEqual(['VAZIO', 'PARCIAL', 'COMPLETO']);
  });

  it('bloqueia terceiro hóspede num quarto duplo (CA-007)', () => {
    expect(checkRoomAssignment({ ...base, room: { ...base.room, guests: 2 } })).toBe('ROOM_FULL');
    expect(checkRoomAssignment({ ...base, room: { ...base.room, guests: 1 } })).toBeNull();
  });

  it('exige transferência explícita para quem já tem quarto (CA-008)', () => {
    expect(checkRoomAssignment({ ...base, currentRoomId: 'q2' })).toBe('ALREADY_IN_ROOM');
    expect(checkRoomAssignment({ ...base, currentRoomId: 'q2', transfer: true })).toBeNull();
    expect(checkRoomAssignment({ ...base, currentRoomId: 'q1' })).toBe('SAME_ROOM');
  });

  it('recusa quarto inativo, outra viagem, cancelada e lista de espera', () => {
    expect(checkRoomAssignment({ ...base, room: { ...base.room, active: false } })).toBe('ROOM_INACTIVE');
    expect(checkRoomAssignment({ ...base, room: { ...base.room, trip_id: 't2' } })).toBe('OTHER_TRIP');
    expect(checkRoomAssignment({ ...base, reservation: { ...base.reservation, reservation_status: 'CANCELADA' } })).toBe('RESERVATION_INACTIVE');
    expect(checkRoomAssignment({ ...base, reservation: { ...base.reservation, reservation_status: 'LISTA_ESPERA' } })).toBe('WAITLIST');
  });
});
