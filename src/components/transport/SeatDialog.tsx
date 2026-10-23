import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { reservationStatusLabel, seatTypeLabel } from '@/lib/constants';
import type { Reservation, TripSeat, TripVehicle } from '@/types';
import { ArrowRightLeft, Ban, Search, Unlock, UserMinus } from 'lucide-react';
import { seatStatusLabel } from './TripSeatMap';

interface Props {
  seat: TripSeat | null;
  vehicle: TripVehicle | null;
  passengers: Reservation[];
  canAssign: boolean;
  busy: boolean;
  onClose: () => void;
  onAssign: (reservation: Reservation) => void;
  onUnassign: (reservationId: string) => void;
  onMove: (reservationId: string) => void;
  onBlock: (reason: string) => void;
  onUnblock: () => void;
}

export function SeatDialog({ seat, vehicle, passengers, canAssign, busy, onClose, onAssign, onUnassign, onMove, onBlock, onUnblock }: Props) {
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    setSearch('');
    setReason('');
    setBlocking(false);
  }, [seat]);

  if (!seat || !vehicle) return null;
  const term = search.trim().toLowerCase();
  // Primeiro quem ainda não tem assento.
  const options = passengers
    .filter((p) => !term || p.passenger_name.toLowerCase().includes(term))
    .sort((a, b) => Number(!!a.seat) - Number(!!b.seat) || a.passenger_name.localeCompare(b.passenger_name));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Assento {seat.seat_number} · {vehicle.operational_name}
          </DialogTitle>
          <DialogDescription>
            {seatStatusLabel[seat.display_status]} · {seatTypeLabel[seat.seat_type]}
            {seat.accessible && ' · acessível'}
            {vehicle.floors.length > 1 && ` · ${seat.floor === 1 ? 'andar de baixo' : 'andar de cima'}`}
          </DialogDescription>
        </DialogHeader>

        {seat.occupant ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <p className="font-medium">{seat.occupant.passenger_name}</p>
              <Badge variant="outline" className="mt-1">{reservationStatusLabel[seat.occupant.reservation_status]}</Badge>
            </div>
            {canAssign && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => onMove(seat.occupant!.reservation_id)} disabled={busy}>
                  <ArrowRightLeft className="h-4 w-4" /> Mudar de assento
                </Button>
                <Button variant="outline" className="text-destructive" onClick={() => onUnassign(seat.occupant!.reservation_id)} disabled={busy}>
                  <UserMinus className="h-4 w-4" /> Tirar do assento
                </Button>
              </div>
            )}
          </div>
        ) : seat.status === 'BLOQUEADO' ? (
          <div className="space-y-4">
            <p className="text-sm">
              <span className="text-muted-foreground">Motivo: </span>
              {seat.blocked_reason ?? '—'}
            </p>
            {canAssign && (
              <Button variant="outline" onClick={onUnblock} disabled={busy}>
                <Unlock className="h-4 w-4" /> Desbloquear assento
              </Button>
            )}
          </div>
        ) : canAssign ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Quem vai sentar aqui?</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input autoFocus placeholder="Buscar passageiro" aria-label="Buscar passageiro" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <ul className="rounded-lg border divide-y max-h-60 overflow-y-auto">
                {options.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum passageiro ativo nesta viagem.</li>}
                {options.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAssign(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none disabled:opacity-50"
                    >
                      <span className="font-medium">{p.passenger_name}</span>
                      <span className="text-muted-foreground">
                        {p.seat ? ` · hoje no ${p.seat.seat_number} (${p.seat.vehicle_name})` : ' · sem assento'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {blocking ? (
              <div className="space-y-2">
                <Label htmlFor="block-reason">Motivo do bloqueio</Label>
                <Input id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: reservado para o guia" />
                <Button variant="outline" disabled={reason.trim().length < 3 || busy} onClick={() => onBlock(reason.trim())}>
                  <Ban className="h-4 w-4" /> Confirmar bloqueio
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setBlocking(true)}>
                <Ban className="h-4 w-4" /> Bloquear este assento
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Assento livre.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
