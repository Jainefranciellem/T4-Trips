import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { listReservations } from '@/lib/reservations.service';
import { assignSeat, blockSeat, listTripVehicles, removeTripVehicle, unassignSeat, unblockSeat } from '@/lib/vehicles.service';
import { compareSeatNumbers } from '@/lib/seat-layout';
import { printTable } from '@/lib/print';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Reservation, ReservationStatus, Trip, TripSeat, TripVehicle } from '@/types';
import { Bus, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { TripVehicleDialog } from './TripVehicleDialog';
import { SeatLegend, TripSeatMap } from './TripSeatMap';
import { SeatDialog } from './SeatDialog';

const NO_SEAT: ReservationStatus[] = ['CANCELADA', 'REEMBOLSADA', 'LISTA_ESPERA'];

export function TransportPanel({ trip }: { trip: Trip }) {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAssign = can('seats.assign') && !['CANCELADA', 'ARQUIVADA'].includes(trip.status);
  const canManage = can('trips.write') && !['CANCELADA', 'ARQUIVADA'].includes(trip.status);

  const vehiclesQuery = useQuery({ queryKey: ['trip-vehicles', trip.id], queryFn: () => listTripVehicles(trip.id) });
  const reservationsQuery = useQuery({ queryKey: ['reservations', trip.id], queryFn: () => listReservations(trip.id) });

  const vehicles = vehiclesQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const vehicle = vehicles.find((v) => v.id === selectedId) ?? vehicles[0] ?? null;
  const [seatOpen, setSeatOpen] = useState<string | null>(null);
  // Passageiro "na mão": o próximo clique num assento coloca ele lá.
  const [placing, setPlacing] = useState<Reservation | null>(null);
  const [swapAsk, setSwapAsk] = useState<{ reservation: Reservation; seat: TripSeat } | null>(null);
  const [vehicleDialog, setVehicleDialog] = useState<{ vehicle: TripVehicle | null } | null>(null);

  useEffect(() => {
    if (!selectedId && vehicles[0]) setSelectedId(vehicles[0].id);
  }, [vehicles, selectedId]);

  const passengers = useMemo(
    () => (reservationsQuery.data ?? []).filter((r) => !NO_SEAT.includes(r.reservation_status)),
    [reservationsQuery.data],
  );
  const unseated = passengers.filter((p) => !p.seat);
  const openSeat = vehicle?.seats.find((s) => s.id === seatOpen) ?? null;

  const onSeatsChanged = (data: TripVehicle[]) => {
    queryClient.setQueryData(['trip-vehicles', trip.id], data);
    queryClient.invalidateQueries({ queryKey: ['reservations', trip.id] });
  };
  const fail = (err: Error) => toast({ title: 'Não foi possível concluir', description: err.message, variant: 'destructive' });

  const seatOp = useMutation({
    mutationFn: (fn: () => Promise<TripVehicle[]>) => fn(),
    onSuccess: (data) => {
      onSeatsChanged(data);
      setSeatOpen(null);
      setPlacing(null);
      setSwapAsk(null);
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: removeTripVehicle,
    onSuccess: () => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['trip-vehicles', trip.id] });
      toast({ title: 'Veículo removido da viagem' });
    },
    onError: fail,
  });

  const place = (reservation: Reservation, seat: TripSeat) => {
    if (seat.occupant?.reservation_id === reservation.id) return setPlacing(null);
    if (seat.status === 'BLOQUEADO') return toast({ title: 'Assento bloqueado', description: seat.blocked_reason ?? undefined, variant: 'destructive' });
    if (seat.occupant) return setSwapAsk({ reservation, seat });
    seatOp.mutate(() => assignSeat(reservation.id, seat.id));
  };

  const handleSeatClick = (seat: TripSeat) => {
    if (placing) place(placing, seat);
    else setSeatOpen(seat.id);
  };

  const printList = () => {
    const rows = vehicles.flatMap((v) =>
      v.seats
        .filter((s) => s.occupant)
        .sort((a, b) => compareSeatNumbers(a.seat_number, b.seat_number))
        .map((s) => [v.operational_name, s.seat_number, s.occupant!.passenger_name]),
    );
    const ok = printTable({
      title: `Lista por assento · ${trip.name}`,
      subtitle: `${trip.destination} · saída ${formatDateTime(trip.departure_at)} · ${trip.departure_location}`,
      generatedBy: user?.name,
      headers: ['Veículo', 'Assento', 'Passageiro'],
      rows,
    });
    if (!ok) toast({ title: 'Libere as janelas pop-up para imprimir', variant: 'destructive' });
  };

  if (vehiclesQuery.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (vehiclesQuery.isError) return <p className="text-destructive">{(vehiclesQuery.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {vehicles.map((v) => (
          <Button
            key={v.id}
            variant={v.id === vehicle?.id ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              setSelectedId(v.id);
              setSeatOpen(null);
            }}
          >
            <Bus className="h-4 w-4" /> {v.operational_name}
            <span className="text-xs opacity-80">
              {v.counts.occupied}/{v.operational_capacity}
            </span>
          </Button>
        ))}
        {canManage && (
          <Button size="sm" onClick={() => setVehicleDialog({ vehicle: null })}>
            <Plus className="h-4 w-4" /> Adicionar veículo
          </Button>
        )}
        {vehicles.length > 0 && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={printList}>
            <Printer className="h-4 w-4" /> Lista por assento
          </Button>
        )}
      </div>

      {!vehicle ? (
        <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">
          Nenhum veículo nesta viagem ainda.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem] items-start">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm">
                  <p className="font-semibold text-base">
                    {vehicle.operational_name}
                    {vehicle.status === 'INATIVO' && <Badge variant="cancelled" className="ml-2">Inativo</Badge>}
                  </p>
                  <p className="text-muted-foreground">
                    {vehicle.vehicle_template.name} · {vehicle.layout_name}
                    {vehicle.identifier && ` · ${vehicle.identifier}`}
                    {vehicle.driver_name && ` · motorista ${vehicle.driver_name}`}
                  </p>
                  <p className="mt-1">
                    <strong>{vehicle.counts.occupied}</strong> de {vehicle.operational_capacity} lugares ocupados · {vehicle.counts.free} livre(s) ·{' '}
                    {vehicle.counts.blocked} bloqueado(s)
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Editar veículo" onClick={() => setVehicleDialog({ vehicle })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {vehicle.counts.occupied === 0 && (
                      <Button variant="ghost" size="icon-sm" aria-label="Remover veículo da viagem" onClick={() => remove.mutate(vehicle.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {placing && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm" role="status">
                  <span>
                    Escolha o assento de <strong>{placing.passenger_name}</strong>
                    {placing.seat && ` (hoje no ${placing.seat.seat_number})`}
                  </span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setPlacing(null)} aria-label="Cancelar escolha">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <TripSeatMap
                vehicle={vehicle}
                selectedSeatId={seatOpen}
                highlightReservationId={placing?.id}
                onSeatClick={handleSeatClick}
              />
              <SeatLegend />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="font-medium text-sm">Sem assento ({unseated.length})</p>
              {unseated.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os passageiros já têm assento.</p>
              ) : (
                <ul className="space-y-1 max-h-96 overflow-y-auto">
                  {unseated.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={!canAssign}
                        onClick={() => setPlacing(placing?.id === p.id ? null : p)}
                        aria-pressed={placing?.id === p.id}
                        className={cn(
                          'w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent',
                          placing?.id === p.id && 'bg-primary/10 font-medium',
                        )}
                      >
                        {p.passenger_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {canAssign && unseated.length > 0 && <p className="text-xs text-muted-foreground">Toque no nome e depois no assento.</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <SeatDialog
        seat={openSeat}
        vehicle={vehicle}
        passengers={passengers}
        canAssign={canAssign}
        busy={seatOp.isPending}
        onClose={() => setSeatOpen(null)}
        onAssign={(r) => seatOp.mutate(() => assignSeat(r.id, openSeat!.id))}
        onUnassign={(id) => seatOp.mutate(() => unassignSeat(id))}
        onMove={(id) => {
          setPlacing(passengers.find((p) => p.id === id) ?? null);
          setSeatOpen(null);
        }}
        onBlock={(reason) => seatOp.mutate(() => blockSeat(openSeat!.id, reason))}
        onUnblock={() => seatOp.mutate(() => unblockSeat(openSeat!.id))}
      />

      <AlertDialog open={!!swapAsk} onOpenChange={(o) => !o && setSwapAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar de lugar?</AlertDialogTitle>
            <AlertDialogDescription>
              {swapAsk?.seat.occupant?.passenger_name} já está no assento {swapAsk?.seat.seat_number}.
              {swapAsk?.reservation.seat
                ? ` Os dois trocam: ${swapAsk.reservation.passenger_name} vai para o ${swapAsk.seat.seat_number} e ${swapAsk.seat.occupant?.passenger_name} vai para o ${swapAsk.reservation.seat.seat_number}.`
                : ` Para trocar, ${swapAsk?.reservation.passenger_name} precisa já ter um assento. Escolha um assento livre.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            {swapAsk?.reservation.seat && (
              <AlertDialogAction onClick={() => seatOp.mutate(() => assignSeat(swapAsk.reservation.id, swapAsk.seat.id, true))}>
                Trocar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TripVehicleDialog
        open={!!vehicleDialog}
        onOpenChange={(o) => !o && setVehicleDialog(null)}
        tripId={trip.id}
        vehicle={vehicleDialog?.vehicle}
        existingCount={vehicles.length}
      />
    </div>
  );
}
