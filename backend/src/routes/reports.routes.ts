import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAudit } from '../lib/audit.js';
import { hasPermission } from '../lib/permissions.js';
import { reportDefinitions } from '../lib/reports/definitions.js';
import { fileName, type ReportMeta } from '../lib/reports/model.js';
import { renderCsv, renderPdf, renderXlsx } from '../lib/reports/render.js';
import { requireAuth, requirePermission, type AuthUser } from '../middleware/auth.js';
import { tripScope } from './trips.routes.js';

const querySchema = z.object({
  format: z.enum(['pdf', 'csv', 'xlsx']).default('pdf'),
  status: z.string().optional(),
  vehicle_id: z.string().uuid().optional(),
  accommodation_id: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  internal: z.enum(['0', '1']).optional(),
});

const contentType = {
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// RF-022: relatórios financeiros só pra quem tem reports.financial.
const allowed = (user: AuthUser) => reportDefinitions.filter((d) => !d.financial || hasPermission(user, 'reports.financial'));

const fmt = (d: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get<{ Params: { id: string } }>('/trips/:id/reports', { preHandler: requirePermission('reports.read') }, async (request, reply) => {
    const trip = await app.prisma.trip.findFirst({ where: { id: request.params.id, ...tripScope(request.user!) } });
    if (!trip) return reply.code(404).send({ message: 'Viagem não encontrada' });
    const [vehicles, accommodations] = await Promise.all([
      app.prisma.tripVehicle.findMany({ where: { trip_id: trip.id }, select: { id: true, operational_name: true }, orderBy: { sort_order: 'asc' } }),
      app.prisma.tripAccommodation.findMany({ where: { trip_id: trip.id }, select: { id: true, accommodation: { select: { name: true } } } }),
    ]);
    return {
      reports: allowed(request.user!).map(({ slug, title, description, financial, filters }) => ({ slug, title, description, financial, filters: filters ?? [] })),
      options: {
        vehicles: vehicles.map((v) => ({ id: v.id, name: v.operational_name })),
        accommodations: accommodations.map((a) => ({ id: a.id, name: a.accommodation.name })),
      },
    };
  });

  app.get<{ Params: { id: string; slug: string } }>('/trips/:id/reports/:slug', { preHandler: requirePermission('reports.read') }, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const user = request.user!;
    const definition = reportDefinitions.find((d) => d.slug === request.params.slug);
    if (!definition) return reply.code(404).send({ message: 'Relatório não encontrado' });
    if (definition.financial && !hasPermission(user, 'reports.financial')) {
      return reply.code(403).send({ message: 'Você não tem permissão para relatórios financeiros' });
    }
    const trip = await app.prisma.trip.findFirst({ where: { id: request.params.id, ...tripScope(user) } });
    if (!trip) return reply.code(404).send({ message: 'Viagem não encontrada' });

    const { report, filters } = await definition.build({ prisma: app.prisma, trip, user, query });
    const meta: ReportMeta = {
      tripName: trip.name,
      tripSubtitle: `${trip.destination} · ${fmt(trip.departure_at)} a ${fmt(trip.return_at)}`,
      generatedBy: user.name,
      generatedAt: new Date(),
      filters,
    };
    const body = query.format === 'pdf' ? await renderPdf(report, meta) : query.format === 'csv' ? renderCsv(report) : await renderXlsx(report, meta);

    // Exportação fica registrada (spec 10.1: operações sensíveis).
    await writeAudit(app.prisma, request, {
      entity_type: 'Trip',
      entity_id: trip.id,
      action: 'REPORT_EXPORT',
      new_values: { report: definition.slug, format: query.format, filters },
    });
    return reply
      .header('Content-Type', contentType[query.format])
      .header('Content-Disposition', `${query.format === 'pdf' ? 'inline' : 'attachment'}; filename="${fileName(definition.slug, trip.name, query.format)}"`)
      .header('Cache-Control', 'private, no-store')
      .send(body);
  });
}
