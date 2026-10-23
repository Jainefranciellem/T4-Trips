import { z } from 'zod';
import { isValidCpf, normalizeCpf } from '../lib/cpf.js';

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const optionalCpf = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : normalizeCpf(v)))
  .nullable()
  .optional()
  .refine((v) => v == null || isValidCpf(v), 'CPF inválido');

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || !Number.isNaN(Date.parse(v)), 'Data inválida');

export const customerFields = {
  full_name: z.string().trim().min(2, 'Informe o nome completo'),
  cpf: optionalCpf,
  birth_date: optionalDate,
  whatsapp: optionalText,
  phone: optionalText,
  email: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v.toLowerCase()))
    .nullable()
    .optional()
    .refine((v) => v == null || z.string().email().safeParse(v).success, 'E-mail inválido'),
  city: optionalText,
  state: optionalText,
  emergency_contact_name: optionalText,
  emergency_contact_phone: optionalText,
  guardian_name: optionalText,
  guardian_phone: optionalText,
  notes: optionalText,
};

export const createCustomerSchema = z.object({
  ...customerFields,
  // RN-001: duplicidade por nome/telefone/e-mail nunca é criada sem confirmação.
  confirm_duplicate: z.boolean().default(false),
});

export const updateCustomerSchema = z.object(customerFields).partial();

export const listCustomersQuery = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['ATIVO', 'ARQUIVADO', 'TODOS']).default('ATIVO'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(30),
});
