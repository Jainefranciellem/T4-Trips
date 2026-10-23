import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { writeAudit } from '../lib/audit.js';
import { lockTrip } from '../lib/locks.js';
import { hasPermission } from '../lib/permissions.js';
import { dateISO, exceedsContract, reservationFinance } from '../lib/finance-rules.js';
import { isEnded } from '../lib/reservation-rules.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { tripScope, tripWriteScope } from './trips.routes.js';

type IdParams = { Params: { id: string } };

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida');
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();
export const paymentMethod = z.enum(['PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'OUTRO']);

const paymentSchema = z.object({
  amount: z.number().int('Valor inválido').positive('Informe o valor'),
  payment_date: isoDate,
  payment_method: paymentMethod,
  reference: optionalText,
  receipt_file_id: z.string().uuid().nullable().optional(),
  // RN-008: passar do contratado só com confirmação.
  confirm_overpayment: z.boolean().default(false),
});

const refundSchema = z.object({
  amount: z.number().int().positive('Informe o valor'),
  payment_date: isoDate,
  payment_method: paymentMethod,
  reference: optionalText,
  reason: z.string().trim().min(3, 'Informe o motivo do reembolso'),
});

const planSchema = z.object({
  installments: z
    .array(z.object({ due_date: isoDate, amount: z.number().int().positive('Parcela sem valor') }))
    .min(1, 'Informe ao menos uma parcela')
    .max(24),
});

export const reverseSchema = z.object({ reason: z.string().trim().min(3, 'Informe o motivo do estorno') });

const financeInclude = {
  payments: { include: { receipt: { select: { id: true, original_name: true, mime_type: true } } }, orderBy: [{ payment_date: 'asc' }, { created_at: 'asc' }] },
  payment_plan: { include: { installments: { orderBy: { installment_number: 'asc' } } } },
} satisfies Prisma.ReservationInclude;

type ReservationWithFinance = Prisma.ReservationGetPayload<{ include: typeof financeInclude }>;

type FinanceInput = Parameters<typeof reservationFinance>[0];

export function financeOf(r: Pick<FinanceInput, 'final_price' | 'reservation_status' | 'payment_due_date' | 'payments'> & { payment_plan: { installments: FinanceInput['installments'] } | null }) {
  return reservationFinance({
    final_price: r.final_price,
    reservation_status: r.reservation_status,
    payment_due_date: r.payment_due_date,
    payments: r.payments,
    installments: r.payment_plan?.installments ?? [],
  });
}

const presentPayment = (p: ReservationWithFinance['payments'][number]) => ({
  id: p.id,
  kind: p.kind,
  amount: p.amount,
  payment_date: dateISO(p.payment_date),
  payment_method: p.payment_method,
  reference: p.reference,
  receipt: p.receipt,
  status: p.status,
  created_by: p.created_by,
  created_at: p.created_at,
  reversed_at: p.reversed_at,
  reversal_reason: p.reversal_reason,
});

function presentFinance(r: ReservationWithFinance) {
  const f = financeOf(r);
  return {
    reservation_id: r.id,
    passenger_name: r.passenger_name,
    reservation_status: r.reservation_status,
    final_price: r.final_price,
    is_courtesy: r.is_courtesy,
    payment_due_date: r.payment_due_date && dateISO(r.payment_due_date),
    ...f,
    payments: r.payments.map(presentPayment),
  };
}

export async function financeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // Pagamentos da reserva: quem registra pagamento (Operador) também precisa
  // ver saldo e parcelas daquela reserva.
  async function findReservation(request: FastifyRequest<IdParams>, reply: FastifyReply, write: boolean) {
    const user = request.user!;
    const r = await app.prisma.reservation.findFirst({
      where: { id: request.params.id, trip: write ? tripWriteScope(user) : tripScope(user) },
      include: financeInclude,
    });
    if (!r) reply.code(404).send({ message: 'Reserva não encontrada' });
    return r;
  }

  const canSeeReservationFinance = (request: FastifyRequest) =>
    hasPermission(request.user!, 'finance.read') || hasPermission(request.user!, 'finance.write');

  const reload = (id: string) => app.prisma.reservation.findUniqueOrThrow({ where: { id }, include: financeInclude });

  async function checkReceipt(fileId: string | null | undefined, request: FastifyRequest) {
    if (!fileId) return true;
    const file = await app.prisma.storedFile.findUnique({ where: { id: fileId } });
    return !!file && !file.deleted_at && (file.uploaded_by === request.user!.id || hasPermission(request.user!, 'finance.read'));
  }

  app.get<IdParams>('/reservations/:id/finance', async (request, reply) => {
    if (!canSeeReservationFinance(request)) return reply.code(403).send({ message: 'Você não tem permissão para esta ação' });
    const r = await findReservation(request, reply, false);
    if (!r) return;
    return presentFinance(r);
  });

  // RF-019: monta (ou refaz) o parcelamento. A soma tem que fechar com o
  // valor final da reserva.
  app.post<IdParams>('/reservations/:id/payment-plan', { preHandler: requirePermission('finance.write') }, async (request, reply) => {
    const { installments } = planSchema.parse(request.body);
    const r = await findReservation(request, reply, true);
    if (!r) return;
    if (isEnded(r.reservation_status)) return reply.code(409).send({ message: 'Reserva cancelada não tem parcelamento' });
    const total = installments.reduce((n, i) => n + i.amount, 0);
    if (total !== r.final_price) {
      return reply.code(400).send({ message: `As parcelas somam ${total / 100} e o contrato é ${r.final_price / 100}` });
    }

    await app.prisma.$transaction(async (tx) => {
      const before = r.payment_plan?.installments.map((i) => ({ due_date: dateISO(i.due_date), amount: i.amount })) ?? null;
      if (r.payment_plan) await tx.paymentPlan.delete({ where: { id: r.payment_plan.id } });
      await tx.paymentPlan.create({
        data: {
          reservation_id: r.id,
          total_amount: total,
          installments: {
            create: [...installments]
              .sort((a, b) => a.due_date.localeCompare(b.due_date))
              .map((i, n) => ({ installment_number: n + 1, due_date: new Date(i.due_date), amount: i.amount })),
          },
        },
      });
      await writeAudit(tx, request, { entity_type: 'Reservation', entity_id: r.id, action: 'PAYMENT_PLAN', old_values: before, new_values: installments });
    });
    return presentFinance(await reload(r.id));
  });

  app.post<IdParams>('/reservations/:id/payments', { preHandler: requirePermission('finance.write') }, async (request, reply) => {
    const input = paymentSchema.parse(request.body);
    const r = await findReservation(request, reply, true);
    if (!r) return;
    if (isEnded(r.reservation_status)) return reply.code(409).send({ message: 'Reserva cancelada não recebe pagamento' });
    if (!(await checkReceipt(input.receipt_file_id, request))) return reply.code(400).send({ message: 'Comprovante inválido' });

    const result = await app.prisma.$transaction(async (tx) => {
      // Duas pessoas lançando ao mesmo tempo não passam do contratado juntas.
      await lockTrip(tx, r.trip_id);
      const fresh = await tx.reservation.findUniqueOrThrow({ where: { id: r.id }, include: financeInclude });
      const { paid } = financeOf(fresh);
      if (!input.confirm_overpayment && exceedsContract(fresh.final_price, paid, input.amount)) {
        return { error: { code: 'OVERPAYMENT', message: `O pagamento passa do valor contratado em ${(paid + input.amount - fresh.final_price) / 100}`, balance: fresh.final_price - paid } };
      }
      const payment = await tx.customerPayment.create({
        data: {
          reservation_id: r.id,
          amount: input.amount,
          payment_date: new Date(input.payment_date),
          payment_method: input.payment_method,
          reference: input.reference ?? null,
          receipt_file_id: input.receipt_file_id ?? null,
          created_by: request.user!.id,
        },
      });
      await writeAudit(tx, request, {
        entity_type: 'Reservation',
        entity_id: r.id,
        action: 'PAYMENT',
        new_values: { payment_id: payment.id, amount: payment.amount, method: payment.payment_method, date: input.payment_date },
      });
      return { ok: true };
    });

    if ('error' in result) return reply.code(409).send(result.error);
    return reply.code(201).send(presentFinance(await reload(r.id)));
  });

  // Estorno não apaga: muda o status, guarda motivo e quem fez (RN-008, CA-012).
  app.post<IdParams>('/payments/:id/reverse', { preHandler: requirePermission('finance.reverse') }, async (request, reply) => {
    const { reason } = reverseSchema.parse(request.body ?? {});
    const payment = await app.prisma.customerPayment.findFirst({
      where: { id: request.params.id, reservation: { trip: tripWriteScope(request.user!) } },
    });
    if (!payment) return reply.code(404).send({ message: 'Pagamento não encontrado' });
    if (payment.status === 'ESTORNADO') return reply.code(409).send({ message: 'Este lançamento já foi estornado' });

    await app.prisma.$transaction(async (tx) => {
      await tx.customerPayment.update({
        where: { id: payment.id },
        data: { status: 'ESTORNADO', reversed_at: new Date(), reversed_by: request.user!.id, reversal_reason: reason },
      });
      // Sem nenhum reembolso válido, a reserva volta a ser só cancelada.
      if (payment.kind === 'REEMBOLSO') {
        const refunds = await tx.customerPayment.count({ where: { reservation_id: payment.reservation_id, kind: 'REEMBOLSO', status: 'VALIDO' } });
        if (refunds === 0) await tx.reservation.update({ where: { id: payment.reservation_id }, data: { reservation_status: 'CANCELADA' } });
      }
      await writeAudit(tx, request, {
        entity_type: 'Reservation',
        entity_id: payment.reservation_id,
        action: 'PAYMENT_REVERSAL',
        old_values: { payment_id: payment.id, amount: payment.amount, status: 'VALIDO' },
        new_values: { status: 'ESTORNADO' },
        reason,
      });
    });
    return presentFinance(await reload(payment.reservation_id));
  });

  // RN-007: reembolso de reserva cancelada é lançado à parte e marca a reserva
  // como reembolsada.
  app.post<IdParams>('/reservations/:id/refunds', { preHandler: requirePermission('finance.reverse') }, async (request, reply) => {
    const input = refundSchema.parse(request.body);
    const r = await findReservation(request, reply, true);
    if (!r) return;
    if (r.reservation_status !== 'CANCELADA' && r.reservation_status !== 'REEMBOLSADA') {
      return reply.code(409).send({ message: 'Cancele a reserva antes de registrar o reembolso' });
    }
    const { paid } = financeOf(r);
    if (input.amount > paid) return reply.code(400).send({ message: `O reembolso passa do que foi pago (${paid / 100})` });

    await app.prisma.$transaction(async (tx) => {
      await tx.customerPayment.create({
        data: {
          reservation_id: r.id,
          kind: 'REEMBOLSO',
          amount: input.amount,
          payment_date: new Date(input.payment_date),
          payment_method: input.payment_method,
          reference: input.reference ?? null,
          created_by: request.user!.id,
        },
      });
      await tx.reservation.update({ where: { id: r.id }, data: { reservation_status: 'REEMBOLSADA' } });
      await writeAudit(tx, request, {
        entity_type: 'Reservation',
        entity_id: r.id,
        action: 'REFUND',
        old_values: { reservation_status: r.reservation_status },
        new_values: { reservation_status: 'REEMBOLSADA', amount: input.amount },
        reason: input.reason,
      });
    });
    return reply.code(201).send(presentFinance(await reload(r.id)));
  });

  // ---- Visão da viagem (finance.read) ----

  async function findTrip(request: FastifyRequest<IdParams>, reply: FastifyReply) {
    const trip = await app.prisma.trip.findFirst({ where: { id: request.params.id, ...tripScope(request.user!) } });
    if (!trip) reply.code(404).send({ message: 'Viagem não encontrada' });
    return trip;
  }

  // Situação financeira de cada reserva (contas a receber).
  app.get<IdParams>('/trips/:id/receivables', { preHandler: requirePermission('finance.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply);
    if (!trip) return;
    const list = await app.prisma.reservation.findMany({ where: { trip_id: trip.id }, include: financeInclude, orderBy: { passenger_name: 'asc' } });
    return list.map((r) => {
      const { payments: _p, installments, ...rest } = presentFinance(r);
      return { ...rest, installments_count: installments.length, payments_count: r.payments.length };
    });
  });

  // Todos os lançamentos da viagem, do mais recente para o mais antigo.
  app.get<IdParams>('/trips/:id/payments', { preHandler: requirePermission('finance.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply);
    if (!trip) return;
    const payments = await app.prisma.customerPayment.findMany({
      where: { reservation: { trip_id: trip.id } },
      include: { reservation: { select: { id: true, passenger_name: true } }, receipt: { select: { id: true, original_name: true, mime_type: true } } },
      orderBy: [{ payment_date: 'desc' }, { created_at: 'desc' }],
    });
    const users = await app.prisma.user.findMany({ where: { id: { in: [...new Set(payments.map((p) => p.created_by))] } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    return payments.map((p) => ({
      ...presentPayment(p),
      reservation_id: p.reservation.id,
      passenger_name: p.reservation.passenger_name,
      created_by_name: name.get(p.created_by) ?? null,
    }));
  });
}
