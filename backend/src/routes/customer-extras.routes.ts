import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAudit } from '../lib/audit.js';
import { hasPermission } from '../lib/permissions.js';
import { isEnded } from '../lib/reservation-rules.js';
import { dateISO } from '../lib/finance-rules.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { financeOf } from './finance.routes.js';
import { tripScope } from './trips.routes.js';

type IdParams = { Params: { id: string } };

const relationshipSchema = z.object({
  related_customer_id: z.string().uuid('Escolha o cliente'),
  relationship_type: z.string().trim().min(2, 'Informe o vínculo').max(40),
  group_name: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
});
const anonymizeSchema = z.object({ reason: z.string().trim().min(3, 'Informe o motivo (ex.: pedido do titular)') });

// RF-005 (vínculos e histórico), RF-012 (grupos juntos) e LGPD 10.2.
export async function customerExtrasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // Vínculo vale nos dois sentidos: Ana→Bruno aparece pra Ana e pro Bruno.
  app.get<IdParams>('/customers/:id/relationships', { preHandler: requirePermission('customers.read') }, async (request) => {
    const id = request.params.id;
    const links = await app.prisma.customerRelationship.findMany({
      where: { OR: [{ customer_id: id }, { related_customer_id: id }] },
      include: { customer: { select: { id: true, full_name: true } }, related_customer: { select: { id: true, full_name: true } } },
      orderBy: { created_at: 'asc' },
    });
    return links.map((l) => ({
      id: l.id,
      relationship_type: l.relationship_type,
      group_name: l.group_name,
      customer: l.customer_id === id ? l.related_customer : l.customer,
    }));
  });

  app.post<IdParams>('/customers/:id/relationships', { preHandler: requirePermission('customers.write') }, async (request, reply) => {
    const input = relationshipSchema.parse(request.body);
    const id = request.params.id;
    if (input.related_customer_id === id) return reply.code(400).send({ message: 'Escolha outro cliente' });
    const found = await app.prisma.customer.count({ where: { id: { in: [id, input.related_customer_id] } } });
    if (found !== 2) return reply.code(404).send({ message: 'Cliente não encontrado' });
    const clash = await app.prisma.customerRelationship.findFirst({
      where: {
        OR: [
          { customer_id: id, related_customer_id: input.related_customer_id },
          { customer_id: input.related_customer_id, related_customer_id: id },
        ],
      },
    });
    if (clash) return reply.code(409).send({ message: 'Esses clientes já estão vinculados' });
    const link = await app.prisma.customerRelationship.create({ data: { customer_id: id, ...input } });
    await writeAudit(app.prisma, request, {
      entity_type: 'Customer',
      entity_id: id,
      action: 'LINK',
      new_values: { related_customer_id: input.related_customer_id, relationship_type: input.relationship_type },
    });
    return reply.code(201).send(link);
  });

  app.delete<IdParams>('/customer-relationships/:id', { preHandler: requirePermission('customers.write') }, async (request, reply) => {
    const link = await app.prisma.customerRelationship.findUnique({ where: { id: request.params.id } });
    if (!link) return reply.code(404).send({ message: 'Vínculo não encontrado' });
    await app.prisma.customerRelationship.delete({ where: { id: link.id } });
    await writeAudit(app.prisma, request, {
      entity_type: 'Customer',
      entity_id: link.customer_id,
      action: 'UNLINK',
      old_values: { related_customer_id: link.related_customer_id },
    });
    return reply.code(204).send();
  });

  // Grupos da viagem: passageiros ativos ligados por vínculo, direto ou em
  // cadeia (Ana–Bruno–Carla). Usado pra sugerir o mesmo quarto.
  app.get<IdParams>('/trips/:id/groups', { preHandler: requirePermission('trips.read') }, async (request, reply) => {
    const trip = await app.prisma.trip.findFirst({ where: { id: request.params.id, ...tripScope(request.user!) } });
    if (!trip) return reply.code(404).send({ message: 'Viagem não encontrada' });
    const reservations = (
      await app.prisma.reservation.findMany({ where: { trip_id: trip.id }, select: { id: true, customer_id: true, passenger_name: true, reservation_status: true } })
    ).filter((r) => !isEnded(r.reservation_status) && r.reservation_status !== 'LISTA_ESPERA');
    const byCustomer = new Map(reservations.map((r) => [r.customer_id, r]));
    const links = await app.prisma.customerRelationship.findMany({
      where: { customer_id: { in: [...byCustomer.keys()] }, related_customer_id: { in: [...byCustomer.keys()] } },
    });

    // União simples pra juntar os componentes ligados.
    const parent = new Map<string, string>([...byCustomer.keys()].map((k) => [k, k]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (const l of links) parent.set(find(l.customer_id), find(l.related_customer_id));
    const groups = new Map<string, { reservation_id: string; passenger_name: string }[]>();
    for (const [customerId, r] of byCustomer) {
      const root = find(customerId);
      groups.set(root, [...(groups.get(root) ?? []), { reservation_id: r.id, passenger_name: r.passenger_name }]);
    }
    const names = new Map(links.filter((l) => l.group_name).map((l) => [find(l.customer_id), l.group_name!]));
    return [...groups.entries()]
      .filter(([, members]) => members.length > 1)
      .map(([root, members]) => ({ name: names.get(root) ?? null, members: members.sort((a, b) => a.passenger_name.localeCompare(b.passenger_name)) }));
  });

  // Histórico completo do cliente (RF-005): viagens, reservas e, pra quem vê o
  // financeiro, valores pagos.
  app.get<IdParams>('/customers/:id/trips', { preHandler: requirePermission('customers.read') }, async (request, reply) => {
    const customer = await app.prisma.customer.findUnique({ where: { id: request.params.id } });
    if (!customer) return reply.code(404).send({ message: 'Cliente não encontrado' });
    const finance = hasPermission(request.user!, 'finance.read');
    const reservations = await app.prisma.reservation.findMany({
      where: { customer_id: customer.id, trip: tripScope(request.user!) },
      include: {
        trip: { select: { id: true, name: true, destination: true, departure_at: true, status: true } },
        payments: true,
        payment_plan: { include: { installments: true } },
      },
      orderBy: { trip: { departure_at: 'desc' } },
    });
    return reservations.map((r) => {
      const f = financeOf(r);
      return {
        reservation_id: r.id,
        reservation_status: r.reservation_status,
        created_at: r.created_at,
        cancelled_at: r.cancelled_at,
        trip: r.trip,
        ...(finance ? { final_price: r.final_price, paid: f.paid, balance: f.balance, financial_status: f.status, payments_count: r.payments.length } : {}),
      };
    });
  });

  // LGPD 10.2: atendimento ao titular — todos os dados guardados sobre ele.
  app.get<IdParams>('/customers/:id/export', { preHandler: requirePermission('privacy.manage') }, async (request, reply) => {
    const customer = await app.prisma.customer.findUnique({
      where: { id: request.params.id },
      include: {
        reservations: {
          include: {
            trip: { select: { name: true, destination: true, departure_at: true, return_at: true } },
            payments: { select: { kind: true, amount: true, payment_date: true, payment_method: true, status: true } },
          },
        },
        relationships: { include: { related_customer: { select: { full_name: true } } } },
        related_to: { include: { customer: { select: { full_name: true } } } },
      },
    });
    if (!customer) return reply.code(404).send({ message: 'Cliente não encontrado' });
    await writeAudit(app.prisma, request, { entity_type: 'Customer', entity_id: customer.id, action: 'PRIVACY_EXPORT' });

    const { reservations, relationships, related_to, ...data } = customer;
    const body = {
      gerado_em: new Date().toISOString(),
      controlador: 'T4 Trips',
      dados_cadastrais: data,
      vinculos: [
        ...relationships.map((r) => ({ com: r.related_customer.full_name, vinculo: r.relationship_type })),
        ...related_to.map((r) => ({ com: r.customer.full_name, vinculo: r.relationship_type })),
      ],
      viagens: reservations.map((r) => ({
        viagem: r.trip.name,
        destino: r.trip.destination,
        saida: r.trip.departure_at,
        retorno: r.trip.return_at,
        situacao: r.reservation_status,
        valor_contratado: r.final_price / 100,
        pagamentos: r.payments.map((p) => ({ tipo: p.kind, valor: p.amount / 100, data: dateISO(p.payment_date), forma: p.payment_method, situacao: p.status })),
      })),
    };
    return reply
      .header('Content-Disposition', `attachment; filename="dados-cliente-${customer.id.slice(0, 8)}.json"`)
      .header('Cache-Control', 'private, no-store')
      .send(body);
  });

  // LGPD 10.2 / RN-014: em vez de apagar (o que quebraria o financeiro),
  // remove tudo que identifica a pessoa e mantém os valores.
  app.post<IdParams>('/customers/:id/anonymize', { preHandler: requirePermission('privacy.manage') }, async (request, reply) => {
    const { reason } = anonymizeSchema.parse(request.body ?? {});
    const customer = await app.prisma.customer.findUnique({ where: { id: request.params.id } });
    if (!customer) return reply.code(404).send({ message: 'Cliente não encontrado' });
    if (customer.anonymized_at) return reply.code(409).send({ message: 'Este cadastro já foi anonimizado' });

    const pending = await app.prisma.reservation.count({
      where: {
        customer_id: customer.id,
        reservation_status: { notIn: ['CANCELADA', 'REEMBOLSADA'] },
        trip: { status: { notIn: ['CONCLUIDA', 'CANCELADA', 'ARQUIVADA'] } },
      },
    });
    if (pending > 0) return reply.code(409).send({ message: 'O cliente tem reserva em viagem ainda não concluída. Cancele ou conclua antes.' });

    const now = new Date();
    await app.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          full_name: 'Cliente anonimizado',
          cpf: null,
          birth_date: null,
          whatsapp: null,
          phone: null,
          email: null,
          city: null,
          state: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          guardian_name: null,
          guardian_phone: null,
          notes: null,
          status: 'ARQUIVADO',
          archived_at: customer.archived_at ?? now,
          anonymized_at: now,
        },
      });
      await tx.reservation.updateMany({
        where: { customer_id: customer.id },
        data: { passenger_name: 'Passageiro anonimizado', notes: null, public_token_revoked_at: now },
      });
      await tx.customerRelationship.deleteMany({ where: { OR: [{ customer_id: customer.id }, { related_customer_id: customer.id }] } });
      // Os logs antigos guardam nome/contatos nos valores alterados: limpa.
      await tx.$executeRaw`UPDATE "AuditLog" SET old_values = NULL, new_values = NULL WHERE entity_type = 'Customer' AND entity_id = ${customer.id}`;
      await writeAudit(tx, request, { entity_type: 'Customer', entity_id: customer.id, action: 'ANONYMIZE', reason });
    });
    return { ok: true };
  });
}
