import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const SEAT_TYPES = ['NORMAL', 'SEMI_LEITO', 'LEITO', 'EXECUTIVO', 'ESPECIAL'] as const;

const seat = z.object({
  floor: z.number().int().min(1).max(2),
  row: z.number().int().min(0).max(39),
  col: z.number().int().min(0).max(7),
  number: z.string().trim().min(1, 'Assento sem número').max(6),
  type: z.enum(SEAT_TYPES).default('NORMAL'),
  accessible: z.boolean().default(false),
  blocked: z.boolean().default(false),
});

// spec 6.11: número, posição, andar, corredor (colunas vazias), tipo,
// acessibilidade e bloqueio padrão de cada assento.
export const layoutDataSchema = z
  .object({
    floors: z
      .array(z.object({ floor: z.number().int().min(1).max(2), rows: z.number().int().min(1).max(40), cols: z.number().int().min(1).max(8) }))
      .min(1)
      .max(2),
    seats: z.array(seat).min(1, 'O layout precisa de pelo menos um assento').max(120),
  })
  .superRefine((data, ctx) => {
    const floors = new Map(data.floors.map((f) => [f.floor, f]));
    const numbers = new Set<string>();
    const positions = new Set<string>();
    data.seats.forEach((s, i) => {
      const f = floors.get(s.floor);
      if (!f || s.row >= f.rows || s.col >= f.cols) {
        ctx.addIssue({ code: 'custom', path: ['seats', i], message: `Assento ${s.number} fora da grade` });
      }
      const key = s.number.toUpperCase();
      if (numbers.has(key)) ctx.addIssue({ code: 'custom', path: ['seats', i], message: `Número de assento repetido: ${s.number}` });
      numbers.add(key);
      const pos = `${s.floor}:${s.row}:${s.col}`;
      if (positions.has(pos)) ctx.addIssue({ code: 'custom', path: ['seats', i], message: 'Dois assentos na mesma posição' });
      positions.add(pos);
    });
  });

export type LayoutData = z.infer<typeof layoutDataSchema>;

const category = z.enum(['VAN', 'MICRO_ONIBUS', 'ONIBUS_CONVENCIONAL', 'ONIBUS_EXECUTIVO', 'ONIBUS_LD', 'ONIBUS_LDD', 'PERSONALIZADO']);

export const createVehicleTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do veículo'),
  category,
  code: optionalText,
  aisle_config: optionalText,
  description: optionalText,
  // O primeiro layout nasce junto e vira o padrão.
  layout: z.object({ name: z.string().trim().min(1).default('Padrão'), layout_data: layoutDataSchema }),
});

export const updateVehicleTemplateSchema = z
  .object({
    name: z.string().trim().min(2),
    category,
    code: optionalText,
    aisle_config: optionalText,
    description: optionalText,
    status: z.enum(['ATIVO', 'INATIVO']),
  })
  .partial();

export const createLayoutSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do layout'),
  layout_data: layoutDataSchema,
  is_default: z.boolean().default(false),
});

export const updateLayoutSchema = z
  .object({ name: z.string().trim().min(1), layout_data: layoutDataSchema, is_default: z.literal(true) })
  .partial();

export const addTripVehicleSchema = z.object({
  seat_layout_id: z.string().uuid('Escolha o layout'),
  operational_name: z.string().trim().min(1, 'Informe o nome do veículo na viagem'),
  identifier: optionalText,
  driver_name: optionalText,
  operational_capacity: z.number().int().positive().optional(),
  notes: optionalText,
});

export const updateTripVehicleSchema = z
  .object({
    operational_name: z.string().trim().min(1),
    identifier: optionalText,
    driver_name: optionalText,
    operational_capacity: z.number().int().positive(),
    notes: optionalText,
    status: z.enum(['ATIVO', 'INATIVO']),
  })
  .partial();

export const assignSeatSchema = z.object({
  trip_seat_id: z.string().uuid(),
  // RN-004: assento de destino ocupado só com troca explícita.
  swap: z.boolean().default(false),
});

export const blockSeatSchema = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo do bloqueio'),
});
