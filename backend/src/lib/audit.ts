import type { FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';

interface AuditEntry {
  entity_type: string;
  entity_id: string;
  action: string;
  old_values?: unknown;
  new_values?: unknown;
  reason?: string | null;
}

type Db = PrismaClient | Prisma.TransactionClient;

// Passe `tx` quando a mudança auditada roda dentro de uma transação, pra o log
// entrar e sair junto com ela.
export async function writeAudit(db: Db, request: FastifyRequest, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      user_id: request.user?.id ?? null,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      old_values: (entry.old_values ?? undefined) as Prisma.InputJsonValue | undefined,
      new_values: (entry.new_values ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: entry.reason ?? null,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] ?? null,
    },
  });
}

// Só os campos que mudaram — mantém o log legível.
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const old_values: Record<string, unknown> = {};
  const new_values: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      old_values[key] = a;
      new_values[key] = b;
    }
  }
  return { old_values, new_values, changed: Object.keys(new_values).length > 0 };
}
