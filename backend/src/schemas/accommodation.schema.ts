import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const roomType = z.enum(['INDIVIDUAL', 'CASAL', 'DUPLO', 'TRIPLO', 'QUADRUPLO', 'QUINTUPLO', 'SEXTUPLO', 'PERSONALIZADO']);

const accommodationFields = {
  name: z.string().trim().min(2, 'Informe o nome da pousada'),
  address: optionalText,
  city: optionalText,
  state: optionalText,
  phone: optionalText,
  email: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v.toLowerCase()))
    .nullable()
    .optional()
    .refine((v) => v == null || z.string().email().safeParse(v).success, 'E-mail inválido'),
  notes: optionalText,
};

export const createAccommodationSchema = z.object(accommodationFields);
export const updateAccommodationSchema = z.object({ ...accommodationFields, status: z.enum(['ATIVO', 'INATIVO']) }).partial();

const roomFields = {
  identifier: z.string().trim().min(1, 'Informe o número ou identificador do quarto').max(20),
  name: optionalText,
  room_type: roomType,
  capacity: z.number().int().min(1, 'Capacidade inválida').max(30),
  beds: z.number().int().min(1, 'Informe as camas').max(30),
  floor: optionalText,
  notes: optionalText,
};

export const createRoomSchema = z.object(roomFields);
export const updateRoomSchema = z.object({ ...roomFields, status: z.enum(['ATIVO', 'INATIVO']) }).partial();

export const addTripAccommodationSchema = z.object({
  accommodation_id: z.string().uuid('Escolha a pousada'),
  // Sem lista, entram todos os quartos ativos.
  room_ids: z.array(z.string().uuid()).optional(),
  notes: optionalText,
});

export const addTripRoomsSchema = z.object({ room_ids: z.array(z.string().uuid()).min(1) });

export const updateTripRoomSchema = z
  .object({
    capacity_override: z.number().int().min(1).max(30).nullable(),
    notes: optionalText,
    status: z.enum(['ATIVO', 'INATIVO']),
  })
  .partial();

export const updateTripAccommodationSchema = z.object({ notes: optionalText, status: z.enum(['ATIVO', 'INATIVO']) }).partial();

export const assignRoomSchema = z.object({
  trip_room_id: z.string().uuid(),
  // CA-008: quem já está em outro quarto só muda com transferência explícita.
  transfer: z.boolean().default(false),
});

export const addGuestsSchema = z.object({
  reservation_ids: z.array(z.string().uuid()).min(1).max(30),
  transfer: z.boolean().default(false),
});
