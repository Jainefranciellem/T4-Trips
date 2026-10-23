import { createHash, randomBytes } from 'node:crypto';

// Token opaco pra links (recuperação de senha, link do passageiro): 32 bytes
// aleatórios, sem nada derivado de ID, nome ou CPF (RN-012).
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// No banco fica só o hash; quem lê o banco não consegue montar o link.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
