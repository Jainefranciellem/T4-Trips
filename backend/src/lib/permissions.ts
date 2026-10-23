import type { Role } from '@prisma/client';

export const PERMISSIONS = [
  'users.manage',
  'customers.read',
  'customers.write',
  'customers.archive',
  'trips.read',
  'trips.write',
  'trips.manage_access',
  'reservations.write',
  'vehicles.manage',
  'seats.assign',
  'accommodations.manage',
  'rooms.assign',
  'finance.read',
  'finance.write',
  'finance.reverse',
  'expenses.write',
  'reports.read',
  'reports.financial',
  'audit.read',
  'links.revoke',
  'sensitive.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Seção 3 da spec. Operador ganha finance.* só por configuração futura; por
// padrão registra pagamentos (finance.write) mas não vê o dashboard financeiro.
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  OPERADOR: [
    'customers.read',
    'customers.write',
    'trips.read',
    'reservations.write',
    'seats.assign',
    'rooms.assign',
    'reports.read',
    'finance.write',
    'sensitive.view',
  ],
  FINANCEIRO: [
    'customers.read',
    'trips.read',
    'finance.read',
    'finance.write',
    'finance.reverse',
    'expenses.write',
    'reports.read',
    'reports.financial',
    'sensitive.view',
  ],
  VISUALIZADOR: ['customers.read', 'trips.read', 'reports.read'],
};

export interface PermissionSubject {
  role: Role;
  can_view_sensitive: boolean;
}

export function hasPermission(subject: PermissionSubject, permission: Permission): boolean {
  if (ROLE_PERMISSIONS[subject.role].includes(permission)) return true;
  // "Não pode visualizar CPF ... sem permissão específica" — flag por usuário.
  return permission === 'sensitive.view' && subject.can_view_sensitive;
}

export function permissionsFor(subject: PermissionSubject): Permission[] {
  return PERMISSIONS.filter((p) => hasPermission(subject, p));
}
