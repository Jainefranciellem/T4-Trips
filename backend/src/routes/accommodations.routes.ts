import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  addGuestsSchema,
  addTripAccommodationSchema,
  addTripRoomsSchema,
  assignRoomSchema,
  createAccommodationSchema,
  createRoomSchema,
  updateAccommodationSchema,
  updateRoomSchema,
  updateTripAccommodationSchema,
  updateTripRoomSchema,
} from '../schemas/accommodation.schema.js';
import { diffFields, writeAudit } from '../lib/audit.js';
import { lockTrip } from '../lib/locks.js';
import { checkRoomAssignment, roomCapacity, roomErrorMessage, roomOccupancy } from '../lib/room-rules.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { tripScope, tripWriteScope } from './trips.routes.js';

type IdParams = { Params: { id: string } };
type Tx = Prisma.TransactionClient;

const CLOSED_TRIP_STATUSES = ['CANCELADA', 'ARQUIVADA'];
const compareIds = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

const catalogInclude = { rooms: { orderBy: { identifier: 'asc' } } } satisfies Prisma.AccommodationInclude;

function presentAccommodation(a: Prisma.AccommodationGetPayload<{ include: typeof catalogInclude }>) {
  const rooms = [...a.rooms].sort((x, y) => compareIds(x.identifier, y.identifier));
  return { ...a, rooms, total_capacity: rooms.filter((r) => r.status === 'ATIVO').reduce((n, r) => n + r.capacity, 0) };
}

const tripInclude = {
  accommodation: true,
  rooms: {
    include: {
      accommodation_room: true,
      assignments: {
        where: { removed_at: null },
        include: { reservation: { select: { id: true, passenger_name: true, reservation_status: true } } },
        orderBy: { assigned_at: 'asc' },
      },
    },
  },
} satisfies Prisma.TripAccommodationInclude;

function presentTripAccommodation(ta: Prisma.TripAccommodationGetPayload<{ include: typeof tripInclude }>) {
  const rooms = ta.rooms
    .map(({ assignments, accommodation_room, ...room }) => {
      const capacity = roomCapacity({ ...room, accommodation_room });
      return {
        ...room,
        identifier: accommodation_room.identifier,
        name: accommodation_room.name,
        room_type: accommodation_room.room_type,
        beds: accommodation_room.beds,
        floor: accommodation_room.floor,
        // Quarto desativado no cadastro conta como inativo na viagem também.
        active: room.status === 'ATIVO' && accommodation_room.status === 'ATIVO' && ta.status === 'ATIVO',
        capacity,
        occupancy: roomOccupancy(assignments.length, capacity),
        guests: assignments.map((a) => ({
          reservation_id: a.reservation.id,
          passenger_name: a.reservation.passenger_name,
          reservation_status: a.reservation.reservation_status,
        })),
      };
    })
    .sort((a, b) => compareIds(a.identifier, b.identifier));
  return {
    id: ta.id,
    trip_id: ta.trip_id,
    notes: ta.notes,
    status: ta.status,
    accommodation: ta.accommodation,
    rooms,
    counts: {
      rooms: rooms.length,
      capacity: rooms.filter((r) => r.active).reduce((n, r) => n + r.capacity, 0),
      guests: rooms.reduce((n, r) => n + r.guests.length, 0),
    },
  };
}

export async function accommodationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // ---- Cadastro de pousadas e quartos (RF-010 / RF-011) ----

  app.get('/accommodations', { preHandler: requirePermission('trips.read') }, async () => {
    const list = await app.prisma.accommodation.findMany({ include: catalogInclude, orderBy: [{ status: 'asc' }, { name: 'asc' }] });
    return list.map(presentAccommodation);
  });

  app.post('/accommodations', { preHandler: requirePermission('accommodations.manage') }, async (request, reply) => {
    const input = createAccommodationSchema.parse(request.body);
    const a = await app.prisma.accommodation.create({ data: input, include: catalogInclude });
    await writeAudit(app.prisma, request, { entity_type: 'Accommodation', entity_id: a.id, action: 'CREATE', new_values: { name: a.name } });
    return reply.code(201).send(presentAccommodation(a));
  });

  app.patch<IdParams>('/accommodations/:id', { preHandler: requirePermission('accommodations.manage') }, async (request, reply) => {
    const changes = updateAccommodationSchema.parse(request.body);
    const existing = await app.prisma.accommodation.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.code(404).send({ message: 'Pousada não encontrada' });
    const { old_values, new_values, changed } = diffFields(existing as unknown as Record<string, unknown>, changes as Record<string, unknown>);
    const a = await app.prisma.accommodation.update({ where: { id: existing.id }, data: changes, include: catalogInclude });
    if (changed) await writeAudit(app.prisma, request, { entity_type: 'Accommodation', entity_id: a.id, action: 'UPDATE', old_values, new_values });
    return presentAccommodation(a);
  });

  app.post<IdParams>('/accommodations/:id/rooms', { preHandler: requirePermission('accommodations.manage') }, async (request, reply) => {
    const input = createRoomSchema.parse(request.body);
    const acc = await app.prisma.accommodation.findUnique({ where: { id: request.params.id } });
    if (!acc) return reply.code(404).send({ message: 'Pousada não encontrada' });
    const clash = await app.prisma.accommodationRoom.findUnique({
      where: { accommodation_id_identifier: { accommodation_id: acc.id, identifier: input.identifier } },
    });
    if (clash) return reply.code(409).send({ message: `Já existe o quarto ${input.identifier} nesta pousada` });
    const room = await app.prisma.accommodationRoom.create({ data: { ...input, accommodation_id: acc.id } });
    await writeAudit(app.prisma, request, { entity_type: 'AccommodationRoom', entity_id: room.id, action: 'CREATE', new_values: { identifier: room.identifier, capacity: room.capacity } });
    return reply.code(201).send(room);
  });

  app.patch<IdParams>('/rooms/:id', { preHandler: requirePermission('accommodations.manage') }, async (request, reply) => {
    const changes = updateRoomSchema.parse(request.body);
    const existing = await app.prisma.accommodationRoom.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.code(404).send({ message: 'Quarto não encontrado' });

    if (changes.identifier && changes.identifier !== existing.identifier) {
      const clash = await app.prisma.accommodationRoom.findUnique({
        where: { accommodation_id_identifier: { accommodation_id: existing.accommodation_id, identifier: changes.identifier } },
      });
      if (clash) return reply.code(409).send({ message: `Já existe o quarto ${changes.identifier} nesta pousada` });
    }
    // Não deixa a capacidade do cadastro ficar abaixo de hóspedes já alocados
    // em viagens que usam a capacidade do quarto.
    if (changes.capacity !== undefined && changes.capacity < existing.capacity) {
      const rooms = await app.prisma.tripRoom.findMany({
        where: { accommodation_room_id: existing.id, capacity_override: null },
        include: { _count: { select: { assignments: { where: { removed_at: null } } } } },
      });
      const most = Math.max(0, ...rooms.map((r) => r._count.assignments));
      if (changes.capacity < most) return reply.code(409).send({ message: `Há viagem com ${most} hóspede(s) neste quarto` });
    }

    const { old_values, new_values, changed } = diffFields(existing as unknown as Record<string, unknown>, changes as Record<string, unknown>);
    const room = await app.prisma.accommodationRoom.update({ where: { id: existing.id }, data: changes });
    if (changed) await writeAudit(app.prisma, request, { entity_type: 'AccommodationRoom', entity_id: room.id, action: 'UPDATE', old_values, new_values });
    return room;
  });

  // ---- Pousadas e quartos da viagem (RF-012) ----

  async function findTrip(request: FastifyRequest, reply: FastifyReply, id: string, write: boolean) {
    const user = request.user!;
    const trip = await app.prisma.trip.findFirst({ where: { id, ...(write ? tripWriteScope(user) : tripScope(user)) } });
    if (!trip) reply.code(404).send({ message: 'Viagem não encontrada' });
    return trip;
  }

  const loadTripAccommodations = async (tripId: string) =>
    (
      await app.prisma.tripAccommodation.findMany({ where: { trip_id: tripId }, include: tripInclude, orderBy: { created_at: 'asc' } })
    ).map(presentTripAccommodation);

  app.get<IdParams>('/trips/:id/accommodations', { preHandler: requirePermission('trips.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply, request.params.id, false);
    if (!trip) return;
    return loadTripAccommodations(trip.id);
  });

  app.post<IdParams>('/trips/:id/accommodations', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const input = addTripAccommodationSchema.parse(request.body);
    const trip = await findTrip(request, reply, request.params.id, true);
    if (!trip) return;
    if (CLOSED_TRIP_STATUSES.includes(trip.status)) return reply.code(409).send({ message: 'Viagem encerrada' });

    const acc = await app.prisma.accommodation.findUnique({ where: { id: input.accommodation_id }, include: { rooms: true } });
    if (!acc) return reply.code(404).send({ message: 'Pousada não encontrada' });
    if (acc.status !== 'ATIVO') return reply.code(409).send({ message: 'Pousada desativada' });
    const already = await app.prisma.tripAccommodation.findUnique({ where: { trip_id_accommodation_id: { trip_id: trip.id, accommodation_id: acc.id } } });
    if (already) return reply.code(409).send({ message: 'Esta pousada já está na viagem' });

    const active = acc.rooms.filter((r) => r.status === 'ATIVO');
    const rooms = input.room_ids ? active.filter((r) => input.room_ids!.includes(r.id)) : active;
    if (input.room_ids && rooms.length !== input.room_ids.length) return reply.code(400).send({ message: 'Quarto inválido ou desativado' });

    await app.prisma.$transaction(async (tx) => {
      const ta = await tx.tripAccommodation.create({
        data: { trip_id: trip.id, accommodation_id: acc.id, notes: input.notes ?? null, rooms: { create: rooms.map((r) => ({ accommodation_room_id: r.id })) } },
      });
      await writeAudit(tx, request, { entity_type: 'TripAccommodation', entity_id: ta.id, action: 'CREATE', new_values: { trip_id: trip.id, accommodation_id: acc.id, rooms: rooms.length } });
    });
    return reply.code(201).send(await loadTripAccommodations(trip.id));
  });

  async function findTripAccommodation(request: FastifyRequest<IdParams>, reply: FastifyReply) {
    const ta = await app.prisma.tripAccommodation.findFirst({
      where: { id: request.params.id, trip: tripWriteScope(request.user!) },
      include: { trip: true },
    });
    if (!ta) reply.code(404).send({ message: 'Pousada da viagem não encontrada' });
    return ta;
  }

  const guestsIn = (tx: Tx | typeof app.prisma, where: Prisma.TripRoomWhereInput) =>
    tx.roomAssignment.count({ where: { removed_at: null, trip_room: where } });

  app.patch<IdParams>('/trip-accommodations/:id', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const changes = updateTripAccommodationSchema.parse(request.body);
    const ta = await findTripAccommodation(request, reply);
    if (!ta) return;
    if (changes.status === 'INATIVO' && (await guestsIn(app.prisma, { trip_accommodation_id: ta.id })) > 0) {
      return reply.code(409).send({ message: 'Tire os hóspedes dos quartos antes de desativar a pousada' });
    }
    await app.prisma.tripAccommodation.update({ where: { id: ta.id }, data: changes });
    await writeAudit(app.prisma, request, { entity_type: 'TripAccommodation', entity_id: ta.id, action: 'UPDATE', new_values: changes });
    return loadTripAccommodations(ta.trip_id);
  });

  // Sem histórico de hóspedes pode sair de vez; com histórico, desative.
  app.delete<IdParams>('/trip-accommodations/:id', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const ta = await findTripAccommodation(request, reply);
    if (!ta) return;
    const history = await app.prisma.roomAssignment.count({ where: { trip_room: { trip_accommodation_id: ta.id } } });
    if (history > 0) return reply.code(409).send({ message: 'Esta pousada já teve hóspedes. Desative em vez de remover, para manter o histórico.' });
    await app.prisma.$transaction(async (tx) => {
      await tx.tripAccommodation.delete({ where: { id: ta.id } });
      await writeAudit(tx, request, { entity_type: 'TripAccommodation', entity_id: ta.id, action: 'DELETE' });
    });
    return loadTripAccommodations(ta.trip_id);
  });

  app.post<IdParams>('/trip-accommodations/:id/rooms', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const { room_ids } = addTripRoomsSchema.parse(request.body);
    const ta = await findTripAccommodation(request, reply);
    if (!ta) return;
    const rooms = await app.prisma.accommodationRoom.findMany({ where: { id: { in: room_ids }, accommodation_id: ta.accommodation_id, status: 'ATIVO' } });
    if (rooms.length !== room_ids.length) return reply.code(400).send({ message: 'Quarto inválido ou desativado' });
    await app.prisma.tripRoom.createMany({ data: rooms.map((r) => ({ trip_accommodation_id: ta.id, accommodation_room_id: r.id })), skipDuplicates: true });
    await writeAudit(app.prisma, request, { entity_type: 'TripAccommodation', entity_id: ta.id, action: 'ADD_ROOMS', new_values: { room_ids } });
    return loadTripAccommodations(ta.trip_id);
  });

  app.patch<IdParams>('/trip-rooms/:id', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const changes = updateTripRoomSchema.parse(request.body);
    const room = await app.prisma.tripRoom.findFirst({
      where: { id: request.params.id, trip_accommodation: { trip: tripWriteScope(request.user!) } },
      include: { trip_accommodation: true, accommodation_room: true },
    });
    if (!room) return reply.code(404).send({ message: 'Quarto não encontrado' });

    const guests = await guestsIn(app.prisma, { id: room.id });
    const nextCapacity = changes.capacity_override === undefined ? roomCapacity(room) : (changes.capacity_override ?? room.accommodation_room.capacity);
    if (nextCapacity < guests) return reply.code(409).send({ message: `O quarto já tem ${guests} hóspede(s)` });
    if (changes.status === 'INATIVO' && guests > 0) return reply.code(409).send({ message: 'Tire os hóspedes antes de desativar o quarto' });

    const { old_values, new_values, changed } = diffFields(room as unknown as Record<string, unknown>, changes as Record<string, unknown>);
    await app.prisma.tripRoom.update({ where: { id: room.id }, data: changes });
    if (changed) await writeAudit(app.prisma, request, { entity_type: 'TripRoom', entity_id: room.id, action: 'UPDATE', old_values, new_values });
    return loadTripAccommodations(room.trip_accommodation.trip_id);
  });

  // ---- Distribuição de hóspedes ----

  const roomLabel = (r: { accommodation_room: { identifier: string }; trip_accommodation: { accommodation: { name: string } } }) => ({
    accommodation: r.trip_accommodation.accommodation.name,
    room: r.accommodation_room.identifier,
  });
  const roomDetail = { accommodation_room: true, trip_accommodation: { include: { accommodation: true } } } as const;

  // Coloca uma reserva no quarto dentro da transação. Devolve o erro, se houver.
  async function placeGuest(tx: Tx, request: FastifyRequest, reservationId: string, tripRoomId: string, transfer: boolean) {
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    const room = await tx.tripRoom.findUnique({ where: { id: tripRoomId }, include: roomDetail });
    if (!room) return { status: 404, body: { message: 'Quarto não encontrado' } };

    const current = await tx.roomAssignment.findFirst({ where: { reservation_id: reservationId, removed_at: null }, include: { trip_room: { include: roomDetail } } });
    const guests = await guestsIn(tx, { id: room.id });
    const error = checkRoomAssignment({
      reservation,
      room: {
        trip_id: room.trip_accommodation.trip_id,
        active: room.status === 'ATIVO' && room.accommodation_room.status === 'ATIVO' && room.trip_accommodation.status === 'ATIVO',
        capacity: roomCapacity(room),
        guests,
      },
      currentRoomId: current?.trip_room_id ?? null,
      targetRoomId: room.id,
      transfer,
    });
    if (error) return { status: 409, body: { code: error, message: `${reservation.passenger_name}: ${roomErrorMessage[error]}` } };

    if (current) await tx.roomAssignment.update({ where: { id: current.id }, data: { removed_at: new Date() } });
    await tx.roomAssignment.create({ data: { reservation_id: reservationId, trip_room_id: room.id, assigned_by: request.user!.id } });
    await writeAudit(tx, request, {
      entity_type: 'Reservation',
      entity_id: reservationId,
      action: current ? 'ROOM_CHANGE' : 'ROOM_ASSIGN',
      old_values: current ? roomLabel(current.trip_room) : null,
      new_values: roomLabel(room),
    });
    return null;
  }

  app.post<IdParams>('/reservations/:id/room-assignment', { preHandler: requirePermission('rooms.assign') }, async (request, reply) => {
    const { trip_room_id, transfer } = assignRoomSchema.parse(request.body);
    const reservation = await app.prisma.reservation.findFirst({ where: { id: request.params.id, trip: tripWriteScope(request.user!) } });
    if (!reservation) return reply.code(404).send({ message: 'Reserva não encontrada' });

    const error = await app.prisma.$transaction(async (tx) => {
      await lockTrip(tx, reservation.trip_id);
      return placeGuest(tx, request, reservation.id, trip_room_id, transfer);
    });
    if (error) return reply.code(error.status).send(error.body);
    return loadTripAccommodations(reservation.trip_id);
  });

  // Vários hóspedes de uma vez (lista colada). Tudo ou nada: se um não couber,
  // ninguém é movido.
  app.post<IdParams>('/trip-rooms/:id/guests', { preHandler: requirePermission('rooms.assign') }, async (request, reply) => {
    const { reservation_ids, transfer } = addGuestsSchema.parse(request.body);
    const room = await app.prisma.tripRoom.findFirst({
      where: { id: request.params.id, trip_accommodation: { trip: tripWriteScope(request.user!) } },
      include: { trip_accommodation: true },
    });
    if (!room) return reply.code(404).send({ message: 'Quarto não encontrado' });
    const tripId = room.trip_accommodation.trip_id;
    const found = await app.prisma.reservation.count({ where: { id: { in: reservation_ids }, trip_id: tripId } });
    if (found !== new Set(reservation_ids).size) return reply.code(404).send({ message: 'Reserva não encontrada' });

    try {
      await app.prisma.$transaction(async (tx) => {
        await lockTrip(tx, tripId);
        for (const id of new Set(reservation_ids)) {
          const error = await placeGuest(tx, request, id, room.id, transfer);
          if (error) throw Object.assign(new Error('rollback'), { result: error });
        }
      });
    } catch (err) {
      const result = (err as { result?: { status: number; body: unknown } }).result;
      if (result) return reply.code(result.status).send(result.body);
      throw err;
    }
    return loadTripAccommodations(tripId);
  });

  app.delete<IdParams>('/reservations/:id/room-assignment', { preHandler: requirePermission('rooms.assign') }, async (request, reply) => {
    const reservation = await app.prisma.reservation.findFirst({ where: { id: request.params.id, trip: tripWriteScope(request.user!) } });
    if (!reservation) return reply.code(404).send({ message: 'Reserva não encontrada' });
    const current = await app.prisma.roomAssignment.findFirst({
      where: { reservation_id: reservation.id, removed_at: null },
      include: { trip_room: { include: roomDetail } },
    });
    if (!current) return reply.code(409).send({ message: 'O hóspede não está em nenhum quarto' });

    await app.prisma.$transaction(async (tx) => {
      await tx.roomAssignment.update({ where: { id: current.id }, data: { removed_at: new Date() } });
      await writeAudit(tx, request, { entity_type: 'Reservation', entity_id: reservation.id, action: 'ROOM_UNASSIGN', old_values: roomLabel(current.trip_room) });
    });
    return loadTripAccommodations(reservation.trip_id);
  });
}
