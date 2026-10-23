import type { FastifyInstance } from 'fastify';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema.js';
import { hashPassword } from '../lib/hash.js';
import { diffFields, writeAudit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  can_view_sensitive: true,
  last_login_at: true,
  created_at: true,
} as const;

export async function usersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // Lista leve (id/nome/perfil) usada pra autorizar usuários em viagens.
  // Quem gerencia viagens precisa dela, mas não do resto dos dados.
  app.get('/users/options', { preHandler: requirePermission('trips.manage_access') }, async () => {
    return app.prisma.user.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/users', { preHandler: requirePermission('users.manage') }, async () => {
    return app.prisma.user.findMany({ select: userSelect, orderBy: { name: 'asc' } });
  });

  app.post('/users', { preHandler: requirePermission('users.manage') }, async (request, reply) => {
    const { password, ...data } = createUserSchema.parse(request.body);
    const user = await app.prisma.user.create({
      data: { ...data, password_hash: await hashPassword(password) },
      select: userSelect,
    });
    await writeAudit(app.prisma, request, {
      entity_type: 'User',
      entity_id: user.id,
      action: 'CREATE',
      new_values: { email: user.email, role: user.role },
    });
    return reply.code(201).send(user);
  });

  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requirePermission('users.manage') },
    async (request, reply) => {
      const { password, ...changes } = updateUserSchema.parse(request.body);
      const existing = await app.prisma.user.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ message: 'Usuário não encontrado' });

      // Não deixa o sistema ficar sem administrador ativo nem o admin se trancar pra fora.
      const losesAdmin =
        existing.role === 'ADMIN' &&
        ((changes.role && changes.role !== 'ADMIN') || (changes.status && changes.status !== 'ATIVO'));
      if (losesAdmin) {
        const otherAdmins = await app.prisma.user.count({
          where: { role: 'ADMIN', status: 'ATIVO', id: { not: existing.id } },
        });
        if (otherAdmins === 0) {
          return reply.code(409).send({ message: 'É preciso manter ao menos um administrador ativo' });
        }
      }

      const { old_values, new_values, changed } = diffFields(existing, changes);
      const user = await app.prisma.user.update({
        where: { id: existing.id },
        data: { ...changes, ...(password ? { password_hash: await hashPassword(password) } : {}) },
        select: userSelect,
      });

      if (changed || password) {
        await writeAudit(app.prisma, request, {
          entity_type: 'User',
          entity_id: user.id,
          action: 'UPDATE_PERMISSIONS',
          old_values,
          new_values: password ? { ...new_values, password: 'alterada' } : new_values,
        });
      }
      return user;
    },
  );
}
