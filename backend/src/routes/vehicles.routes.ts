import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  createLayoutSchema,
  createVehicleTemplateSchema,
  updateLayoutSchema,
  updateVehicleTemplateSchema,
  type LayoutData,
} from '../schemas/vehicle.schema.js';
import { diffFields, writeAudit } from '../lib/audit.js';
import { layoutCapacity } from '../lib/seat-rules.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

type IdParams = { Params: { id: string } };

const floorsOf = (layout: LayoutData) => layout.floors.length;

// Capacidade e andares do modelo acompanham o layout padrão.
async function syncTemplateWithDefault(tx: Prisma.TransactionClient, templateId: string) {
  const def = await tx.seatLayout.findFirst({ where: { vehicle_template_id: templateId, is_default: true } });
  if (!def) return;
  const data = def.layout_data as unknown as LayoutData;
  await tx.vehicleTemplate.update({
    where: { id: templateId },
    data: { capacity: layoutCapacity(data), floors: floorsOf(data) },
  });
}

export async function vehiclesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // Leitura liberada pra quem opera viagens (precisa escolher o veículo).
  app.get('/vehicle-templates', { preHandler: requirePermission('trips.read') }, async () => {
    return app.prisma.vehicleTemplate.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: { layouts: { orderBy: [{ is_default: 'desc' }, { name: 'asc' }] } },
    });
  });

  app.post('/vehicle-templates', { preHandler: requirePermission('vehicles.manage') }, async (request, reply) => {
    const { layout, ...input } = createVehicleTemplateSchema.parse(request.body);
    const template = await app.prisma.$transaction(async (tx) => {
      const t = await tx.vehicleTemplate.create({
        data: {
          ...input,
          capacity: layoutCapacity(layout.layout_data),
          floors: floorsOf(layout.layout_data),
          layouts: {
            create: { name: layout.name, layout_data: layout.layout_data as unknown as Prisma.InputJsonValue, is_default: true },
          },
        },
        include: { layouts: true },
      });
      await writeAudit(tx, request, {
        entity_type: 'VehicleTemplate',
        entity_id: t.id,
        action: 'CREATE',
        new_values: { name: t.name, category: t.category, capacity: t.capacity },
      });
      return t;
    });
    return reply.code(201).send(template);
  });

  app.patch<IdParams>('/vehicle-templates/:id', { preHandler: requirePermission('vehicles.manage') }, async (request, reply) => {
    const changes = updateVehicleTemplateSchema.parse(request.body);
    const existing = await app.prisma.vehicleTemplate.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.code(404).send({ message: 'Veículo não encontrado' });

    const { old_values, new_values, changed } = diffFields(
      existing as unknown as Record<string, unknown>,
      changes as Record<string, unknown>,
    );
    const template = await app.prisma.vehicleTemplate.update({
      where: { id: existing.id },
      data: changes,
      include: { layouts: { orderBy: [{ is_default: 'desc' }, { name: 'asc' }] } },
    });
    if (changed) {
      await writeAudit(app.prisma, request, { entity_type: 'VehicleTemplate', entity_id: existing.id, action: 'UPDATE', old_values, new_values });
    }
    return template;
  });

  app.get<IdParams>('/vehicle-templates/:id/layouts', { preHandler: requirePermission('trips.read') }, async (request) => {
    return app.prisma.seatLayout.findMany({
      where: { vehicle_template_id: request.params.id },
      orderBy: [{ is_default: 'desc' }, { name: 'asc' }],
    });
  });

  app.post<IdParams>('/vehicle-templates/:id/layouts', { preHandler: requirePermission('vehicles.manage') }, async (request, reply) => {
    const input = createLayoutSchema.parse(request.body);
    const template = await app.prisma.vehicleTemplate.findUnique({ where: { id: request.params.id } });
    if (!template) return reply.code(404).send({ message: 'Veículo não encontrado' });

    const layout = await app.prisma.$transaction(async (tx) => {
      if (input.is_default) {
        await tx.seatLayout.updateMany({ where: { vehicle_template_id: template.id }, data: { is_default: false } });
      }
      const l = await tx.seatLayout.create({
        data: {
          vehicle_template_id: template.id,
          name: input.name,
          layout_data: input.layout_data as unknown as Prisma.InputJsonValue,
          is_default: input.is_default,
        },
      });
      await syncTemplateWithDefault(tx, template.id);
      await writeAudit(tx, request, { entity_type: 'SeatLayout', entity_id: l.id, action: 'CREATE', new_values: { name: l.name } });
      return l;
    });
    return reply.code(201).send(layout);
  });

  // Editar gera nova versão. Viagens que já usam o layout guardaram a cópia
  // dos assentos e não mudam.
  app.patch<IdParams>('/seat-layouts/:id', { preHandler: requirePermission('vehicles.manage') }, async (request, reply) => {
    const changes = updateLayoutSchema.parse(request.body);
    const existing = await app.prisma.seatLayout.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.code(404).send({ message: 'Layout não encontrado' });

    const layout = await app.prisma.$transaction(async (tx) => {
      if (changes.is_default) {
        await tx.seatLayout.updateMany({ where: { vehicle_template_id: existing.vehicle_template_id }, data: { is_default: false } });
      }
      const l = await tx.seatLayout.update({
        where: { id: existing.id },
        data: {
          ...(changes.name ? { name: changes.name } : {}),
          ...(changes.is_default ? { is_default: true } : {}),
          ...(changes.layout_data
            ? { layout_data: changes.layout_data as unknown as Prisma.InputJsonValue, version: existing.version + 1 }
            : {}),
        },
      });
      await syncTemplateWithDefault(tx, existing.vehicle_template_id);
      await writeAudit(tx, request, {
        entity_type: 'SeatLayout',
        entity_id: l.id,
        action: 'UPDATE',
        old_values: { version: existing.version },
        new_values: { version: l.version, name: l.name, is_default: l.is_default },
      });
      return l;
    });
    return layout;
  });

  app.post<IdParams>('/seat-layouts/:id/duplicate', { preHandler: requirePermission('vehicles.manage') }, async (request, reply) => {
    const source = await app.prisma.seatLayout.findUnique({ where: { id: request.params.id } });
    if (!source) return reply.code(404).send({ message: 'Layout não encontrado' });
    const layout = await app.prisma.seatLayout.create({
      data: {
        vehicle_template_id: source.vehicle_template_id,
        name: `${source.name} (cópia)`,
        layout_data: source.layout_data as Prisma.InputJsonValue,
        is_default: false,
      },
    });
    await writeAudit(app.prisma, request, {
      entity_type: 'SeatLayout',
      entity_id: layout.id,
      action: 'DUPLICATE',
      new_values: { source_layout_id: source.id },
    });
    return reply.code(201).send(layout);
  });
}
