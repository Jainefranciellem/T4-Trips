import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/hash.js';

const prisma = new PrismaClient();

// Categorias iniciais de despesa (RF-017). A migração já cria; o seed garante
// que existam mesmo num banco restaurado de um backup antigo.
const CATEGORIES = [
  'Transporte principal',
  'Transfer local',
  'Hospedagem',
  'Café da manhã',
  'Alimentação',
  'Passeios inclusos',
  'Passeios opcionais',
  'Fotografia e filmagem',
  'Brindes e sorteios',
  'Equipe e guias',
  'Motoristas',
  'Publicidade',
  'Taxas',
  'Outros',
];

async function main() {
  for (const name of CATEGORIES) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name, is_system: true } });
  }

  // Perfis (Admin, Operador, Financeiro, Visualizador) são fixos no código
  // (src/lib/permissions.ts); aqui só nasce o primeiro administrador.
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@t4trips.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrador';
  if (!password) throw new Error('Defina SEED_ADMIN_PASSWORD para criar o administrador inicial');
  if (password.length < 8) throw new Error('SEED_ADMIN_PASSWORD precisa de ao menos 8 caracteres');

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role: 'ADMIN', password_hash: await hashPassword(password) },
  });
  console.log(`Categorias prontas e administrador pronto: ${email}`);
}

main().finally(() => prisma.$disconnect());
