import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, Trip } from '@prisma/client';
import {
  createTripSchema,
  listTripsQuery,
  reasonSchema,
  setTripUsersSchema,
  updateTripSchema,
} from '../schemas/trip.schema.js';
import { hasPermission } from '../lib/permissions.js';
import { diffFields, writeAudit } from '../lib/audit.js';
import {
  canArchiveTrip,
  canCancelTrip,
  canEditTrip,
  tripGroup,
} from '../lib/trip-rules.js';
import { computeTripSummary, isConfirmed, type ReservationLike } from '../lib/reservation-rules.js';
import { requireAuth, requirePermission, type AuthUser } from '../middleware/auth.js';

type IdParams = { Params: { id: string } };

// ADMIN enxerga todas as viagens; os demais só as que foram autorizados.
export function tripScope(user: AuthUser): Prisma.TripWhereInput {
  return user.role === 'ADMIN' ? {} : { users: { some: { user_id: user.id } } };
}

// Pra alterar dados da viagem (reservas etc.) o acesso precisa ser "Operar".
export function tripWriteScope(user: AuthUser): Prisma.TripWhereInput {
  return user.role === 'ADMIN' ? {} : { users: { some: { user_id: user.id, access_level: 'OPERAR' } } };
}

// Só o necessário pra calcular vagas e receita prevista no resumo.
export const summaryFields = { reservation_status: true, hold_expires_at: true, final_price: true } as const;

function presentTrip(trip: Trip, user: AuthUser, reservations: ReservationLike[]) {
  const includeFinance = hasPermission(user, 'finance.read');
  return {
    ...trip,
    group: tripGroup(trip.status),
    summary: computeTripSummary(trip, reservations, includeFinance),
    // Observações internas não vão pra quem só visualiza.
    ...(user.role === 'VISUALIZADOR' ? { internal_notes: null } : {}),
  };
}

export async function tripsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // Viagem fora do escopo do usuário responde 404 (não 403) pra não revelar
  // que o ID existe — spec 10.1, proteção contra enumeração.
  const reservationsOf = (tripId: string) =>
    app.prisma.reservation.findMany({ where: { trip_id: tripId }, select: summaryFields });

  async function findTrip(request: FastifyRequest<IdParams>, reply: FastifyReply) {
    const trip = await app.prisma.trip.findFirst({
      where: { id: request.params.id, ...tripScope(request.user!) },
    });
    if (!trip) {
      reply.code(404).send({ message: 'Viagem não encontrada' });
      return null;
    }
    return trip;
  }

  app.get('/trips', { preHandler: requirePermission('trips.read') }, async (request) => {
    const { q, status, from, to } = listTripsQuery.parse(request.query);
    const where: Prisma.TripWhereInput = { ...tripScope(request.user!) };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { destination: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (from || to) {
      where.departure_at = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const trips = await app.prisma.trip.findMany({
      where,
      orderBy: { departure_at: 'asc' },
      include: { reservations: { select: summaryFields } },
    });
    return trips.map(({ reservations, ...t }) => presentTrip(t, request.user!, reservations));
  });

  app.post('/trips', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const input = createTripSchema.parse(request.body);
    const trip = await app.prisma.trip.create({
      data: { ...input, created_by: request.user!.id },
    });
    await writeAudit(app.prisma, request, {
      entity_type: 'Trip',
      entity_id: trip.id,
      action: 'CREATE',
      new_values: { name: trip.name, destination: trip.destination },
    });
    return reply.code(201).send(presentTrip(trip, request.user!, []));
  });

  app.get<IdParams>('/trips/:id', { preHandler: requirePermission('trips.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply);
    if (!trip) return;
    return presentTrip(trip, request.user!, await reservationsOf(trip.id));
  });

  app.patch<IdParams>('/trips/:id', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const changes = updateTripSchema.parse(request.body);
    const existing = await findTrip(request, reply);
    if (!existing) return;

    if (!canEditTrip(existing.status, request.user!.role)) {
      return reply.code(409).send({ message: 'Esta viagem não pode mais ser editada' });
    }

    // O refine do schema só compara datas enviadas juntas; aqui cobre o caso
    // de editar só uma delas contra a que já está salva.
    const departure = changes.departure_at ?? existing.departure_at;
    const returning = changes.return_at ?? existing.return_at;
    if (returning <= departure) {
      return reply.code(400).send({
        message: 'Dados inválidos',
        issues: [{ path: 'return_at', message: 'O retorno deve ser posterior à saída' }],
      });
    }

    // RN-002: não dá pra baixar a capacidade abaixo das reservas confirmadas.
    const reservations = await reservationsOf(existing.id);
    if (changes.commercial_capacity !== undefined) {
      const confirmed = reservations.filter((r) => isConfirmed(r.reservation_status)).length;
      if (changes.commercial_capacity < confirmed) {
        return reply.code(409).send({
          message: `A viagem já tem ${confirmed} reserva(s) confirmada(s); a capacidade não pode ficar abaixo disso`,
        });
      }
    }

    const { old_values, new_values, changed } = diffFields(
      existing as unknown as Record<string, unknown>,
      changes as Record<string, unknown>,
    );
    const trip = await app.prisma.trip.update({ where: { id: existing.id }, data: changes });
    if (changed) {
      await writeAudit(app.prisma, request, {
        entity_type: 'Trip',
        entity_id: trip.id,
        action: 'UPDATE',
        old_values,
        new_values,
      });
    }
    return presentTrip(trip, request.user!, reservations);
  });

  // Duplica só a viagem (configuração e textos) — sem passageiros, reservas ou
  // financeiro. Nasce PLANEJADA pra o usuário ajustar datas antes de abrir.
  app.post<IdParams>('/trips/:id/duplicate', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const source = await findTrip(request, reply);
    if (!source) return;

    const {
      id: _id,
      created_at: _c,
      updated_at: _u,
      archived_at: _a,
      cancelled_at: _x,
      previous_status: _p,
      ...copy
    } = source;
    const trip = await app.prisma.trip.create({
      data: { ...copy, name: `${source.name} (cópia)`, status: 'PLANEJADA', created_by: request.user!.id },
    });
    await writeAudit(app.prisma, request, {
      entity_type: 'Trip',
      entity_id: trip.id,
      action: 'DUPLICATE',
      new_values: { source_trip_id: source.id },
    });
    return reply.code(201).send(presentTrip(trip, request.user!, []));
  });

  app.post<IdParams>('/trips/:id/cancel', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const { reason } = reasonSchema.parse(request.body ?? {});
    if (!reason) {
      return reply.code(400).send({
        message: 'Dados inválidos',
        issues: [{ path: 'reason', message: 'Informe o motivo do cancelamento' }],
      });
    }
    const existing = await findTrip(request, reply);
    if (!existing) return;
    if (!canCancelTrip(existing.status)) {
      return reply.code(409).send({ message: 'Esta viagem não pode ser cancelada' });
    }

    // Cancela junto as reservas ativas (RN-007), na mesma transação. Pagamentos
    // ficam no histórico; reembolsos são lançados à parte.
    const trip = await app.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.trip.update({
        where: { id: existing.id },
        data: { status: 'CANCELADA', cancelled_at: now },
      });
      const { count } = await tx.reservation.updateMany({
        where: { trip_id: existing.id, reservation_status: { notIn: ['CANCELADA', 'REEMBOLSADA'] } },
        data: { reservation_status: 'CANCELADA', cancelled_at: now, cancel_reason: `Viagem cancelada: ${reason}` },
      });
      await writeAudit(tx, request, {
        entity_type: 'Trip',
        entity_id: updated.id,
        action: 'CANCEL',
        old_values: { status: existing.status },
        new_values: { status: updated.status, reservations_cancelled: count },
        reason,
      });
      return updated;
    });
    return presentTrip(trip, request.user!, await reservationsOf(trip.id));
  });

  app.post<IdParams>('/trips/:id/archive', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const existing = await findTrip(request, reply);
    if (!existing) return;
    if (!canArchiveTrip(existing.status)) {
      return reply.code(409).send({ message: 'Esta viagem já está arquivada' });
    }

    const trip = await app.prisma.trip.update({
      where: { id: existing.id },
      data: { status: 'ARQUIVADA', previous_status: existing.status, archived_at: new Date() },
    });
    await writeAudit(app.prisma, request, {
      entity_type: 'Trip',
      entity_id: trip.id,
      action: 'ARCHIVE',
      old_values: { status: existing.status },
      new_values: { status: trip.status },
    });
    return presentTrip(trip, request.user!, await reservationsOf(trip.id));
  });

  app.post<IdParams>('/trips/:id/restore', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const existing = await findTrip(request, reply);
    if (!existing) return;
    if (existing.status !== 'ARQUIVADA') {
      return reply.code(409).send({ message: 'Só viagens arquivadas podem ser restauradas' });
    }

    const trip = await app.prisma.trip.update({
      where: { id: existing.id },
      data: { status: existing.previous_status ?? 'PLANEJADA', previous_status: null, archived_at: null },
    });
    await writeAudit(app.prisma, request, {
      entity_type: 'Trip',
      entity_id: trip.id,
      action: 'RESTORE',
      old_values: { status: existing.status },
      new_values: { status: trip.status },
    });
    return presentTrip(trip, request.user!, await reservationsOf(trip.id));
  });

  app.get<IdParams>('/trips/:id/dashboard', { preHandler: requirePermission('trips.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply);
    if (!trip) return;
    const presented = presentTrip(trip, request.user!, await reservationsOf(trip.id));
    return { trip: presented, summary: presented.summary };
  });

  // Quem pode acessar a viagem. Só ADMIN (trips.manage_access).
  app.get<IdParams>('/trips/:id/users', { preHandler: requirePermission('trips.manage_access') }, async (request, reply) => {
    const trip = await findTrip(request, reply);
    if (!trip) return;
    return app.prisma.tripUser.findMany({
      where: { trip_id: trip.id },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
  });

  app.put<IdParams>('/trips/:id/users', { preHandler: requirePermission('trips.manage_access') }, async (request, reply) => {
    const { users } = setTripUsersSchema.parse(request.body);
    const trip = await findTrip(request, reply);
    if (!trip) return;

    const before = await app.prisma.tripUser.findMany({ where: { trip_id: trip.id } });
    await app.prisma.$transaction(async (tx) => {
      await tx.tripUser.deleteMany({ where: { trip_id: trip.id } });
      if (users.length > 0) {
        await tx.tripUser.createMany({
          data: users.map((u) => ({ trip_id: trip.id, user_id: u.user_id, access_level: u.access_level })),
          skipDuplicates: true,
        });
      }
      await writeAudit(tx, request, {
        entity_type: 'Trip',
        entity_id: trip.id,
        action: 'UPDATE_ACCESS',
        old_values: before.map((b) => ({ user_id: b.user_id, access_level: b.access_level })),
        new_values: users,
      });
    });
    return reply.code(204).send();
  });
}
