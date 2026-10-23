import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  addTripVehicleSchema,
  assignSeatSchema,
  blockSeatSchema,
  updateTripVehicleSchema,
  type LayoutData,
} from '../schemas/vehicle.schema.js';
import { diffFields, writeAudit } from '../lib/audit.js';
import { lockTrip } from '../lib/locks.js';
import {
  assignErrorMessage,
  checkSeatAssignment,
  compareSeatNumbers,
  layoutCapacity,
  seatDisplayStatus,
  seatsFromLayout,
} from '../lib/seat-rules.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { tripScope, tripWriteScope } from './trips.routes.js';

type IdParams = { Params: { id: string } };

const CLOSED_TRIP_STATUSES = ['CANCELADA', 'ARQUIVADA'];

const vehicleInclude = {
  vehicle_template: { select: { id: true, name: true, category: true } },
  seat_layout: { select: { id: true, name: true, layout_data: true } },
  seats: {
    include: {
      assignments: {
        where: { removed_at: null },
        include: { reservation: { select: { id: true, passenger_name: true, reservation_status: true } } },
      },
    },
  },
} satisfies Prisma.TripVehicleInclude;

type VehicleWithSeats = Prisma.TripVehicleGetPayload<{ include: typeof vehicleInclude }>;

function presentVehicle(v: VehicleWithSeats) {
  const layout = v.seat_layout.layout_data as unknown as LayoutData;
  const seats = v.seats
    .map(({ assignments, ...seat }) => {
      const occupant = assignments[0]?.reservation ?? null;
      return {
        ...seat,
        display_status: seatDisplayStatus(seat, occupant),
        occupant: occupant && { reservation_id: occupant.id, passenger_name: occupant.passenger_name, reservation_status: occupant.reservation_status },
      };
    })
    .sort((a, b) => compareSeatNumbers(a.seat_number, b.seat_number));
  const { seat_layout, seats: _s, ...rest } = v;
  return {
    ...rest,
    layout_name: seat_layout.name,
    floors: layout.floors,
    seats,
    counts: {
      total: seats.length,
      occupied: seats.filter((s) => s.occupant).length,
      blocked: seats.filter((s) => s.status === 'BLOQUEADO').length,
      free: seats.filter((s) => s.display_status === 'LIVRE').length,
    },
  };
}

export async function transportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  async function findTrip(request: FastifyRequest, reply: FastifyReply, id: string, write: boolean) {
    const user = request.user!;
    const trip = await app.prisma.trip.findFirst({ where: { id, ...(write ? tripWriteScope(user) : tripScope(user)) } });
    if (!trip) reply.code(404).send({ message: 'Viagem não encontrada' });
    return trip;
  }

  const loadVehicles = async (tripId: string) =>
    (
      await app.prisma.tripVehicle.findMany({
        where: { trip_id: tripId },
        include: vehicleInclude,
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      })
    ).map(presentVehicle);

  app.get<IdParams>('/trips/:id/vehicles', { preHandler: requirePermission('trips.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply, request.params.id, false);
    if (!trip) return;
    return loadVehicles(trip.id);
  });

  app.post<IdParams>('/trips/:id/vehicles', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const input = addTripVehicleSchema.parse(request.body);
    const trip = await findTrip(request, reply, request.params.id, true);
    if (!trip) return;
    if (CLOSED_TRIP_STATUSES.includes(trip.status)) return reply.code(409).send({ message: 'Viagem encerrada' });

    const layout = await app.prisma.seatLayout.findUnique({
      where: { id: input.seat_layout_id },
      include: { vehicle_template: true },
    });
    if (!layout) return reply.code(404).send({ message: 'Layout não encontrado' });
    if (layout.vehicle_template.status !== 'ATIVO') return reply.code(409).send({ message: 'Este veículo está desativado' });

    const data = layout.layout_data as unknown as LayoutData;
    const capacity = layoutCapacity(data);
    const operational = input.operational_capacity ?? capacity;
    if (operational > capacity) {
      return reply.code(400).send({ message: `A capacidade operacional não pode passar de ${capacity} (assentos livres do layout)` });
    }

    const vehicle = await app.prisma.$transaction(async (tx) => {
      const count = await tx.tripVehicle.count({ where: { trip_id: trip.id } });
      const v = await tx.tripVehicle.create({
        data: {
          trip_id: trip.id,
          vehicle_template_id: layout.vehicle_template_id,
          seat_layout_id: layout.id,
          layout_version: layout.version,
          operational_name: input.operational_name,
          identifier: input.identifier ?? null,
          driver_name: input.driver_name ?? null,
          operational_capacity: operational,
          notes: input.notes ?? null,
          sort_order: count,
          seats: { create: seatsFromLayout(data) },
        },
      });
      await writeAudit(tx, request, {
        entity_type: 'TripVehicle',
        entity_id: v.id,
        action: 'CREATE',
        new_values: { trip_id: trip.id, seat_layout_id: layout.id, operational_capacity: operational },
      });
      return v;
    });
    const full = await app.prisma.tripVehicle.findUniqueOrThrow({ where: { id: vehicle.id }, include: vehicleInclude });
    return reply.code(201).send(presentVehicle(full));
  });

  async function findTripVehicle(request: FastifyRequest<IdParams>, reply: FastifyReply) {
    const v = await app.prisma.tripVehicle.findFirst({
      where: { id: request.params.id, trip: tripWriteScope(request.user!) },
      include: { trip: true },
    });
    if (!v) reply.code(404).send({ message: 'Veículo não encontrado' });
    return v;
  }

  app.patch<IdParams>('/trip-vehicles/:id', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const changes = updateTripVehicleSchema.parse(request.body);
    const existing = await findTripVehicle(request, reply);
    if (!existing) return;

    const seated = await app.prisma.seatAssignment.count({ where: { removed_at: null, trip_seat: { trip_vehicle_id: existing.id } } });
    if (changes.operational_capacity !== undefined) {
      const usable = await app.prisma.tripSeat.count({ where: { trip_vehicle_id: existing.id, status: 'LIVRE' } });
      if (changes.operational_capacity < seated) {
        return reply.code(409).send({ message: `Já há ${seated} passageiro(s) sentados neste veículo` });
      }
      if (changes.operational_capacity > usable + seated) {
        return reply.code(400).send({ message: 'A capacidade operacional passa do número de assentos disponíveis' });
      }
    }
    if (changes.status === 'INATIVO' && seated > 0) {
      return reply.code(409).send({ message: 'Tire os passageiros dos assentos antes de desativar o veículo' });
    }

    const { old_values, new_values, changed } = diffFields(existing as unknown as Record<string, unknown>, changes as Record<string, unknown>);
    await app.prisma.tripVehicle.update({ where: { id: existing.id }, data: changes });
    if (changed) {
      await writeAudit(app.prisma, request, { entity_type: 'TripVehicle', entity_id: existing.id, action: 'UPDATE', old_values, new_values });
    }
    const full = await app.prisma.tripVehicle.findUniqueOrThrow({ where: { id: existing.id }, include: vehicleInclude });
    return presentVehicle(full);
  });

  // Só sai de vez quem nunca teve passageiro; com histórico, desative.
  app.delete<IdParams>('/trip-vehicles/:id', { preHandler: requirePermission('trips.write') }, async (request, reply) => {
    const existing = await findTripVehicle(request, reply);
    if (!existing) return;
    const history = await app.prisma.seatAssignment.count({ where: { trip_seat: { trip_vehicle_id: existing.id } } });
    if (history > 0) {
      return reply.code(409).send({ message: 'Este veículo já teve passageiros. Desative em vez de remover, para manter o histórico.' });
    }
    await app.prisma.$transaction(async (tx) => {
      await tx.tripVehicle.delete({ where: { id: existing.id } });
      await writeAudit(tx, request, { entity_type: 'TripVehicle', entity_id: existing.id, action: 'DELETE', old_values: { operational_name: existing.operational_name } });
    });
    return reply.code(204).send();
  });

  // RF-009 / RN-003 / RN-004. Também cobre transferência entre veículos: o
  // destino pode ser assento de qualquer veículo da mesma viagem.
  app.post<IdParams>('/reservations/:id/seat-assignment', { preHandler: requirePermission('seats.assign') }, async (request, reply) => {
    const { trip_seat_id, swap } = assignSeatSchema.parse(request.body);
    const user = request.user!;
    const reservation = await app.prisma.reservation.findFirst({
      where: { id: request.params.id, trip: tripWriteScope(user) },
    });
    if (!reservation) return reply.code(404).send({ message: 'Reserva não encontrada' });

    const result = await app.prisma.$transaction(async (tx) => {
      await lockTrip(tx, reservation.trip_id);
      const seat = await tx.tripSeat.findUnique({ where: { id: trip_seat_id }, include: { trip_vehicle: true } });
      if (!seat || seat.trip_vehicle.trip_id !== reservation.trip_id) return { status: 404, body: { message: 'Assento não encontrado' } };

      const fresh = await tx.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
      const current = await tx.seatAssignment.findFirst({
        where: { reservation_id: reservation.id, removed_at: null },
        include: { trip_seat: { include: { trip_vehicle: true } } },
      });
      const occupant = await tx.seatAssignment.findFirst({ where: { trip_seat_id: seat.id, removed_at: null } });
      const vehicleOccupied = await tx.seatAssignment.count({
        where: { removed_at: null, trip_seat: { trip_vehicle_id: seat.trip_vehicle_id }, reservation_id: { not: reservation.id } },
      });

      const error = checkSeatAssignment({
        reservation: fresh,
        seat: { status: seat.status, trip_id: seat.trip_vehicle.trip_id, vehicle_active: seat.trip_vehicle.status === 'ATIVO' },
        occupiedBy: occupant?.reservation_id ?? null,
        reservationId: reservation.id,
        swap,
        vehicleOccupied,
        vehicleCapacity: seat.trip_vehicle.operational_capacity,
        movingWithinVehicle: current?.trip_seat.trip_vehicle_id === seat.trip_vehicle_id,
      });
      if (error) return { status: 409, body: { code: error, message: assignErrorMessage[error] } };

      // Troca exige que os dois tenham assento: senão um ficaria sem lugar.
      if (occupant && !current) {
        return { status: 409, body: { code: 'SWAP_NEEDS_SEAT', message: 'Para trocar, o passageiro precisa já ter um assento' } };
      }

      const now = new Date();
      const ended = [current?.id, occupant?.id].filter(Boolean) as string[];
      if (ended.length) await tx.seatAssignment.updateMany({ where: { id: { in: ended } }, data: { removed_at: now } });
      await tx.seatAssignment.create({ data: { reservation_id: reservation.id, trip_seat_id: seat.id, assigned_by: user.id } });
      if (occupant && current) {
        await tx.seatAssignment.create({ data: { reservation_id: occupant.reservation_id, trip_seat_id: current.trip_seat_id, assigned_by: user.id } });
      }

      const where = (s: { seat_number: string; trip_vehicle: { operational_name: string } }) => ({
        vehicle: s.trip_vehicle.operational_name,
        seat: s.seat_number,
      });
      await writeAudit(tx, request, {
        entity_type: 'Reservation',
        entity_id: reservation.id,
        action: current ? 'SEAT_CHANGE' : 'SEAT_ASSIGN',
        old_values: current ? where(current.trip_seat) : null,
        new_values: where(seat),
      });
      if (occupant && current) {
        await writeAudit(tx, request, {
          entity_type: 'Reservation',
          entity_id: occupant.reservation_id,
          action: 'SEAT_CHANGE',
          old_values: where(seat),
          new_values: where(current.trip_seat),
          reason: 'Troca de assento',
        });
      }
      return { status: 200, body: null };
    });

    if (result.status !== 200) return reply.code(result.status).send(result.body);
    return loadVehicles(reservation.trip_id);
  });

  app.delete<IdParams>('/reservations/:id/seat-assignment', { preHandler: requirePermission('seats.assign') }, async (request, reply) => {
    const reservation = await app.prisma.reservation.findFirst({
      where: { id: request.params.id, trip: tripWriteScope(request.user!) },
    });
    if (!reservation) return reply.code(404).send({ message: 'Reserva não encontrada' });

    const current = await app.prisma.seatAssignment.findFirst({
      where: { reservation_id: reservation.id, removed_at: null },
      include: { trip_seat: { include: { trip_vehicle: true } } },
    });
    if (!current) return reply.code(409).send({ message: 'O passageiro não tem assento' });

    await app.prisma.$transaction(async (tx) => {
      await tx.seatAssignment.update({ where: { id: current.id }, data: { removed_at: new Date() } });
      await writeAudit(tx, request, {
        entity_type: 'Reservation',
        entity_id: reservation.id,
        action: 'SEAT_UNASSIGN',
        old_values: { vehicle: current.trip_seat.trip_vehicle.operational_name, seat: current.trip_seat.seat_number },
      });
    });
    return loadVehicles(reservation.trip_id);
  });

  async function setBlocked(request: FastifyRequest<IdParams>, reply: FastifyReply, block: boolean) {
    const reason = block ? blockSeatSchema.parse(request.body ?? {}).reason : null;
    const seat = await app.prisma.tripSeat.findFirst({
      where: { id: request.params.id, trip_vehicle: { trip: tripWriteScope(request.user!) } },
      include: { trip_vehicle: true, assignments: { where: { removed_at: null } } },
    });
    if (!seat) return reply.code(404).send({ message: 'Assento não encontrado' });
    if (block && seat.assignments.length > 0) return reply.code(409).send({ message: 'Tire o passageiro antes de bloquear o assento' });
    if (block === (seat.status === 'BLOQUEADO')) {
      return reply.code(409).send({ message: block ? 'O assento já está bloqueado' : 'O assento não está bloqueado' });
    }

    await app.prisma.$transaction(async (tx) => {
      await tx.tripSeat.update({
        where: { id: seat.id },
        data: { status: block ? 'BLOQUEADO' : 'LIVRE', blocked_reason: reason },
      });
      await writeAudit(tx, request, {
        entity_type: 'TripSeat',
        entity_id: seat.id,
        action: block ? 'SEAT_BLOCK' : 'SEAT_UNBLOCK',
        new_values: { vehicle: seat.trip_vehicle.operational_name, seat: seat.seat_number },
        reason,
      });
    });
    return loadVehicles(seat.trip_vehicle.trip_id);
  }

  app.post<IdParams>('/trip-seats/:id/block', { preHandler: requirePermission('seats.assign') }, (request, reply) => setBlocked(request, reply, true));
  app.post<IdParams>('/trip-seats/:id/unblock', { preHandler: requirePermission('seats.assign') }, (request, reply) => setBlocked(request, reply, false));
}
