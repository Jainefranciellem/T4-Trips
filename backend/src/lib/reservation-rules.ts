import type { ReservationStatus } from '@prisma/client';

export const ACTIVE_STATUSES: ReservationStatus[] = [
  'PRE_RESERVA',
  'RESERVADA',
  'CONFIRMADA',
  'PARCIALMENTE_PAGA',
  'PAGA',
  'ATRASADA',
  'LISTA_ESPERA',
];

const CONFIRMED: ReservationStatus[] = ['CONFIRMADA', 'PARCIALMENTE_PAGA', 'PAGA', 'ATRASADA'];
const PENDING: ReservationStatus[] = ['PRE_RESERVA', 'RESERVADA'];
const ENDED: ReservationStatus[] = ['CANCELADA', 'REEMBOLSADA'];

// Status que dá pra escolher à mão. Os financeiros vêm dos pagamentos e o
// cancelamento tem ação própria (libera recursos e pede motivo).
export const MANUAL_RESERVATION_STATUSES: ReservationStatus[] = [
  'PRE_RESERVA',
  'RESERVADA',
  'CONFIRMADA',
  'LISTA_ESPERA',
];

export const isConfirmed = (s: ReservationStatus) => CONFIRMED.includes(s);
export const isEnded = (s: ReservationStatus) => ENDED.includes(s);

export interface VacancyConfig {
  pending_holds_seat: boolean;
  auto_release_holds: boolean;
}

export interface ReservationLike {
  reservation_status: ReservationStatus;
  hold_expires_at: Date | null;
  final_price: number;
  // Pago líquido (pagamentos válidos menos reembolsos).
  paid?: number;
}

// Pré-reserva vencida conta como liberada quando a viagem libera sozinha.
export function isExpiredHold(r: Pick<ReservationLike, 'reservation_status' | 'hold_expires_at'>, now = new Date()) {
  return r.reservation_status === 'PRE_RESERVA' && !!r.hold_expires_at && r.hold_expires_at <= now;
}

// RN-002: confirmada sempre ocupa; pendente segue a configuração da viagem.
export function occupiesVacancy(
  r: Pick<ReservationLike, 'reservation_status' | 'hold_expires_at'>,
  config: VacancyConfig,
  now = new Date(),
): boolean {
  if (isConfirmed(r.reservation_status)) return true;
  if (!PENDING.includes(r.reservation_status)) return false;
  if (!config.pending_holds_seat) return false;
  return !(config.auto_release_holds && isExpiredHold(r, now));
}

export interface CapacityCheck {
  capacity: number;
  config: VacancyConfig;
  // Reservas da viagem, sem a que está sendo alterada.
  others: Pick<ReservationLike, 'reservation_status' | 'hold_expires_at'>[];
  nextStatus: ReservationStatus;
}

export type CapacityResult = { ok: true } | { ok: false; code: 'TRIP_FULL' | 'CONFIRMED_OVER_CAPACITY' };

export function checkCapacity({ capacity, config, others, nextStatus }: CapacityCheck, now = new Date()): CapacityResult {
  const candidate = { reservation_status: nextStatus, hold_expires_at: null };
  // "Confirmadas não podem ultrapassar a capacidade" vale mesmo quando
  // pendentes não ocupam vaga.
  if (isConfirmed(nextStatus)) {
    const confirmed = others.filter((r) => isConfirmed(r.reservation_status)).length;
    if (confirmed + 1 > capacity) return { ok: false, code: 'CONFIRMED_OVER_CAPACITY' };
  }
  if (!occupiesVacancy(candidate, config, now)) return { ok: true };
  const occupied = others.filter((r) => occupiesVacancy(r, config, now)).length;
  return occupied + 1 > capacity ? { ok: false, code: 'TRIP_FULL' } : { ok: true };
}

// Cortesia não paga; desconto não pode deixar o valor negativo.
export function computeFinalPrice(input: {
  package_price: number;
  discount_amount: number;
  surcharge_amount: number;
  is_courtesy: boolean;
}): number | null {
  if (input.is_courtesy) return 0;
  const value = input.package_price - input.discount_amount + input.surcharge_amount;
  return value < 0 ? null : value;
}

export interface TripSummary {
  passengers: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  waitlist: number;
  expired_holds: number;
  occupied: number;
  available_seats: number;
  // Centavos. Só pra quem tem finance.read.
  revenue_expected: number | null;
  revenue_received: number | null;
  revenue_pending: number | null;
}

// RF-014 e RN-010 (versão resumida pros cartões; o dashboard financeiro
// completo está em finance-rules.ts).
export function computeTripSummary(
  trip: { commercial_capacity: number } & VacancyConfig,
  reservations: ReservationLike[],
  includeFinance: boolean,
  now = new Date(),
): TripSummary {
  let confirmed = 0, pending = 0, cancelled = 0, waitlist = 0, expired = 0, occupied = 0, expected = 0, received = 0;
  for (const r of reservations) {
    const s = r.reservation_status;
    if (isEnded(s)) cancelled++;
    else if (s === 'LISTA_ESPERA') waitlist++;
    else if (isConfirmed(s)) confirmed++;
    else if (isExpiredHold(r, now)) expired++;
    else pending++;
    if (occupiesVacancy(r, trip, now)) occupied++;
    if (!isEnded(s) && s !== 'LISTA_ESPERA') {
      expected += r.final_price;
      received += r.paid ?? 0;
    }
  }
  return {
    passengers: confirmed + pending + expired,
    confirmed,
    pending,
    cancelled,
    waitlist,
    expired_holds: expired,
    occupied,
    available_seats: Math.max(0, trip.commercial_capacity - occupied),
    revenue_expected: includeFinance ? expected : null,
    revenue_received: includeFinance ? received : null,
    revenue_pending: includeFinance ? expected - received : null,
  };
}
