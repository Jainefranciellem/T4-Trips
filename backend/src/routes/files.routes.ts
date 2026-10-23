import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { env } from '../env.js';
import { hasPermission } from '../lib/permissions.js';
import { writeAudit } from '../lib/audit.js';
import {
  MAX_FILE_BYTES,
  URL_TTL_SECONDS,
  checksumOf,
  detectFileType,
  newStorageKey,
  readLocal,
  storage,
  verifyLocalSignature,
} from '../lib/storage.js';
import { requireAuth } from '../middleware/auth.js';

// Comprovantes de pagamento e de despesa (spec 9.1).
export async function filesRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 } });

  app.post('/files', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    if (!hasPermission(user, 'finance.write') && !hasPermission(user, 'expenses.write')) {
      return reply.code(403).send({ message: 'Você não tem permissão para esta ação' });
    }

    const part = await request.file();
    if (!part) return reply.code(400).send({ message: 'Envie o arquivo do comprovante' });
    const buffer = await part.toBuffer().catch(() => null);
    if (!buffer || part.file.truncated) {
      return reply.code(413).send({ message: `O arquivo passa de ${MAX_FILE_BYTES / 1024 / 1024} MB` });
    }
    const type = detectFileType(buffer);
    if (!type) return reply.code(415).send({ message: 'Envie um PDF ou uma imagem (JPG, PNG ou WEBP)' });

    const key = newStorageKey(type.ext);
    await storage.put(key, buffer, type.mime);
    const file = await app.prisma.storedFile.create({
      data: {
        storage_key: key,
        original_name: (part.filename || `comprovante.${type.ext}`).slice(0, 200),
        mime_type: type.mime,
        size: buffer.length,
        checksum: checksumOf(buffer),
        uploaded_by: user.id,
      },
    });
    await writeAudit(app.prisma, request, { entity_type: 'File', entity_id: file.id, action: 'UPLOAD', new_values: { name: file.original_name, size: file.size } });
    return reply.code(201).send({ id: file.id, original_name: file.original_name, mime_type: file.mime_type, size: file.size });
  });

  // Link temporário. Quem vê o financeiro abre qualquer comprovante; os demais
  // só os que enviaram.
  app.get<{ Params: { id: string } }>('/files/:id/url', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const file = await app.prisma.storedFile.findUnique({ where: { id: request.params.id } });
    if (!file || file.deleted_at || (!hasPermission(user, 'finance.read') && file.uploaded_by !== user.id)) {
      return reply.code(404).send({ message: 'Arquivo não encontrado' });
    }
    return { url: await storage.downloadUrl(file.storage_key, file.original_name, file.mime_type), expires_in: URL_TTL_SECONDS };
  });

  // Só no modo local: entrega o arquivo de um link assinado e ainda válido.
  app.get<{ Querystring: { key?: string; exp?: string; sig?: string; name?: string } }>('/files/download', async (request, reply) => {
    if (env.STORAGE_DRIVER !== 'local') return reply.code(404).send({ message: 'Arquivo não encontrado' });
    const { key = '', exp = '', sig = '', name = 'arquivo' } = request.query;
    if (!verifyLocalSignature(key, Number(exp), sig)) return reply.code(403).send({ message: 'Link expirado ou inválido' });
    const file = await app.prisma.storedFile.findUnique({ where: { storage_key: key } });
    if (!file || file.deleted_at) return reply.code(404).send({ message: 'Arquivo não encontrado' });
    const body = await readLocal(key);
    return reply
      .header('Content-Type', file.mime_type)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .send(body);
  });
}
