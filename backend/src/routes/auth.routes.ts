import type { FastifyInstance } from 'fastify';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
} from '../schemas/auth.schema.js';
import { env } from '../env.js';
import { comparePassword, hashPassword } from '../lib/hash.js';
import { sendEmail } from '../lib/email.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { permissionsFor } from '../lib/permissions.js';
import { writeAudit } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_MINUTES = 60;

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    // Limite por IP além do bloqueio por conta: segura varredura de e-mails.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { email, password } = loginSchema.parse(request.body);
      const invalid = () => reply.code(401).send({ message: 'E-mail ou senha incorretos' });

      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || user.status !== 'ATIVO') return invalid();

      if (user.locked_until && user.locked_until > new Date()) {
        return reply
          .code(429)
          .send({ message: 'Muitas tentativas inválidas. Tente novamente em alguns minutos.' });
      }

      const isValid = await comparePassword(password, user.password_hash);
      if (!isValid) {
        const failed = user.failed_login_count + 1;
        const lock = failed >= MAX_FAILED_ATTEMPTS;
        await app.prisma.user.update({
          where: { id: user.id },
          data: {
            failed_login_count: lock ? 0 : failed,
            locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          },
        });
        return invalid();
      }

      await app.prisma.user.update({
        where: { id: user.id },
        data: { failed_login_count: 0, locked_until: null, last_login_at: new Date() },
      });

      return reply.send({
        accessToken: signAccessToken({ sub: user.id }),
        refreshToken: signRefreshToken({ sub: user.id }),
        user: publicUser(user),
      });
    },
  );

  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return reply.code(401).send({ message: 'Sessão expirada' });
    }

    const user = await app.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ATIVO') {
      return reply.code(401).send({ message: 'Usuário inativo ou inexistente' });
    }

    return reply.send({ accessToken: signAccessToken({ sub: user.id }) });
  });

  // Tokens são stateless; o logout real acontece no cliente (descarta os
  // tokens). O endpoint existe pra registrar o encerramento de sessão.
  app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await writeAudit(app.prisma, request, {
      entity_type: 'User',
      entity_id: request.user!.id,
      action: 'LOGOUT',
    });
    return reply.code(204).send();
  });

  // Responde igual exista ou não o e-mail, pra não servir de teste de cadastro.
  app.post(
    '/auth/forgot-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { email } = forgotPasswordSchema.parse(request.body);
      const user = await app.prisma.user.findUnique({ where: { email } });

      if (user && user.status === 'ATIVO') {
        const token = generateToken();
        // Pedido novo invalida os links anteriores ainda não usados.
        await app.prisma.$transaction([
          app.prisma.passwordResetToken.updateMany({
            where: { user_id: user.id, used_at: null },
            data: { used_at: new Date() },
          }),
          app.prisma.passwordResetToken.create({
            data: {
              user_id: user.id,
              token_hash: hashToken(token),
              expires_at: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
            },
          }),
        ]);

        const link = `${env.APP_URL}/redefinir-senha?token=${token}`;
        if (env.RESEND_API_KEY) {
          await sendEmail({
            apiKey: env.RESEND_API_KEY,
            from: env.EMAIL_FROM,
            to: user.email,
            subject: 'Redefinição de senha — T4 Trips Manager',
            text:
              `Olá, ${user.name}.\n\n` +
              `Para criar uma nova senha, acesse o link abaixo (válido por ${RESET_TOKEN_MINUTES} minutos):\n\n` +
              `${link}\n\nSe você não pediu a troca, ignore este e-mail.`,
          }).catch((err) => request.log.error(err, 'falha ao enviar e-mail de recuperação'));
        } else {
          request.log.warn({ link }, 'RESEND_API_KEY ausente: link de recuperação só no log');
        }
      }

      return reply.send({ message: 'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.' });
    },
  );

  app.post(
    '/auth/reset-password',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { token, password } = resetPasswordSchema.parse(request.body);
      const record = await app.prisma.passwordResetToken.findUnique({
        where: { token_hash: hashToken(token) },
        include: { user: true },
      });

      if (!record || record.used_at || record.expires_at < new Date() || record.user.status !== 'ATIVO') {
        return reply.code(400).send({ message: 'Link inválido ou expirado. Peça um novo.' });
      }

      await app.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.update({ where: { id: record.id }, data: { used_at: new Date() } });
        await tx.user.update({
          where: { id: record.user_id },
          data: { password_hash: await hashPassword(password), failed_login_count: 0, locked_until: null },
        });
        // Sem sessão aqui; o próprio dono da conta fica como autor no log.
        const { id, email, name, role, can_view_sensitive } = record.user;
        request.user = { id, email, name, role, can_view_sensitive };
        await writeAudit(tx, request, {
          entity_type: 'User',
          entity_id: record.user_id,
          action: 'PASSWORD_RESET',
        });
      });

      return reply.send({ message: 'Senha alterada. Você já pode entrar.' });
    },
  );

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    return publicUser(user);
  });
}

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERADOR' | 'FINANCEIRO' | 'VISUALIZADOR';
  can_view_sensitive: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: permissionsFor(user),
  };
}
