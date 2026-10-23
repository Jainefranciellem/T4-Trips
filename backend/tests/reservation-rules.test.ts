import { describe, expect, it } from 'vitest';
import {
  checkCapacity,
  computeFinalPrice,
  computeTripSummary,
  occupiesVacancy,
} from '../src/lib/reservation-rules.js';
import type { ReservationStatus } from '@prisma/client';

const now = new Date('2027-01-01T12:00:00Z');
const past = new Date('2027-01-01T11:00:00Z');
const future = new Date('2027-01-02T12:00:00Z');
const holds = { pending_holds_seat: true, auto_release_holds: true };
const r = (s: ReservationStatus, hold_expires_at: Date | null = null, final_price = 100000) => ({
  reservation_status: s,
  hold_expires_at,
  final_price,
});

describe('ocupação de vaga (RN-002)', () => {
  it('confirmada sempre ocupa; cancelada e lista de espera nunca', () => {
    const noHold = { pending_holds_seat: false, auto_release_holds: true };
    expect(occupiesVacancy(r('CONFIRMADA'), noHold, now)).toBe(true);
    expect(occupiesVacancy(r('PAGA'), noHold, now)).toBe(true);
    expect(occupiesVacancy(r('CANCELADA'), holds, now)).toBe(false);
    expect(occupiesVacancy(r('LISTA_ESPERA'), holds, now)).toBe(false);
  });

  it('pendente segue a configuração da viagem', () => {
    expect(occupiesVacancy(r('RESERVADA'), holds, now)).toBe(true);
    expect(occupiesVacancy(r('RESERVADA'), { ...holds, pending_holds_seat: false }, now)).toBe(false);
  });

  it('pré-reserva vencida libera a vaga só com liberação automática', () => {
    expect(occupiesVacancy(r('PRE_RESERVA', past), holds, now)).toBe(false);
    expect(occupiesVacancy(r('PRE_RESERVA', future), holds, now)).toBe(true);
    expect(occupiesVacancy(r('PRE_RESERVA', past), { ...holds, auto_release_holds: false }, now)).toBe(true);
  });
});

describe('checkCapacity', () => {
  it('bloqueia quando lota', () => {
    const others = [r('CONFIRMADA'), r('RESERVADA')];
    expect(checkCapacity({ capacity: 2, config: holds, others, nextStatus: 'RESERVADA' }, now)).toEqual({ ok: false, code: 'TRIP_FULL' });
    expect(checkCapacity({ capacity: 3, config: holds, others, nextStatus: 'RESERVADA' }, now)).toEqual({ ok: true });
  });

  it('confirmadas nunca passam da capacidade, mesmo com pendentes fora da conta', () => {
    const noHold = { pending_holds_seat: false, auto_release_holds: true };
    const others = [r('CONFIRMADA'), r('RESERVADA'), r('RESERVADA')];
    expect(checkCapacity({ capacity: 1, config: noHold, others, nextStatus: 'RESERVADA' }, now).ok).toBe(true);
    expect(checkCapacity({ capacity: 1, config: noHold, others, nextStatus: 'CONFIRMADA' }, now)).toEqual({ ok: false, code: 'CONFIRMED_OVER_CAPACITY' });
  });

  it('lista de espera não consome vaga', () => {
    expect(checkCapacity({ capacity: 1, config: holds, others: [r('CONFIRMADA')], nextStatus: 'LISTA_ESPERA' }, now).ok).toBe(true);
  });
});

describe('computeFinalPrice', () => {
  it('aplica desconto e acréscimo; cortesia zera', () => {
    expect(computeFinalPrice({ package_price: 128700, discount_amount: 10000, surcharge_amount: 2000, is_courtesy: false })).toBe(120700);
    expect(computeFinalPrice({ package_price: 128700, discount_amount: 0, surcharge_amount: 0, is_courtesy: true })).toBe(0);
    expect(computeFinalPrice({ package_price: 1000, discount_amount: 2000, surcharge_amount: 0, is_courtesy: false })).toBeNull();
  });
});

describe('computeTripSummary (RF-014)', () => {
  const trip = { commercial_capacity: 10, ...holds };
  const list = [
    r('CONFIRMADA', null, 128700),
    r('RESERVADA', null, 128700),
    r('PRE_RESERVA', past, 128700),
    r('CANCELADA', null, 128700),
    r('LISTA_ESPERA', null, 128700),
  ];

  it('conta vagas e separa situações', () => {
    const s = computeTripSummary(trip, list, true, now);
    expect(s).toMatchObject({ passengers: 3, confirmed: 1, pending: 1, expired_holds: 1, cancelled: 1, waitlist: 1, occupied: 2, available_seats: 8 });
  });

  it('receita prevista ignora canceladas e lista de espera (RN-010)', () => {
    const s = computeTripSummary(trip, list, true, now);
    expect(s.revenue_expected).toBe(3 * 128700);
    expect(s.revenue_pending).toBe(3 * 128700);
    expect(computeTripSummary(trip, list, false, now).revenue_expected).toBeNull();
  });
});
