import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBRL, formatDate } from '@/lib/format';
import { tripStatusLabel, tripStatusVariant } from '@/lib/constants';
import type { Trip } from '@/types';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { TripActions } from './TripActions';

interface Props {
  trip: Trip;
  onEdit: (trip: Trip) => void;
  onCancel: (trip: Trip) => void;
}

export function TripCard({ trip, onEdit, onCancel }: Props) {
  const { summary } = trip;
  const occupied = trip.commercial_capacity - summary.available_seats;
  const percent = Math.min(100, Math.round((occupied / trip.commercial_capacity) * 100));

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/viagens/${trip.id}`} className="font-semibold hover:text-primary line-clamp-2">
              {trip.name}
            </Link>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> {trip.destination}
            </p>
          </div>
          <TripActions trip={trip} onEdit={onEdit} onCancel={onCancel} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={tripStatusVariant[trip.status]}>{tripStatusLabel[trip.status]}</Badge>
          <span className="flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(trip.departure_at)} – {formatDate(trip.return_at)}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {summary.passengers} passageiro(s)
            </span>
            <span className="text-muted-foreground">{summary.available_seats} vaga(s) livre(s)</span>
          </div>
          <div
            className="h-2 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Ocupação da viagem"
          >
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {summary.revenue_received !== null && (
          <div className="grid grid-cols-2 gap-2 text-sm border-t pt-3">
            <div>
              <p className="text-xs text-muted-foreground">Recebido</p>
              <p className="font-semibold text-success">{formatBRL(summary.revenue_received)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendente</p>
              <p className="font-semibold text-warning">{formatBRL(summary.revenue_pending ?? 0)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
