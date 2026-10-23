import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PricingScenario, Prisma } from '@prisma/client';
import { z } from 'zod';
import { writeAudit } from '../lib/audit.js';
import { calculatePricing, compareByPassengers, pricingProblem, type PricingInput } from '../lib/pricing-rules.js';
import { isEnded } from '../lib/reservation-rules.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { tripScope, tripWriteScope } from './trips.routes.js';

type IdParams = { Params: { id: string } };

const cents = z.number().int().min(0);
const bp = z.number().int().min(0).max(9_900);

const scenarioFields = {
  name: z.string().trim().min(1, 'Dê um nome ao cenário'),
  paying_passengers: z.number().int().min(1, 'Informe ao menos um passageiro pagante').max(500),
  courtesy_passengers: z.number().int().min(0).max(100).default(0),
  vehicle_capacity: z.number().int().positive().nullable().default(null),
  fixed_costs: cents.default(0),
  variable_cost_per_person: cents.default(0),
  discounts: cents.default(0),
  installment_fee_bp: bp.default(0),
  contingency_type: z.enum(['FIXO', 'PERCENTUAL']).default('PERCENTUAL'),
  contingency_value: z.number().int().min(0).default(0),
  desired_margin_bp: bp.default(0),
  desired_price: z.number().int().positive().nullable().default(null),
};
const createSchema = z.object(scenarioFields);
const updateSchema = z
  .object({
    ...scenarioFields,
    courtesy_passengers: z.number().int().min(0).max(100),
    vehicle_capacity: z.number().int().positive().nullable(),
    fixed_costs: cents,
    variable_cost_per_person: cents,
    discounts: cents,
    installment_fee_bp: bp,
    contingency_type: z.enum(['FIXO', 'PERCENTUAL']),
    contingency_value: z.number().int().min(0),
    desired_margin_bp: bp,
    desired_price: z.number().int().positive().nullable(),
  })
  .partial();
const compareSchema = z.object({ counts: z.array(z.number().int().min(1).max(500)).max(12).optional() });

const inputOf = (s: Pick<PricingScenario, keyof PricingInput>): PricingInput => ({
  paying_passengers: s.paying_passengers,
  courtesy_passengers: s.courtesy_passengers,
  vehicle_capacity: s.vehicle_capacity,
  fixed_costs: s.fixed_costs,
  variable_cost_per_person: s.variable_cost_per_person,
  discounts: s.discounts,
  installment_fee_bp: s.installment_fee_bp,
  contingency_type: s.contingency_type,
  contingency_value: s.contingency_value,
  desired_margin_bp: s.desired_margin_bp,
  desired_price: s.desired_price,
});

// As saídas gravadas (spec 6.27) são sempre as da conta atual.
const outputsOf = (input: PricingInput) => {
  const r = calculatePricing(input);
  return {
    suggested_price: r.suggested_price,
    minimum_price: r.minimum_price,
    estimated_revenue: r.estimated_revenue,
    estimated_profit: r.estimated_profit,
    break_even_passengers: r.break_even_passengers,
  };
};

const present = (s: PricingScenario) => ({ ...s, result: calculatePricing(inputOf(s)) });

// Sugere quantidades pra comparar: em volta do cenário e na capacidade.
function defaultCounts(s: PricingScenario) {
  const n = s.paying_passengers;
  const set = new Set([Math.max(1, Math.round(n * 0.5)), Math.max(1, Math.round(n * 0.75)), n, Math.round(n * 1.25)]);
  if (s.vehicle_capacity) set.add(Math.max(1, s.vehicle_capacity - s.courtesy_passengers));
  return [...set].sort((a, b) => a - b);
}

export async function pricingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  async function findTrip(request: FastifyRequest, reply: FastifyReply, id: string, write: boolean) {
    const user = request.user!;
    const trip = await app.prisma.trip.findFirst({ where: { id, ...(write ? tripWriteScope(user) : tripScope(user)) } });
    if (!trip) reply.code(404).send({ message: 'Viagem não encontrada' });
    return trip;
  }

  // Cenário de viagem segue o acesso à viagem; o independente, a permissão.
  async function findScenario(request: FastifyRequest<IdParams>, reply: FastifyReply, write: boolean) {
    const user = request.user!;
    const scope = write ? tripWriteScope(user) : tripScope(user);
    // ADMIN tem escopo vazio; "trip: {}" numa relação opcional não casa, então
    // ele não passa pelo filtro.
    const where: Prisma.PricingScenarioWhereInput =
      user.role === 'ADMIN' ? { id: request.params.id } : { id: request.params.id, OR: [{ trip_id: null }, { trip: scope }] };
    const s = await app.prisma.pricingScenario.findFirst({ where });
    if (!s) reply.code(404).send({ message: 'Cenário não encontrado' });
    return s;
  }

  async function create(request: FastifyRequest, reply: FastifyReply, tripId: string | null) {
    const input = createSchema.parse(request.body);
    const problem = pricingProblem(input);
    if (problem) return reply.code(400).send({ message: problem });
    const s = await app.prisma.pricingScenario.create({
      data: { ...input, ...outputsOf(input), trip_id: tripId, created_by: request.user!.id },
    });
    await writeAudit(app.prisma, request, { entity_type: 'PricingScenario', entity_id: s.id, action: 'CREATE', new_values: { name: s.name, trip_id: tripId } });
    return reply.code(201).send(present(s));
  }

  app.get('/pricing-scenarios', { preHandler: requirePermission('finance.read') }, async () =>
    (await app.prisma.pricingScenario.findMany({ where: { trip_id: null }, orderBy: { updated_at: 'desc' } })).map(present),
  );
  app.post('/pricing-scenarios', { preHandler: requirePermission('pricing.write') }, (request, reply) => create(request, reply, null));

  app.get<IdParams>('/trips/:id/pricing-scenarios', { preHandler: requirePermission('finance.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply, request.params.id, false);
    if (!trip) return;
    return (await app.prisma.pricingScenario.findMany({ where: { trip_id: trip.id }, orderBy: { created_at: 'asc' } })).map(present);
  });

  app.post<IdParams>('/trips/:id/pricing-scenarios', { preHandler: requirePermission('pricing.write') }, async (request, reply) => {
    const trip = await findTrip(request, reply, request.params.id, true);
    if (!trip) return;
    return create(request, reply, trip.id);
  });

  // Ponto de partida tirado da viagem: despesas lançadas, passageiros e veículos.
  app.get<IdParams>('/trips/:id/pricing-defaults', { preHandler: requirePermission('finance.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply, request.params.id, false);
    if (!trip) return;
    const [expenses, reservations, vehicles] = await Promise.all([
      app.prisma.tripExpense.findMany({ where: { trip_id: trip.id, cancelled_at: null } }),
      app.prisma.reservation.findMany({ where: { trip_id: trip.id }, select: { reservation_status: true, is_courtesy: true } }),
      app.prisma.tripVehicle.findMany({ where: { trip_id: trip.id, status: 'ATIVO' }, select: { operational_capacity: true } }),
    ]);
    const active = reservations.filter((r) => !isEnded(r.reservation_status) && r.reservation_status !== 'LISTA_ESPERA');
    const courtesy = active.filter((r) => r.is_courtesy).length;
    const paying = active.length - courtesy;
    const perPersonTotal = expenses.filter((e) => e.cost_type === 'POR_PESSOA').reduce((n, e) => n + e.planned_amount, 0);
    return {
      paying_passengers: paying > 0 ? paying : Math.max(1, trip.commercial_capacity - courtesy),
      courtesy_passengers: courtesy,
      vehicle_capacity: vehicles.length ? vehicles.reduce((n, v) => n + v.operational_capacity, 0) : null,
      fixed_costs: expenses.filter((e) => e.cost_type === 'FIXO').reduce((n, e) => n + e.planned_amount, 0),
      variable_cost_per_person: active.length ? Math.round(perPersonTotal / active.length) : 0,
      current_price: trip.default_package_price,
    };
  });

  app.patch<IdParams>('/pricing-scenarios/:id', { preHandler: requirePermission('pricing.write') }, async (request, reply) => {
    const changes = updateSchema.parse(request.body);
    const existing = await findScenario(request, reply, true);
    if (!existing) return;
    const input = { ...inputOf(existing), ...changes } as PricingInput;
    const problem = pricingProblem(input);
    if (problem) return reply.code(400).send({ message: problem });
    const s = await app.prisma.pricingScenario.update({
      where: { id: existing.id },
      data: { ...changes, ...outputsOf(input) } as Prisma.PricingScenarioUpdateInput,
    });
    return present(s);
  });

  app.delete<IdParams>('/pricing-scenarios/:id', { preHandler: requirePermission('pricing.write') }, async (request, reply) => {
    const existing = await findScenario(request, reply, true);
    if (!existing) return;
    await app.prisma.pricingScenario.delete({ where: { id: existing.id } });
    await writeAudit(app.prisma, request, { entity_type: 'PricingScenario', entity_id: existing.id, action: 'DELETE', old_values: { name: existing.name } });
    return reply.code(204).send();
  });

  // spec 8.9: resultado + comparação por quantidade de passageiros.
  app.post<IdParams>('/pricing-scenarios/:id/calculate', { preHandler: requirePermission('finance.read') }, async (request, reply) => {
    const { counts } = compareSchema.parse(request.body ?? {});
    const s = await findScenario(request, reply, false);
    if (!s) return;
    const input = inputOf(s);
    return { result: calculatePricing(input), comparison: compareByPassengers(input, counts ?? defaultCounts(s)) };
  });

  // Leva o preço do cenário para o valor padrão do pacote da viagem.
  app.post<IdParams>('/pricing-scenarios/:id/apply', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const s = await findScenario(request, reply, true);
    if (!s) return;
    if (!s.trip_id) return reply.code(400).send({ message: 'Cenário independente não tem viagem' });
    const trip = await app.prisma.trip.findUniqueOrThrow({ where: { id: s.trip_id } });
    if (['CANCELADA', 'ARQUIVADA', 'CONCLUIDA'].includes(trip.status)) return reply.code(409).send({ message: 'Esta viagem não pode mais ser editada' });
    const price = calculatePricing(inputOf(s)).price;
    await app.prisma.$transaction(async (tx) => {
      await tx.trip.update({ where: { id: trip.id }, data: { default_package_price: price } });
      await writeAudit(tx, request, {
        entity_type: 'Trip',
        entity_id: trip.id,
        action: 'UPDATE',
        old_values: { default_package_price: trip.default_package_price },
        new_values: { default_package_price: price },
        reason: `Preço do cenário "${s.name}"`,
      });
    });
    return { default_package_price: price };
  });
}
