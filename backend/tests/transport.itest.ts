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
let layoutId: string;
let vanId: string;
let busId: string;
const res: Record<string, { id: string; url: string }> = {};

// Van 2+1 com 2 fileiras: assentos 1,2,3 na primeira, 4,5,6 na segunda (6 bloqueado).
const vanLayout = {
  floors: [{ floor: 1, rows: 2, cols: 4 }],
  seats: [
    { floor: 1, row: 0, col: 0, number: '1' },
    { floor: 1, row: 0, col: 1, number: '2' },
    { floor: 1, row: 0, col: 3, number: '3' },
    { floor: 1, row: 1, col: 0, number: '4' },
    { floor: 1, row: 1, col: 1, number: '5' },
    { floor: 1, row: 1, col: 3, number: '6', blocked: true },
  ],
};

type Vehicle = { id: string; seats: { id: string; seat_number: string; display_status: string; occupant: { passenger_name: string } | null }[] };
const seatOf = (vehicles: Vehicle[], vehicleId: string, number: string) =>
  vehicles.find((v) => v.id === vehicleId)!.seats.find((s) => s.seat_number === number)!;
const vehicles = async () => (await inject('admin', 'GET', `/trips/${tripId}/vehicles`)).json() as Vehicle[];
const assign = (who: string, reservation: string, seatId: string, swap = false) =>
  inject(who, 'POST', `/reservations/${res[reservation].id}/seat-assignment`, { trip_seat_id: seatId, swap });

beforeAll(async () => {
  const { buildApp } = await import('../src/app.js');
  const { hashPassword } = await import('../src/lib/hash.js');
  app = await buildApp();
  await app.ready();

  await app.prisma.$transaction([
    app.prisma.auditLog.deleteMany(),
    app.prisma.seatAssignment.deleteMany(),
    app.prisma.reservation.deleteMany(),
    app.prisma.tripVehicle.deleteMany(),
    app.prisma.seatLayout.deleteMany(),
    app.prisma.vehicleTemplate.deleteMany(),
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
      name: 'Pipa 2027',
      destination: 'Pipa',
      departure_at: '2027-05-01T05:30:00-03:00',
      return_at: '2027-05-04T21:00:00-03:00',
      departure_location: 'Aracaju',
      commercial_capacity: 10,
      default_package_price: 100000,
    })
  ).json().id;
  const users = await app.prisma.user.findMany({ where: { role: { not: 'ADMIN' } } });
  await inject('admin', 'PUT', `/trips/${tripId}/users`, { users: users.map((u) => ({ user_id: u.id, access_level: 'OPERAR' })) });

  for (const name of ['Ana', 'Bia', 'Caio', 'Duda', 'Edu']) {
    const c = (await inject('admin', 'POST', '/customers', { full_name: `${name} Teste` })).json();
    const r = (await inject('admin', 'POST', `/trips/${tripId}/reservations`, { customer_id: c.id, reservation_status: name === 'Edu' ? 'RESERVADA' : 'CONFIRMADA' })).json();
    res[name] = { id: r.reservation.id, url: r.public_url };
  }
});

afterAll(async () => {
  await app.close();
});

describe('modelos de veículo', () => {
  it('só admin cria; capacidade vem do layout sem os bloqueados', async () => {
    const payload = { name: 'Van 6 lugares', category: 'VAN', aisle_config: '2+1', layout: { name: 'Padrão', layout_data: vanLayout } };
    expect((await inject('operador', 'POST', '/vehicle-templates', payload)).statusCode).toBe(403);
    const r = await inject('admin', 'POST', '/vehicle-templates', payload);
    expect(r.statusCode).toBe(201);
    expect(r.json().capacity).toBe(5);
    layoutId = r.json().layouts[0].id;
  });

  it('recusa layout com número repetido', async () => {
    const bad = { ...vanLayout, seats: [...vanLayout.seats, { floor: 1, row: 1, col: 2, number: '1' }] };
    const r = await inject('admin', 'POST', '/vehicle-templates', { name: 'X', category: 'VAN', layout: { layout_data: bad } });
    expect(r.statusCode).toBe(400);
  });

  it('editar o layout sobe a versão e duplicar cria cópia', async () => {
    const r = await inject('admin', 'PATCH', `/seat-layouts/${layoutId}`, { layout_data: vanLayout });
    expect(r.json().version).toBe(2);
    expect((await inject('admin', 'POST', `/seat-layouts/${layoutId}/duplicate`)).json().name).toBe('Padrão (cópia)');
  });
});

describe('veículos da viagem', () => {
  it('adiciona mais de um veículo, copiando os assentos', async () => {
    const van = await inject('admin', 'POST', `/trips/${tripId}/vehicles`, { seat_layout_id: layoutId, operational_name: 'Van 1', driver_name: 'Seu Zé', operational_capacity: 4 });
    expect(van.statusCode).toBe(201);
    expect(van.json().counts).toMatchObject({ total: 6, blocked: 1, free: 5 });
    vanId = van.json().id;
    busId = (await inject('admin', 'POST', `/trips/${tripId}/vehicles`, { seat_layout_id: layoutId, operational_name: 'Van 2' })).json().id;

    const tooBig = await inject('admin', 'POST', `/trips/${tripId}/vehicles`, { seat_layout_id: layoutId, operational_name: 'X', operational_capacity: 9 });
    expect(tooBig.statusCode).toBe(400);
  });

  it('operador não adiciona veículo (só admin)', async () => {
    expect((await inject('operador', 'POST', `/trips/${tripId}/vehicles`, { seat_layout_id: layoutId, operational_name: 'X' })).statusCode).toBe(403);
  });
});

describe('assentos', () => {
  it('atribui e mostra reservado/confirmado no mapa', async () => {
    const v = await vehicles();
    expect((await assign('operador', 'Ana', seatOf(v, vanId, '1').id)).statusCode).toBe(200);
    expect((await assign('operador', 'Edu', seatOf(v, vanId, '2').id)).statusCode).toBe(200);
    const after = await vehicles();
    expect(seatOf(after, vanId, '1')).toMatchObject({ display_status: 'CONFIRMADO', occupant: { passenger_name: 'Ana Teste' } });
    expect(seatOf(after, vanId, '2').display_status).toBe('RESERVADO');
  });

  it('bloqueia assento ocupado (CA-004) e assento bloqueado', async () => {
    const v = await vehicles();
    const taken = await assign('operador', 'Bia', seatOf(v, vanId, '1').id);
    expect(taken.statusCode).toBe(409);
    expect(taken.json().code).toBe('SEAT_TAKEN');
    expect((await assign('operador', 'Bia', seatOf(v, vanId, '6').id)).json().code).toBe('SEAT_BLOCKED');
  });

  it('respeita a capacidade operacional do veículo (CA-005)', async () => {
    const v = await vehicles();
    expect((await assign('operador', 'Bia', seatOf(v, vanId, '3').id)).statusCode).toBe(200);
    expect((await assign('operador', 'Caio', seatOf(v, vanId, '4').id)).statusCode).toBe(200);
    const full = await assign('operador', 'Duda', seatOf(v, vanId, '5').id);
    expect(full.json().code).toBe('VEHICLE_FULL');
  });

  it('transfere de assento removendo o anterior e audita (CA-006)', async () => {
    const v = await vehicles();
    expect((await assign('operador', 'Caio', seatOf(v, vanId, '5').id)).statusCode).toBe(200);
    const after = await vehicles();
    expect(seatOf(after, vanId, '4').occupant).toBeNull();
    expect(seatOf(after, vanId, '5').occupant?.passenger_name).toBe('Caio Teste');
    const log = await app.prisma.auditLog.findFirstOrThrow({ where: { entity_id: res.Caio.id, action: 'SEAT_CHANGE' } });
    expect(log.old_values).toMatchObject({ seat: '4' });
    expect(log.new_values).toMatchObject({ seat: '5' });
  });

  it('troca explícita entre dois passageiros', async () => {
    const v = await vehicles();
    expect((await assign('operador', 'Ana', seatOf(v, vanId, '3').id, true)).statusCode).toBe(200);
    const after = await vehicles();
    expect(seatOf(after, vanId, '3').occupant?.passenger_name).toBe('Ana Teste');
    expect(seatOf(after, vanId, '1').occupant?.passenger_name).toBe('Bia Teste');
  });

  it('transfere entre veículos, respeitando a lotação do destino', async () => {
    const v = await vehicles();
    expect((await assign('operador', 'Duda', seatOf(v, busId, '1').id)).statusCode).toBe(200);
    // Van 1 está com 4 de 4: não recebe mais ninguém de fora.
    expect((await assign('operador', 'Duda', seatOf(v, vanId, '4').id)).json().code).toBe('VEHICLE_FULL');
    expect((await assign('operador', 'Edu', seatOf(v, busId, '2').id)).statusCode).toBe(200);
    expect((await assign('operador', 'Duda', seatOf(v, vanId, '4').id)).statusCode).toBe(200);
    const after = await vehicles();
    expect(seatOf(after, busId, '1').occupant).toBeNull();
    expect(seatOf(after, vanId, '2').occupant).toBeNull();
    expect(seatOf(after, busId, '2').occupant?.passenger_name).toBe('Edu Teste');
  });

  it('financeiro não mexe em assento', async () => {
    const v = await vehicles();
    expect((await assign('financeiro', 'Duda', seatOf(v, busId, '3').id)).statusCode).toBe(403);
  });

  it('bloqueio exige motivo e assento livre', async () => {
    const v = await vehicles();
    expect((await inject('operador', 'POST', `/trip-seats/${seatOf(v, busId, '5').id}/block`, {})).statusCode).toBe(400);
    expect((await inject('operador', 'POST', `/trip-seats/${seatOf(v, vanId, '1').id}/block`, { reason: 'Quebrado' })).statusCode).toBe(409);
    const ok = await inject('operador', 'POST', `/trip-seats/${seatOf(v, busId, '5').id}/block`, { reason: 'Banco quebrado' });
    expect(seatOf(ok.json(), busId, '5').display_status).toBe('BLOQUEADO');
    const un = await inject('operador', 'POST', `/trip-seats/${seatOf(v, busId, '5').id}/unblock`);
    expect(seatOf(un.json(), busId, '5').display_status).toBe('LIVRE');
  });
});

describe('integração com reservas', () => {
  it('lista de passageiros e link mostram o assento (CA-017)', async () => {
    const list = (await inject('operador', 'GET', `/trips/${tripId}/reservations`)).json();
    expect(list.find((r: { id: string }) => r.id === res.Ana.id).seat).toMatchObject({ seat_number: '3', vehicle_name: 'Van 1' });

    const token = res.Ana.url.split('/p/')[1];
    const pub = (await app.inject({ method: 'GET', url: `/public/reservations/${token}` })).json();
    expect(pub.transport).toMatchObject({ vehicle: 'Van 1', seat_number: '3' });
    expect(JSON.stringify(pub)).not.toContain('Seu Zé');
  });

  it('cancelar a reserva libera o assento (CA-009)', async () => {
    await inject('operador', 'POST', `/reservations/${res.Ana.id}/cancel`, { reason: 'Desistiu' });
    expect(seatOf(await vehicles(), vanId, '3').occupant).toBeNull();
  });

  it('não reduz capacidade abaixo dos sentados nem remove veículo com histórico', async () => {
    expect((await inject('admin', 'PATCH', `/trip-vehicles/${vanId}`, { operational_capacity: 1 })).statusCode).toBe(409);
    expect((await inject('admin', 'DELETE', `/trip-vehicles/${vanId}`)).statusCode).toBe(409);
  });

  it('cancelar a viagem libera todos os assentos', async () => {
    await inject('admin', 'POST', `/trips/${tripId}/cancel`, { reason: 'Mau tempo' });
    const seated = await app.prisma.seatAssignment.count({ where: { removed_at: null } });
    expect(seated).toBe(0);
  });
});
