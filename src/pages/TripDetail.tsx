import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TripActions } from '@/components/trips/TripActions';
import { TripFormDialog } from '@/components/trips/TripFormDialog';
import { CancelTripDialog } from '@/components/trips/CancelTripDialog';
import { TripAccessCard } from '@/components/trips/TripAccessCard';
import { ReservationsPanel } from '@/components/reservations/ReservationsPanel';
import { TransportPanel } from '@/components/transport/TransportPanel';
import { AccommodationsPanel } from '@/components/accommodations/AccommodationsPanel';
import { PaymentsPanel } from '@/components/finance/PaymentsPanel';
import { ExpensesPanel } from '@/components/finance/ExpensesPanel';
import { FinanceDashboardPanel } from '@/components/finance/FinanceDashboardPanel';
import { PricingSimulator } from '@/components/planning/PricingSimulator';
import { ItineraryPanel } from '@/components/planning/ItineraryPanel';
import { ReportsPanel } from '@/components/reports/ReportsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { getTrip } from '@/lib/trips.service';
import { canEditTrip } from '@/lib/trip-rules';
import { formatBRL, formatDateTime } from '@/lib/format';
import { tripModules, tripStatusLabel, tripStatusVariant } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Trip } from '@/types';
import { ArrowLeft, Construction, Pencil } from 'lucide-react';

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'success' | 'warning' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-xl font-bold mt-1', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning')}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function NoAccess() {
  return (
    <div className="text-center py-16 border border-dashed rounded-xl text-sm text-muted-foreground">
      Seu perfil não tem acesso aos dados financeiros desta viagem.
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value}</dd>
    </div>
  );
}

function Summary({ trip }: { trip: Trip }) {
  const s = trip.summary;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Capacidade comercial" value={trip.commercial_capacity} />
        <Stat label="Passageiros" value={s.passengers} />
        <Stat label="Vagas livres" value={s.available_seats} />
        <Stat label="Lista de espera" value={s.waitlist} />
        <Stat label="Confirmadas" value={s.confirmed} />
        <Stat label="Pendentes" value={s.pending} />
        <Stat label="Pré-reservas vencidas" value={s.expired_holds} tone={s.expired_holds ? 'warning' : undefined} />
        <Stat label="Canceladas" value={s.cancelled} />
        {s.revenue_received !== null && (
          <>
            <Stat label="Receita prevista" value={formatBRL(s.revenue_expected ?? 0)} />
            <Stat label="Receita recebida" value={formatBRL(s.revenue_received)} tone="success" />
            <Stat label="A receber" value={formatBRL(s.revenue_pending ?? 0)} tone="warning" />
          </>
        )}
      </div>
      <Details trip={trip} />
    </div>
  );
}

function Details({ trip }: { trip: Trip }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dados da viagem</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Destino" value={trip.destination} />
          <Field label="Local de embarque" value={trip.departure_location} />
          <Field label="Saída" value={formatDateTime(trip.departure_at)} />
          <Field label="Retorno" value={formatDateTime(trip.return_at)} />
          <Field label="Valor padrão do pacote" value={formatBRL(trip.default_package_price)} />
          <Field label="Reserva pendente ocupa vaga" value={trip.pending_holds_seat ? 'Sim' : 'Não'} />
          <Field label="Lista de espera" value={trip.waitlist_enabled ? 'Ativa' : 'Desativada'} />
          <Field label="Validade da pré-reserva" value={trip.reservation_ttl_hours && `${trip.reservation_ttl_hours} horas`} />
          <Field label="Pré-reserva vencida" value={trip.auto_release_holds ? 'Libera a vaga sozinha' : 'Só libera ao cancelar'} />
          <Field label="Descrição" value={trip.description} />
          <Field label="Serviços inclusos" value={trip.included_services} />
          <Field label="Serviços opcionais" value={trip.optional_services} />
          <Field label="Orientações públicas" value={trip.public_instructions} />
          <Field label="Política de cancelamento" value={trip.cancellation_policy} />
          <Field label="Observações internas" value={trip.internal_notes} />
        </dl>
      </CardContent>
    </Card>
  );
}

const TripDetail = () => {
  const { id = '', module = 'resumo' } = useParams();
  const { user, can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Trip | null>(null);

  const { data: trip, isLoading, isError, error } = useQuery({ queryKey: ['trip', id], queryFn: () => getTrip(id) });

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (isError || !trip) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground">{(error as Error)?.message ?? 'Viagem não encontrada'}</p>
        <Button asChild variant="outline">
          <Link to="/viagens">Voltar para Minhas Trips</Link>
        </Button>
      </div>
    );
  }

  const current = tripModules.find((m) => m.key === module) ?? tripModules[0];
  const editable = can('trips.write') && user && canEditTrip(trip.status, user.role);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/viagens" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Minhas Trips
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold">{trip.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Badge variant={tripStatusVariant[trip.status]}>{tripStatusLabel[trip.status]}</Badge>
              {trip.destination} · saída {formatDateTime(trip.departure_at)}
            </div>
          </div>
          <TripActions trip={trip} onEdit={() => setEditOpen(true)} onCancel={setCancelling} />
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b pb-px -mx-4 px-4 md:mx-0 md:px-0" aria-label="Módulos da viagem">
        {tripModules.map((m) => (
          <NavLink
            key={m.key}
            to={m.key === 'resumo' ? `/viagens/${trip.id}` : `/viagens/${trip.id}/${m.key}`}
            end
            className={cn(
              'whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
              current.key === m.key
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {m.label}
          </NavLink>
        ))}
      </nav>

      {current.key === 'resumo' && <Summary trip={trip} />}
      {(current.key === 'passageiros' || current.key === 'reservas') && (
        <ReservationsPanel key={current.key} trip={trip} mode={current.key} />
      )}
      {current.key === 'transporte' && <TransportPanel trip={trip} />}
      {current.key === 'pousadas' && <AccommodationsPanel trip={trip} />}
      {current.key === 'pagamentos' && (can('finance.read') || can('finance.write') ? <PaymentsPanel trip={trip} /> : <NoAccess />)}
      {current.key === 'despesas' && (can('finance.read') ? <ExpensesPanel trip={trip} /> : <NoAccess />)}
      {current.key === 'financeiro' && (can('finance.read') ? <FinanceDashboardPanel trip={trip} /> : <NoAccess />)}
      {current.key === 'simulador' && (can('finance.read') ? <PricingSimulator tripId={trip.id} /> : <NoAccess />)}
      {current.key === 'roteiro' && <ItineraryPanel trip={trip} />}
      {current.key === 'relatorios' && <ReportsPanel trip={trip} />}

      {current.key === 'configuracoes' && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
          <div className="space-y-3">
            {editable && (
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar dados da viagem
              </Button>
            )}
            <Details trip={trip} />
          </div>
          {can('trips.manage_access') && <TripAccessCard tripId={trip.id} />}
        </div>
      )}

      {!current.ready && (
        <div className="text-center py-16 border border-dashed rounded-xl space-y-2">
          <Construction className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">{current.label}</p>
          <p className="text-sm text-muted-foreground">Este módulo chega nas próximas fases do projeto.</p>
        </div>
      )}

      <TripFormDialog open={editOpen} onOpenChange={setEditOpen} trip={trip} />
      <CancelTripDialog trip={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
    </div>
  );
};

export default TripDetail;
