import { z } from 'zod';

const role = z.enum(['ADMIN', 'OPERADOR', 'FINANCEIRO', 'VISUALIZADOR']);

export const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
  role,
  can_view_sensitive: z.boolean().default(false),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2),
    role,
    status: z.enum(['ATIVO', 'INATIVO']),
    can_view_sensitive: z.boolean(),
    password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
  })
  .partial();
