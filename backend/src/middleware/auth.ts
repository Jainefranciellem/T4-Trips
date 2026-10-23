import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt.js';
import { hasPermission, type Permission } from '../lib/permissions.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  can_view_sensitive: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// O usuário é recarregado do banco a cada request (e não lido do token) pra
// que desativar um usuário ou trocar o perfil dele valha imediatamente.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ message: 'Token de acesso ausente' });
  }

  let sub: string;
  try {
    sub = verifyAccessToken(header.slice('Bearer '.length)).sub;
  } catch {
    return reply.code(401).send({ message: 'Token de acesso inválido ou expirado' });
  }

  const user = await request.server.prisma.user.findUnique({
    where: { id: sub },
    select: { id: true, email: true, name: true, role: true, status: true, can_view_sensitive: true },
  });

  if (!user || user.status !== 'ATIVO') {
    return reply.code(401).send({ message: 'Usuário inativo ou inexistente' });
  }

  request.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    can_view_sensitive: user.can_view_sensitive,
  };
}

// Retorna um preHandler que exige a permissão. Roda depois de requireAuth.
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !hasPermission(request.user, permission)) {
      return reply.code(403).send({ message: 'Você não tem permissão para esta ação' });
    }
  };
}
