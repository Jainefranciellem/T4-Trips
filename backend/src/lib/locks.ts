import type { Prisma } from '@prisma/client';

// Serializa as operações que mexem em vagas e assentos da mesma viagem: duas
// pessoas pegando a última vaga (ou o mesmo assento) ao mesmo tempo não
// passam juntas (RNF-004). Vale até o fim da transação.
export async function lockTrip(tx: Prisma.TransactionClient, tripId: string) {
  await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
}
