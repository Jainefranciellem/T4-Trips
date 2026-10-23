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
let publicToken: string;

beforeAll(async () => {
  const { buildApp } = await import('../src/app.js');
  const { hashPassword } = await import('../src/lib/hash.js');
  app = await buildApp();
  await app.ready();

  await app.prisma.$transaction([
    app.prisma.auditLog.deleteMany(),
    app.prisma.pricingScenario.deleteMany(),
    app.prisma.itineraryItem.deleteMany(),
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
      return_at: '2027-03-12T20:00:00-03:00',
      departure_location: 'Aracaju',
      commercial_capacity: 28,
      default_package_price: 100000,
    })
  ).json().id;
  const users = await app.prisma.user.findMany({ where: { role: { not: 'ADMIN' } } });
  await inject('admin', 'PUT', `/trips/${tripId}/users`, { users: users.map((u) => ({ user_id: u.id, access_level: 'OPERAR' })) });
  const c = (await inject('admin', 'POST', '/customers', { full_name: 'Ana Teste' })).json();
  publicToken = (await inject('admin', 'POST', `/trips/${tripId}/reservations`, { customer_id: c.id })).json().public_url.split('/p/')[1];
});

afterAll(async () => {
  await app.close();
});

const scenario = {
  name: 'Base',
  paying_passengers: 20,
  courtesy_passengers: 2,
  vehicle_capacity: 28,
  fixed_costs: 1_000_000,
  variable_cost_per_person: 50_000,
  desired_margin_bp: 2000,
};

describe('simulador de preços (CA-014)', () => {
  let id: string;

  it('cria cenário da viagem com custo, preço sugerido, receita, lucro e equilíbrio', async () => {
    expect((await inject('operador', 'POST', `/trips/${tripId}/pricing-scenarios`, scenario)).statusCode).toBe(403);
    const r = await inject('financeiro', 'POST', `/trips/${tripId}/pricing-scenarios`, scenario);
    expect(r.statusCode).toBe(201);
    id = r.json().id;
    expect(r.json()).toMatchObject({ suggested_price: 131_250, estimated_revenue: 2_625_000, estimated_profit: 525_000 });
    expect(r.json().result).toMatchObject({ cost_per_paying: 105_000, minimum_price: 105_000 });
    expect(r.json().break_even_passengers).toBeGreaterThan(0);
  });

  it('recusa zero pagantes (RN-011)', async () => {
    expect((await inject('financeiro', 'POST', `/trips/${tripId}/pricing-scenarios`, { ...scenario, paying_passengers: 0 })).statusCode).toBe(400);
  });

  it('editar recalcula e grava as saídas', async () => {
    const r = await inject('financeiro', 'PATCH', `/pricing-scenarios/${id}`, { desired_price: 150_000 });
    expect(r.json()).toMatchObject({ estimated_revenue: 3_000_000, break_even_passengers: 11 });
  });

  it('compara quantidades de passageiros', async () => {
    const r = (await inject('financeiro', 'POST', `/pricing-scenarios/${id}/calculate`, { counts: [10, 20, 26] })).json();
    expect(r.comparison.map((c: { paying_passengers: number }) => c.paying_passengers)).toEqual([10, 20, 26]);
    const auto = (await inject('financeiro', 'POST', `/pricing-scenarios/${id}/calculate`)).json();
    expect(auto.comparison.some((c: { paying_passengers: number }) => c.paying_passengers === 26)).toBe(true);
  });

  it('cenário independente e sem acesso para quem não vê o financeiro', async () => {
    const r = await inject('financeiro', 'POST', '/pricing-scenarios', { ...scenario, name: 'Pacote Noronha' });
    expect(r.statusCode).toBe(201);
    expect((await inject('financeiro', 'GET', '/pricing-scenarios')).json()).toHaveLength(1);
    expect((await inject('visualizador', 'GET', `/trips/${tripId}/pricing-scenarios`)).statusCode).toBe(403);
    expect((await inject('operador', 'GET', '/pricing-scenarios')).statusCode).toBe(403);
  });

  it('padrões vêm da viagem e o preço pode ir para o pacote', async () => {
    const d = (await inject('financeiro', 'GET', `/trips/${tripId}/pricing-defaults`)).json();
    expect(d).toMatchObject({ paying_passengers: 1, courtesy_passengers: 0, vehicle_capacity: null, current_price: 100000 });
    expect((await inject('financeiro', 'POST', `/pricing-scenarios/${id}/apply`)).statusCode).toBe(403);
    const applied = await inject('admin', 'POST', `/pricing-scenarios/${id}/apply`);
    expect(applied.json().default_package_price).toBe(150_000);
    expect((await inject('admin', 'GET', `/trips/${tripId}`)).json().default_package_price).toBe(150_000);
  });
});

describe('roteiro (RF-016)', () => {
  let items: { id: string; activity: string; itinerary_date: string }[];

  it('operador cadastra itens; data fora da viagem e horário invertido são recusados', async () => {
    const add = (payload: Record<string, unknown>) => inject('operador', 'POST', `/trips/${tripId}/itinerary`, payload);
    expect((await add({ itinerary_date: '2027-03-20', activity: 'Fora' })).statusCode).toBe(400);
    expect((await add({ itinerary_date: '2027-03-10', activity: 'X', start_time: '10:00', end_time: '09:00' })).statusCode).toBe(400);
    await add({ itinerary_date: '2027-03-10', start_time: '06:00', activity: 'Saída de Aracaju', meeting_point: 'Orla de Atalaia', internal_notes: 'Motorista: Zé' });
    await add({ itinerary_date: '2027-03-11', start_time: '08:00', end_time: '11:00', activity: 'Aula de surf', location: 'Praia da Tiririca' });
    await add({ itinerary_date: '2027-03-11', activity: 'Reunião com a pousada', is_public: false });
    items = (await add({ itinerary_date: '2027-03-11', activity: 'Luau' })).json();
    expect(items.map((i) => i.activity)).toEqual(['Saída de Aracaju', 'Reunião com a pousada', 'Luau', 'Aula de surf']);
    expect((await inject('visualizador', 'POST', `/trips/${tripId}/itinerary`, { itinerary_date: '2027-03-10', activity: 'X' })).statusCode).toBe(403);
  });

  it('visualizador lê sem observações internas', async () => {
    const list = (await inject('visualizador', 'GET', `/trips/${tripId}/itinerary`)).json();
    expect(list[0].internal_notes).toBeNull();
  });

  it('reordena, edita e remove', async () => {
    const day11 = items.filter((i) => i.itinerary_date === '2027-03-11' && i.activity !== 'Aula de surf');
    const r = await inject('operador', 'POST', `/trips/${tripId}/itinerary/reorder`, { ids: [day11[1].id, day11[0].id] });
    expect(r.json().filter((i: { itinerary_date: string; start_time: string | null }) => i.itinerary_date === '2027-03-11' && !i.start_time).map((i: { activity: string }) => i.activity)).toEqual(['Luau', 'Reunião com a pousada']);
    const luau = items.find((i) => i.activity === 'Luau')!;
    expect((await inject('operador', 'PATCH', `/itinerary-items/${luau.id}`, { start_time: '20:00', public_instructions: 'Levar casaco' })).statusCode).toBe(200);
    expect((await inject('operador', 'DELETE', `/itinerary-items/${luau.id}`)).json()).toHaveLength(3);
  });

  it('página do passageiro mostra só os itens públicos, sem observações internas', async () => {
    const pub = (await app.inject({ method: 'GET', url: `/public/reservations/${publicToken}` })).json();
    expect(pub.itinerary.map((i: { activity: string }) => i.activity)).toEqual(['Saída de Aracaju', 'Aula de surf']);
    expect(pub.itinerary[0]).toMatchObject({ date: '2027-03-10', start_time: '06:00', meeting_point: 'Orla de Atalaia' });
    expect(JSON.stringify(pub)).not.toContain('Motorista: Zé');
  });
});
