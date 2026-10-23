import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/hash.js';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@t4trips.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrador';

  if (!password) throw new Error('Defina SEED_ADMIN_PASSWORD para criar o administrador inicial');

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role: 'ADMIN', password_hash: await hashPassword(password) },
  });
  console.log(`Administrador pronto: ${email}`);
}

main().finally(() => prisma.$disconnect());
