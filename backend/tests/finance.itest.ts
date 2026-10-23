import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) throw new Error('Defina TEST_DATABASE_URL (veja o script npm run test:integration)');
const storageDir = mkdtempSync(path.join(tmpdir(), 't4trips-files-'));
process.env.DATABASE_URL = TEST_DB;
process.env.CORS_ORIGIN = 'http://localhost';
process.env.JWT_SECRET = 'test-access-secret-123456';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-123456';
process.env.APP_URL = 'http://app.test';
process.env.API_URL = 'http://api.test';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = storageDir;
process.env.NODE_ENV = 'test';

let app: FastifyInstance;
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
const inject = (who: string, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as 'GET', url, headers: auth(who), payload: payload as Record<string, unknown> });

let tripId: string;
const res: Record<string, string> = {};
const pay = (who: string, name: string, amount: number, extra: Record<string, unknown> = {}) =>
  inject(who, 'POST', `/reservations/${res[name]}/payments`, { amount, payment_date: '2027-01-05', payment_method: 'PIX', ...extra });

function upload(who: string, content: Buffer, filename: string) {
  const boundary = '----t4tripsboundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({ method: 'POST', url: '/files', headers: { ...auth(who), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
}

beforeAll(async () => {
  const { buildApp } = await import('../src/app.js');
  const { hashPassword } = await import('../src/lib/hash.js');
  app = await buildApp();
  await app.ready();

  await app.prisma.$transaction([
    app.prisma.auditLog.deleteMany(),
    app.prisma.expensePayment.deleteMany(),
    app.prisma.tripExpense.deleteMany(),
    app.prisma.expenseCategory.deleteMany({ where: { is_system: false } }),
    app.prisma.customerPayment.deleteMany(),
    app.prisma.paymentPlan.deleteMany(),
    app.prisma.storedFile.deleteMany(),
    app.prisma.seatAssignment.deleteMany(),
    app.prisma.roomAssignment.deleteMany(),
    app.prisma.reservation.deleteMany(),
    app.prisma.tripVehicle.deleteMany(),
    app.prisma.seatLayout.deleteMany(),
    app.prisma.vehicleTemplate.deleteMany(),
    app.prisma.tripAccommodation.deleteMany(),
    app.prisma.accommodationRoom.deleteMany(),
    app.prisma.accommodation.deleteMany(),
    app.prisma.passwordResetToken.deleteMany(),
    app.prisma.tripUser.deleteMany(),
    app.prisma.trip.deleteMany(),
    app.prisma.customerRelationship.deleteMany(),
    app.prisma.customer.deleteMany(),
    app.prisma.user.deleteMany(),
  ]);

  const password_hash = await hashPassword('senha-teste-1');
  for (const [name, role] of [['admin', 'ADMIN'], ['operador', 'OPERADOR'], ['financeiro', 'FINANCEIRO'], ['visualizador', 'VISUALIZADOR']] as const) {
    await app.prisma.user.create({ data: { email: `${name}@test.com`, name, role, password_hash } });
    tokens[name] = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: `${name}@test.com`, password: 'senha-teste-1' } })).json().accessToken;
  }

  tripId = (
    await inject('admin', 'POST', '/trips', {
      name: 'Itacaré 2027',
      destination: 'Itacaré',
      departure_at: '2027-03-10T06:00:00-03:00',
      return_at: '2027-03-14T20:00:00-03:00',
      departure_location: 'Aracaju',
      commercial_capacity: 10,
      default_package_price: 128700,
    })
  ).json().id;
  const users = await app.prisma.user.findMany({ where: { role: { not: 'ADMIN' } } });
  await inject('admin', 'PUT', `/trips/${tripId}/users`, { users: users.map((u) => ({ user_id: u.id, access_level: 'OPERAR' })) });

  for (const [name, extra] of [['Ana', {}], ['Bia', {}], ['Caio', { is_courtesy: true }], ['Duda', {}]] as const) {
    const c = (await inject('admin', 'POST', '/customers', { full_name: `${name} Teste` })).json();
    res[name] = (await inject('admin', 'POST', `/trips/${tripId}/reservations`, { customer_id: c.id, reservation_status: 'CONFIRMADA', ...extra })).json().reservation.id;
  }
});

afterAll(async () => {
  await app.close();
  rmSync(storageDir, { recursive: true, force: true });
});

let receiptId: string;

describe('comprovantes', () => {
  it('aceita PDF e imagem, recusa outros tipos pelo conteúdo', async () => {
    const pdf = await upload('operador', Buffer.from('%PDF-1.4\n%fake pdf\n'), 'pix.pdf');
    expect(pdf.statusCode).toBe(201);
    receiptId = pdf.json().id;
    const fake = await upload('operador', Buffer.from('MZ executável disfarçado'), 'foto.jpg');
    expect(fake.statusCode).toBe(415);
    expect((await upload('visualizador', Buffer.from('%PDF-1.4'), 'x.pdf')).statusCode).toBe(403);
    const saved = await app.prisma.storedFile.findUniqueOrThrow({ where: { id: receiptId } });
    expect(saved.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('link temporário só pra quem pode ver; assinatura adulterada falha', async () => {
    expect((await inject('visualizador', 'GET', `/files/${receiptId}/url`)).statusCode).toBe(404);
    const { url } = (await inject('financeiro', 'GET', `/files/${receiptId}/url`)).json();
    const local = url.replace('http://api.test', '');
    const ok = await app.inject({ method: 'GET', url: local });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('application/pdf');
    expect(ok.body).toContain('%PDF');
    expect((await app.inject({ method: 'GET', url: local.replace(/sig=[^&]+/, 'sig=xxxx') })).statusCode).toBe(403);
  });
});

describe('pagamentos de passageiros', () => {
  it('pagamento parcial: R$ 650 de R$ 1.287 deixa R$ 637 (CA-011)', async () => {
    const r = await pay('operador', 'Ana', 65000, { receipt_file_id: receiptId });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ paid: 65000, balance: 63700, status: 'PARCIALMENTE_PAGO' });
    expect(r.json().payments[0].receipt.original_name).toBe('pix.pdf');
  });

  it('pagamento integral: Pago e saldo zero (CA-010)', async () => {
    const r = await pay('operador', 'Ana', 63700);
    expect(r.json()).toMatchObject({ paid: 128700, balance: 0, status: 'PAGO' });
  });

  it('não passa do contratado sem confirmação (RN-008)', async () => {
    const r = await pay('operador', 'Ana', 1000);
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe('OVERPAYMENT');
    expect((await pay('operador', 'Ana', 1000, { confirm_overpayment: true })).json().balance).toBe(-1000);
  });

  it('estorno exige motivo e permissão, e reduz o recebido (CA-012)', async () => {
    const finance = (await inject('operador', 'GET', `/reservations/${res.Ana}/finance`)).json();
    const extra = finance.payments.find((p: { amount: number }) => p.amount === 1000);
    expect((await inject('operador', 'POST', `/payments/${extra.id}/reverse`, { reason: 'Lançado a mais' })).statusCode).toBe(403);
    expect((await inject('financeiro', 'POST', `/payments/${extra.id}/reverse`, {})).statusCode).toBe(400);
    const r = await inject('financeiro', 'POST', `/payments/${extra.id}/reverse`, { reason: 'Lançado a mais' });
    expect(r.json()).toMatchObject({ paid: 128700, balance: 0 });
    expect(r.json().payments.find((p: { id: string }) => p.id === extra.id).status).toBe('ESTORNADO');
    const log = await app.prisma.auditLog.findFirstOrThrow({ where: { action: 'PAYMENT_REVERSAL' } });
    expect(log.reason).toBe('Lançado a mais');
    // O lançamento continua lá (sem exclusão física).
    expect(await app.prisma.customerPayment.count({ where: { reservation_id: res.Ana } })).toBe(3);
  });

  it('parcelamento tem que fechar com o contrato; vencida vira atrasado', async () => {
    const bad = await inject('operador', 'POST', `/reservations/${res.Bia}/payment-plan`, { installments: [{ due_date: '2027-01-10', amount: 100000 }] });
    expect(bad.statusCode).toBe(400);
    const plan = await inject('operador', 'POST', `/reservations/${res.Bia}/payment-plan`, {
      installments: [
        { due_date: '2020-01-10', amount: 64350 },
        { due_date: '2099-02-10', amount: 64350 },
      ],
    });
    expect(plan.statusCode).toBe(200);
    expect(plan.json()).toMatchObject({ status: 'ATRASADO', overdue_amount: 64350 });
    const after = await pay('operador', 'Bia', 64350);
    expect(after.json().installments.map((i: { status: string }) => i.status)).toEqual(['PAGA', 'PENDENTE']);
    expect(after.json().status).toBe('PARCIALMENTE_PAGO');
  });

  it('reembolso só em reserva cancelada e até o valor pago', async () => {
    await pay('operador', 'Duda', 30000);
    const notCancelled = await inject('financeiro', 'POST', `/reservations/${res.Duda}/refunds`, { amount: 10000, payment_date: '2027-01-20', payment_method: 'PIX', reason: 'Desistência' });
    expect(notCancelled.statusCode).toBe(409);
    await inject('operador', 'POST', `/reservations/${res.Duda}/cancel`, { reason: 'Desistência' });
    const tooMuch = await inject('financeiro', 'POST', `/reservations/${res.Duda}/refunds`, { amount: 40000, payment_date: '2027-01-20', payment_method: 'PIX', reason: 'Desistência' });
    expect(tooMuch.statusCode).toBe(400);
    const ok = await inject('financeiro', 'POST', `/reservations/${res.Duda}/refunds`, { amount: 20000, payment_date: '2027-01-20', payment_method: 'PIX', reason: 'Desistência' });
    expect(ok.json()).toMatchObject({ status: 'REEMBOLSADO', paid: 10000, refunded: 20000 });
  });
});

let expenseId: string;

describe('despesas (RN-009)', () => {
  it('cria com categoria inicial; operador não lança despesa', async () => {
    const cats = (await inject('financeiro', 'GET', '/expense-categories')).json();
    expect(cats.length).toBeGreaterThanOrEqual(14);
    const transporte = cats.find((c: { name: string }) => c.name === 'Transporte principal');
    const payload = { category_id: transporte.id, description: 'Ônibus fretado', supplier_name: 'Viação Sol', planned_amount: 300000, due_date: '2099-03-01' };
    expect((await inject('operador', 'POST', `/trips/${tripId}/expenses`, payload)).statusCode).toBe(403);
    const r = await inject('financeiro', 'POST', `/trips/${tripId}/expenses`, payload);
    expect(r.json()).toMatchObject({ status: 'PREVISTA', balance: 300000 });
    expenseId = r.json().id;
    const custom = await inject('financeiro', 'POST', '/expense-categories', { name: 'Seguro viagem' });
    expect(custom.statusCode).toBe(201);
    await inject('financeiro', 'POST', `/trips/${tripId}/expenses`, { category_id: custom.json().id, description: 'Seguro', planned_amount: 10000, cost_type: 'POR_PESSOA' });
  });

  it('pagamento parcial, integral, confirmação acima do previsto e estorno', async () => {
    const partial = await inject('financeiro', 'POST', `/expenses/${expenseId}/payments`, { amount: 100000, payment_date: '2027-01-10', payment_method: 'TRANSFERENCIA' });
    expect(partial.json()).toMatchObject({ paid: 100000, balance: 200000, status: 'PARCIALMENTE_PAGA' });
    const over = await inject('financeiro', 'POST', `/expenses/${expenseId}/payments`, { amount: 250000, payment_date: '2027-01-11', payment_method: 'PIX' });
    expect(over.statusCode).toBe(409);
    const full = await inject('financeiro', 'POST', `/expenses/${expenseId}/payments`, { amount: 200000, payment_date: '2027-01-11', payment_method: 'PIX' });
    expect(full.json().status).toBe('QUITADA');
    const pid = full.json().payments[1].id;
    const rev = await inject('financeiro', 'POST', `/expense-payments/${pid}/reverse`, { reason: 'Pago em duplicidade' });
    expect(rev.json()).toMatchObject({ paid: 100000, balance: 200000 });
  });

  it('cancelar despesa mantém o histórico', async () => {
    const e = (await inject('financeiro', 'POST', `/trips/${tripId}/expenses`, { category_id: (await app.prisma.expenseCategory.findFirstOrThrow({ where: { name: 'Outros' } })).id, description: 'Brinde', planned_amount: 5000 })).json();
    const c = await inject('financeiro', 'POST', `/expenses/${e.id}/cancel`, { reason: 'Não vai ter' });
    expect(c.json().status).toBe('CANCELADA');
  });
});

describe('dashboard financeiro (RF-020 / CA-013)', () => {
  it('calcula receitas, despesas, resultado e ponto de equilíbrio', async () => {
    const d = (await inject('financeiro', 'GET', `/trips/${tripId}/finance-dashboard`)).json();
    // Ana 1287 + Bia 1287 + Caio cortesia 0 (Duda cancelada fica fora).
    expect(d).toMatchObject({
      revenue_expected: 257400,
      revenue_received: 128700 + 64350,
      revenue_pending: 64350,
      expenses_expected: 310000,
      expenses_paid: 100000,
      expenses_pending: 210000,
      profit_expected: 257400 - 310000,
      result_realized: 128700 + 64350 - 100000,
      paying_passengers: 2,
      courtesy_passengers: 1,
      average_ticket: 128700,
      retained_from_cancellations: 10000,
    });
    expect(d.by_category[0]).toMatchObject({ category: 'Transporte principal', planned: 300000, paid: 100000 });
  });

  it('resumo da viagem traz o recebido real', async () => {
    const t = (await inject('financeiro', 'GET', `/trips/${tripId}`)).json();
    expect(t.summary).toMatchObject({ revenue_received: 193050, revenue_pending: 64350 });
  });

  it('sem permissão financeira a API não devolve dados financeiros (CA-020)', async () => {
    for (const url of [`/trips/${tripId}/finance-dashboard`, `/trips/${tripId}/expenses`, `/trips/${tripId}/payments`, `/trips/${tripId}/receivables`]) {
      expect((await inject('visualizador', 'GET', url)).statusCode).toBe(403);
      expect((await inject('operador', 'GET', url)).statusCode).toBe(403);
    }
    expect((await inject('visualizador', 'GET', `/reservations/${res.Ana}/finance`)).statusCode).toBe(403);
    const t = (await inject('visualizador', 'GET', `/trips/${tripId}`)).json();
    expect(t.summary.revenue_received).toBeNull();
  });

  it('lista de lançamentos e contas a receber', async () => {
    const payments = (await inject('financeiro', 'GET', `/trips/${tripId}/payments`)).json();
    // Ana 3 (um estornado), Bia 1, Duda 1 pagamento + 1 reembolso.
    expect(payments.length).toBe(6);
    expect(payments[0]).toHaveProperty('created_by_name');
    const recv = (await inject('financeiro', 'GET', `/trips/${tripId}/receivables`)).json();
    expect(recv.find((r: { passenger_name: string }) => r.passenger_name === 'Bia Teste')).toMatchObject({ balance: 64350, installments_count: 2 });
  });
});
