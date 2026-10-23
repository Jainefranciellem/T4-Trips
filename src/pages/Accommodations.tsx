import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AccommodationFormDialog } from '@/components/accommodations/AccommodationFormDialog';
import { RoomFormDialog } from '@/components/accommodations/RoomFormDialog';
import { useAuth } from '@/contexts/AuthContext';
import { listAccommodations } from '@/lib/accommodations.service';
import { formatPhone } from '@/lib/format';
import { roomTypeLabel } from '@/lib/constants';
import type { Accommodation, AccommodationRoom } from '@/types';
import { MapPin, Pencil, Plus } from 'lucide-react';

const Accommodations = () => {
  const { can } = useAuth();
  const manage = can('accommodations.manage');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Accommodation | null>(null);
  const [roomFor, setRoomFor] = useState<{ accommodation: Accommodation; room: AccommodationRoom | null } | null>(null);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['accommodations'], queryFn: listAccommodations });

  return (
    <div>
      <PageHeader
        title="Pousadas"
        description="Pousadas e quartos reutilizados nas viagens"
        actions={
          manage && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nova pousada
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : isError ? (
        <p className="text-destructive">{(error as Error).message}</p>
      ) : data!.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">Nenhuma pousada cadastrada ainda.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data!.map((a) => (
            <Card key={a.id} className={a.status === 'INATIVO' ? 'opacity-70' : undefined}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.name}</p>
                    {(a.city || a.address) && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {[a.address, [a.city, a.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {a.phone && <p className="text-sm text-muted-foreground">{formatPhone(a.phone)}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.status === 'INATIVO' && <Badge variant="cancelled">Inativa</Badge>}
                    <Badge variant="outline">{a.total_capacity} lugares</Badge>
                    {manage && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${a.name}`}
                        onClick={() => {
                          setEditing(a);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {a.rooms.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={!manage}
                      onClick={() => setRoomFor({ accommodation: a, room: r })}
                      className={`rounded-lg border px-3 py-2 text-left text-sm hover:border-primary disabled:hover:border-border ${r.status === 'INATIVO' ? 'opacity-50 line-through' : ''}`}
                      aria-label={`Quarto ${r.identifier}, ${roomTypeLabel[r.room_type]}, ${r.capacity} pessoas${r.status === 'INATIVO' ? ', inativo' : ''}`}
                    >
                      <span className="font-semibold">{r.identifier}</span>
                      <span className="block text-xs text-muted-foreground">
                        {roomTypeLabel[r.room_type]} · {r.capacity}p
                      </span>
                    </button>
                  ))}
                  {manage && (
                    <Button variant="outline" size="sm" className="h-auto py-2" onClick={() => setRoomFor({ accommodation: a, room: null })}>
                      <Plus className="h-4 w-4" /> Quarto
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AccommodationFormDialog open={formOpen} onOpenChange={setFormOpen} accommodation={editing} />
      <RoomFormDialog accommodation={roomFor?.accommodation ?? null} room={roomFor?.room ?? null} onOpenChange={(o) => !o && setRoomFor(null)} />
    </div>
  );
};

export default Accommodations;
