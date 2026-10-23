import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ItineraryItem } from '@prisma/client';
import { z } from 'zod';
import { diffFields, writeAudit } from '../lib/audit.js';
import { dateISO } from '../lib/finance-rules.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { tripScope, tripWriteScope } from './trips.routes.js';

type IdParams = { Params: { id: string } };

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

const fields = {
  itinerary_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  start_time: time,
  end_time: time,
  location: optionalText,
  activity: z.string().trim().min(2, 'Descreva a atividade'),
  meeting_point: optionalText,
  included_services: optionalText,
  public_instructions: optionalText,
  internal_notes: optionalText,
  is_public: z.boolean().default(true),
};
const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, is_public: z.boolean() }).partial();
const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

// Datas da viagem no fuso de São Paulo (saída às 23h ainda é aquele dia).
const tripDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

export function presentItem(item: ItineraryItem, opts: { internal: boolean }) {
  return { ...item, itinerary_date: dateISO(item.itinerary_date), internal_notes: opts.internal ? item.internal_notes : null };
}

const order = [{ itinerary_date: 'asc' as const }, { start_time: { sort: 'asc' as const, nulls: 'first' as const } }, { sort_order: 'asc' as const }];

export async function itineraryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  async function findTrip(request: FastifyRequest, reply: FastifyReply, id: string, write: boolean) {
    const user = request.user!;
    const trip = await app.prisma.trip.findFirst({ where: { id, ...(write ? tripWriteScope(user) : tripScope(user)) } });
    if (!trip) reply.code(404).send({ message: 'Viagem não encontrada' });
    return trip;
  }

  // Item fora do período da viagem provavelmente é erro de digitação.
  function outsideTrip(trip: { departure_at: Date; return_at: Date }, date: string) {
    return date < tripDay(trip.departure_at) || date > tripDay(trip.return_at);
  }
  const timesProblem = (start?: string | null, end?: string | null) => (start && end && end < start ? 'O horário final é antes do inicial' : null);

  const list = async (tripId: string, internal: boolean) =>
    (await app.prisma.itineraryItem.findMany({ where: { trip_id: tripId }, orderBy: order })).map((i) => presentItem(i, { internal }));

  const internalFor = (request: FastifyRequest) => request.user!.role !== 'VISUALIZADOR';

  app.get<IdParams>('/trips/:id/itinerary', { preHandler: requirePermission('trips.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply, request.params.id, false);
    if (!trip) return;
    return list(trip.id, internalFor(request));
  });

  app.post<IdParams>('/trips/:id/itinerary', { preHandler: requirePermission('itinerary.write') }, async (request, reply) => {
    const input = createSchema.parse(request.body);
    const trip = await findTrip(request, reply, request.params.id, true);
    if (!trip) return;
    if (outsideTrip(trip, input.itinerary_date)) return reply.code(400).send({ message: 'A data fica fora do período da viagem' });
    const problem = timesProblem(input.start_time, input.end_time);
    if (problem) return reply.code(400).send({ message: problem });

    const last = await app.prisma.itineraryItem.aggregate({ where: { trip_id: trip.id, itinerary_date: new Date(input.itinerary_date) }, _max: { sort_order: true } });
    const item = await app.prisma.itineraryItem.create({
      data: { ...input, itinerary_date: new Date(input.itinerary_date), sort_order: (last._max.sort_order ?? -1) + 1, trip_id: trip.id },
    });
    await writeAudit(app.prisma, request, { entity_type: 'ItineraryItem', entity_id: item.id, action: 'CREATE', new_values: { trip_id: trip.id, activity: item.activity } });
    return reply.code(201).send(await list(trip.id, true));
  });

  async function findItem(request: FastifyRequest<IdParams>, reply: FastifyReply) {
    const item = await app.prisma.itineraryItem.findFirst({ where: { id: request.params.id, trip: tripWriteScope(request.user!) }, include: { trip: true } });
    if (!item) reply.code(404).send({ message: 'Item do roteiro não encontrado' });
    return item;
  }

  app.patch<IdParams>('/itinerary-items/:id', { preHandler: requirePermission('itinerary.write') }, async (request, reply) => {
    const changes = updateSchema.parse(request.body);
    const item = await findItem(request, reply);
    if (!item) return;
    if (changes.itinerary_date && outsideTrip(item.trip, changes.itinerary_date)) return reply.code(400).send({ message: 'A data fica fora do período da viagem' });
    const problem = timesProblem(changes.start_time === undefined ? item.start_time : changes.start_time, changes.end_time === undefined ? item.end_time : changes.end_time);
    if (problem) return reply.code(400).send({ message: problem });

    const data = { ...changes, ...(changes.itinerary_date ? { itinerary_date: new Date(changes.itinerary_date) } : {}) };
    const { trip: _t, ...plain } = item;
    const { old_values, new_values, changed } = diffFields(plain as unknown as Record<string, unknown>, data as Record<string, unknown>);
    await app.prisma.itineraryItem.update({ where: { id: item.id }, data });
    if (changed) await writeAudit(app.prisma, request, { entity_type: 'ItineraryItem', entity_id: item.id, action: 'UPDATE', old_values, new_values });
    return list(item.trip_id, true);
  });

  app.delete<IdParams>('/itinerary-items/:id', { preHandler: requirePermission('itinerary.write') }, async (request, reply) => {
    const item = await findItem(request, reply);
    if (!item) return;
    await app.prisma.$transaction(async (tx) => {
      await tx.itineraryItem.delete({ where: { id: item.id } });
      await writeAudit(tx, request, { entity_type: 'ItineraryItem', entity_id: item.id, action: 'DELETE', old_values: { activity: item.activity, date: dateISO(item.itinerary_date) } });
    });
    return list(item.trip_id, true);
  });

  // Nova ordem dos itens de um mesmo dia (subir/descer na tela).
  app.post<IdParams>('/trips/:id/itinerary/reorder', { preHandler: requirePermission('itinerary.write') }, async (request, reply) => {
    const { ids } = reorderSchema.parse(request.body);
    const trip = await findTrip(request, reply, request.params.id, true);
    if (!trip) return;
    const found = await app.prisma.itineraryItem.count({ where: { id: { in: ids }, trip_id: trip.id } });
    if (found !== ids.length) return reply.code(404).send({ message: 'Item do roteiro não encontrado' });
    await app.prisma.$transaction(ids.map((id, i) => app.prisma.itineraryItem.update({ where: { id }, data: { sort_order: i } })));
    return list(trip.id, true);
  });
}
