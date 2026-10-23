import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Spec 16.4 (testes de segurança) + vínculos, grupos e LGPD.
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

const trips: Record<string, string> = {};
const res: Record<string, { id: string; token: string; customer: string }> = {};
let seatB: string;

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
  const base = { destination: 'X', departure_at: '2027-03-10T06:00:00-03:00', return_at: '2027-03-12T20:00:00-03:00', departure_location: 'Aracaju', commercial_capacity: 10, default_package_price: 100000 };
  trips.A = (await inject('admin', 'POST', '/trips', { ...base, name: 'Viagem A' })).json().id;
  trips.B = (await inject('admin', 'POST', '/trips', { ...base, name: 'Viagem B' })).json().id;
  // Equipe só tem acesso à viagem A.
  const users = await app.prisma.user.findMany({ where: { role: { not: 'ADMIN' } } });
  await inject('admin', 'PUT', `/trips/${trips.A}/users`, { users: users.map((u) => ({ user_id: u.id, access_level: 'OPERAR' })) });

  for (const [key, trip, name, cpf] of [['ana', 'A', 'Ana Souza', '52998224725'], ['bruno', 'A', 'Bruno Lima', null], ['carla', 'B', 'Carla Dias', null]] as const) {
    const c = (await inject('admin', 'POST', '/customers', { full_name: name, cpf, phone: `799${key.length}${key.charCodeAt(0)}00000` })).json();
    const r = (await inject('admin', 'POST', `/trips/${trips[trip]}/reservations`, { customer_id: c.id, reservation_status: 'CONFIRMADA' })).json();
    res[key] = { id: r.reservation.id, token: r.public_url.split('/p/')[1], customer: c.id };
  }
  await inject('admin', 'POST', `/reservations/${res.carla.id}/payments`, { amount: 50000, payment_date: '2027-01-05', payment_method: 'PIX' });
  const layout = (await inject('admin', 'POST', '/vehicle-templates', { name: 'Van', category: 'VAN', layout: { layout_data: { floors: [{ floor: 1, rows: 1, cols: 2 }], seats: [{ floor: 1, row: 0, col: 0, number: '1' }, { floor: 1, row: 0, col: 1, number: '2' }] } } })).json().layouts[0].id;
  seatB = (await inject('admin', 'POST', `/trips/${trips.B}/vehicles`, { seat_layout_id: layout, operational_name: 'Van B' })).json().seats[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('acesso indevido entre viagens', () => {
  it('equipe sem acesso à viagem B recebe 404 em tudo dela (não 403)', async () => {
    const urls = [
      ['GET', `/trips/${trips.B}`],
      ['GET', `/trips/${trips.B}/reservations`],
      ['GET', `/reservations/${res.carla.id}`],
      ['GET', `/trips/${trips.B}/vehicles`],
      ['GET', `/trips/${trips.B}/itinerary`],
      ['GET', `/trips/${trips.B}/reports/passageiros`],
      ['POST', `/trips/${trips.B}/reservations`],
    ] as const;
    for (const [method, url] of urls) {
      const r = await inject('operador', method, url, method === 'POST' ? { customer_id: res.ana.customer } : undefined);
      expect(r.statusCode, url).toBe(404);
    }
    for (const url of [`/reservations/${res.carla.id}/finance`, `/trips/${trips.B}/finance-dashboard`, `/trips/${trips.B}/expenses`]) {
      expect((await inject('financeiro', 'GET', url)).statusCode, url).toBe(404);
    }
  });

  it('não dá pra usar um assento de outra viagem nem estornar pagamento dela', async () => {
    const seat = await inject('operador', 'POST', `/reservations/${res.ana.id}/seat-assignment`, { trip_seat_id: seatB });
    expect(seat.statusCode).toBe(404);
    const payment = await app.prisma.customerPayment.findFirstOrThrow({ where: { reservation_id: res.carla.id } });
    expect((await inject('financeiro', 'POST', `/payments/${payment.id}/reverse`, { reason: 'teste indevido' })).statusCode).toBe(404);
  });
});

describe('usuário sem permissão', () => {
  it('visualizador não altera nada', async () => {
    const attempts = [
      ['POST', `/trips/${trips.A}/reservations`, { customer_id: res.ana.customer }],
      ['PATCH', `/reservations/${res.ana.id}`, { discount_amount: 100 }],
      ['POST', `/reservations/${res.ana.id}/cancel`, { reason: 'xxx' }],
      ['POST', `/reservations/${res.ana.id}/payments`, { amount: 1, payment_date: '2027-01-01', payment_method: 'PIX' }],
      ['POST', '/customers', { full_name: 'Novo' }],
      ['POST', `/trips/${trips.A}/itinerary`, { itinerary_date: '2027-03-10', activity: 'Xxx' }],
      ['POST', '/users', { name: 'X', email: 'x@x.com', password: '12345678', role: 'ADMIN' }],
    ] as const;
    for (const [method, url, body] of attempts) expect((await inject('visualizador', method, url, body)).statusCode, url).toBe(403);
  });

  it('token adulterado ou ausente é recusado', async () => {
    const [h, p] = tokens.visualizador.split('.');
    const forged = Buffer.from(JSON.parse(Buffer.from(p, 'base64url').toString()).sub ? JSON.stringify({ sub: 'x' }) : '{}').toString('base64url');
    expect((await app.inject({ method: 'GET', url: '/trips', headers: { authorization: `Bearer ${h}.${forged}.assinatura` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/trips' })).statusCode).toBe(401);
  });
});

describe('link público', () => {
  it('não permite enumerar reservas: token qualquer, curto ou ID interno dão a mesma resposta', async () => {
    const bodies = new Set<string>();
    for (const t of ['a'.repeat(43), 'curto', res.ana.id, encodeURIComponent('../../etc/passwd')]) {
      const r = await app.inject({ method: 'GET', url: `/public/reservations/${t}` });
      expect(r.statusCode).toBe(404);
      bodies.add(r.body);
    }
    expect(bodies.size).toBe(1);
  });

  it('não expõe CPF, contatos nem valores', async () => {
    const body = (await app.inject({ method: 'GET', url: `/public/reservations/${res.ana.token}` })).body;
    for (const secret of ['52998224725', '529.982', 'final_price', 'package_price', '100000', 'phone', 'customer_id', res.ana.id]) {
      expect(body, secret).not.toContain(secret);
    }
  });

  it('revogação vale na hora', async () => {
    await inject('admin', 'POST', `/reservations/${res.bruno.id}/revoke-public-link`);
    expect((await app.inject({ method: 'GET', url: `/public/reservations/${res.bruno.token}` })).statusCode).toBe(404);
  });

  it('tentativas repetidas no endpoint público são limitadas', async () => {
    let limited = false;
    for (let i = 0; i < 40 && !limited; i++) {
      const r = await app.inject({ method: 'GET', url: `/public/reservations/${'z'.repeat(43)}`, remoteAddress: '10.9.9.9' });
      limited = r.statusCode === 429;
    }
    expect(limited).toBe(true);
  });

  it('respostas saem com cabeçalhos de segurança', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
  });
});

describe('uploads', () => {
  it('recusa arquivo maior que 5 MB', async () => {
    const boundary = '----x';
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 10, 0x20)]);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="g.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      big,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const r = await app.inject({ method: 'POST', url: '/files', headers: { ...auth('financeiro'), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(r.statusCode).toBe(413);
  });
});

describe('vínculos e grupos (RF-005 / RF-012)', () => {
  it('vincula clientes, sem repetir nem vincular a si mesmo', async () => {
    const link = await inject('operador', 'POST', `/customers/${res.ana.customer}/relationships`, { related_customer_id: res.bruno.customer, relationship_type: 'Família', group_name: 'Família Souza' });
    expect(link.statusCode).toBe(201);
    expect((await inject('operador', 'POST', `/customers/${res.bruno.customer}/relationships`, { related_customer_id: res.ana.customer, relationship_type: 'Família' })).statusCode).toBe(409);
    expect((await inject('operador', 'POST', `/customers/${res.ana.customer}/relationships`, { related_customer_id: res.ana.customer, relationship_type: 'Eu' })).statusCode).toBe(400);
    const fromBruno = (await inject('operador', 'GET', `/customers/${res.bruno.customer}/relationships`)).json();
    expect(fromBruno[0].customer.full_name).toBe('Ana Souza');
  });

  it('a viagem mostra o grupo pra manter junto', async () => {
    const groups = (await inject('operador', 'GET', `/trips/${trips.A}/groups`)).json();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: 'Família Souza' });
    expect(groups[0].members.map((m: { passenger_name: string }) => m.passenger_name)).toEqual(['Ana Souza', 'Bruno Lima']);
  });

  it('histórico de viagens do cliente, com valores só pra quem vê o financeiro', async () => {
    const admin = (await inject('admin', 'GET', `/customers/${res.carla.customer}/trips`)).json();
    expect(admin[0]).toMatchObject({ trip: { name: 'Viagem B' }, paid: 50000, financial_status: 'PARCIALMENTE_PAGO' });
    const viewer = (await inject('visualizador', 'GET', `/customers/${res.ana.customer}/trips`)).json();
    expect(viewer[0]).not.toHaveProperty('paid');
  });
});

describe('LGPD (10.2)', () => {
  it('exporta os dados do titular (só admin) e registra', async () => {
    expect((await inject('operador', 'GET', `/customers/${res.carla.customer}/export`)).statusCode).toBe(403);
    const r = await inject('admin', 'GET', `/customers/${res.carla.customer}/export`);
    expect(r.headers['content-disposition']).toContain('attachment');
    expect(r.json()).toMatchObject({ dados_cadastrais: { full_name: 'Carla Dias' }, viagens: [{ viagem: 'Viagem B', pagamentos: [{ valor: 500 }] }] });
    expect(await app.prisma.auditLog.count({ where: { action: 'PRIVACY_EXPORT' } })).toBe(1);
  });

  it('anonimiza só sem viagem em aberto, preservando o financeiro', async () => {
    expect((await inject('admin', 'POST', `/customers/${res.carla.customer}/anonymize`, { reason: 'Pedido do titular' })).statusCode).toBe(409);
    await inject('admin', 'POST', `/trips/${trips.B}/cancel`, { reason: 'Cancelada' });
    const r = await inject('admin', 'POST', `/customers/${res.carla.customer}/anonymize`, { reason: 'Pedido do titular' });
    expect(r.statusCode).toBe(200);
    const c = await app.prisma.customer.findUniqueOrThrow({ where: { id: res.carla.customer } });
    expect(c).toMatchObject({ full_name: 'Cliente anonimizado', cpf: null, phone: null, status: 'ARQUIVADO' });
    const reservation = await app.prisma.reservation.findUniqueOrThrow({ where: { id: res.carla.id }, include: { payments: true } });
    expect(reservation.passenger_name).toBe('Passageiro anonimizado');
    expect(reservation.payments[0].amount).toBe(50000);
    const logs = await app.prisma.auditLog.findMany({ where: { entity_type: 'Customer', entity_id: res.carla.customer } });
    expect(JSON.stringify(logs.map((l) => [l.old_values, l.new_values]))).not.toContain('Carla');
  });
});
