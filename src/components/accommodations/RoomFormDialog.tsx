import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createRoom, updateRoom } from '@/lib/accommodations.service';
import { roomTypeCapacity, roomTypeLabel } from '@/lib/constants';
import type { Accommodation, AccommodationRoom, RoomType } from '@/types';
import { Loader2 } from 'lucide-react';

interface Props {
  accommodation: Accommodation | null;
  room: AccommodationRoom | null;
  onOpenChange: (open: boolean) => void;
}

const types = Object.keys(roomTypeLabel) as RoomType[];

export function RoomFormDialog({ accommodation, room, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<RoomType>('DUPLO');
  const [capacity, setCapacity] = useState('2');
  const [beds, setBeds] = useState('2');
  const [floor, setFloor] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Depois de salvar um quarto novo, já prepara o próximo (cadastro em série).
  const [keepOpen, setKeepOpen] = useState(false);

  const reset = (r: AccommodationRoom | null) => {
    setIdentifier(r?.identifier ?? '');
    setName(r?.name ?? '');
    setType(r?.room_type ?? 'DUPLO');
    setCapacity(String(r?.capacity ?? 2));
    setBeds(String(r?.beds ?? 2));
    setFloor(r?.floor ?? '');
    setNotes(r?.notes ?? '');
    setActive(r ? r.status === 'ATIVO' : true);
    setError(null);
  };

  useEffect(() => {
    if (accommodation) reset(room);
  }, [accommodation, room]);

  const chooseType = (t: RoomType) => {
    setType(t);
    setCapacity(String(roomTypeCapacity[t]));
    setBeds(String(t === 'CASAL' ? 1 : roomTypeCapacity[t]));
  };

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        identifier: identifier.trim(),
        name: name.trim() || null,
        room_type: type,
        capacity: Number(capacity),
        beds: Number(beds),
        floor: floor.trim() || null,
        notes: notes.trim() || null,
      };
      return room ? updateRoom(room.id, { ...data, status: active ? 'ATIVO' : 'INATIVO' }) : createRoom(accommodation!.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accommodations'] });
      toast({ title: room ? 'Quarto atualizado' : `Quarto ${identifier} cadastrado` });
      if (!room && keepOpen) {
        // Sugere o próximo número: 101 → 102.
        const n = Number(identifier);
        setIdentifier(Number.isInteger(n) ? String(n + 1) : '');
        setName('');
        return;
      }
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return setError('Informe o número ou identificador do quarto.');
    if (!(Number(capacity) >= 1)) return setError('Capacidade inválida.');
    if (!(Number(beds) >= 1)) return setError('Informe a quantidade de camas.');
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={!!accommodation} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{room ? `Quarto ${room.identifier}` : `Novo quarto · ${accommodation?.name}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="room-id">Número</Label>
              <Input id="room-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="101" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-name">Nome (opcional)</Label>
              <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Suíte vista mar" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => chooseType(v as RoomType)}>
                <SelectTrigger aria-label="Tipo do quarto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {roomTypeLabel[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-cap">Capacidade (pessoas)</Label>
              <Input id="room-cap" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-beds">Camas</Label>
              <Input id="room-beds" type="number" min={1} value={beds} onChange={(e) => setBeds(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="room-floor">Andar ou localização</Label>
              <Input id="room-floor" value={floor} onChange={(e) => setFloor(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="room-notes">Observações</Label>
              <Input id="room-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {room ? (
            <label className="flex items-center justify-between text-sm">
              Quarto ativo
              <Switch checked={active} onCheckedChange={setActive} />
            </label>
          ) : (
            <label className="flex items-center justify-between text-sm">
              Cadastrar outro em seguida
              <Switch checked={keepOpen} onCheckedChange={setKeepOpen} />
            </label>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {room ? 'Salvar' : 'Cadastrar quarto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
