import type { CostType, CustomerPaymentKind, EntryStatus, ReservationStatus } from '@prisma/client';
import { isEnded } from './reservation-rules.js';

// Datas de vencimento são dias (sem hora). "Hoje" é o dia em São Paulo, pra
// uma parcela não vencer às 21h por causa do UTC.
export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export const dateISO = (d: Date) => d.toISOString().slice(0, 10);

interface Entry {
  amount: number;
  status: EntryStatus;
}
interface CustomerEntry extends Entry {
  kind: CustomerPaymentKind;
  payment_date: Date;
}

const valid = <T extends Entry>(list: T[]) => list.filter((p) => p.status === 'VALIDO');

export type InstallmentStatus = 'PENDENTE' | 'PARCIAL' | 'PAGA' | 'VENCIDA';
export type FinancialStatus = 'PENDENTE' | 'PARCIALMENTE_PAGO' | 'PAGO' | 'ATRASADO' | 'CANCELADO' | 'REEMBOLSADO';

export interface InstallmentInput {
  id: string;
  installment_number: number;
  due_date: Date;
  amount: number;
}

// Divide em parcelas iguais; os centavos que sobram vão nas primeiras.
// Vencimentos mensais a partir do primeiro (dia 31 vira o último dia do mês).
export function splitInstallments(total: number, count: number, firstDue: string) {
  const base = Math.floor(total / count);
  const rest = total - base * count;
  const [y, m, d] = firstDue.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const month = m - 1 + i;
    const lastDay = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(y, month, Math.min(d, lastDay)));
    return { installment_number: i + 1, due_date: dateISO(due), amount: base + (i < rest ? 1 : 0) };
  });
}

// RN-008. Pagamentos válidos quitam as parcelas na ordem de vencimento.
export function reservationFinance(input: {
  final_price: number;
  reservation_status: ReservationStatus;
  payment_due_date: Date | null;
  payments: CustomerEntry[];
  installments: InstallmentInput[];
  today?: string;
}) {
  const today = input.today ?? todayISO();
  const ok = valid(input.payments);
  const gross = ok.filter((p) => p.kind === 'PAGAMENTO').reduce((n, p) => n + p.amount, 0);
  const refunded = ok.filter((p) => p.kind === 'REEMBOLSO').reduce((n, p) => n + p.amount, 0);
  const paid = gross - refunded;
  const balance = input.final_price - paid;

  let left = gross;
  const installments = [...input.installments]
    .sort((a, b) => a.due_date.getTime() - b.due_date.getTime() || a.installment_number - b.installment_number)
    .map((i) => {
      const paid_amount = Math.min(i.amount, Math.max(0, left));
      left -= paid_amount;
      const due = dateISO(i.due_date);
      const status: InstallmentStatus =
        paid_amount >= i.amount ? 'PAGA' : due < today ? 'VENCIDA' : paid_amount > 0 ? 'PARCIAL' : 'PENDENTE';
      return { ...i, due_date: due, paid_amount, status };
    });

  const overdue = installments.length
    ? installments.some((i) => i.status === 'VENCIDA')
    : !!input.payment_due_date && dateISO(input.payment_due_date) < today && balance > 0;

  let status: FinancialStatus;
  if (input.reservation_status === 'REEMBOLSADA') status = 'REEMBOLSADO';
  else if (isEnded(input.reservation_status)) status = 'CANCELADO';
  else if (balance <= 0) status = 'PAGO';
  else if (overdue) status = 'ATRASADO';
  else if (paid > 0) status = 'PARCIALMENTE_PAGO';
  else status = 'PENDENTE';

  const plan_total = installments.reduce((n, i) => n + i.amount, 0);
  const next = installments.find((i) => i.status !== 'PAGA');
  return {
    paid,
    refunded,
    balance,
    status,
    installments,
    // O valor contratado mudou depois de montar as parcelas.
    plan_mismatch: installments.length > 0 && plan_total !== input.final_price,
    next_due_date: next?.due_date ?? (input.payment_due_date && balance > 0 ? dateISO(input.payment_due_date) : null),
    overdue_amount: installments.filter((i) => i.status === 'VENCIDA').reduce((n, i) => n + i.amount - i.paid_amount, 0),
  };
}

// RN-008: total pago não passa do contratado sem confirmação explícita.
export const exceedsContract = (finalPrice: number, alreadyPaid: number, amount: number) => alreadyPaid + amount > finalPrice;

export type ExpenseStatus = 'PREVISTA' | 'PARCIALMENTE_PAGA' | 'QUITADA' | 'VENCIDA' | 'CANCELADA';

// RN-009.
export function expenseFinance(input: { planned_amount: number; due_date: Date | null; cancelled_at: Date | null; payments: Entry[]; today?: string }) {
  const today = input.today ?? todayISO();
  const paid = valid(input.payments).reduce((n, p) => n + p.amount, 0);
  const balance = input.planned_amount - paid;
  let status: ExpenseStatus;
  if (input.cancelled_at) status = 'CANCELADA';
  else if (balance <= 0) status = 'QUITADA';
  else if (input.due_date && dateISO(input.due_date) < today) status = 'VENCIDA';
  else if (paid > 0) status = 'PARCIALMENTE_PAGA';
  else status = 'PREVISTA';
  return { paid, balance, status };
}

export interface FinanceReservation {
  reservation_status: ReservationStatus;
  final_price: number;
  is_courtesy: boolean;
  paid: number;
}

export interface FinanceExpense {
  cancelled: boolean;
  cost_type: CostType;
  planned_amount: number;
  paid: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

// RN-010. Lista de espera não entra como receita (não tem vaga).
export function tripFinance(reservations: FinanceReservation[], expenses: FinanceExpense[]) {
  const active = reservations.filter((r) => !isEnded(r.reservation_status) && r.reservation_status !== 'LISTA_ESPERA');
  const ended = reservations.filter((r) => isEnded(r.reservation_status));
  const revenue_expected = active.reduce((n, r) => n + r.final_price, 0);
  const revenue_received = active.reduce((n, r) => n + r.paid, 0);
  const live = expenses.filter((e) => !e.cancelled);
  const expenses_expected = live.reduce((n, e) => n + e.planned_amount, 0);
  // Pagamento de despesa cancelada continua sendo dinheiro que saiu.
  const expenses_paid = expenses.reduce((n, e) => n + e.paid, 0);
  const profit_expected = revenue_expected - expenses_expected;
  const result_realized = revenue_received - expenses_paid;

  const paying = active.filter((r) => !r.is_courtesy && r.final_price > 0);
  const ticket = paying.length ? Math.round(paying.reduce((n, r) => n + r.final_price, 0) / paying.length) : null;
  const fixed = live.filter((e) => e.cost_type === 'FIXO').reduce((n, e) => n + e.planned_amount, 0);
  const perPersonTotal = live.filter((e) => e.cost_type === 'POR_PESSOA').reduce((n, e) => n + e.planned_amount, 0);
  // Custo por pessoa rateado por todos que viajam (cortesia também consome).
  const variable_per_passenger = active.length ? Math.round(perPersonTotal / active.length) : 0;
  const contribution = ticket !== null ? ticket - variable_per_passenger : null;
  const break_even_passengers = contribution && contribution > 0 ? Math.ceil(fixed / contribution) : null;

  return {
    revenue_expected,
    revenue_received,
    revenue_pending: revenue_expected - revenue_received,
    expenses_expected,
    expenses_paid,
    expenses_pending: expenses_expected - live.reduce((n, e) => n + e.paid, 0),
    profit_expected,
    result_realized,
    margin_expected: ratio(profit_expected, revenue_expected),
    margin_realized: ratio(result_realized, revenue_received),
    paying_passengers: paying.length,
    courtesy_passengers: active.filter((r) => r.is_courtesy).length,
    average_ticket: ticket,
    fixed_costs: fixed,
    variable_per_passenger,
    break_even_passengers,
    // Fora da receita (RN-010), mas é dinheiro em caixa: pagamentos de
    // canceladas que não foram devolvidos.
    retained_from_cancellations: ended.reduce((n, r) => n + Math.max(0, r.paid), 0),
  };
}
