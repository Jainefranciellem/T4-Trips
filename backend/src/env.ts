import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3333),
  // Aceita várias origens separadas por vírgula.
  CORS_ORIGIN: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  // Endereço do frontend, usado nos links enviados por e-mail.
  APP_URL: z.string().url().default('http://localhost:8080'),
  // Sem RESEND_API_KEY o link de recuperação de senha só sai no log (dev).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('T4 Trips <nao-responda@t4trips.com.br>'),
});

export const env = envSchema.parse(process.env);
