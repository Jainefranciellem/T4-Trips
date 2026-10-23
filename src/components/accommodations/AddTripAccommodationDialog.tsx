import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { addTripAccommodation, addTripRooms, listAccommodations } from '@/lib/accommodations.service';
import { roomTypeLabel } from '@/lib/constants';
import type { TripAccommodation } from '@/types';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  current: TripAccommodation[];
  // Com pousada já na viagem: só acrescenta quartos que faltam.
  addRoomsTo?: TripAccommodation | null;
}

export function AddTripAccommodationDialog({ open, onOpenChange, tripId, current, addRoomsTo }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ['accommodations'], queryFn: listAccommodations, enabled: open });
  const [accId, setAccId] = useState('');
  const [rooms, setRooms] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const inTrip = new Set(current.map((c) => c.accommodation.id));
  const options = (catalog.data ?? []).filter((a) => a.status === 'ATIVO' && (addRoomsTo ? a.id === addRoomsTo.accommodation.id : !inTrip.has(a.id)));
  const acc = options.find((a) => a.id === accId);
  const taken = new Set(addRoomsTo?.rooms.map((r) => r.accommodation_room_id) ?? []);
  const available = acc?.rooms.filter((r) => r.status === 'ATIVO' && !taken.has(r.id)) ?? [];

  useEffect(() => {
    if (!open) return;
    setAccId(addRoomsTo?.accommodation.id ?? '');
    setError(null);
  }, [open, addRoomsTo]);

  useEffect(() => {
    setRooms(new Set(available.map((r) => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accId, catalog.data]);

  const mutation = useMutation({
    mutationFn: () => (addRoomsTo ? addTripRooms(addRoomsTo.id, [...rooms]) : addTripAccommodation(tripId, { accommodation_id: accId, room_ids: [...rooms] })),
    onSuccess: (data) => {
      queryClient.setQueryData(['trip-accommodations', tripId], data);
      toast({ title: addRoomsTo ? 'Quartos adicionados' : 'Pousada adicionada à viagem' });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggle = (id: string, on: boolean) =>
    setRooms((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{addRoomsTo ? `Mais quartos · ${addRoomsTo.accommodation.name}` : 'Adicionar pousada'}</DialogTitle>
        </DialogHeader>
        {catalog.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {addRoomsTo ? 'Pousada indisponível.' : 'Nenhuma pousada disponível. '}
            {!addRoomsTo && <Link to="/pousadas" className="text-primary underline">Cadastre em Pousadas</Link>}
          </p>
        ) : (
          <div className="space-y-4">
            {!addRoomsTo && (
              <div className="space-y-1.5">
                <Label>Pousada</Label>
                <Select value={accId} onValueChange={setAccId}>
                  <SelectTrigger aria-label="Pousada">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.total_capacity} lugares)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {acc && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Quartos usados nesta viagem</Label>
                  <span className="text-xs text-muted-foreground">
                    {rooms.size} quarto(s) · {available.filter((r) => rooms.has(r.id)).reduce((n, r) => n + r.capacity, 0)} lugares
                  </span>
                </div>
                {available.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todos os quartos ativos já estão na viagem.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {available.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                        <Checkbox checked={rooms.has(r.id)} onCheckedChange={(v) => toggle(r.id, !!v)} />
                        <span>
                          <strong>{r.identifier}</strong> · {roomTypeLabel[r.room_type]} · {r.capacity}p
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!acc || rooms.size === 0 || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
