export type Role = 'ADMIN' | 'OPERADOR' | 'FINANCEIRO' | 'VISUALIZADOR';

export type Permission =
  | 'users.manage'
  | 'customers.read'
  | 'customers.write'
  | 'customers.archive'
  | 'trips.read'
  | 'trips.write'
  | 'trips.manage_access'
  | 'reservations.write'
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
  expired_holds: number;
  occupied: number;
  available_seats: number;
  revenue_expected: number | null;
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
  auto_release_holds: boolean;
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

export type ReservationStatus =
  | 'PRE_RESERVA'
  | 'RESERVADA'
  | 'CONFIRMADA'
  | 'PARCIALMENTE_PAGA'
  | 'PAGA'
  | 'ATRASADA'
  | 'CANCELADA'
  | 'REEMBOLSADA'
  | 'LISTA_ESPERA';

export type ManualReservationStatus = 'PRE_RESERVA' | 'RESERVADA' | 'CONFIRMADA' | 'LISTA_ESPERA';

export type PublicLinkState = 'SEM_LINK' | 'ATIVO' | 'REVOGADO' | 'EXPIRADO' | 'INATIVO';

// Valores em centavos; null quando o perfil não pode ver valores.
export interface Reservation {
  id: string;
  trip_id: string;
  customer_id: string;
  reservation_status: ReservationStatus;
  passenger_name: string;
  package_price: number | null;
  discount_amount: number | null;
  surcharge_amount: number | null;
  final_price: number | null;
  is_courtesy: boolean;
  payment_due_date: string | null;
  hold_expires_at: string | null;
  hold_expired: boolean;
  notes: string | null;
  public_link: PublicLinkState;
  public_token_created_at: string | null;
  public_token_expires_at: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  customer: Customer;
}

export interface PublicReservation {
  passenger_name: string;
  waitlist: boolean;
  trip: {
    name: string;
    destination: string;
    departure_at: string;
    return_at: string;
    departure_location: string;
    included_services: string | null;
    public_instructions: string | null;
  };
  transport: null;
  accommodation: null;
  itinerary: unknown[];
}
