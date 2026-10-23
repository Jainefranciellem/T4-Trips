import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const dateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida')
  .transform((v) => new Date(v));

// CA-001: bloquear nome/destino vazios, datas inválidas, retorno antes da saída,
// capacidade <= 0 e valor em formato inválido (centavos inteiros, >= 0).
const baseTrip = z.object({
  name: z.string().trim().min(1, 'Informe o nome da viagem'),
  destination: z.string().trim().min(1, 'Informe o destino'),
  departure_at: dateTime,
  return_at: dateTime,
  departure_location: z.string().trim().min(1, 'Informe o local de embarque'),
  commercial_capacity: z.number().int('Capacidade inválida').positive('A capacidade deve ser maior que zero'),
  default_package_price: z.number().int('Valor inválido').min(0, 'Valor inválido'),
  status: z.enum(['PLANEJADA', 'ABERTA', 'LOTADA', 'EM_ANDAMENTO', 'CONCLUIDA']).default('PLANEJADA'),
  description: optionalText,
  included_services: optionalText,
  optional_services: optionalText,
  internal_notes: optionalText,
  public_instructions: optionalText,
  cancellation_policy: optionalText,
  cover_image_url: optionalText,
  waitlist_enabled: z.boolean().default(false),
  pending_holds_seat: z.boolean().default(true),
  reservation_ttl_hours: z.number().int().positive().nullable().optional(),
});

const returnAfterDeparture = (v: { departure_at?: Date; return_at?: Date }) =>
  !v.departure_at || !v.return_at || v.return_at > v.departure_at;

export const createTripSchema = baseTrip.refine(returnAfterDeparture, {
  message: 'O retorno deve ser posterior à saída',
  path: ['return_at'],
});

export const updateTripSchema = baseTrip.partial().refine(returnAfterDeparture, {
  message: 'O retorno deve ser posterior à saída',
  path: ['return_at'],
});

export const listTripsQuery = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['PLANEJADA', 'ABERTA', 'LOTADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA', 'ARQUIVADA']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo').optional(),
});

export const setTripUsersSchema = z.object({
  users: z.array(
    z.object({
      user_id: z.string().uuid(),
      access_level: z.enum(['VISUALIZAR', 'OPERAR']).default('OPERAR'),
    }),
  ),
});
