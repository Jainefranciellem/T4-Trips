import type { Role, TripStatus } from '@/types';

// Espelho das regras de backend/src/lib/trip-rules.ts, só pra esconder ações
// que a API recusaria. A API continua sendo quem decide.
export const canCancelTrip = (s: TripStatus) => s !== 'CANCELADA' && s !== 'ARQUIVADA' && s !== 'CONCLUIDA';
export const canArchiveTrip = (s: TripStatus) => s !== 'ARQUIVADA';

export function canEditTrip(s: TripStatus, role: Role) {
  if (s === 'CANCELADA' || s === 'ARQUIVADA') return false;
  if (s === 'CONCLUIDA') return role === 'ADMIN';
  return true;
}
