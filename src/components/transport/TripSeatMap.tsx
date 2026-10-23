import { cn } from '@/lib/utils';
import { SeatGrid } from '@/components/vehicles/SeatGrid';
import type { SeatDisplayStatus, TripSeat, TripVehicle } from '@/types';
import { Accessibility } from 'lucide-react';

export const seatStatusLabel: Record<SeatDisplayStatus, string> = {
  LIVRE: 'Livre',
  RESERVADO: 'Reservado',
  CONFIRMADO: 'Confirmado',
  BLOQUEADO: 'Bloqueado',
};

// Cor + desenho (tracejado, preenchido, riscado) pra não depender só de cor (RNF-006).
export const seatStatusClass: Record<SeatDisplayStatus, string> = {
  LIVRE: 'bg-background border-border hover:border-primary',
  RESERVADO: 'bg-warning/15 border-warning border-dashed text-warning',
  CONFIRMADO: 'bg-success text-success-foreground border-success',
  BLOQUEADO: 'bg-muted text-muted-foreground border-muted line-through',
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

interface Props {
  vehicle: TripVehicle;
  selectedSeatId?: string | null;
  highlightReservationId?: string | null;
  onSeatClick: (seat: TripSeat) => void;
}

export function TripSeatMap({ vehicle, selectedSeatId, highlightReservationId, onSeatClick }: Props) {
  const byPos = new Map(vehicle.seats.map((s) => [`${s.floor}:${s.row}:${s.col}`, s]));
  return (
    <div className="flex flex-wrap gap-4 overflow-x-auto pb-2">
      {vehicle.floors.map((floor) => (
        <SeatGrid
          key={floor.floor}
          floor={floor}
          showFloorLabel={vehicle.floors.length > 1}
          renderCell={(row, col) => {
            const seat = byPos.get(`${floor.floor}:${row}:${col}`);
            if (!seat) return null;
            const label = `Assento ${seat.seat_number}, ${seatStatusLabel[seat.display_status]}${seat.occupant ? `, ${seat.occupant.passenger_name}` : ''}`;
            return (
              <button
                type="button"
                onClick={() => onSeatClick(seat)}
                title={seat.occupant ? `${seat.seat_number} · ${seat.occupant.passenger_name}` : `${seat.seat_number} · ${seatStatusLabel[seat.display_status]}`}
                aria-label={label}
                className={cn(
                  'relative h-10 w-10 rounded-md border-2 text-[11px] leading-none font-semibold flex flex-col items-center justify-center transition-colors',
                  seatStatusClass[seat.display_status],
                  selectedSeatId === seat.id && 'ring-2 ring-primary ring-offset-1',
                  highlightReservationId && seat.occupant?.reservation_id === highlightReservationId && 'ring-2 ring-secondary ring-offset-1',
                )}
              >
                <span>{seat.seat_number}</span>
                {seat.occupant && <span className="text-[9px] font-normal opacity-90">{initials(seat.occupant.passenger_name)}</span>}
                {seat.accessible && <Accessibility className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 text-primary bg-background rounded-full" aria-hidden />}
              </button>
            );
          }}
        />
      ))}
    </div>
  );
}

export function SeatLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(Object.keys(seatStatusLabel) as SeatDisplayStatus[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn('h-4 w-4 rounded border-2', seatStatusClass[s])} aria-hidden /> {seatStatusLabel[s]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <Accessibility className="h-4 w-4 text-primary" aria-hidden /> Acessível
      </span>
    </div>
  );
}
