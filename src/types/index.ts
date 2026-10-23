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
  | 'vehicles.manage'
  | 'seats.assign'
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
  seat: ReservationSeat | null;
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
  transport: { vehicle: string; identifier: string | null; seat_number: string; floor: number } | null;
  accommodation: null;
  itinerary: unknown[];
}

export interface ReservationSeat {
  trip_seat_id: string;
  seat_number: string;
  floor: number;
  trip_vehicle_id: string;
  vehicle_name: string;
}

export type VehicleCategory =
  | 'VAN'
  | 'MICRO_ONIBUS'
  | 'ONIBUS_CONVENCIONAL'
  | 'ONIBUS_EXECUTIVO'
  | 'ONIBUS_LD'
  | 'ONIBUS_LDD'
  | 'PERSONALIZADO';

export type SeatType = 'NORMAL' | 'SEMI_LEITO' | 'LEITO' | 'EXECUTIVO' | 'ESPECIAL';

export interface LayoutSeat {
  floor: number;
  row: number;
  col: number;
  number: string;
  type: SeatType;
  accessible: boolean;
  blocked: boolean;
}

export interface LayoutFloor {
  floor: number;
  rows: number;
  cols: number;
}

export interface LayoutData {
  floors: LayoutFloor[];
  seats: LayoutSeat[];
}

export interface SeatLayout {
  id: string;
  vehicle_template_id: string;
  name: string;
  version: number;
  is_default: boolean;
  layout_data: LayoutData;
}

export interface VehicleTemplate {
  id: string;
  name: string;
  category: VehicleCategory;
  code: string | null;
  capacity: number;
  floors: number;
  aisle_config: string | null;
  description: string | null;
  status: 'ATIVO' | 'INATIVO';
  layouts: SeatLayout[];
}

export type SeatDisplayStatus = 'LIVRE' | 'BLOQUEADO' | 'RESERVADO' | 'CONFIRMADO';

export interface TripSeat {
  id: string;
  seat_number: string;
  floor: number;
  row: number;
  col: number;
  seat_type: SeatType;
  accessible: boolean;
  status: 'LIVRE' | 'BLOQUEADO';
  blocked_reason: string | null;
  display_status: SeatDisplayStatus;
  occupant: { reservation_id: string; passenger_name: string; reservation_status: ReservationStatus } | null;
}

export interface TripVehicle {
  id: string;
  trip_id: string;
  operational_name: string;
  identifier: string | null;
  driver_name: string | null;
  operational_capacity: number;
  notes: string | null;
  status: 'ATIVO' | 'INATIVO';
  layout_name: string;
  layout_version: number;
  vehicle_template: { id: string; name: string; category: VehicleCategory };
  floors: LayoutFloor[];
  seats: TripSeat[];
  counts: { total: number; occupied: number; blocked: number; free: number };
}
