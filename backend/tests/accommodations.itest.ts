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
const inject = (who: string, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as 'GET', url, headers: auth(who), payload: payload as Record<string, unknown> });

let tripId: string;
let pousadaId: string;
let pousada2Id: string;
const rooms: Record<string, string> = {};
const res: Record<string, { id: string; url: string }> = {};

type TripAcc = { accommodation: { id: string; name: string }; rooms: { id: string; identifier: string; capacity: number; occupancy: string; guests: { passenger_name: string }[] }[] };
const tripAccs = async () => (await inject('admin', 'GET', `/trips/${tripId}/accommodations`)).json() as TripAcc[];
const roomOf = (list: TripAcc[], accId: string, identifier: string) =>
  list.find((a) => a.accommodation.id === accId)!.rooms.find((r) => r.identifier === identifier)!;
const assign = (who: string, name: string, tripRoomId: string, transfer = false) =>
  inject(who, 'POST', `/reservations/${res[name].id}/room-assignment`, { trip_room_id: tripRoomId, transfer });

beforeAll(async () => {
  const { buildApp } = await import('../src/app.js');
  const { hashPassword } = await import('../src/lib/hash.js');
  app = await buildApp();
  await app.ready();

  await app.prisma.$transaction([
    app.prisma.auditLog.deleteMany(),
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
  for (const [name, role] of [['admin', 'ADMIN'], ['operador', 'OPERADOR'], ['financeiro', 'FINANCEIRO']] as const) {
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
      default_package_price: 100000,
    })
  ).json().id;
  const users = await app.prisma.user.findMany({ where: { role: { not: 'ADMIN' } } });
  await inject('admin', 'PUT', `/trips/${tripId}/users`, { users: users.map((u) => ({ user_id: u.id, access_level: 'OPERAR' })) });

  for (const name of ['Ana', 'Bia', 'Caio', 'Duda', 'Edu']) {
    const c = (await inject('admin', 'POST', '/customers', { full_name: `${name} Teste` })).json();
    const r = (await inject('admin', 'POST', `/trips/${tripId}/reservations`, { customer_id: c.id, reservation_status: 'CONFIRMADA' })).json();
    res[name] = { id: r.reservation.id, url: r.public_url };
  }
});

afterAll(async () => {
  await app.close();
});

describe('cadastro de pousadas', () => {
  it('só admin cadastra; capacidade total soma os quartos ativos', async () => {
    expect((await inject('operador', 'POST', '/accommodations', { name: 'Pousada X' })).statusCode).toBe(403);
    const p = await inject('admin', 'POST', '/accommodations', { name: 'Pousada Maré', city: 'Itacaré', state: 'BA', address: 'Rua da Praia, 10', phone: '73999990000' });
    pousadaId = p.json().id;
    for (const [identifier, room_type, capacity] of [['101', 'DUPLO', 2], ['102', 'TRIPLO', 3], ['103', 'INDIVIDUAL', 1]] as const) {
      const r = await inject('admin', 'POST', `/accommodations/${pousadaId}/rooms`, { identifier, room_type, capacity, beds: capacity });
      expect(r.statusCode).toBe(201);
      rooms[identifier] = r.json().id;
    }
    const dup = await inject('admin', 'POST', `/accommodations/${pousadaId}/rooms`, { identifier: '101', room_type: 'DUPLO', capacity: 2, beds: 2 });
    expect(dup.statusCode).toBe(409);

    const list = (await inject('admin', 'GET', '/accommodations')).json();
    expect(list[0].total_capacity).toBe(6);
    pousada2Id = (await inject('admin', 'POST', '/accommodations', { name: 'Pousada Sol' })).json().id;
    await inject('admin', 'POST', `/accommodations/${pousada2Id}/rooms`, { identifier: '1', room_type: 'QUADRUPLO', capacity: 4, beds: 4 });
  });
});

describe('pousadas da viagem', () => {
  it('associa uma ou mais pousadas com os quartos escolhidos', async () => {
    const r = await inject('admin', 'POST', `/trips/${tripId}/accommodations`, { accommodation_id: pousadaId, room_ids: [rooms['101'], rooms['102']] });
    expect(r.statusCode).toBe(201);
    expect(r.json()[0].rooms.map((x: { identifier: string }) => x.identifier)).toEqual(['101', '102']);
    await inject('admin', 'POST', `/trips/${tripId}/accommodations`, { accommodation_id: pousada2Id });
    expect((await tripAccs()).length).toBe(2);
    const again = await inject('admin', 'POST', `/trips/${tripId}/accommodations`, { accommodation_id: pousadaId });
    expect(again.statusCode).toBe(409);
  });
});

describe('distribuição de hóspedes', () => {
  it('coloca hóspedes e marca parcial/completo', async () => {
    const list = await tripAccs();
    expect((await assign('operador', 'Ana', roomOf(list, pousadaId, '101').id)).statusCode).toBe(200);
    expect(roomOf(await tripAccs(), pousadaId, '101').occupancy).toBe('PARCIAL');
    expect((await assign('operador', 'Bia', roomOf(list, pousadaId, '101').id)).statusCode).toBe(200);
    expect(roomOf(await tripAccs(), pousadaId, '101').occupancy).toBe('COMPLETO');
  });

  it('bloqueia o terceiro hóspede num duplo (CA-007)', async () => {
    const r = await assign('operador', 'Caio', roomOf(await tripAccs(), pousadaId, '101').id);
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe('ROOM_FULL');
  });

  it('pede transferência explícita e registra quarto anterior e novo (CA-008)', async () => {
    const list = await tripAccs();
    const blocked = await assign('operador', 'Ana', roomOf(list, pousadaId, '102').id);
    expect(blocked.json().code).toBe('ALREADY_IN_ROOM');
    expect((await assign('operador', 'Ana', roomOf(list, pousadaId, '102').id, true)).statusCode).toBe(200);
    const after = await tripAccs();
    expect(roomOf(after, pousadaId, '101').guests.map((g) => g.passenger_name)).toEqual(['Bia Teste']);
    const log = await app.prisma.auditLog.findFirstOrThrow({ where: { entity_id: res.Ana.id, action: 'ROOM_CHANGE' } });
    expect(log.old_values).toMatchObject({ room: '101' });
    expect(log.new_values).toMatchObject({ room: '102' });
  });

  it('lista colada: tudo ou nada', async () => {
    const list = await tripAccs();
    const room102 = roomOf(list, pousadaId, '102').id;
    // 102 tem Ana; cabem mais 2. Três não cabem: ninguém entra.
    const tooMany = await inject('operador', 'POST', `/trip-rooms/${room102}/guests`, { reservation_ids: [res.Caio.id, res.Duda.id, res.Edu.id] });
    expect(tooMany.statusCode).toBe(409);
    expect(roomOf(await tripAccs(), pousadaId, '102').guests).toHaveLength(1);
    const ok = await inject('operador', 'POST', `/trip-rooms/${room102}/guests`, { reservation_ids: [res.Caio.id, res.Duda.id] });
    expect(ok.statusCode).toBe(200);
    expect(roomOf(ok.json(), pousadaId, '102').occupancy).toBe('COMPLETO');
  });

  it('capacidade da viagem: aumenta com override, não reduz abaixo dos hóspedes', async () => {
    const room102 = roomOf(await tripAccs(), pousadaId, '102').id;
    expect((await inject('admin', 'PATCH', `/trip-rooms/${room102}`, { capacity_override: 2 })).statusCode).toBe(409);
    const more = await inject('admin', 'PATCH', `/trip-rooms/${room102}`, { capacity_override: 4 });
    expect(roomOf(more.json(), pousadaId, '102')).toMatchObject({ capacity: 4, occupancy: 'PARCIAL' });
  });

  it('financeiro não mexe em quarto', async () => {
    expect((await assign('financeiro', 'Edu', roomOf(await tripAccs(), pousada2Id, '1').id)).statusCode).toBe(403);
  });

  it('desativar quarto do cadastro tira ele da capacidade total', async () => {
    await inject('admin', 'PATCH', `/rooms/${rooms['103']}`, { status: 'INATIVO' });
    const list = (await inject('admin', 'GET', '/accommodations')).json();
    expect(list.find((a: { id: string }) => a.id === pousadaId).total_capacity).toBe(5);
  });
});

describe('integração com reservas', () => {
  it('lista de passageiros e link mostram pousada e quarto (CA-017)', async () => {
    const list = (await inject('operador', 'GET', `/trips/${tripId}/reservations`)).json();
    expect(list.find((r: { id: string }) => r.id === res.Bia.id).room).toMatchObject({ room_identifier: '101', accommodation_name: 'Pousada Maré' });
    const pub = (await app.inject({ method: 'GET', url: `/public/reservations/${res.Bia.url.split('/p/')[1]}` })).json();
    expect(pub.accommodation).toMatchObject({ name: 'Pousada Maré', room: '101', city: 'Itacaré' });
    expect(JSON.stringify(pub)).not.toContain('73999990000');
  });

  it('cancelar libera o quarto (CA-009) e a pousada com histórico não sai', async () => {
    await inject('operador', 'POST', `/reservations/${res.Bia.id}/cancel`, { reason: 'Desistiu' });
    expect(roomOf(await tripAccs(), pousadaId, '101').occupancy).toBe('VAZIO');
    const ta = (await tripAccs()).find((a) => a.accommodation.id === pousadaId) as unknown as { id: string };
    expect((await inject('admin', 'DELETE', `/trip-accommodations/${ta.id}`)).statusCode).toBe(409);
  });

  it('tirar do quarto e cancelar a viagem libera tudo', async () => {
    expect((await inject('operador', 'DELETE', `/reservations/${res.Ana.id}/room-assignment`)).statusCode).toBe(200);
    await inject('admin', 'POST', `/trips/${tripId}/cancel`, { reason: 'Mau tempo' });
    expect(await app.prisma.roomAssignment.count({ where: { removed_at: null } })).toBe(0);
  });
});
