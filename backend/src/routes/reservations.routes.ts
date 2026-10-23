import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Customer, Prisma, Reservation, Trip } from '@prisma/client';
import {
  cancelReservationSchema,
  createReservationSchema,
  listReservationsQuery,
  regenerateLinkSchema,
  updateReservationSchema,
} from '../schemas/reservation.schema.js';
import { env } from '../env.js';
import { hasPermission } from '../lib/permissions.js';
import { diffFields, writeAudit } from '../lib/audit.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import {
  ACTIVE_STATUSES,
  checkCapacity,
  computeFinalPrice,
  isEnded,
  isExpiredHold,
} from '../lib/reservation-rules.js';
import { lockTrip } from '../lib/locks.js';
import { requireAuth, requirePermission, type AuthUser } from '../middleware/auth.js';
import { presentCustomer } from './customers.routes.js';
import { tripScope, tripWriteScope } from './trips.routes.js';

type IdParams = { Params: { id: string } };
type Tx = Prisma.TransactionClient;

const CLOSED_TRIP_STATUSES = ['CANCELADA', 'ARQUIVADA', 'CONCLUIDA'];

const publicUrl = (token: string) => `${env.APP_URL}/p/${token}`;

// Valores contratados aparecem pra quem lança reservas ou vê o financeiro;
// o Visualizador não vê (spec 3.4).
const canSeePrices = (user: AuthUser) =>
  hasPermission(user, 'reservations.write') || hasPermission(user, 'finance.read');

function linkState(r: Reservation, now = new Date()) {
  if (!r.public_token_hash) return 'SEM_LINK' as const;
  // Reserva cancelada não abre a página, mesmo com o token intacto.
  if (isEnded(r.reservation_status)) return 'INATIVO' as const;
  if (r.public_token_revoked_at) return 'REVOGADO' as const;
  if (r.public_token_expires_at && r.public_token_expires_at <= now) return 'EXPIRADO' as const;
  return 'ATIVO' as const;
}

// Assento ativo da reserva, pra listas e página pública.
export const activeSeatInclude = {
  where: { removed_at: null },
  include: { trip_seat: { include: { trip_vehicle: { select: { id: true, operational_name: true, identifier: true } } } } },
} satisfies Prisma.Reservation$seat_assignmentsArgs;

type SeatAssignmentWithSeat = Prisma.SeatAssignmentGetPayload<{ include: typeof activeSeatInclude.include }>;

const presentSeat = (a: SeatAssignmentWithSeat | undefined) =>
  a
    ? {
        trip_seat_id: a.trip_seat_id,
        seat_number: a.trip_seat.seat_number,
        floor: a.trip_seat.floor,
        trip_vehicle_id: a.trip_seat.trip_vehicle.id,
        vehicle_name: a.trip_seat.trip_vehicle.operational_name,
      }
    : null;

// Quarto ativo da reserva.
export const activeRoomInclude = {
  where: { removed_at: null },
  include: {
    trip_room: { include: { accommodation_room: true, trip_accommodation: { include: { accommodation: true } } } },
  },
} satisfies Prisma.Reservation$room_assignmentsArgs;

type RoomAssignmentWithRoom = Prisma.RoomAssignmentGetPayload<{ include: typeof activeRoomInclude.include }>;

const presentRoom = (a: RoomAssignmentWithRoom | undefined) =>
  a
    ? {
        trip_room_id: a.trip_room_id,
        room_identifier: a.trip_room.accommodation_room.identifier,
        room_name: a.trip_room.accommodation_room.name,
        accommodation_id: a.trip_room.trip_accommodation.accommodation_id,
        accommodation_name: a.trip_room.trip_accommodation.accommodation.name,
      }
    : null;

const withSeat = { customer: true, seat_assignments: activeSeatInclude, room_assignments: activeRoomInclude } as const;

function presentReservation(
  r: Reservation & { customer: Customer; seat_assignments?: SeatAssignmentWithSeat[]; room_assignments?: RoomAssignmentWithRoom[] },
  user: AuthUser,
) {
  const { public_token_hash: _hash, customer, seat_assignments, room_assignments, ...rest } = r;
  const prices = canSeePrices(user);
  return {
    ...rest,
    package_price: prices ? r.package_price : null,
    discount_amount: prices ? r.discount_amount : null,
    surcharge_amount: prices ? r.surcharge_amount : null,
    final_price: prices ? r.final_price : null,
    notes: user.role === 'VISUALIZADOR' ? null : r.notes,
    hold_expired: isExpiredHold(r),
    public_link: linkState(r),
    seat: presentSeat(seat_assignments?.[0]),
    room: presentRoom(room_assignments?.[0]),
    customer: presentCustomer(customer, user),
  };
}


// RN-007: cancelar libera o assento (o histórico fica em seat_assignments).
export async function releaseSeat(tx: Tx, reservationId: string) {
  const active = await tx.seatAssignment.findFirst({
    where: { reservation_id: reservationId, removed_at: null },
    include: { trip_seat: true },
  });
  if (!active) return null;
  await tx.seatAssignment.update({ where: { id: active.id }, data: { removed_at: new Date() } });
  return active.trip_seat.seat_number;
}

export async function releaseRoom(tx: Tx, reservationId: string) {
  const active = await tx.roomAssignment.findFirst({
    where: { reservation_id: reservationId, removed_at: null },
    include: { trip_room: { include: { accommodation_room: true } } },
  });
  if (!active) return null;
  await tx.roomAssignment.update({ where: { id: active.id }, data: { removed_at: new Date() } });
  return active.trip_room.accommodation_room.identifier;
}

async function capacityError(tx: Tx, trip: Trip, nextStatus: Reservation['reservation_status'], excludeId?: string) {
  if (nextStatus === 'LISTA_ESPERA') {
    return trip.waitlist_enabled ? null : { code: 'WAITLIST_DISABLED', message: 'Esta viagem não usa lista de espera' };
  }
  const others = await tx.reservation.findMany({
    where: { trip_id: trip.id, reservation_status: { in: ACTIVE_STATUSES }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { reservation_status: true, hold_expires_at: true },
  });
  const result = checkCapacity({ capacity: trip.commercial_capacity, config: trip, others, nextStatus });
  if (result.ok) return null;
  return {
    code: result.code,
    message:
      result.code === 'CONFIRMED_OVER_CAPACITY'
        ? 'A viagem já atingiu a capacidade de reservas confirmadas'
        : 'A viagem está lotada',
    waitlist_available: trip.waitlist_enabled,
  };
}

function holdExpiry(trip: Trip, status: Reservation['reservation_status'], now = new Date()) {
  if (status !== 'PRE_RESERVA' || !trip.reservation_ttl_hours) return null;
  return new Date(now.getTime() + trip.reservation_ttl_hours * 3_600_000);
}

export async function reservationsRoutes(app: FastifyInstance) {
  // Página pública do passageiro (RF-015): sem login, com limite por IP e a
  // mesma resposta pra token inexistente, revogado ou vencido — não dá pra
  // descobrir reservas por tentativa.
  app.get<{ Params: { token: string } }>(
    '/public/reservations/:token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex');
      const unavailable = () => reply.code(404).send({ message: 'Este link não está disponível.' });

      const token = request.params.token;
      if (token.length < 20 || token.length > 100) return unavailable();

      const r = await app.prisma.reservation.findUnique({
        where: { public_token_hash: hashToken(token) },
        include: { trip: true, seat_assignments: activeSeatInclude, room_assignments: activeRoomInclude },
      });
      if (!r || linkState(r) !== 'ATIVO') return unavailable();
      const seat = r.seat_assignments[0]?.trip_seat;
      const room = r.room_assignments[0]?.trip_room;
      if (r.trip.status === 'CANCELADA' || r.trip.status === 'ARQUIVADA') return unavailable();

      // RN-013: só dados públicos; o roteiro entra numa próxima fase.
      // Motorista, capacidades e contatos internos ficam de fora.
      return {
        passenger_name: r.passenger_name,
        waitlist: r.reservation_status === 'LISTA_ESPERA',
        trip: {
          name: r.trip.name,
          destination: r.trip.destination,
          departure_at: r.trip.departure_at,
          return_at: r.trip.return_at,
          departure_location: r.trip.departure_location,
          included_services: r.trip.included_services,
          public_instructions: r.trip.public_instructions,
        },
        transport: seat
          ? { vehicle: seat.trip_vehicle.operational_name, identifier: seat.trip_vehicle.identifier, seat_number: seat.seat_number, floor: seat.floor }
          : null,
        accommodation: room
          ? {
              name: room.trip_accommodation.accommodation.name,
              address: room.trip_accommodation.accommodation.address,
              city: room.trip_accommodation.accommodation.city,
              state: room.trip_accommodation.accommodation.state,
              room: room.accommodation_room.identifier,
              room_name: room.accommodation_room.name,
            }
          : null,
        itinerary: [],
      };
    },
  );

  app.register(async (admin) => {
    admin.addHook('preHandler', requireAuth);

    async function findTrip(request: FastifyRequest, reply: FastifyReply, id: string, write: boolean) {
      const user = request.user!;
      const trip = await admin.prisma.trip.findFirst({ where: { id, ...(write ? tripWriteScope(user) : tripScope(user)) } });
      if (!trip) reply.code(404).send({ message: 'Viagem não encontrada' });
      return trip;
    }

    // Reserva de viagem fora do escopo do usuário responde 404, como a viagem.
    async function findReservation(request: FastifyRequest<IdParams>, reply: FastifyReply, write: boolean) {
      const user = request.user!;
      const r = await admin.prisma.reservation.findFirst({
        where: { id: request.params.id, trip: write ? tripWriteScope(user) : tripScope(user) },
        include: { ...withSeat, trip: true },
      });
      if (!r) reply.code(404).send({ message: 'Reserva não encontrada' });
      return r;
    }

    admin.get<IdParams>('/trips/:id/reservations', { preHandler: requirePermission('trips.read') }, async (request, reply) => {
      const { status, q } = listReservationsQuery.parse(request.query);
      const trip = await findTrip(request, reply, request.params.id, false);
      if (!trip) return;

      const where: Prisma.ReservationWhereInput = { trip_id: trip.id };
      if (status === 'ATIVAS') where.reservation_status = { in: ACTIVE_STATUSES };
      else if (status !== 'TODAS') where.reservation_status = status;
      if (q) where.passenger_name = { contains: q, mode: 'insensitive' };

      const items = await admin.prisma.reservation.findMany({
        where,
        include: withSeat,
        orderBy: { passenger_name: 'asc' },
      });
      return items.map((r) => presentReservation(r, request.user!));
    });

    admin.post<IdParams>('/trips/:id/reservations', { preHandler: requirePermission('reservations.write') }, async (request, reply) => {
      const input = createReservationSchema.parse(request.body);
      const trip = await findTrip(request, reply, request.params.id, true);
      if (!trip) return;
      if (CLOSED_TRIP_STATUSES.includes(trip.status)) {
        return reply.code(409).send({ message: 'Esta viagem não recebe mais reservas' });
      }

      const customer = await admin.prisma.customer.findUnique({ where: { id: input.customer_id } });
      if (!customer) return reply.code(404).send({ message: 'Cliente não encontrado' });
      if (customer.status !== 'ATIVO') {
        return reply.code(409).send({ message: 'Cliente arquivado. Restaure o cadastro antes de reservar.' });
      }

      const package_price = input.package_price ?? trip.default_package_price;
      const final_price = computeFinalPrice({ ...input, package_price });
      if (final_price === null) {
        return reply.code(400).send({ message: 'O desconto não pode ser maior que o valor do pacote' });
      }

      const token = generateToken();
      const result = await admin.prisma.$transaction(async (tx) => {
        await lockTrip(tx, trip.id);

        // RN-006: uma reserva ativa por cliente e viagem.
        const existing = await tx.reservation.findFirst({
          where: { trip_id: trip.id, customer_id: customer.id, reservation_status: { in: ACTIVE_STATUSES } },
          select: { id: true, reservation_status: true },
        });
        if (existing) {
          return { error: { status: 409, body: { code: 'RESERVATION_EXISTS', message: 'Este cliente já tem uma reserva ativa nesta viagem', existing } } };
        }

        const full = await capacityError(tx, trip, input.reservation_status);
        if (full) return { error: { status: 409, body: full } };

        const now = new Date();
        const reservation = await tx.reservation.create({
          data: {
            trip_id: trip.id,
            customer_id: customer.id,
            reservation_status: input.reservation_status,
            passenger_name: customer.full_name,
            package_price,
            discount_amount: input.is_courtesy ? 0 : input.discount_amount,
            surcharge_amount: input.is_courtesy ? 0 : input.surcharge_amount,
            final_price,
            is_courtesy: input.is_courtesy,
            payment_due_date: input.payment_due_date ?? null,
            hold_expires_at: holdExpiry(trip, input.reservation_status, now),
            notes: input.notes ?? null,
            public_token_hash: hashToken(token),
            public_token_created_at: now,
            public_token_expires_at: input.public_link_expires_at ?? null,
            created_by: request.user!.id,
          },
          include: withSeat,
        });
        await writeAudit(tx, request, {
          entity_type: 'Reservation',
          entity_id: reservation.id,
          action: 'CREATE',
          new_values: {
            trip_id: trip.id,
            customer_id: customer.id,
            reservation_status: reservation.reservation_status,
            final_price,
          },
        });
        return { reservation };
      });

      if ('error' in result) return reply.code(result.error!.status).send(result.error!.body);
      return reply.code(201).send({
        reservation: presentReservation(result.reservation!, request.user!),
        // O link só existe aqui: no banco fica o hash.
        public_url: publicUrl(token),
      });
    });

    admin.get<IdParams>('/reservations/:id', { preHandler: requirePermission('trips.read') }, async (request, reply) => {
      const r = await findReservation(request, reply, false);
      if (!r) return;
      const history = hasPermission(request.user!, 'audit.read')
        ? await admin.prisma.auditLog.findMany({
            where: { entity_type: 'Reservation', entity_id: r.id },
            orderBy: { created_at: 'desc' },
            include: { user: { select: { name: true } } },
          })
        : [];
      return { ...presentReservation(r, request.user!), history };
    });

    admin.patch<IdParams>('/reservations/:id', { preHandler: requirePermission('reservations.write') }, async (request, reply) => {
      const { reason, ...changes } = updateReservationSchema.parse(request.body);
      const existing = await findReservation(request, reply, true);
      if (!existing) return;
      if (isEnded(existing.reservation_status)) {
        return reply.code(409).send({ message: 'Reserva cancelada não pode ser alterada' });
      }

      const merged = {
        package_price: changes.package_price ?? existing.package_price,
        discount_amount: changes.discount_amount ?? existing.discount_amount,
        surcharge_amount: changes.surcharge_amount ?? existing.surcharge_amount,
        is_courtesy: changes.is_courtesy ?? existing.is_courtesy,
      };
      if (merged.is_courtesy) {
        merged.discount_amount = 0;
        merged.surcharge_amount = 0;
      }
      const final_price = computeFinalPrice(merged);
      if (final_price === null) {
        return reply.code(400).send({ message: 'O desconto não pode ser maior que o valor do pacote' });
      }

      const data: Prisma.ReservationUncheckedUpdateInput = { ...changes, ...merged, final_price };
      const statusChanged = changes.reservation_status && changes.reservation_status !== existing.reservation_status;

      const result = await admin.prisma.$transaction(async (tx) => {
        if (statusChanged) {
          await lockTrip(tx, existing.trip_id);
          const full = await capacityError(tx, existing.trip, changes.reservation_status!, existing.id);
          if (full) return { error: full };
          data.hold_expires_at = holdExpiry(existing.trip, changes.reservation_status!);
          // Voltar pra lista de espera devolve assento e quarto.
          if (changes.reservation_status === 'LISTA_ESPERA') {
            await releaseSeat(tx, existing.id);
            await releaseRoom(tx, existing.id);
          }
        }

        const { old_values, new_values, changed } = diffFields(
          existing as unknown as Record<string, unknown>,
          data as Record<string, unknown>,
        );
        const updated = await tx.reservation.update({ where: { id: existing.id }, data, include: { customer: true } });
        if (changed) {
          // RF-024: alteração de valor contratado tem ação própria na auditoria.
          const action = final_price !== existing.final_price ? 'CONTRACT_VALUE_CHANGE' : statusChanged ? 'STATUS_CHANGE' : 'UPDATE';
          await writeAudit(tx, request, { entity_type: 'Reservation', entity_id: existing.id, action, old_values, new_values, reason });
        }
        return { updated };
      });

      if ('error' in result) return reply.code(409).send(result.error);
      return presentReservation(result.updated!, request.user!);
    });

    // RN-007: muda o status, libera assento e quarto e preserva o histórico.
    admin.post<IdParams>('/reservations/:id/cancel', { preHandler: requirePermission('reservations.write') }, async (request, reply) => {
      const { reason } = cancelReservationSchema.parse(request.body ?? {});
      const existing = await findReservation(request, reply, true);
      if (!existing) return;
      if (isEnded(existing.reservation_status)) {
        return reply.code(409).send({ message: 'Esta reserva já está cancelada' });
      }

      const updated = await admin.prisma.$transaction(async (tx) => {
        const released = await releaseSeat(tx, existing.id);
        const releasedRoom = await releaseRoom(tx, existing.id);
        const r = await tx.reservation.update({
          where: { id: existing.id },
          data: { reservation_status: 'CANCELADA', cancelled_at: new Date(), cancel_reason: reason },
          include: withSeat,
        });
        await writeAudit(tx, request, {
          entity_type: 'Reservation',
          entity_id: r.id,
          action: 'CANCEL',
          old_values: {
            reservation_status: existing.reservation_status,
            ...(released ? { seat: released } : {}),
            ...(releasedRoom ? { room: releasedRoom } : {}),
          },
          new_values: { reservation_status: 'CANCELADA' },
          reason,
        });
        return r;
      });
      return presentReservation(updated, request.user!);
    });

    // Gera um link novo e invalida o anterior. É também o jeito de "copiar o
    // link de novo", já que o token original não fica guardado.
    admin.post<IdParams>(
      '/reservations/:id/regenerate-public-link',
      { preHandler: requirePermission('reservations.write') },
      async (request, reply) => {
        const { expires_at } = regenerateLinkSchema.parse(request.body ?? {});
        const existing = await findReservation(request, reply, true);
        if (!existing) return;
        if (isEnded(existing.reservation_status)) {
          return reply.code(409).send({ message: 'Reserva cancelada não tem link' });
        }

        const token = generateToken();
        const updated = await admin.prisma.$transaction(async (tx) => {
          const r = await tx.reservation.update({
            where: { id: existing.id },
            data: {
              public_token_hash: hashToken(token),
              public_token_created_at: new Date(),
              public_token_expires_at: expires_at ?? null,
              public_token_revoked_at: null,
            },
            include: withSeat,
          });
          await writeAudit(tx, request, {
            entity_type: 'Reservation',
            entity_id: r.id,
            action: 'REGENERATE_LINK',
            new_values: { expires_at: expires_at ?? null },
          });
          return r;
        });
        return { reservation: presentReservation(updated, request.user!), public_url: publicUrl(token) };
      },
    );

    admin.post<IdParams>(
      '/reservations/:id/revoke-public-link',
      { preHandler: requirePermission('links.revoke') },
      async (request, reply) => {
        const existing = await findReservation(request, reply, true);
        if (!existing) return;
        if (linkState(existing) !== 'ATIVO') {
          return reply.code(409).send({ message: 'Esta reserva não tem link ativo' });
        }

        const updated = await admin.prisma.$transaction(async (tx) => {
          const r = await tx.reservation.update({
            where: { id: existing.id },
            data: { public_token_revoked_at: new Date() },
            include: withSeat,
          });
          await writeAudit(tx, request, { entity_type: 'Reservation', entity_id: r.id, action: 'REVOKE_LINK' });
          return r;
        });
        return presentReservation(updated, request.user!);
      },
    );
  });
}
