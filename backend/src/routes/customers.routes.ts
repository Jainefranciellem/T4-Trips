import type { FastifyInstance } from 'fastify';
import type { Customer, Prisma } from '@prisma/client';
import {
  createCustomerSchema,
  listCustomersQuery,
  updateCustomerSchema,
} from '../schemas/customer.schema.js';
import { maskCpf, normalizeCpf } from '../lib/cpf.js';
import { hasPermission } from '../lib/permissions.js';
import { diffFields, writeAudit } from '../lib/audit.js';
import { requireAuth, requirePermission, type AuthUser } from '../middleware/auth.js';

// Sem sensitive.view (ex.: Visualizador) o cliente sai sem contatos, CPF
// mascarado — evita expor dados pessoais em telas e relatórios operacionais.
export function presentCustomer(customer: Customer, viewer: AuthUser) {
  if (hasPermission(viewer, 'sensitive.view')) return customer;
  return {
    ...customer,
    cpf: maskCpf(customer.cpf),
    birth_date: null,
    whatsapp: null,
    phone: null,
    email: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    guardian_name: null,
    guardian_phone: null,
    notes: null,
  };
}

function toData(input: Record<string, unknown>) {
  const data = { ...input };
  delete data.confirm_duplicate;
  if (typeof data.birth_date === 'string') data.birth_date = new Date(data.birth_date);
  return data as Prisma.CustomerUncheckedUpdateInput;
}

export async function customersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/customers', { preHandler: requirePermission('customers.read') }, async (request) => {
    const { q, status, page, page_size } = listCustomersQuery.parse(request.query);
    const where: Prisma.CustomerWhereInput = {};
    if (status !== 'TODOS') where.status = status;

    if (q) {
      const digits = q.replace(/\D/g, '');
      // CPF/telefone só entram na busca pra quem pode ver esses dados — senão
      // dava pra descobrir CPFs por tentativa mesmo com o campo mascarado.
      const canSearchSensitive = hasPermission(request.user!, 'sensitive.view');
      where.OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        ...(canSearchSensitive
          ? ([
              { email: { contains: q, mode: 'insensitive' } },
              ...(digits ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }, { whatsapp: { contains: digits } }] : []),
            ] as Prisma.CustomerWhereInput[])
          : []),
      ];
    }

    const [total, items] = await Promise.all([
      app.prisma.customer.count({ where }),
      app.prisma.customer.findMany({
        where,
        orderBy: { full_name: 'asc' },
        skip: (page - 1) * page_size,
        take: page_size,
      }),
    ]);

    return { total, page, page_size, items: items.map((c) => presentCustomer(c, request.user!)) };
  });

  app.post('/customers', { preHandler: requirePermission('customers.write') }, async (request, reply) => {
    const input = createCustomerSchema.parse(request.body);

    // CA-003: CPF repetido bloqueia e aponta o cadastro existente pra vincular.
    if (input.cpf) {
      const sameCpf = await app.prisma.customer.findUnique({
        where: { cpf: input.cpf },
        select: { id: true, full_name: true, status: true },
      });
      if (sameCpf) {
        return reply.code(409).send({
          code: 'CPF_DUPLICATE',
          message: 'Já existe um cliente com este CPF',
          existing: sameCpf,
        });
      }
    }

    // RN-001: possível duplicidade por nome/telefone/e-mail pede confirmação.
    if (!input.confirm_duplicate) {
      const or: Prisma.CustomerWhereInput[] = [
        { full_name: { equals: input.full_name, mode: 'insensitive' } },
      ];
      if (input.phone) or.push({ phone: input.phone });
      if (input.whatsapp) or.push({ whatsapp: input.whatsapp });
      if (input.email) or.push({ email: input.email });

      const matches = await app.prisma.customer.findMany({
        where: { OR: or },
        select: { id: true, full_name: true, status: true },
        take: 5,
      });
      if (matches.length > 0) {
        return reply.code(409).send({
          code: 'POSSIBLE_DUPLICATE',
          message: 'Encontramos cadastros parecidos. Confirme para criar mesmo assim.',
          matches,
        });
      }
    }

    const customer = await app.prisma.customer.create({
      data: toData(input) as Prisma.CustomerUncheckedCreateInput,
    });
    await writeAudit(app.prisma, request, {
      entity_type: 'Customer',
      entity_id: customer.id,
      action: 'CREATE',
      new_values: { full_name: customer.full_name },
    });
    return reply.code(201).send(presentCustomer(customer, request.user!));
  });

  app.get<{ Params: { id: string } }>(
    '/customers/:id',
    { preHandler: requirePermission('customers.read') },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUnique({ where: { id: request.params.id } });
      if (!customer) return reply.code(404).send({ message: 'Cliente não encontrado' });
      return presentCustomer(customer, request.user!);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/customers/:id',
    { preHandler: requirePermission('customers.write') },
    async (request, reply) => {
      const changes = updateCustomerSchema.parse(request.body);
      const existing = await app.prisma.customer.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ message: 'Cliente não encontrado' });

      // Quem não vê dados sensíveis recebe os campos mascarados/nulos; se
      // permitíssemos editar, o formulário devolveria esses nulos e apagaria
      // os dados reais.
      if (!hasPermission(request.user!, 'sensitive.view')) {
        return reply.code(403).send({ message: 'Você não tem permissão para editar este cadastro' });
      }

      if (changes.cpf && changes.cpf !== existing.cpf) {
        const clash = await app.prisma.customer.findUnique({ where: { cpf: normalizeCpf(changes.cpf) } });
        if (clash && clash.id !== existing.id) {
          return reply.code(409).send({
            code: 'CPF_DUPLICATE',
            message: 'Já existe um cliente com este CPF',
            existing: { id: clash.id, full_name: clash.full_name, status: clash.status },
          });
        }
      }

      const data = toData(changes);
      const { old_values, new_values, changed } = diffFields(
        existing as unknown as Record<string, unknown>,
        data as Record<string, unknown>,
      );
      const customer = await app.prisma.customer.update({ where: { id: existing.id }, data });
      if (changed) {
        await writeAudit(app.prisma, request, {
          entity_type: 'Customer',
          entity_id: customer.id,
          action: 'UPDATE',
          old_values,
          new_values,
        });
      }
      return presentCustomer(customer, request.user!);
    },
  );

  // Exclusão lógica (RN-014): arquivar e restaurar; nunca delete físico.
  app.post<{ Params: { id: string } }>(
    '/customers/:id/archive',
    { preHandler: requirePermission('customers.archive') },
    async (request, reply) => setArchived(app, request, reply, true),
  );

  app.post<{ Params: { id: string } }>(
    '/customers/:id/restore',
    { preHandler: requirePermission('customers.archive') },
    async (request, reply) => setArchived(app, request, reply, false),
  );

  // Histórico do cliente: alterações do cadastro e reservas em viagens.
  // Pagamentos entram com o módulo financeiro.
  app.get<{ Params: { id: string } }>(
    '/customers/:id/history',
    { preHandler: requirePermission('audit.read') },
    async (request) => {
      const logs = await app.prisma.auditLog.findMany({
        where: { entity_type: 'Customer', entity_id: request.params.id },
        orderBy: { created_at: 'desc' },
        include: { user: { select: { name: true } } },
        take: 100,
      });
      const reservations = await app.prisma.reservation.findMany({
        where: { customer_id: request.params.id },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          reservation_status: true,
          created_at: true,
          cancelled_at: true,
          trip: { select: { id: true, name: true, destination: true, departure_at: true } },
        },
      });
      return { audit: logs, reservations, payments: [] };
    },
  );
}

async function setArchived(
  app: FastifyInstance,
  request: import('fastify').FastifyRequest<{ Params: { id: string } }>,
  reply: import('fastify').FastifyReply,
  archive: boolean,
) {
  const existing = await app.prisma.customer.findUnique({ where: { id: request.params.id } });
  if (!existing) return reply.code(404).send({ message: 'Cliente não encontrado' });

  const customer = await app.prisma.customer.update({
    where: { id: existing.id },
    data: archive
      ? { status: 'ARQUIVADO', archived_at: new Date() }
      : { status: 'ATIVO', archived_at: null },
  });
  await writeAudit(app.prisma, request, {
    entity_type: 'Customer',
    entity_id: customer.id,
    action: archive ? 'ARCHIVE' : 'RESTORE',
    old_values: { status: existing.status },
    new_values: { status: customer.status },
  });
  return presentCustomer(customer, request.user!);
}
