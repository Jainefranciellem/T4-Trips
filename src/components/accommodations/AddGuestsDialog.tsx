import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { matchNames } from '@/lib/name-match';
import type { Reservation, TripRoom } from '@/types';
import { AlertTriangle, CheckCircle2, Loader2, Search, XCircle } from 'lucide-react';

interface Props {
  room: TripRoom | null;
  passengers: Reservation[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reservationIds: string[], transfer: boolean) => void;
}

const where = (r: Reservation) => (r.room ? `${r.room.room_identifier} (${r.room.accommodation_name})` : null);

// RF-012: adicionar hóspedes buscando ou colando uma lista de nomes.
export function AddGuestsDialog({ room, passengers, busy, error, onClose, onConfirm }: Props) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pasted, setPasted] = useState('');
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [tab, setTab] = useState('buscar');

  useEffect(() => {
    setSearch('');
    setPicked(new Set());
    setPasted('');
    setChoices({});
    setTab('buscar');
  }, [room]);

  const candidates = useMemo(() => passengers.filter((p) => p.room?.trip_room_id !== room?.id), [passengers, room]);
  const matched = useMemo(() => matchNames(pasted, candidates, (p) => p.passenger_name), [pasted, candidates]);

  if (!room) return null;
  const free = room.capacity - room.guests.length;
  const term = search.trim().toLowerCase();
  const list = candidates
    .filter((p) => !term || p.passenger_name.toLowerCase().includes(term))
    .sort((a, b) => Number(!!a.room) - Number(!!b.room) || a.passenger_name.localeCompare(b.passenger_name));

  const pastedIds = matched
    .map((m, i) => (m.matches.length === 1 ? m.matches[0].id : choices[i]))
    .filter((id): id is string => !!id);
  const ids = tab === 'buscar' ? [...picked] : [...new Set(pastedIds)];
  const movers = ids.map((id) => passengers.find((p) => p.id === id)!).filter((p) => p?.room);

  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Quarto {room.identifier} · {free} vaga(s)
          </DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="buscar">Buscar</TabsTrigger>
            <TabsTrigger value="colar">Colar lista</TabsTrigger>
          </TabsList>

          <TabsContent value="buscar" className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input autoFocus placeholder="Buscar passageiro" aria-label="Buscar passageiro" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <ul className="rounded-lg border divide-y max-h-64 overflow-y-auto">
              {list.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum passageiro disponível.</li>}
              {list.map((p) => {
                const checked = picked.has(p.id);
                return (
                  <li key={p.id}>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Checkbox checked={checked} disabled={!checked && picked.size >= free} onCheckedChange={(v) => toggle(p.id, !!v)} />
                      <span>
                        <span className="font-medium">{p.passenger_name}</span>
                        <span className="text-muted-foreground"> · {where(p) ? `hoje no ${where(p)}` : 'sem quarto'}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          <TabsContent value="colar" className="space-y-3">
            <Textarea
              rows={5}
              aria-label="Lista de nomes"
              placeholder={'Um nome por linha, por exemplo:\nAna Souza\nBruno Lima'}
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setChoices({});
              }}
            />
            {matched.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {matched.map((m, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {m.matches.length === 1 ? (
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" aria-label="Encontrado" />
                    ) : m.matches.length === 0 ? (
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-label="Não encontrado" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-label="Mais de um encontrado" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-muted-foreground">{m.line} → </span>
                      {m.matches.length === 1 ? (
                        <span className="font-medium">{m.matches[0].passenger_name}</span>
                      ) : m.matches.length === 0 ? (
                        <span className="text-destructive">não está entre os passageiros</span>
                      ) : (
                        <Select value={choices[i]} onValueChange={(v) => setChoices((c) => ({ ...c, [i]: v }))}>
                          <SelectTrigger className="h-8 mt-1" aria-label={`Escolher passageiro para ${m.line}`}>
                            <SelectValue placeholder="Qual deles?" />
                          </SelectTrigger>
                          <SelectContent>
                            {m.matches.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.passenger_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        {ids.length > free && (
          <p className="text-sm text-destructive" role="alert">
            São {ids.length} pessoas para {free} vaga(s).
          </p>
        )}
        {movers.length > 0 && (
          <p className="text-sm text-warning flex items-start gap-2" role="status">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            Serão transferidos de quarto: {movers.map((p) => `${p.passenger_name} (${where(p)})`).join(', ')}.
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={ids.length === 0 || ids.length > free || busy} onClick={() => onConfirm(ids, movers.length > 0)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {movers.length > 0 ? 'Adicionar e transferir' : `Adicionar ${ids.length || ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
