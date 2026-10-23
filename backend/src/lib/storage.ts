import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const URL_TTL_SECONDS = 5 * 60;

// spec 9.1: só comprovantes em PDF ou imagem. O tipo é conferido pelos
// primeiros bytes, não pelo nome nem pelo Content-Type do navegador.
const signatures: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

export function detectFileType(buffer: Buffer) {
  return signatures.find((s) => s.test(buffer)) ?? null;
}

export const checksumOf = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

export const newStorageKey = (ext: string) => {
  const now = new Date();
  return `receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
};

interface Storage {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  // Link temporário pra baixar (spec 9.1: URLs temporárias).
  downloadUrl(key: string, filename: string, mime: string): Promise<string>;
}

// ---- modo local (desenvolvimento e testes) ----
const sign = (key: string, exp: number) => createHmac('sha256', env.JWT_SECRET).update(`${key}:${exp}`).digest('base64url');

export function verifyLocalSignature(key: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(key, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function localPath(key: string) {
  const root = path.resolve(env.STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Chave de arquivo inválida');
  return full;
}

export const readLocal = (key: string) => readFile(localPath(key));

const localStorage: Storage = {
  async put(key, body) {
    const full = localPath(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  },
  async downloadUrl(key, filename) {
    const exp = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS;
    const q = new URLSearchParams({ key, exp: String(exp), sig: sign(key, exp), name: filename });
    return `${env.API_URL}/files/download?${q}`;
  },
};

// ---- Cloudflare R2 (S3) ----
let client: S3Client | null = null;
const s3 = () =>
  (client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  }));

const s3Storage: Storage = {
  async put(key, body, mime) {
    await s3().send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: mime }));
  },
  async downloadUrl(key, filename, mime) {
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ResponseContentType: mime,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(filename)}"`,
    });
    return getSignedUrl(s3(), command, { expiresIn: URL_TTL_SECONDS });
  },
};

export const storage: Storage = env.STORAGE_DRIVER === 's3' ? s3Storage : localStorage;
