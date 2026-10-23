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
const report = (who: string, slug: string, qs = '') => inject(who, 'GET', `/trips/${tripId}/reports/${slug}?${qs}`);

let tripId: string;
const SLUGS = ['passageiros', 'por-veiculo', 'por-assento', 'embarque', 'por-pousada', 'por-quarto', 'pagamentos', 'inadimplentes', 'despesas', 'financeiro', 'lucro', 'roteiro'];

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
      commercial_capacity: 20,
      default_package_price: 100000,
    })
  ).json().id;
  const users = await app.prisma.user.findMany({ where: { role: { not: 'ADMIN' } } });
  await inject('admin', 'PUT', `/trips/${tripId}/users`, { users: users.map((u) => ({ user_id: u.id, access_level: 'OPERAR' })) });

  // Veículo com 12 assentos (pra testar ordem 2 antes de 10).
  const seats = Array.from({ length: 12 }, (_, i) => ({ floor: 1, row: Math.floor(i / 4), col: i % 4, number: String(i + 1) }));
  const layoutId = (await inject('admin', 'POST', '/vehicle-templates', { name: 'Van', category: 'VAN', layout: { layout_data: { floors: [{ floor: 1, rows: 3, cols: 4 }], seats } } })).json().layouts[0].id;
  const vehicle = (await inject('admin', 'POST', `/trips/${tripId}/vehicles`, { seat_layout_id: layoutId, operational_name: 'Van 1', driver_name: 'Zé' })).json();
  const seatId = (n: string) => vehicle.seats.find((s: { seat_number: string }) => s.seat_number === n).id;

  const acc = (await inject('admin', 'POST', '/accommodations', { name: 'Pousada Maré', city: 'Itacaré' })).json();
  await inject('admin', 'POST', `/accommodations/${acc.id}/rooms`, { identifier: '10', room_type: 'DUPLO', capacity: 2, beds: 2 });
  await inject('admin', 'POST', `/accommodations/${acc.id}/rooms`, { identifier: '2', room_type: 'TRIPLO', capacity: 3, beds: 3 });
  const tas = (await inject('admin', 'POST', `/trips/${tripId}/accommodations`, { accommodation_id: acc.id })).json();
  const roomId = (id: string) => tas[0].rooms.find((r: { identifier: string }) => r.identifier === id).id;

  const people = [
    { name: 'Ana Souza', cpf: '52998224725', seat: '10', room: '2' },
    { name: 'Bruno Lima', cpf: null, seat: '2', room: '2' },
    { name: 'Carla Dias', cpf: null, seat: null, room: '10' },
  ];
  for (const p of people) {
    const c = (await inject('admin', 'POST', '/customers', { full_name: p.name, cpf: p.cpf, whatsapp: '79999990000', confirm_duplicate: true })).json();
    const r = (await inject('admin', 'POST', `/trips/${tripId}/reservations`, { customer_id: c.id, reservation_status: 'CONFIRMADA', payment_due_date: '2020-01-01' })).json().reservation;
    if (p.seat) await inject('admin', 'POST', `/reservations/${r.id}/seat-assignment`, { trip_seat_id: seatId(p.seat) });
    await inject('admin', 'POST', `/reservations/${r.id}/room-assignment`, { trip_room_id: roomId(p.room) });
    if (p.name !== 'Carla Dias') await inject('admin', 'POST', `/reservations/${r.id}/payments`, { amount: 100000, payment_date: '2027-01-05', payment_method: 'PIX' });
  }
  const cat = await app.prisma.expenseCategory.findFirstOrThrow({ where: { name: 'Transporte principal' } });
  await inject('financeiro', 'POST', `/trips/${tripId}/expenses`, { category_id: cat.id, description: 'Van fretada', planned_amount: 150000 });
  await inject('operador', 'POST', `/trips/${tripId}/itinerary`, { itinerary_date: '2027-03-11', start_time: '08:00', activity: 'Aula de surf' });
  await inject('operador', 'POST', `/trips/${tripId}/itinerary`, { itinerary_date: '2027-03-11', activity: 'Acerto com a pousada', is_public: false, internal_notes: 'Levar recibo' });
});

afterAll(async () => {
  await app.close();
});

describe('relatórios (RF-022)', () => {
  it('os 12 relatórios saem em PDF, CSV e Excel', async () => {
    for (const slug of SLUGS) {
      const pdf = await report('admin', slug);
      expect(pdf.statusCode, slug).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      const csv = await report('admin', slug, 'format=csv');
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      const xlsx = await report('admin', slug, 'format=xlsx');
      // Excel é um zip.
      expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
      expect(xlsx.headers['content-disposition']).toContain('.xlsx');
    }
  });

  it('lista por assento em ordem numérica (CA-018)', async () => {
    const lines = (await report('admin', 'por-assento', 'format=csv')).body.split('\r\n');
    const seats = lines.slice(1).map((l) => l.split(';')[1]);
    expect(seats.slice(0, 3)).toEqual(['1', '2', '3']);
    expect(lines.find((l) => l.includes(';2;'))).toContain('Bruno Lima');
    expect(lines.find((l) => l.includes(';10;'))).toContain('Ana Souza');
  });

  it('hospedagem agrupada por pousada e quarto (CA-019)', async () => {
    const body = (await report('admin', 'por-pousada', 'format=csv')).body;
    const rows = body.split('\r\n').slice(1);
    expect(rows[0]).toMatch(/^Pousada Maré · Itacaré;2;Triplo;/);
    expect(rows.filter((r) => r.includes(';2;')).length).toBe(2);
    expect(rows.find((r) => r.includes('Carla Dias'))).toContain(';10;');
  });

  it('lista por veículo mostra quem está sem assento', async () => {
    const body = (await report('admin', 'por-veiculo', 'format=csv')).body;
    expect(body).toContain('Sem assento;;Carla Dias');
  });

  it('CPF: completo pra quem vê dados sensíveis, mascarado pro visualizador e sempre na lista de embarque', async () => {
    expect((await report('admin', 'passageiros', 'format=csv')).body).toContain('529.982.247-25');
    const viewer = (await report('visualizador', 'passageiros', 'format=csv')).body;
    expect(viewer).not.toContain('52998224725');
    expect(viewer).not.toContain('529.982.247-25');
    expect(viewer).not.toContain('79999990000');
    const boarding = (await report('admin', 'embarque', 'format=csv')).body;
    expect(boarding).toContain('•••.•••.•••-25');
    expect(boarding).not.toContain('529.982');
  });

  it('financeiros: negados para operador e visualizador e fora da lista deles (CA-020)', async () => {
    for (const slug of ['pagamentos', 'inadimplentes', 'despesas', 'financeiro', 'lucro']) {
      expect((await report('operador', slug)).statusCode).toBe(403);
      expect((await report('visualizador', slug)).statusCode).toBe(403);
      expect((await report('financeiro', slug)).statusCode).toBe(200);
    }
    const list = (await inject('operador', 'GET', `/trips/${tripId}/reports`)).json();
    expect(list.reports.map((r: { slug: string }) => r.slug)).toEqual(['passageiros', 'por-veiculo', 'por-assento', 'embarque', 'por-pousada', 'por-quarto', 'roteiro']);
    expect(list.options.vehicles[0].name).toBe('Van 1');
    // Coluna de pagamento some pra quem não vê o financeiro.
    expect((await report('operador', 'passageiros', 'format=csv')).body.split('\r\n')[0]).not.toContain('Pagamento');
  });

  it('valores conferem: pagamentos, inadimplentes e lucro', async () => {
    const pays = (await report('financeiro', 'pagamentos', 'format=csv')).body;
    expect(pays).toContain('05/01/2027;Ana Souza;Pagamento;Pix;1000,00;Válido');
    expect(pays).toContain(';Total válido;;;2000,00');
    const late = (await report('financeiro', 'inadimplentes', 'format=csv')).body.split('\r\n');
    expect(late).toHaveLength(3); // cabeçalho, Carla, total
    expect(late[1]).toContain('Carla Dias');
    const profit = (await report('financeiro', 'lucro', 'format=csv')).body;
    expect(profit).toContain('Receita;3000,00;2000,00');
    expect(profit).toContain('(-) Transporte principal;-1500,00;0,00');
    expect(profit).toContain('Lucro / resultado;1500,00;2000,00');
  });

  it('filtros: período, veículo e roteiro interno', async () => {
    // Nenhum pagamento depois de 01/02: só cabeçalho e total.
    expect((await report('financeiro', 'pagamentos', 'format=csv&from=2027-02-01')).body.split('\r\n')).toHaveLength(2);
    const vehicles = (await inject('admin', 'GET', `/trips/${tripId}/reports`)).json().options.vehicles;
    expect((await report('admin', 'por-veiculo', `format=csv&vehicle_id=${vehicles[0].id}`)).body).not.toContain('Sem assento');
    expect((await report('operador', 'roteiro', 'format=csv')).body).not.toContain('Acerto com a pousada');
    const internal = (await report('operador', 'roteiro', 'format=csv&internal=1')).body;
    expect(internal).toContain('Acerto com a pousada (interno)');
    expect(internal).toContain('Interno: Levar recibo');
    expect((await report('visualizador', 'roteiro', 'format=csv&internal=1')).body).not.toContain('Levar recibo');
  });

  it('PDF com várias páginas tem paginação e a exportação fica na auditoria', async () => {
    for (let i = 0; i < 70; i++) {
      await app.prisma.itineraryItem.create({ data: { trip_id: tripId, itinerary_date: new Date('2027-03-10'), activity: `Atividade ${i}`, sort_order: i + 10 } });
    }
    const pdf = (await report('admin', 'roteiro')).rawPayload.toString('latin1');
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    expect(await app.prisma.auditLog.count({ where: { action: 'REPORT_EXPORT' } })).toBeGreaterThan(0);
    expect((await report('admin', 'nao-existe')).statusCode).toBe(404);
  });
});

describe('viagem concluída (CA-022 / RN-015)', () => {
  it('continua consultável com tudo e não recebe novas reservas', async () => {
    expect((await inject('admin', 'PATCH', `/trips/${tripId}`, { status: 'CONCLUIDA' })).json().status).toBe('CONCLUIDA');
    const checks: [string, string, (b: unknown) => boolean][] = [
      ['operador', `/trips/${tripId}/reservations`, (b) => (b as unknown[]).length === 3],
      ['operador', `/trips/${tripId}/vehicles`, (b) => (b as { counts: { occupied: number } }[])[0].counts.occupied === 2],
      ['operador', `/trips/${tripId}/accommodations`, (b) => (b as { counts: { guests: number } }[])[0].counts.guests === 3],
      ['operador', `/trips/${tripId}/itinerary`, (b) => (b as unknown[]).length > 0],
      ['financeiro', `/trips/${tripId}/payments`, (b) => (b as unknown[]).length === 2],
      ['financeiro', `/trips/${tripId}/expenses`, (b) => (b as unknown[]).length === 1],
      ['financeiro', `/trips/${tripId}/finance-dashboard`, (b) => (b as { revenue_received: number }).revenue_received === 200000],
    ];
    for (const [who, url, ok] of checks) {
      const r = await inject(who, 'GET', url);
      expect(r.statusCode, url).toBe(200);
      expect(ok(r.json()), url).toBe(true);
    }
    expect((await report('financeiro', 'lucro')).statusCode).toBe(200);
    const c = (await inject('admin', 'POST', '/customers', { full_name: 'Depois da viagem' })).json();
    expect((await inject('admin', 'POST', `/trips/${tripId}/reservations`, { customer_id: c.id })).statusCode).toBe(409);
  });
});
