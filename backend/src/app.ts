import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from './env.js';
import { prismaPlugin } from './plugins/prisma.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { customersRoutes } from './routes/customers.routes.js';
import { tripsRoutes } from './routes/trips.routes.js';
import { reservationsRoutes } from './routes/reservations.routes.js';
import { vehiclesRoutes } from './routes/vehicles.routes.js';
import { transportRoutes } from './routes/transport.routes.js';
import { accommodationsRoutes } from './routes/accommodations.routes.js';
import { filesRoutes } from './routes/files.routes.js';
import { financeRoutes } from './routes/finance.routes.js';
import { expensesRoutes } from './routes/expenses.routes.js';
import { pricingRoutes } from './routes/pricing.routes.js';
import { itineraryRoutes } from './routes/itinerary.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { customerExtrasRoutes } from './routes/customer-extras.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // O site lê o nome do arquivo dos relatórios.
    exposedHeaders: ['Content-Disposition'],
  });
  // Sem limite global; as rotas sensíveis (login, link público) declaram o seu.
  await app.register(rateLimit, { global: false });
  await app.register(prismaPlugin);

  // Must be set before registering route plugins: Fastify snapshots the error
  // handler at register() time for each encapsulated context, so setting it
  // afterwards would not apply to routes registered above it.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        message: error.issues[0]?.message ?? 'Dados inválidos',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.code(409).send({ message: 'Registro já existe (conflito de chave única)' });
    }

    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({ message: 'Muitas requisições. Tente novamente em instantes.' });
    }

    app.log.error(error);
    return reply.code(500).send({ message: 'Erro interno do servidor' });
  });

  // Cabeçalhos de segurança em todas as respostas (spec 10.1). A API só devolve
  // JSON e arquivos; nada dela deve abrir dentro de outro site.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    if (process.env.NODE_ENV === 'production') reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(customersRoutes);
  await app.register(tripsRoutes);
  await app.register(reservationsRoutes);
  await app.register(vehiclesRoutes);
  await app.register(transportRoutes);
  await app.register(accommodationsRoutes);
  await app.register(filesRoutes);
  await app.register(financeRoutes);
  await app.register(expensesRoutes);
  await app.register(pricingRoutes);
  await app.register(itineraryRoutes);
  await app.register(reportsRoutes);
  await app.register(customerExtrasRoutes);

  return app;
}
