import type { ManualReservationStatus, ReservationStatus, Role, TripGroup, TripStatus } from '@/types';

export const tripStatusLabel: Record<TripStatus, string> = {
  PLANEJADA: 'Planejada',
  ABERTA: 'Aberta para reservas',
  LOTADA: 'Lotada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  ARQUIVADA: 'Arquivada',
};

export const tripStatusVariant: Record<
  TripStatus,
  'info' | 'success' | 'warning' | 'attended' | 'cancelled' | 'missed'
> = {
  PLANEJADA: 'info',
  ABERTA: 'success',
  LOTADA: 'warning',
  EM_ANDAMENTO: 'attended',
  CONCLUIDA: 'cancelled',
  CANCELADA: 'missed',
  ARQUIVADA: 'cancelled',
};

// Status que dá pra escolher à mão no formulário. Cancelar e arquivar são ações.
export const editableTripStatuses: TripStatus[] = [
  'PLANEJADA',
  'ABERTA',
  'LOTADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
];

export const tripGroupLabel: Record<TripGroup, string> = {
  futuras: 'Futuras',
  em_andamento: 'Em andamento',
  concluidas: 'Concluídas',
  arquivadas: 'Arquivadas',
  canceladas: 'Canceladas',
};

export const roleLabel: Record<Role, string> = {
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
  FINANCEIRO: 'Financeiro',
  VISUALIZADOR: 'Visualizador',
};

export const reservationStatusLabel: Record<ReservationStatus, string> = {
  PRE_RESERVA: 'Pré-reserva',
  RESERVADA: 'Reservada',
  CONFIRMADA: 'Confirmada',
  PARCIALMENTE_PAGA: 'Parcialmente paga',
  PAGA: 'Paga',
  ATRASADA: 'Atrasada',
  CANCELADA: 'Cancelada',
  REEMBOLSADA: 'Reembolsada',
  LISTA_ESPERA: 'Lista de espera',
};

export const reservationStatusVariant: Record<
  ReservationStatus,
  'info' | 'success' | 'warning' | 'attended' | 'cancelled' | 'missed'
> = {
  PRE_RESERVA: 'warning',
  RESERVADA: 'info',
  CONFIRMADA: 'success',
  PARCIALMENTE_PAGA: 'attended',
  PAGA: 'success',
  ATRASADA: 'missed',
  CANCELADA: 'cancelled',
  REEMBOLSADA: 'cancelled',
  LISTA_ESPERA: 'attended',
};

// Os demais status vêm dos pagamentos ou do cancelamento.
export const manualReservationStatuses: ManualReservationStatus[] = ['PRE_RESERVA', 'RESERVADA', 'CONFIRMADA', 'LISTA_ESPERA'];

// Resumo da seção 3 da spec, mostrado ao escolher o perfil.
export const roleDescription: Record<Role, string> = {
  ADMIN: 'Acesso total, inclusive usuários, permissões e financeiro.',
  OPERADOR: 'Clientes, passageiros, assentos, quartos e registro de pagamentos nas viagens autorizadas.',
  FINANCEIRO: 'Pagamentos, despesas, dashboards e relatórios financeiros das viagens autorizadas.',
  VISUALIZADOR: 'Só consulta as viagens autorizadas, sem editar e sem dados financeiros.',
};

// Módulos de uma viagem (RF-004). `ready` marca os já implementados.
export const tripModules = [
  { key: 'resumo', label: 'Resumo', ready: true },
  { key: 'passageiros', label: 'Passageiros', ready: true },
  { key: 'transporte', label: 'Transporte e assentos', ready: false },
  { key: 'pousadas', label: 'Pousadas e quartos', ready: false },
  { key: 'reservas', label: 'Reservas', ready: true },
  { key: 'pagamentos', label: 'Pagamentos', ready: false },
  { key: 'despesas', label: 'Despesas', ready: false },
  { key: 'financeiro', label: 'Dashboard financeiro', ready: false },
  { key: 'simulador', label: 'Simulador de preços', ready: false },
  { key: 'roteiro', label: 'Roteiro', ready: false },
  { key: 'relatorios', label: 'Relatórios', ready: false },
  { key: 'configuracoes', label: 'Configurações da viagem', ready: true },
] as const;

export const brazilStates = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];
