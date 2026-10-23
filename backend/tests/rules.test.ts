import { describe, expect, it } from 'vitest';
import { isValidCpf, maskCpf, normalizeCpf } from '../src/lib/cpf.js';
import { hasPermission, permissionsFor } from '../src/lib/permissions.js';
import { canArchiveTrip, canCancelTrip, canEditTrip, tripGroup } from '../src/lib/trip-rules.js';
import { createTripSchema, updateTripSchema } from '../src/schemas/trip.schema.js';
import { createCustomerSchema } from '../src/schemas/customer.schema.js';

const validTrip = {
  name: 'Fernando de Noronha',
  destination: 'Noronha',
  departure_at: '2027-01-10T08:00:00-03:00',
  return_at: '2027-01-15T18:00:00-03:00',
  departure_location: 'Aracaju',
  commercial_capacity: 40,
  default_package_price: 128700,
};

describe('CPF', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224726')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });
  it('normaliza e mascara', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(maskCpf('52998224725')).toBe('•••.•••.•••-25');
    expect(maskCpf(null)).toBeNull();
  });
});

describe('permissões (seção 3)', () => {
  it('admin tem tudo', () => {
    expect(permissionsFor({ role: 'ADMIN', can_view_sensitive: false }).length).toBeGreaterThan(10);
  });
  it('operador não gerencia usuários nem edita viagens', () => {
    const op = { role: 'OPERADOR', can_view_sensitive: false } as const;
    expect(hasPermission(op, 'users.manage')).toBe(false);
    expect(hasPermission(op, 'trips.write')).toBe(false);
    expect(hasPermission(op, 'customers.write')).toBe(true);
  });
  it('visualizador só vê CPF com permissão específica', () => {
    expect(hasPermission({ role: 'VISUALIZADOR', can_view_sensitive: false }, 'sensitive.view')).toBe(false);
    expect(hasPermission({ role: 'VISUALIZADOR', can_view_sensitive: true }, 'sensitive.view')).toBe(true);
    expect(hasPermission({ role: 'VISUALIZADOR', can_view_sensitive: true }, 'customers.write')).toBe(false);
  });
  it('financeiro vê dashboards financeiros mas não gerencia usuários', () => {
    const fin = { role: 'FINANCEIRO', can_view_sensitive: false } as const;
    expect(hasPermission(fin, 'finance.read')).toBe(true);
    expect(hasPermission(fin, 'users.manage')).toBe(false);
  });
});

describe('regras de viagem', () => {
  it('agrupa status do dashboard', () => {
    expect(tripGroup('ABERTA')).toBe('futuras');
    expect(tripGroup('EM_ANDAMENTO')).toBe('em_andamento');
    expect(tripGroup('CANCELADA')).toBe('canceladas');
  });
  it('restringe cancelar/arquivar/editar', () => {
    expect(canCancelTrip('ABERTA')).toBe(true);
    expect(canCancelTrip('CANCELADA')).toBe(false);
    expect(canCancelTrip('CONCLUIDA')).toBe(false);
    expect(canArchiveTrip('ARQUIVADA')).toBe(false);
    expect(canEditTrip('CONCLUIDA', 'ADMIN')).toBe(true);
    expect(canEditTrip('CONCLUIDA', 'OPERADOR')).toBe(false);
    expect(canEditTrip('CANCELADA', 'ADMIN')).toBe(false);
  });
});

describe('CA-001 — validação de viagem', () => {
  it('aceita dados válidos', () => {
    expect(createTripSchema.safeParse(validTrip).success).toBe(true);
  });
  it.each([
    ['nome vazio', { name: '  ' }],
    ['destino vazio', { destination: '' }],
    ['data inválida', { departure_at: 'abc' }],
    ['retorno antes da saída', { return_at: '2027-01-09T08:00:00-03:00' }],
    ['capacidade zero', { commercial_capacity: 0 }],
    ['capacidade negativa', { commercial_capacity: -3 }],
    ['capacidade fracionada', { commercial_capacity: 10.5 }],
    ['valor fracionado', { default_package_price: 10.5 }],
    ['valor negativo', { default_package_price: -1 }],
  ])('bloqueia %s', (_label, patch) => {
    expect(createTripSchema.safeParse({ ...validTrip, ...patch }).success).toBe(false);
  });
  it('update parcial não aplica defaults', () => {
    const parsed = updateTripSchema.parse({ name: 'Novo' });
    expect(parsed).toEqual({ name: 'Novo' });
  });
});

describe('cliente', () => {
  it('rejeita CPF inválido e normaliza válido', () => {
    expect(createCustomerSchema.safeParse({ full_name: 'Ana Souza', cpf: '123' }).success).toBe(false);
    expect(createCustomerSchema.parse({ full_name: 'Ana Souza', cpf: '529.982.247-25' }).cpf).toBe('52998224725');
    expect(createCustomerSchema.parse({ full_name: 'Ana Souza', cpf: '' }).cpf).toBeNull();
  });
});
