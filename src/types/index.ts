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
  | 'accommodations.manage'
  | 'rooms.assign'
  | 'finance.read'
  | 'finance.write'
  | 'finance.reverse'
  | 'expenses.write'
  | 'pricing.write'
  | 'itinerary.write'
  | 'reports.read'
  | 'reports.financial'
  | 'audit.read'
  | 'links.revoke'
  | 'sensitive.view'
  | 'privacy.manage';

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
  anonymized_at?: string | null;
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
  room: ReservationRoom | null;
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
  accommodation: { name: string; address: string | null; city: string | null; state: string | null; room: string; room_name: string | null } | null;
  itinerary: {
    date: string;
    start_time: string | null;
    end_time: string | null;
    activity: string;
    location: string | null;
    meeting_point: string | null;
    included_services: string | null;
    public_instructions: string | null;
  }[];
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

export interface ReservationRoom {
  trip_room_id: string;
  room_identifier: string;
  room_name: string | null;
  accommodation_id: string;
  accommodation_name: string;
}

export type RoomType = 'INDIVIDUAL' | 'CASAL' | 'DUPLO' | 'TRIPLO' | 'QUADRUPLO' | 'QUINTUPLO' | 'SEXTUPLO' | 'PERSONALIZADO';

export interface AccommodationRoom {
  id: string;
  accommodation_id: string;
  identifier: string;
  name: string | null;
  room_type: RoomType;
  capacity: number;
  beds: number;
  floor: string | null;
  notes: string | null;
  status: 'ATIVO' | 'INATIVO';
}

export interface Accommodation {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: 'ATIVO' | 'INATIVO';
  rooms: AccommodationRoom[];
  total_capacity: number;
}

export type RoomOccupancy = 'VAZIO' | 'PARCIAL' | 'COMPLETO';

export interface TripRoom {
  id: string;
  accommodation_room_id: string;
  identifier: string;
  name: string | null;
  room_type: RoomType;
  beds: number;
  floor: string | null;
  capacity: number;
  capacity_override: number | null;
  notes: string | null;
  status: 'ATIVO' | 'INATIVO';
  active: boolean;
  occupancy: RoomOccupancy;
  guests: { reservation_id: string; passenger_name: string; reservation_status: ReservationStatus }[];
}

export interface TripAccommodation {
  id: string;
  trip_id: string;
  notes: string | null;
  status: 'ATIVO' | 'INATIVO';
  accommodation: Omit<Accommodation, 'rooms' | 'total_capacity'>;
  rooms: TripRoom[];
  counts: { rooms: number; capacity: number; guests: number };
}

export type PaymentMethod = 'PIX' | 'DINHEIRO' | 'CARTAO' | 'TRANSFERENCIA' | 'OUTRO';
export type EntryStatus = 'VALIDO' | 'ESTORNADO';
export type FinancialStatus = 'PENDENTE' | 'PARCIALMENTE_PAGO' | 'PAGO' | 'ATRASADO' | 'CANCELADO' | 'REEMBOLSADO';
export type InstallmentStatus = 'PENDENTE' | 'PARCIAL' | 'PAGA' | 'VENCIDA';
export type ExpenseStatus = 'PREVISTA' | 'PARCIALMENTE_PAGA' | 'QUITADA' | 'VENCIDA' | 'CANCELADA';
export type CostType = 'FIXO' | 'POR_PESSOA';

export interface FileRef {
  id: string;
  original_name: string;
  mime_type: string;
}

export interface CustomerPayment {
  id: string;
  kind: 'PAGAMENTO' | 'REEMBOLSO';
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  receipt: FileRef | null;
  status: EntryStatus;
  created_at: string;
  reversed_at: string | null;
  reversal_reason: string | null;
}

export interface Installment {
  id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: InstallmentStatus;
}

export interface ReservationFinance {
  reservation_id: string;
  passenger_name: string;
  reservation_status: ReservationStatus;
  final_price: number;
  is_courtesy: boolean;
  payment_due_date: string | null;
  paid: number;
  refunded: number;
  balance: number;
  status: FinancialStatus;
  installments: Installment[];
  plan_mismatch: boolean;
  next_due_date: string | null;
  overdue_amount: number;
  payments: CustomerPayment[];
}

export type Receivable = Omit<ReservationFinance, 'payments' | 'installments'> & { installments_count: number; payments_count: number };

export interface LedgerEntry extends CustomerPayment {
  reservation_id: string;
  passenger_name: string;
  created_by_name: string | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  is_system: boolean;
  status: 'ATIVO' | 'INATIVO';
}

export interface ExpensePayment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  receipt: FileRef | null;
  status: EntryStatus;
  reversal_reason: string | null;
}

export interface TripExpense {
  id: string;
  trip_id: string;
  category: { id: string; name: string };
  description: string;
  supplier_name: string | null;
  cost_type: CostType;
  planned_amount: number;
  due_date: string | null;
  notes: string | null;
  receipt: FileRef | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  paid: number;
  balance: number;
  status: ExpenseStatus;
  payments: ExpensePayment[];
}

export interface FinanceDashboard {
  revenue_expected: number;
  revenue_received: number;
  revenue_pending: number;
  expenses_expected: number;
  expenses_paid: number;
  expenses_pending: number;
  profit_expected: number;
  result_realized: number;
  margin_expected: number | null;
  margin_realized: number | null;
  paying_passengers: number;
  courtesy_passengers: number;
  average_ticket: number | null;
  fixed_costs: number;
  variable_per_passenger: number;
  break_even_passengers: number | null;
  retained_from_cancellations: number;
  commercial_capacity: number;
  by_category: { category: string; planned: number; paid: number }[];
  reservations_by_status: { pago: number; parcial: number; pendente: number; atrasado: number };
  overdue_amount: number;
  expenses_overdue: number;
}

export interface PricingScenarioInput {
  name: string;
  paying_passengers: number;
  courtesy_passengers: number;
  vehicle_capacity: number | null;
  fixed_costs: number;
  variable_cost_per_person: number;
  discounts: number;
  installment_fee_bp: number;
  contingency_type: 'FIXO' | 'PERCENTUAL';
  contingency_value: number;
  desired_margin_bp: number;
  desired_price: number | null;
}

export interface PricingResult {
  price: number;
  base_costs: number;
  contingency: number;
  total_cost: number;
  cost_per_paying: number;
  minimum_price: number;
  suggested_price: number;
  estimated_revenue: number;
  fees: number;
  estimated_profit: number;
  estimated_margin: number | null;
  break_even_passengers: number | null;
  warnings: string[];
}

export interface PricingScenario extends PricingScenarioInput {
  id: string;
  trip_id: string | null;
  updated_at: string;
  result: PricingResult;
}

export interface PricingDefaults {
  paying_passengers: number;
  courtesy_passengers: number;
  vehicle_capacity: number | null;
  fixed_costs: number;
  variable_cost_per_person: number;
  current_price: number;
}

export interface ItineraryItem {
  id: string;
  trip_id: string;
  itinerary_date: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  activity: string;
  meeting_point: string | null;
  included_services: string | null;
  public_instructions: string | null;
  internal_notes: string | null;
  is_public: boolean;
}

export interface CustomerLink {
  id: string;
  relationship_type: string;
  group_name: string | null;
  customer: { id: string; full_name: string };
}

export interface CustomerTrip {
  reservation_id: string;
  reservation_status: ReservationStatus;
  created_at: string;
  cancelled_at: string | null;
  trip: { id: string; name: string; destination: string; departure_at: string; status: TripStatus };
  final_price?: number;
  paid?: number;
  balance?: number;
  financial_status?: FinancialStatus;
}

export interface PassengerGroup {
  name: string | null;
  members: { reservation_id: string; passenger_name: string }[];
}
