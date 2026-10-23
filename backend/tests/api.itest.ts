import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Banco isolado: nunca roda contra o banco de desenvolvimento.
const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) throw new Error('Defina TEST_DATABASE_URL (veja o script npm run test:integration)');
process.env.DATABASE_URL = TEST_DB;
process.env.CORS_ORIGIN = 'http://localhost';
process.env.JWT_SECRET = 'test-access-secret-123456';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-123456';
process.env.NODE_ENV = 'test';

let app: FastifyInstance;
const tokens: Record<string, string> = {};

const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
const trip = {
  name: 'Noronha 2027',
  destination: 'Fernando de Noronha',
  departure_at: '2027-01-10T08:00:00-03:00',
  return_at: '2027-01-15T18:00:00-03:00',
  departure_location: 'Aracaju',
  commercial_capacity: 40,
  default_package_price: 128700,
};

async function login(email: string, password: string) {
  return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
}

beforeAll(async () => {
  const { buildApp } = await import('../src/app.js');
  const { hashPassword } = await import('../src/lib/hash.js');
  app = await buildApp();
  await app.ready();

  // Banco limpo a cada execução.
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
  await app.prisma.user.create({
    data: { email: 'admin@test.com', name: 'Admin', role: 'ADMIN', password_hash: await hashPassword('senha-admin-1') },
  });
  const res = await login('admin@test.com', 'senha-admin-1');
  tokens.admin = res.json().accessToken;
});

afterAll(async () => {
  await app.close();
});

describe('autenticação', () => {
  it('rejeita senha errada sem revelar se o e-mail existe', async () => {
    const wrong = await login('admin@test.com', 'errada');
    const unknown = await login('naoexiste@test.com', 'errada');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().message).toBe(wrong.json().message);
  });

  it('bloqueia a conta após 5 tentativas inválidas e registra último acesso', async () => {
    await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin'),
      payload: { name: 'Tranca', email: 'tranca@test.com', password: 'senha-12345', role: 'OPERADOR' },
    });
    for (let i = 0; i < 5; i++) await login('tranca@test.com', 'errada');
    const locked = await login('tranca@test.com', 'senha-12345');
    expect(locked.statusCode).toBe(429);

    const admin = await app.prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    expect(admin.last_login_at).not.toBeNull();
  });

  it('exige token e rejeita usuário desativado imediatamente', async () => {
    expect((await app.inject({ method: 'GET', url: '/customers' })).statusCode).toBe(401);

    const created = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin'),
      payload: { name: 'Sai', email: 'sai@test.com', password: 'senha-12345', role: 'OPERADOR' },
    });
    const sai = (await login('sai@test.com', 'senha-12345')).json().accessToken;
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${sai}` } })).statusCode).toBe(200);

    await app.inject({ method: 'PATCH', url: `/users/${created.json().id}`, headers: auth('admin'), payload: { status: 'INATIVO' } });
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${sai}` } })).statusCode).toBe(401);
  });

  it('não deixa remover o último administrador', async () => {
    const admin = await app.prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    const res = await app.inject({ method: 'PATCH', url: `/users/${admin.id}`, headers: auth('admin'), payload: { role: 'OPERADOR' } });
    expect(res.statusCode).toBe(409);
  });
});

describe('perfis e usuários', () => {
  it('cria operador e visualizador; só admin gerencia usuários', async () => {
    for (const [who, role] of [['operador', 'OPERADOR'], ['visualizador', 'VISUALIZADOR']] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/users',
        headers: auth('admin'),
        payload: { name: who, email: `${who}@test.com`, password: 'senha-12345', role },
      });
      expect(res.statusCode).toBe(201);
      tokens[who] = (await login(`${who}@test.com`, 'senha-12345')).json().accessToken;
    }
    expect((await app.inject({ method: 'GET', url: '/users', headers: auth('operador') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/users', headers: auth('operador'), payload: {} })).statusCode).toBe(403);
  });
});

describe('clientes', () => {
  let customerId: string;

  it('cria cliente e bloqueia CPF duplicado (CA-003)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: auth('operador'),
      payload: { full_name: 'Ana Souza', cpf: '529.982.247-25', phone: '79999990000', email: 'ana@x.com' },
    });
    expect(created.statusCode).toBe(201);
    customerId = created.json().id;
    expect(created.json().cpf).toBe('52998224725');

    const dup = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: auth('operador'),
      payload: { full_name: 'Outra Pessoa', cpf: '52998224725', confirm_duplicate: true },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('CPF_DUPLICATE');
    expect(dup.json().existing.id).toBe(customerId);
  });

  it('pede confirmação para possível duplicidade por nome/telefone (RN-001)', async () => {
    const payload = { full_name: 'ana souza', phone: '79988887777' };
    const first = await app.inject({ method: 'POST', url: '/customers', headers: auth('operador'), payload });
    expect(first.statusCode).toBe(409);
    expect(first.json().code).toBe('POSSIBLE_DUPLICATE');

    const confirmed = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: auth('operador'),
      payload: { ...payload, confirm_duplicate: true },
    });
    expect(confirmed.statusCode).toBe(201);
  });

  it('visualizador vê CPF mascarado, sem contatos, e não busca por CPF', async () => {
    const res = await app.inject({ method: 'GET', url: `/customers/${customerId}`, headers: auth('visualizador') });
    const body = res.json();
    expect(body.cpf).toBe('•••.•••.•••-25');
    expect(body.phone).toBeNull();
    expect(body.email).toBeNull();

    const bySensitive = await app.inject({ method: 'GET', url: '/customers?q=52998224725', headers: auth('visualizador') });
    expect(bySensitive.json().items).toHaveLength(0);
    const byOperator = await app.inject({ method: 'GET', url: '/customers?q=52998224725', headers: auth('operador') });
    expect(byOperator.json().items).toHaveLength(1);

    const write = await app.inject({ method: 'PATCH', url: `/customers/${customerId}`, headers: auth('visualizador'), payload: { city: 'X' } });
    expect(write.statusCode).toBe(403);
  });

  it('arquiva sem apagar e registra auditoria', async () => {
    const res = await app.inject({ method: 'POST', url: `/customers/${customerId}/archive`, headers: auth('admin') });
    expect(res.json().status).toBe('ARQUIVADO');
    const list = await app.inject({ method: 'GET', url: '/customers?q=Ana', headers: auth('admin') });
    expect(list.json().items.find((c: { id: string }) => c.id === customerId)).toBeUndefined();
    const all = await app.inject({ method: 'GET', url: '/customers?status=TODOS&q=Ana', headers: auth('admin') });
    expect(all.json().items.find((c: { id: string }) => c.id === customerId)).toBeDefined();
    const logs = await app.prisma.auditLog.findMany({ where: { entity_type: 'Customer', entity_id: customerId } });
    expect(logs.map((l) => l.action)).toContain('ARCHIVE');
  });
});

describe('viagens', () => {
  let tripId: string;

  it('valida o cadastro (CA-001)', async () => {
    for (const patch of [{ name: '' }, { commercial_capacity: 0 }, { return_at: '2027-01-01T00:00:00Z' }, { default_package_price: 10.5 }]) {
      const res = await app.inject({ method: 'POST', url: '/trips', headers: auth('admin'), payload: { ...trip, ...patch } });
      expect(res.statusCode).toBe(400);
    }
  });

  it('só admin cria viagem', async () => {
    expect((await app.inject({ method: 'POST', url: '/trips', headers: auth('operador'), payload: trip })).statusCode).toBe(403);
    const res = await app.inject({ method: 'POST', url: '/trips', headers: auth('admin'), payload: trip });
    expect(res.statusCode).toBe(201);
    tripId = res.json().id;
    expect(res.json().summary.available_seats).toBe(40);
  });

  it('operador só enxerga viagens autorizadas; as demais respondem 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/trips', headers: auth('operador') })).json()).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `/trips/${tripId}`, headers: auth('operador') })).statusCode).toBe(404);

    const op = await app.prisma.user.findUniqueOrThrow({ where: { email: 'operador@test.com' } });
    const put = await app.inject({
      method: 'PUT',
      url: `/trips/${tripId}/users`,
      headers: auth('admin'),
      payload: { users: [{ user_id: op.id, access_level: 'OPERAR' }] },
    });
    expect(put.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/trips', headers: auth('operador') })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: `/trips/${tripId}`, headers: auth('operador') })).statusCode).toBe(200);
    // Visualizador não foi autorizado: continua sem acesso.
    expect((await app.inject({ method: 'GET', url: `/trips/${tripId}`, headers: auth('visualizador') })).statusCode).toBe(404);
    // E operador não gerencia acesso.
    expect((await app.inject({ method: 'PUT', url: `/trips/${tripId}/users`, headers: auth('operador'), payload: { users: [] } })).statusCode).toBe(403);
  });

  it('não mostra dados financeiros a quem não tem finance.read', async () => {
    const res = await app.inject({ method: 'GET', url: `/trips/${tripId}`, headers: auth('operador') });
    expect(res.json().summary.revenue_received).toBeNull();
    const admin = await app.inject({ method: 'GET', url: `/trips/${tripId}`, headers: auth('admin') });
    expect(admin.json().summary.revenue_received).toBe(0);
  });

  it('edita validando datas contra o valor já salvo', async () => {
    const bad = await app.inject({ method: 'PATCH', url: `/trips/${tripId}`, headers: auth('admin'), payload: { return_at: '2027-01-01T00:00:00Z' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PATCH', url: `/trips/${tripId}`, headers: auth('admin'), payload: { status: 'ABERTA', commercial_capacity: 45 } });
    expect(ok.json().status).toBe('ABERTA');
    const logs = await app.prisma.auditLog.findMany({ where: { entity_id: tripId, action: 'UPDATE' } });
    expect(logs[0].old_values).toMatchObject({ commercial_capacity: 40 });
  });

  it('duplica sem copiar acesso, cancela com motivo, arquiva e restaura', async () => {
    const dup = await app.inject({ method: 'POST', url: `/trips/${tripId}/duplicate`, headers: auth('admin') });
    expect(dup.statusCode).toBe(201);
    expect(dup.json().name).toBe('Noronha 2027 (cópia)');
    expect(dup.json().status).toBe('PLANEJADA');
    const dupId = dup.json().id;

    expect((await app.inject({ method: 'POST', url: `/trips/${dupId}/cancel`, headers: auth('admin'), payload: {} })).statusCode).toBe(400);
    const cancelled = await app.inject({ method: 'POST', url: `/trips/${dupId}/cancel`, headers: auth('admin'), payload: { reason: 'Poucos inscritos' } });
    expect(cancelled.json().status).toBe('CANCELADA');
    expect((await app.inject({ method: 'PATCH', url: `/trips/${dupId}`, headers: auth('admin'), payload: { name: 'x' } })).statusCode).toBe(409);
    const cancelLog = await app.prisma.auditLog.findFirstOrThrow({ where: { entity_id: dupId, action: 'CANCEL' } });
    expect(cancelLog.reason).toBe('Poucos inscritos');

    const archived = await app.inject({ method: 'POST', url: `/trips/${tripId}/archive`, headers: auth('admin') });
    expect(archived.json().status).toBe('ARQUIVADA');
    const restored = await app.inject({ method: 'POST', url: `/trips/${tripId}/restore`, headers: auth('admin') });
    expect(restored.json().status).toBe('ABERTA');
  });

  it('filtra por status e busca', async () => {
    const byStatus = await app.inject({ method: 'GET', url: '/trips?status=CANCELADA', headers: auth('admin') });
    expect(byStatus.json()).toHaveLength(1);
    const byText = await app.inject({ method: 'GET', url: '/trips?q=noronha', headers: auth('admin') });
    expect(byText.json().length).toBe(2);
  });
});

describe('recuperação de senha', () => {
  it('responde igual para e-mail existente e inexistente', async () => {
    const known = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'admin@test.com' } });
    const unknown = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'ninguem@test.com' } });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());
    // Só o hash vai pro banco.
    const saved = await app.prisma.passwordResetToken.findMany();
    expect(saved).toHaveLength(1);
    expect(saved[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('troca a senha com token válido, uma vez só', async () => {
    const { hashToken } = await import('../src/lib/tokens.js');
    const admin = await app.prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    await app.prisma.passwordResetToken.create({
      data: { user_id: admin.id, token_hash: hashToken('token-de-teste'), expires_at: new Date(Date.now() + 60_000) },
    });

    const reset = () =>
      app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token: 'token-de-teste', password: 'nova-senha-123' } });
    expect((await reset()).statusCode).toBe(200);
    expect((await login('admin@test.com', 'nova-senha-123')).statusCode).toBe(200);
    expect((await reset()).statusCode).toBe(400);

    const audit = await app.prisma.auditLog.findFirst({ where: { entity_id: admin.id, action: 'PASSWORD_RESET' } });
    expect(audit?.user_id).toBe(admin.id);
  });

  it('recusa token expirado', async () => {
    const { hashToken } = await import('../src/lib/tokens.js');
    const admin = await app.prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    await app.prisma.passwordResetToken.create({
      data: { user_id: admin.id, token_hash: hashToken('expirado'), expires_at: new Date(Date.now() - 1000) },
    });
    const res = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token: 'expirado', password: 'outra-senha-123' } });
    expect(res.statusCode).toBe(400);
  });
});
