import type { Role, TripStatus } from '@prisma/client';

// Status que o usuário pode escolher à mão. CANCELADA e ARQUIVADA têm ações
// próprias (cancelar/arquivar) porque exigem efeitos colaterais e auditoria.
export const MANUAL_TRIP_STATUSES: TripStatus[] = [
  'PLANEJADA',
  'ABERTA',
  'LOTADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
];

export function canCancelTrip(status: TripStatus): boolean {
  return status !== 'CANCELADA' && status !== 'ARQUIVADA' && status !== 'CONCLUIDA';
}

export function canArchiveTrip(status: TripStatus): boolean {
  return status !== 'ARQUIVADA';
}

// RN-015: viagens concluídas ficam consultáveis; edição limitada. Só ADMIN edita.
export function canEditTrip(status: TripStatus, role: Role): boolean {
  if (status === 'CANCELADA' || status === 'ARQUIVADA') return false;
  if (status === 'CONCLUIDA') return role === 'ADMIN';
  return true;
}

// Agrupa os status nas colunas do dashboard "Minhas Trips" (RF-002).
export type TripGroup = 'futuras' | 'em_andamento' | 'concluidas' | 'arquivadas' | 'canceladas';

export function tripGroup(status: TripStatus): TripGroup {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'em_andamento';
    case 'CONCLUIDA':
      return 'concluidas';
    case 'ARQUIVADA':
      return 'arquivadas';
    case 'CANCELADA':
      return 'canceladas';
    default:
      return 'futuras';
  }
}

export interface TripSummary {
  passengers: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  waitlist: number;
  available_seats: number;
  // Valores em centavos. Só preenchidos pra quem tem finance.read.
  revenue_received: number | null;
  revenue_pending: number | null;
}

// Ainda não há reservas (próxima fase): tudo zerado e as vagas livres iguais à
// capacidade comercial. Ao implementar reservas, só esta função muda.
export function emptyTripSummary(commercialCapacity: number, includeFinance: boolean): TripSummary {
  return {
    passengers: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    waitlist: 0,
    available_seats: commercialCapacity,
    revenue_received: includeFinance ? 0 : null,
    revenue_pending: includeFinance ? 0 : null,
  };
}
