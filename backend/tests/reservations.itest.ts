import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) throw new Error('Defina TEST_DATABASE_URL (veja o script npm run test:integration)');
process.env.DATABASE_URL = TEST_DB;
process.env.CORS_ORIGIN = 'http://localhost';
process.env.JWT_SECRET = 'test-access-secret-123456';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-123456';
process.env.APP_URL = 'http://app.test';
process.env.NODE_ENV = 'test';

let app: FastifyInstance;
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
const tokenOf = (url: string) => url.split('/p/')[1];

let tripId: string;
let otherTripId: string;
const customers: Record<string, string> = {};

const trip = {
  name: 'Itacaré 2027',
  destination: 'Itacaré',
  departure_at: '2027-03-10T06:00:00-03:00',
  return_at: '2027-03-14T20:00:00-03:00',
  departure_location: 'Aracaju',
  commercial_capacity: 2,
  default_package_price: 128700,
  waitlist_enabled: true,
  public_instructions: 'Levar protetor solar',
  internal_notes: 'Motorista confirmado',
};

const reserve = (who: string, payload: Record<string, unknown>, id = tripId) =>
  app.inject({ method: 'POST', url: `/trips/${id}/reservations`, headers: auth(who), payload });

beforeAll(async () => {
  const { buildApp } = await import('../src/app.js');
  const { hashPassword } = await import('../src/lib/hash.js');
  app = await buildApp();
  await app.ready();

  await app.prisma.$transaction([
    app.prisma.auditLog.deleteMany(),
    app.prisma.reservation.deleteMany(),
    app.prisma.passwordResetToken.deleteMany(),
    app.prisma.tripUser.deleteMany(),
    app.prisma.trip.deleteMany(),
    app.prisma.customerRelationship.deleteMany(),
    app.prisma.customer.deleteMany(),
    app.prisma.user.deleteMany(),
  ]);

  const password_hash = await hashPassword('senha-teste-1');
  const users = [
    ['admin', 'ADMIN'],
    ['operador', 'OPERADOR'],
    ['semacesso', 'OPERADOR'],
    ['visualizador', 'VISUALIZADOR'],
  ] as const;
  for (const [name, role] of users) {
    await app.prisma.user.create({ data: { email: `${name}@test.com`, name, role, password_hash } });
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: `${name}@test.com`, password: 'senha-teste-1' } });
    tokens[name] = res.json().accessToken;
  }

  tripId = (await app.inject({ method: 'POST', url: '/trips', headers: auth('admin'), payload: trip })).json().id;
  otherTripId = (await app.inject({ method: 'POST', url: '/trips', headers: auth('admin'), payload: { ...trip, name: 'Outra' } })).json().id;

  const op = await app.prisma.user.findUniqueOrThrow({ where: { email: 'operador@test.com' } });
  const viewer = await app.prisma.user.findUniqueOrThrow({ where: { email: 'visualizador@test.com' } });
  await app.inject({
    method: 'PUT',
    url: `/trips/${tripId}/users`,
    headers: auth('admin'),
    payload: { users: [{ user_id: op.id, access_level: 'OPERAR' }, { user_id: viewer.id, access_level: 'VISUALIZAR' }] },
  });

  for (const [key, full_name, cpf] of [
    ['ana', 'Ana Souza', '52998224725'],
    ['bruno', 'Bruno Lima', null],
    ['carla', 'Carla Dias', null],
    ['davi', 'Davi Melo', null],
  ] as const) {
    const res = await app.inject({ method: 'POST', url: '/customers', headers: auth('admin'), payload: { full_name, cpf, phone: `7999990000${key.length}${key[0].charCodeAt(0)}` } });
    customers[key] = res.json().id;
  }
});

afterAll(async () => {
  await app.close();
});

let anaReservation: string;
let anaUrl: string;

describe('reservas', () => {
  it('reutiliza o cliente sem duplicar o cadastro (CA-002) e usa o preço padrão', async () => {
    const res = await reserve('operador', { customer_id: customers.ana, reservation_status: 'CONFIRMADA' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    anaReservation = body.reservation.id;
    anaUrl = body.public_url;
    expect(body.reservation.final_price).toBe(128700);
    expect(body.reservation.passenger_name).toBe('Ana Souza');
    expect(body.public_url).toMatch(/^http:\/\/app\.test\/p\/[A-Za-z0-9_-]{40,}$/);
    expect(body.reservation).not.toHaveProperty('public_token_hash');
    expect(await app.prisma.customer.count({ where: { full_name: 'Ana Souza' } })).toBe(1);

    // Só o hash fica no banco.
    const saved = await app.prisma.reservation.findUniqueOrThrow({ where: { id: anaReservation } });
    expect(saved.public_token_hash).not.toContain(tokenOf(anaUrl));
  });

  it('bloqueia segunda reserva ativa do mesmo cliente na viagem (RN-006)', async () => {
    const res = await reserve('operador', { customer_id: customers.ana });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('RESERVATION_EXISTS');
  });

  it('aplica desconto e recusa desconto maior que o pacote', async () => {
    const ok = await reserve('operador', { customer_id: customers.bruno, discount_amount: 28700 });
    expect(ok.json().reservation.final_price).toBe(100000);
    const bad = await reserve('operador', { customer_id: customers.carla, discount_amount: 999999 });
    expect(bad.statusCode).toBe(400);
  });

  it('lotada: bloqueia nova vaga e aceita lista de espera (RN-002)', async () => {
    const full = await reserve('operador', { customer_id: customers.carla });
    expect(full.statusCode).toBe(409);
    expect(full.json()).toMatchObject({ code: 'TRIP_FULL', waitlist_available: true });

    const wait = await reserve('operador', { customer_id: customers.carla, reservation_status: 'LISTA_ESPERA' });
    expect(wait.statusCode).toBe(201);

    const summary = (await app.inject({ method: 'GET', url: `/trips/${tripId}`, headers: auth('admin') })).json().summary;
    expect(summary).toMatchObject({ passengers: 2, confirmed: 1, pending: 1, waitlist: 1, available_seats: 0, revenue_expected: 228700 });
  });

  it('não promove da lista de espera sem vaga', async () => {
    const list = (await app.inject({ method: 'GET', url: `/trips/${tripId}/reservations`, headers: auth('operador') })).json();
    const carla = list.find((r: { passenger_name: string }) => r.passenger_name === 'Carla Dias');
    const res = await app.inject({ method: 'PATCH', url: `/reservations/${carla.id}`, headers: auth('operador'), payload: { reservation_status: 'RESERVADA' } });
    expect(res.statusCode).toBe(409);
  });

  it('não deixa baixar a capacidade abaixo das confirmadas', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/trips/${tripId}`, headers: auth('admin'), payload: { commercial_capacity: 0 } });
    expect(res.statusCode).toBe(400);
    await app.inject({ method: 'POST', url: `/trips/${otherTripId}/reservations`, headers: auth('admin'), payload: { customer_id: customers.davi, reservation_status: 'CONFIRMADA' } });
    await app.inject({ method: 'POST', url: `/trips/${otherTripId}/reservations`, headers: auth('admin'), payload: { customer_id: customers.ana, reservation_status: 'CONFIRMADA' } });
    const below = await app.inject({ method: 'PATCH', url: `/trips/${otherTripId}`, headers: auth('admin'), payload: { commercial_capacity: 1 } });
    expect(below.statusCode).toBe(409);
  });

  it('alteração de valor contratado é auditada (CA-021)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/reservations/${anaReservation}`,
      headers: auth('operador'),
      payload: { surcharge_amount: 5000, reason: 'Quarto individual' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().final_price).toBe(133700);
    const log = await app.prisma.auditLog.findFirstOrThrow({ where: { entity_id: anaReservation, action: 'CONTRACT_VALUE_CHANGE' } });
    expect(log.old_values).toMatchObject({ final_price: 128700 });
    expect(log.new_values).toMatchObject({ final_price: 133700 });
    expect(log.reason).toBe('Quarto individual');
  });
});

describe('link individual', () => {
  it('mostra só dados públicos (CA-015 / RN-013)', async () => {
    const res = await app.inject({ method: 'GET', url: `/public/reservations/${tokenOf(anaUrl)}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const text = res.body;
    expect(res.json()).toMatchObject({ passenger_name: 'Ana Souza', trip: { name: 'Itacaré 2027', public_instructions: 'Levar protetor solar' } });
    for (const secret of ['52998224725', '133700', 'Motorista confirmado', 'customer_id', anaReservation, 'Bruno']) {
      expect(text).not.toContain(secret);
    }
  });

  it('token inexistente responde igual a revogado', async () => {
    const res = await app.inject({ method: 'GET', url: `/public/reservations/${'x'.repeat(43)}` });
    expect(res.statusCode).toBe(404);
  });

  it('só quem pode revogar revoga; revogado bloqueia na hora (CA-016)', async () => {
    const denied = await app.inject({ method: 'POST', url: `/reservations/${anaReservation}/revoke-public-link`, headers: auth('operador') });
    expect(denied.statusCode).toBe(403);
    const ok = await app.inject({ method: 'POST', url: `/reservations/${anaReservation}/revoke-public-link`, headers: auth('admin') });
    expect(ok.json().public_link).toBe('REVOGADO');
    const res = await app.inject({ method: 'GET', url: `/public/reservations/${tokenOf(anaUrl)}` });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('Ana');
  });

  it('regenerar cria link novo e o antigo continua morto', async () => {
    const res = await app.inject({ method: 'POST', url: `/reservations/${anaReservation}/regenerate-public-link`, headers: auth('operador') });
    const url = res.json().public_url;
    expect(tokenOf(url)).not.toBe(tokenOf(anaUrl));
    expect((await app.inject({ method: 'GET', url: `/public/reservations/${tokenOf(url)}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/public/reservations/${tokenOf(anaUrl)}` })).statusCode).toBe(404);
    anaUrl = url;
  });
});

describe('permissões', () => {
  it('visualizador lê sem valores e não reserva', async () => {
    const list = await app.inject({ method: 'GET', url: `/trips/${tripId}/reservations`, headers: auth('visualizador') });
    expect(list.statusCode).toBe(200);
    expect(list.json()[0].final_price).toBeNull();
    expect(list.json()[0].customer.phone).toBeNull();
    expect((await reserve('visualizador', { customer_id: customers.davi })).statusCode).toBe(403);
  });

  it('operador sem acesso à viagem recebe 404 (spec 10.1)', async () => {
    expect((await reserve('semacesso', { customer_id: customers.davi })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/reservations/${anaReservation}`, headers: auth('semacesso') })).statusCode).toBe(404);
  });
});

describe('cancelamento (CA-009)', () => {
  it('cancela com motivo, libera a vaga, desativa o link e audita', async () => {
    const noReason = await app.inject({ method: 'POST', url: `/reservations/${anaReservation}/cancel`, headers: auth('operador'), payload: {} });
    expect(noReason.statusCode).toBe(400);

    const res = await app.inject({ method: 'POST', url: `/reservations/${anaReservation}/cancel`, headers: auth('operador'), payload: { reason: 'Desistiu' } });
    expect(res.json().reservation_status).toBe('CANCELADA');
    expect(res.json().public_link).toBe('INATIVO');

    const summary = (await app.inject({ method: 'GET', url: `/trips/${tripId}`, headers: auth('admin') })).json().summary;
    expect(summary).toMatchObject({ cancelled: 1, available_seats: 1 });
    expect((await app.inject({ method: 'GET', url: `/public/reservations/${tokenOf(anaUrl)}` })).statusCode).toBe(404);
    expect(await app.prisma.auditLog.count({ where: { entity_id: anaReservation, action: 'CANCEL' } })).toBe(1);

    // Com a vaga liberada, o mesmo cliente pode reservar de novo.
    expect((await reserve('operador', { customer_id: customers.ana })).statusCode).toBe(201);
  });

  it('cancelar a viagem cancela as reservas ativas', async () => {
    await app.inject({ method: 'POST', url: `/trips/${otherTripId}/cancel`, headers: auth('admin'), payload: { reason: 'Mau tempo' } });
    const active = await app.prisma.reservation.count({ where: { trip_id: otherTripId, reservation_status: { not: 'CANCELADA' } } });
    expect(active).toBe(0);
  });

  it('histórico do cliente lista as reservas', async () => {
    const res = await app.inject({ method: 'GET', url: `/customers/${customers.ana}/history`, headers: auth('admin') });
    expect(res.json().reservations.length).toBe(3);
  });
});
