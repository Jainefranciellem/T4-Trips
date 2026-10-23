import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { roomTypeLabel } from '@/lib/constants';
import type { TripRoom } from '@/types';
import { Loader2 } from 'lucide-react';

interface Props {
  room: TripRoom | null;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: { capacity_override: number | null; notes: string | null; status: 'ATIVO' | 'INATIVO' }) => void;
}

// Ajustes do quarto só nesta viagem (capacidade extra, observação, desativar).
export function TripRoomDialog({ room, busy, onClose, onSave }: Props) {
  const [capacity, setCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    setCapacity(room?.capacity_override ? String(room.capacity_override) : '');
    setNotes(room?.notes ?? '');
    setActive(room ? room.status === 'ATIVO' : true);
  }, [room]);

  if (!room) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quarto {room.identifier} nesta viagem</DialogTitle>
          <DialogDescription>
            {roomTypeLabel[room.room_type]} · {room.beds} cama(s) · hoje cabem {room.capacity}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tr-cap">Capacidade nesta viagem</Label>
            <Input id="tr-cap" type="number" min={1} placeholder="Igual ao cadastro" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-notes">Observação</Label>
            <Input id="tr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: colchão extra" />
          </div>
          <label className="flex items-center justify-between text-sm">
            Usar este quarto
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={() => onSave({ capacity_override: capacity ? Number(capacity) : null, notes: notes.trim() || null, status: active ? 'ATIVO' : 'INATIVO' })}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
