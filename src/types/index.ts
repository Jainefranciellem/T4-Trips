export type Role = 'ADMIN' | 'OPERADOR' | 'FINANCEIRO' | 'VISUALIZADOR';

export type Permission =
  | 'users.manage'
  | 'customers.read'
  | 'customers.write'
  | 'customers.archive'
  | 'trips.read'
  | 'trips.write'
  | 'trips.manage_access'
  | 'finance.read'
  | 'finance.write'
  | 'reports.read'
  | 'reports.financial'
  | 'audit.read'
  | 'links.revoke'
  | 'sensitive.view';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: Permission[];
}

export type TripStatus =
  | 'PLANEJADA'
  | 'ABERTA'
  | 'LOTADA'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'CANCELADA'
  | 'ARQUIVADA';

export type TripGroup = 'futuras' | 'em_andamento' | 'concluidas' | 'arquivadas' | 'canceladas';

export interface TripSummary {
  passengers: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  waitlist: number;
  available_seats: number;
  revenue_received: number | null;
  revenue_pending: number | null;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  departure_at: string;
  return_at: string;
  departure_location: string;
  commercial_capacity: number;
  default_package_price: number;
  description: string | null;
  included_services: string | null;
  optional_services: string | null;
  internal_notes: string | null;
  public_instructions: string | null;
  cancellation_policy: string | null;
  cover_image_url: string | null;
  waitlist_enabled: boolean;
  pending_holds_seat: boolean;
  reservation_ttl_hours: number | null;
  status: TripStatus;
  group: TripGroup;
  summary: TripSummary;
}

export type TripInput = Omit<
  Trip,
  'id' | 'group' | 'summary' | 'cover_image_url' | 'status'
> & { status: Exclude<TripStatus, 'CANCELADA' | 'ARQUIVADA'> };

export interface Customer {
  id: string;
  full_name: string;
  cpf: string | null;
  birth_date: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  notes: string | null;
  status: 'ATIVO' | 'ARQUIVADO';
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ATIVO' | 'INATIVO';
  can_view_sensitive: boolean;
  last_login_at: string | null;
}
