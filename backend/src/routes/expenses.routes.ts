import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { diffFields, writeAudit } from '../lib/audit.js';
import { hasPermission } from '../lib/permissions.js';
import { dateISO, expenseFinance, tripFinance } from '../lib/finance-rules.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { financeOf, paymentMethod, reverseSchema } from './finance.routes.js';
import { tripScope, tripWriteScope } from './trips.routes.js';

type IdParams = { Params: { id: string } };

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

const expenseFields = {
  category_id: z.string().uuid('Escolha a categoria'),
  description: z.string().trim().min(2, 'Descreva a despesa'),
  supplier_name: optionalText,
  cost_type: z.enum(['FIXO', 'POR_PESSOA']).default('FIXO'),
  planned_amount: z.number().int('Valor inválido').positive('Informe o valor previsto'),
  due_date: isoDate.nullable().optional(),
  notes: optionalText,
  receipt_file_id: z.string().uuid().nullable().optional(),
};
const createExpenseSchema = z.object(expenseFields);
const updateExpenseSchema = z.object({ ...expenseFields, cost_type: z.enum(['FIXO', 'POR_PESSOA']), reason: optionalText }).partial();
const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Informe o motivo do cancelamento') });
const expensePaymentSchema = z.object({
  amount: z.number().int('Valor inválido').positive('Informe o valor'),
  payment_date: isoDate,
  payment_method: paymentMethod,
  reference: optionalText,
  receipt_file_id: z.string().uuid().nullable().optional(),
  // RN-009: pagar mais que o previsto só com confirmação.
  confirm_overpayment: z.boolean().default(false),
});
const categorySchema = z.object({ name: z.string().trim().min(2, 'Informe o nome da categoria'), description: optionalText });

const expenseInclude = {
  category: { select: { id: true, name: true } },
  receipt: { select: { id: true, original_name: true, mime_type: true } },
  payments: { include: { receipt: { select: { id: true, original_name: true, mime_type: true } } }, orderBy: [{ payment_date: 'asc' }, { created_at: 'asc' }] },
} satisfies Prisma.TripExpenseInclude;

type ExpenseWithPayments = Prisma.TripExpenseGetPayload<{ include: typeof expenseInclude }>;

function presentExpense(e: ExpenseWithPayments) {
  const f = expenseFinance(e);
  return {
    ...e,
    due_date: e.due_date && dateISO(e.due_date),
    ...f,
    payments: e.payments.map((p) => ({ ...p, payment_date: dateISO(p.payment_date) })),
  };
}

export async function expensesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/expense-categories', { preHandler: requirePermission('finance.read') }, async () =>
    app.prisma.expenseCategory.findMany({ orderBy: [{ is_system: 'desc' }, { name: 'asc' }] }),
  );

  // RF-017: categorias personalizadas além das iniciais.
  app.post('/expense-categories', { preHandler: requirePermission('expenses.write') }, async (request, reply) => {
    const input = categorySchema.parse(request.body);
    const clash = await app.prisma.expenseCategory.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } });
    if (clash) return reply.code(409).send({ message: 'Já existe uma categoria com esse nome' });
    const c = await app.prisma.expenseCategory.create({ data: input });
    await writeAudit(app.prisma, request, { entity_type: 'ExpenseCategory', entity_id: c.id, action: 'CREATE', new_values: { name: c.name } });
    return reply.code(201).send(c);
  });

  async function findTrip(request: FastifyRequest<IdParams>, reply: FastifyReply, write: boolean) {
    const user = request.user!;
    const trip = await app.prisma.trip.findFirst({ where: { id: request.params.id, ...(write ? tripWriteScope(user) : tripScope(user)) } });
    if (!trip) reply.code(404).send({ message: 'Viagem não encontrada' });
    return trip;
  }

  async function findExpense(request: FastifyRequest<IdParams>, reply: FastifyReply) {
    const e = await app.prisma.tripExpense.findFirst({
      where: { id: request.params.id, trip: tripWriteScope(request.user!) },
      include: expenseInclude,
    });
    if (!e) reply.code(404).send({ message: 'Despesa não encontrada' });
    return e;
  }

  async function validRefs(input: { category_id?: string; receipt_file_id?: string | null }, request: FastifyRequest) {
    if (input.category_id) {
      const c = await app.prisma.expenseCategory.findUnique({ where: { id: input.category_id } });
      if (!c || c.status !== 'ATIVO') return 'Categoria inválida';
    }
    if (input.receipt_file_id) {
      const f = await app.prisma.storedFile.findUnique({ where: { id: input.receipt_file_id } });
      if (!f || f.deleted_at || (f.uploaded_by !== request.user!.id && !hasPermission(request.user!, 'finance.read'))) return 'Comprovante inválido';
    }
    return null;
  }

  const reload = async (id: string) => presentExpense(await app.prisma.tripExpense.findUniqueOrThrow({ where: { id }, include: expenseInclude }));

  app.get<IdParams>('/trips/:id/expenses', { preHandler: requirePermission('finance.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply, false);
    if (!trip) return;
    const list = await app.prisma.tripExpense.findMany({
      where: { trip_id: trip.id },
      include: expenseInclude,
      orderBy: [{ cancelled_at: { sort: 'desc', nulls: 'first' } }, { due_date: { sort: 'asc', nulls: 'last' } }, { created_at: 'asc' }],
    });
    return list.map(presentExpense);
  });

  app.post<IdParams>('/trips/:id/expenses', { preHandler: requirePermission('expenses.write') }, async (request, reply) => {
    const input = createExpenseSchema.parse(request.body);
    const trip = await findTrip(request, reply, true);
    if (!trip) return;
    const problem = await validRefs(input, request);
    if (problem) return reply.code(400).send({ message: problem });

    const e = await app.prisma.tripExpense.create({
      data: { ...input, due_date: input.due_date ? new Date(input.due_date) : null, trip_id: trip.id, created_by: request.user!.id },
    });
    await writeAudit(app.prisma, request, {
      entity_type: 'TripExpense',
      entity_id: e.id,
      action: 'CREATE',
      new_values: { trip_id: trip.id, description: e.description, planned_amount: e.planned_amount },
    });
    return reply.code(201).send(await reload(e.id));
  });

  app.patch<IdParams>('/expenses/:id', { preHandler: requirePermission('expenses.write') }, async (request, reply) => {
    const { reason, ...changes } = updateExpenseSchema.parse(request.body);
    const e = await findExpense(request, reply);
    if (!e) return;
    if (e.cancelled_at) return reply.code(409).send({ message: 'Despesa cancelada não pode ser alterada' });
    const problem = await validRefs(changes, request);
    if (problem) return reply.code(400).send({ message: problem });

    const data: Prisma.TripExpenseUncheckedUpdateInput = {
      ...changes,
      ...(changes.due_date !== undefined ? { due_date: changes.due_date ? new Date(changes.due_date) : null } : {}),
    };
    const { payments: _p, category: _c, receipt: _r, ...plain } = e;
    const { old_values, new_values, changed } = diffFields(plain as unknown as Record<string, unknown>, data as Record<string, unknown>);
    await app.prisma.tripExpense.update({ where: { id: e.id }, data });
    if (changed) await writeAudit(app.prisma, request, { entity_type: 'TripExpense', entity_id: e.id, action: 'UPDATE', old_values, new_values, reason });
    return reload(e.id);
  });

  // Cancela sem apagar; pagamentos já feitos continuam no histórico.
  app.post<IdParams>('/expenses/:id/cancel', { preHandler: requirePermission('expenses.write') }, async (request, reply) => {
    const { reason } = cancelSchema.parse(request.body ?? {});
    const e = await findExpense(request, reply);
    if (!e) return;
    if (e.cancelled_at) return reply.code(409).send({ message: 'Esta despesa já está cancelada' });
    await app.prisma.$transaction(async (tx) => {
      await tx.tripExpense.update({ where: { id: e.id }, data: { cancelled_at: new Date(), cancel_reason: reason } });
      await writeAudit(tx, request, { entity_type: 'TripExpense', entity_id: e.id, action: 'CANCEL', reason });
    });
    return reload(e.id);
  });

  // RF-018: pagamento parcial ou integral.
  app.post<IdParams>('/expenses/:id/payments', { preHandler: requirePermission('expenses.write') }, async (request, reply) => {
    const input = expensePaymentSchema.parse(request.body);
    const e = await findExpense(request, reply);
    if (!e) return;
    if (e.cancelled_at) return reply.code(409).send({ message: 'Despesa cancelada não recebe pagamento' });
    const problem = await validRefs(input, request);
    if (problem) return reply.code(400).send({ message: problem });

    const { paid } = expenseFinance(e);
    if (!input.confirm_overpayment && paid + input.amount > e.planned_amount) {
      return reply.code(409).send({
        code: 'OVERPAYMENT',
        message: `O pagamento passa do valor previsto em ${(paid + input.amount - e.planned_amount) / 100}`,
        balance: e.planned_amount - paid,
      });
    }
    await app.prisma.$transaction(async (tx) => {
      const p = await tx.expensePayment.create({
        data: {
          expense_id: e.id,
          amount: input.amount,
          payment_date: new Date(input.payment_date),
          payment_method: input.payment_method,
          reference: input.reference ?? null,
          receipt_file_id: input.receipt_file_id ?? null,
          created_by: request.user!.id,
        },
      });
      await writeAudit(tx, request, { entity_type: 'TripExpense', entity_id: e.id, action: 'PAYMENT', new_values: { payment_id: p.id, amount: p.amount } });
    });
    return reply.code(201).send(await reload(e.id));
  });

  app.post<IdParams>('/expense-payments/:id/reverse', { preHandler: requirePermission('finance.reverse') }, async (request, reply) => {
    const { reason } = reverseSchema.parse(request.body ?? {});
    const p = await app.prisma.expensePayment.findFirst({ where: { id: request.params.id, expense: { trip: tripWriteScope(request.user!) } } });
    if (!p) return reply.code(404).send({ message: 'Pagamento não encontrado' });
    if (p.status === 'ESTORNADO') return reply.code(409).send({ message: 'Este lançamento já foi estornado' });
    await app.prisma.$transaction(async (tx) => {
      await tx.expensePayment.update({
        where: { id: p.id },
        data: { status: 'ESTORNADO', reversed_at: new Date(), reversed_by: request.user!.id, reversal_reason: reason },
      });
      await writeAudit(tx, request, {
        entity_type: 'TripExpense',
        entity_id: p.expense_id,
        action: 'PAYMENT_REVERSAL',
        old_values: { payment_id: p.id, amount: p.amount },
        reason,
      });
    });
    return reload(p.expense_id);
  });

  // RF-020: dashboard financeiro da viagem, com despesas por categoria.
  app.get<IdParams>('/trips/:id/finance-dashboard', { preHandler: requirePermission('finance.read') }, async (request, reply) => {
    const trip = await findTrip(request, reply, false);
    if (!trip) return;
    const [reservations, expenses] = await Promise.all([
      app.prisma.reservation.findMany({
        where: { trip_id: trip.id },
        include: { payments: true, payment_plan: { include: { installments: true } } },
      }),
      app.prisma.tripExpense.findMany({ where: { trip_id: trip.id }, include: { payments: true, category: true } }),
    ]);

    const fin = reservations.map((r) => ({ r, f: financeOf(r) }));
    const exp = expenses.map((e) => ({ e, f: expenseFinance(e) }));
    const summary = tripFinance(
      fin.map(({ r, f }) => ({ reservation_status: r.reservation_status, final_price: r.final_price, is_courtesy: r.is_courtesy, paid: f.paid })),
      exp.map(({ e, f }) => ({ cancelled: !!e.cancelled_at, cost_type: e.cost_type, planned_amount: e.planned_amount, paid: f.paid })),
    );

    const byCategory = new Map<string, { category: string; planned: number; paid: number }>();
    for (const { e, f } of exp) {
      if (e.cancelled_at) continue;
      const row = byCategory.get(e.category_id) ?? { category: e.category.name, planned: 0, paid: 0 };
      row.planned += e.planned_amount;
      row.paid += f.paid;
      byCategory.set(e.category_id, row);
    }
    const count = (status: string) => fin.filter(({ f }) => f.status === status).length;

    return {
      ...summary,
      commercial_capacity: trip.commercial_capacity,
      by_category: [...byCategory.values()].sort((a, b) => b.planned - a.planned),
      reservations_by_status: {
        pago: count('PAGO'),
        parcial: count('PARCIALMENTE_PAGO'),
        pendente: count('PENDENTE'),
        atrasado: count('ATRASADO'),
      },
      overdue_amount: fin.reduce((n, { f }) => n + f.overdue_amount, 0),
      expenses_overdue: exp.filter(({ f }) => f.status === 'VENCIDA').length,
    };
  });
}
