import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/common/Segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { TripCard } from '@/components/trips/TripCard';
import { TripFormDialog } from '@/components/trips/TripFormDialog';
import { CancelTripDialog } from '@/components/trips/CancelTripDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks/use-debounce';
import { listTrips } from '@/lib/trips.service';
import { tripGroupLabel } from '@/lib/constants';
import type { Trip, TripGroup } from '@/types';
import { Plus, Search } from 'lucide-react';

const groups = Object.keys(tripGroupLabel) as TripGroup[];

const Trips = () => {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<TripGroup>('futuras');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [cancelling, setCancelling] = useState<Trip | null>(null);
  const q = useDebounce(search.trim());

  const { data: trips, isLoading, isError, error } = useQuery({
    queryKey: ['trips', q],
    queryFn: () => listTrips({ q }),
  });

  const counts = useMemo(() => {
    const c = Object.fromEntries(groups.map((g) => [g, 0])) as Record<TripGroup, number>;
    trips?.forEach((t) => c[t.group]++);
    return c;
  }, [trips]);

  const visible = trips?.filter((t) => t.group === group) ?? [];

  const openEdit = (trip: Trip) => {
    setEditing(trip);
    setFormOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Minhas Trips"
        description="Viagens da T4 Trips por situação"
        actions={
          can('trips.write') && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nova viagem
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <Segmented<TripGroup>
          label="Situação das viagens"
          value={group}
          onChange={setGroup}
          options={groups.map((g) => ({
            value: g,
            label: (
              <>
                {tripGroupLabel[g]} <span className="ml-1.5 text-xs opacity-70">{counts[g]}</span>
              </>
            ),
          }))}
        />
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou destino"
            aria-label="Buscar viagens"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-destructive">{(error as Error).message}</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <p className="text-muted-foreground">
            {q ? 'Nenhuma viagem encontrada para essa busca.' : `Nenhuma viagem ${tripGroupLabel[group].toLowerCase()}.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((trip) => (
            <TripCard key={trip.id} trip={trip} onEdit={openEdit} onCancel={setCancelling} />
          ))}
        </div>
      )}

      <TripFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        trip={editing}
        onSaved={(saved) => !editing && navigate(`/viagens/${saved.id}`)}
      />
      <CancelTripDialog trip={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
    </div>
  );
};

export default Trips;
