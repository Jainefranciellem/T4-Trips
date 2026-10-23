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
  // Comprovantes: "s3" usa o Cloudflare R2 (API compatível com S3); "local"
  // grava numa pasta, pra desenvolvimento e testes.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('storage'),
  // Endereço público desta API, usado nos links temporários do modo local.
  API_URL: z.string().url().default('http://localhost:3333'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
});

export const env = envSchema
  .refine(
    (e) => e.STORAGE_DRIVER !== 's3' || (e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET),
    'STORAGE_DRIVER=s3 exige R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET',
  )
  .parse(process.env);
