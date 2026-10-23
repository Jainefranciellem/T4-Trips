import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { listReservations } from '@/lib/reservations.service';
import { listTripGroups } from '@/lib/customers.service';
import {
  addGuests,
  assignRoom,
  listTripAccommodations,
  removeTripAccommodation,
  unassignRoom,
  updateTripAccommodation,
  updateTripRoom,
} from '@/lib/accommodations.service';
import { getReport } from '@/lib/reports.service';
import { roomOccupancyLabel, roomTypeLabel } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Reservation, ReservationStatus, RoomOccupancy, Trip, TripAccommodation, TripRoom } from '@/types';
import { ArrowRightLeft, BedDouble, Plus, Printer, Settings2, Trash2, UserPlus, X } from 'lucide-react';
import { AddTripAccommodationDialog } from './AddTripAccommodationDialog';
import { AddGuestsDialog } from './AddGuestsDialog';
import { TripRoomDialog } from './TripRoomDialog';

const NO_ROOM: ReservationStatus[] = ['CANCELADA', 'REEMBOLSADA', 'LISTA_ESPERA'];

const occupancyVariant: Record<RoomOccupancy, 'cancelled' | 'warning' | 'success'> = {
  VAZIO: 'cancelled',
  PARCIAL: 'warning',
  COMPLETO: 'success',
};

export function AccommodationsPanel({ trip }: { trip: Trip }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const open = !['CANCELADA', 'ARQUIVADA'].includes(trip.status);
  const canAssign = can('rooms.assign') && open;
  const canManage = can('trips.write') && open;

  const accQuery = useQuery({ queryKey: ['trip-accommodations', trip.id], queryFn: () => listTripAccommodations(trip.id) });
  const resQuery = useQuery({ queryKey: ['reservations', trip.id], queryFn: () => listReservations(trip.id) });
  const groupsQuery = useQuery({ queryKey: ['trip-groups', trip.id], queryFn: () => listTripGroups(trip.id) });

  const [addOpen, setAddOpen] = useState<{ addRoomsTo: TripAccommodation | null } | null>(null);
  const [guestsFor, setGuestsFor] = useState<TripRoom | null>(null);
  const [settingsFor, setSettingsFor] = useState<TripRoom | null>(null);
  const [placing, setPlacing] = useState<Reservation | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);

  const passengers = useMemo(() => (resQuery.data ?? []).filter((r) => !NO_ROOM.includes(r.reservation_status)), [resQuery.data]);
  const unhoused = passengers.filter((p) => !p.room);
  const accommodations = accQuery.data ?? [];

  const fail = (err: Error) => toast({ title: 'Não foi possível concluir', description: err.message, variant: 'destructive' });
  const op = useMutation({
    mutationFn: (fn: () => Promise<TripAccommodation[]>) => fn(),
    onSuccess: (data) => {
      queryClient.setQueryData(['trip-accommodations', trip.id], data);
      queryClient.invalidateQueries({ queryKey: ['reservations', trip.id] });
      setPlacing(null);
      setGuestsFor(null);
      setSettingsFor(null);
      setGuestError(null);
    },
    onError: (err: Error) => (guestsFor ? setGuestError(err.message) : fail(err)),
  });

  const placeIn = (room: TripRoom) => {
    if (!placing) return;
    op.mutate(() => assignRoom(placing.id, room.id, !!placing.room));
  };

  // PDF do servidor (mesmo da aba Relatórios).
  const printList = () =>
    getReport(trip.id, 'por-pousada', 'pdf').catch((err: Error) =>
      toast({ title: 'Não foi possível gerar o PDF', description: err.message, variant: 'destructive' }),
    );

  if (accQuery.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (accQuery.isError) return <p className="text-destructive">{(accQuery.error as Error).message}</p>;

  const roomCard = (room: TripRoom) => {
    const target = placing && room.active && room.occupancy !== 'COMPLETO' && placing.room?.trip_room_id !== room.id;
    return (
      <div
        key={room.id}
        className={cn(
          'rounded-xl border bg-card p-3 space-y-2',
          !room.active && 'opacity-60',
          target && 'border-primary ring-1 ring-primary/40',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">
              {room.identifier}
              {room.name && <span className="font-normal text-muted-foreground"> · {room.name}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {roomTypeLabel[room.room_type]} · {room.guests.length}/{room.capacity}
              {room.capacity_override && ' (ajustado)'}
              {room.notes && ` · ${room.notes}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={room.active ? occupancyVariant[room.occupancy] : 'cancelled'}>{room.active ? roomOccupancyLabel[room.occupancy] : 'Fora de uso'}</Badge>
            {canManage && (
              <Button variant="ghost" size="icon-sm" aria-label={`Ajustar quarto ${room.identifier}`} onClick={() => setSettingsFor(room)}>
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <ul className="space-y-1">
          {room.guests.map((g) => (
            <li key={g.reservation_id} className="flex items-center justify-between gap-1 rounded-md bg-muted/50 px-2 py-1 text-sm">
              <span className="truncate">{g.passenger_name}</span>
              {canAssign && (
                <span className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Transferir ${g.passenger_name}`}
                    onClick={() => setPlacing(passengers.find((p) => p.id === g.reservation_id) ?? null)}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Tirar ${g.passenger_name} do quarto`} onClick={() => op.mutate(() => unassignRoom(g.reservation_id))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>

        {canAssign && room.active && (
          target ? (
            <Button size="sm" className="w-full" onClick={() => placeIn(room)} disabled={op.isPending}>
              Colocar {placing!.passenger_name.split(' ')[0]} aqui
            </Button>
          ) : (
            room.occupancy !== 'COMPLETO' &&
            !placing && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setGuestError(null);
                  setGuestsFor(room);
                }}
              >
                <UserPlus className="h-4 w-4" /> Adicionar hóspede
              </Button>
            )
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen({ addRoomsTo: null })}>
            <Plus className="h-4 w-4" /> Adicionar pousada
          </Button>
        )}
        {accommodations.length > 0 && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={printList}>
            <Printer className="h-4 w-4" /> Lista de hospedagem
          </Button>
        )}
      </div>

      {placing && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm sticky top-2 z-10" role="status">
          <span>
            Escolha o quarto de <strong>{placing.passenger_name}</strong>
            {placing.room && ` (hoje no ${placing.room.room_identifier})`}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => setPlacing(null)} aria-label="Cancelar escolha">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {accommodations.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">Nenhuma pousada nesta viagem ainda.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem] items-start">
          <div className="space-y-6">
            {accommodations.map((a) => (
              <section key={a.id} className="space-y-3" aria-label={a.accommodation.name}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-primary" /> {a.accommodation.name}
                      {a.status === 'INATIVO' && <Badge variant="cancelled">Fora de uso</Badge>}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {a.counts.guests} de {a.counts.capacity} lugares ocupados · {a.counts.rooms} quarto(s)
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setAddOpen({ addRoomsTo: a })}>
                        <Plus className="h-4 w-4" /> Quartos
                      </Button>
                      {a.counts.guests === 0 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Tirar ${a.accommodation.name} da viagem`}
                          onClick={() =>
                            op.mutate(async () => {
                              try {
                                return await removeTripAccommodation(a.id);
                              } catch {
                                // Já teve hóspedes: desativa pra manter o histórico.
                                return updateTripAccommodation(a.id, { status: 'INATIVO' });
                              }
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{a.rooms.map((r) => roomCard(r))}</div>
              </section>
            ))}
          </div>

          <Card className="lg:sticky lg:top-4">
            <CardContent className="p-4 space-y-2">
              <p className="font-medium text-sm">Sem quarto ({unhoused.length})</p>
              {unhoused.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os passageiros já têm quarto.</p>
              ) : (
                <ul className="space-y-1 max-h-96 overflow-y-auto">
                  {unhoused.map((p) => (
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
              {canAssign && unhoused.length > 0 && <p className="text-xs text-muted-foreground">Toque no nome e depois em "Colocar aqui" no quarto.</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <AddTripAccommodationDialog
        open={!!addOpen}
        onOpenChange={(o) => !o && setAddOpen(null)}
        tripId={trip.id}
        current={accommodations}
        addRoomsTo={addOpen?.addRoomsTo}
      />
      <AddGuestsDialog
        room={guestsFor}
        passengers={passengers}
        groups={groupsQuery.data ?? []}
        busy={op.isPending}
        error={guestError}
        onClose={() => setGuestsFor(null)}
        onConfirm={(ids, transfer) => op.mutate(() => addGuests(guestsFor!.id, ids, transfer))}
      />
      <TripRoomDialog
        room={settingsFor}
        busy={op.isPending}
        onClose={() => setSettingsFor(null)}
        onSave={(payload) => op.mutate(() => updateTripRoom(settingsFor!.id, payload))}
      />
    </div>
  );
}
