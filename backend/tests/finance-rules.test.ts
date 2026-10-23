import { describe, expect, it } from 'vitest';
import { expenseFinance, reservationFinance, splitInstallments, todayISO, tripFinance } from '../src/lib/finance-rules.js';

const pay = (amount: number, extra: Partial<{ kind: 'PAGAMENTO' | 'REEMBOLSO'; status: 'VALIDO' | 'ESTORNADO' }> = {}) => ({
  amount,
  kind: 'PAGAMENTO' as const,
  status: 'VALIDO' as const,
  payment_date: new Date('2027-01-05'),
  ...extra,
});
const base = { final_price: 128700, reservation_status: 'CONFIRMADA' as const, payment_due_date: null, installments: [], today: '2027-02-01' };

describe('saldo e status da reserva (RN-008)', () => {
  it('pagamento integral fica Pago com saldo zero (CA-010)', () => {
    expect(reservationFinance({ ...base, payments: [pay(128700)] })).toMatchObject({ paid: 128700, balance: 0, status: 'PAGO' });
  });

  it('pagamento parcial de R$ 650 deixa R$ 637 de saldo (CA-011)', () => {
    expect(reservationFinance({ ...base, payments: [pay(65000)] })).toMatchObject({ paid: 65000, balance: 63700, status: 'PARCIALMENTE_PAGO' });
  });

  it('estorno sai do total recebido (CA-012)', () => {
    const r = reservationFinance({ ...base, payments: [pay(65000), pay(63700, { status: 'ESTORNADO' })] });
    expect(r).toMatchObject({ paid: 65000, balance: 63700 });
  });

  it('cortesia já nasce paga; cancelada e reembolsada têm status próprio', () => {
    expect(reservationFinance({ ...base, final_price: 0, payments: [] }).status).toBe('PAGO');
    expect(reservationFinance({ ...base, reservation_status: 'CANCELADA', payments: [pay(10000)] }).status).toBe('CANCELADO');
    const refunded = reservationFinance({ ...base, reservation_status: 'REEMBOLSADA', payments: [pay(10000), pay(10000, { kind: 'REEMBOLSO' })] });
    expect(refunded).toMatchObject({ status: 'REEMBOLSADO', paid: 0, refunded: 10000 });
  });

  it('sem parcelas, vence pelo prazo de pagamento', () => {
    expect(reservationFinance({ ...base, payment_due_date: new Date('2027-01-20'), payments: [pay(1000)] }).status).toBe('ATRASADO');
    expect(reservationFinance({ ...base, payment_due_date: new Date('2027-03-20'), payments: [] }).status).toBe('PENDENTE');
  });
});

describe('parcelas', () => {
  it('divide em parcelas iguais com o resto nas primeiras e vencimento mensal', () => {
    const p = splitInstallments(100000, 3, '2027-01-31');
    expect(p.map((i) => i.amount)).toEqual([33334, 33333, 33333]);
    expect(p.map((i) => i.due_date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('distribui pagamentos por vencimento e marca a vencida automaticamente', () => {
    const installments = splitInstallments(90000, 3, '2027-01-10').map((i, n) => ({ ...i, id: String(n), due_date: new Date(i.due_date) }));
    const r = reservationFinance({ ...base, final_price: 90000, installments, payments: [pay(40000)], today: '2027-02-15' });
    expect(r.installments.map((i) => [i.paid_amount, i.status])).toEqual([
      [30000, 'PAGA'],
      [10000, 'VENCIDA'],
      [0, 'PENDENTE'],
    ]);
    expect(r).toMatchObject({ status: 'ATRASADO', overdue_amount: 20000, next_due_date: '2027-02-10' });
  });

  it('avisa quando o contrato mudou depois do parcelamento', () => {
    const installments = splitInstallments(90000, 2, '2027-03-10').map((i, n) => ({ ...i, id: String(n), due_date: new Date(i.due_date) }));
    expect(reservationFinance({ ...base, final_price: 95000, installments, payments: [] }).plan_mismatch).toBe(true);
  });
});

describe('despesas (RN-009)', () => {
  it('saldo é previsto menos pago; quitada com saldo zero', () => {
    const e = { planned_amount: 500000, due_date: new Date('2027-03-01'), cancelled_at: null, today: '2027-02-01' };
    expect(expenseFinance({ ...e, payments: [] }).status).toBe('PREVISTA');
    expect(expenseFinance({ ...e, payments: [{ amount: 200000, status: 'VALIDO' }] })).toMatchObject({ balance: 300000, status: 'PARCIALMENTE_PAGA' });
    expect(expenseFinance({ ...e, payments: [{ amount: 500000, status: 'VALIDO' }] }).status).toBe('QUITADA');
    expect(expenseFinance({ ...e, payments: [{ amount: 500000, status: 'ESTORNADO' }] }).balance).toBe(500000);
    expect(expenseFinance({ ...e, today: '2027-03-02', payments: [] }).status).toBe('VENCIDA');
  });
});

describe('resultado da viagem (RN-010 / CA-013)', () => {
  const reservations = [
    { reservation_status: 'CONFIRMADA' as const, final_price: 100000, is_courtesy: false, paid: 100000 },
    { reservation_status: 'RESERVADA' as const, final_price: 100000, is_courtesy: false, paid: 40000 },
    { reservation_status: 'CONFIRMADA' as const, final_price: 0, is_courtesy: true, paid: 0 },
    { reservation_status: 'CANCELADA' as const, final_price: 100000, is_courtesy: false, paid: 30000 },
    { reservation_status: 'LISTA_ESPERA' as const, final_price: 100000, is_courtesy: false, paid: 0 },
  ];
  const expenses = [
    { cancelled: false, cost_type: 'FIXO' as const, planned_amount: 60000, paid: 60000 },
    { cancelled: false, cost_type: 'POR_PESSOA' as const, planned_amount: 30000, paid: 0 },
    { cancelled: true, cost_type: 'FIXO' as const, planned_amount: 99999, paid: 0 },
  ];

  it('calcula receitas, despesas, lucro, margem e ponto de equilíbrio', () => {
    const f = tripFinance(reservations, expenses);
    expect(f).toMatchObject({
      revenue_expected: 200000,
      revenue_received: 140000,
      revenue_pending: 60000,
      expenses_expected: 90000,
      expenses_paid: 60000,
      expenses_pending: 30000,
      profit_expected: 110000,
      result_realized: 80000,
      paying_passengers: 2,
      courtesy_passengers: 1,
      average_ticket: 100000,
      fixed_costs: 60000,
      variable_per_passenger: 10000,
      break_even_passengers: 1,
      retained_from_cancellations: 30000,
    });
    expect(f.margin_expected).toBeCloseTo(0.55);
  });

  it('sem receita a margem fica vazia', () => {
    expect(tripFinance([], []).margin_expected).toBeNull();
  });
});

describe('hoje em São Paulo', () => {
  it('22h de 31/01 em Brasília ainda é 31/01', () => {
    expect(todayISO(new Date('2027-02-01T01:00:00Z'))).toBe('2027-01-31');
  });
});
