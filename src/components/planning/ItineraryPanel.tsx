import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createItineraryItem, deleteItineraryItem, listItinerary, reorderItinerary, updateItineraryItem, type ItineraryInput } from '@/lib/planning.service';
import { getReport } from '@/lib/reports.service';
import { formatDay } from '@/lib/format';
import type { ItineraryItem, Trip } from '@/types';
import { ArrowDown, ArrowUp, Clock, EyeOff, Loader2, MapPin, Pencil, Plus, Printer, Trash2, Users } from 'lucide-react';

const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};
const tripDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

// Todos os dias da viagem, da saída ao retorno.
function tripDays(trip: Trip) {
  const days: string[] = [];
  const end = tripDay(trip.return_at);
  for (let d = tripDay(trip.departure_at); d <= end && days.length < 60; ) {
    days.push(d);
    const [y, m, dd] = d.split('-').map(Number);
    d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
  }
  return days;
}

const emptyItem = (date: string): ItineraryInput => ({
  itinerary_date: date,
  start_time: null,
  end_time: null,
  location: null,
  activity: '',
  meeting_point: null,
  included_services: null,
  public_instructions: null,
  internal_notes: null,
  is_public: true,
});

function ItemDialog({ item, days, busy, onClose, onSave }: { item: (ItineraryInput & { id?: string }) | null; days: string[]; busy: boolean; onClose: () => void; onSave: (v: ItineraryInput) => void }) {
  const [v, setV] = useState<ItineraryInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setV(item ? { ...item } : null);
    setError(null);
  }, [item]);
  if (!item || !v) return null;
  const set = <K extends keyof ItineraryInput>(k: K, value: ItineraryInput[K]) => setV({ ...v, [k]: value });
  const text = (k: keyof ItineraryInput) => ({ value: (v[k] as string | null) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, (e.target.value || null) as never) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (v.activity.trim().length < 2) return setError('Descreva a atividade.');
    if (v.start_time && v.end_time && v.end_time < v.start_time) return setError('O horário final é antes do inicial.');
    setError(null);
    onSave({ ...v, activity: v.activity.trim() });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.id ? 'Editar item do roteiro' : 'Novo item do roteiro'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-3 grid-cols-3">
            <div className="space-y-1.5 col-span-3 sm:col-span-1">
              <Label htmlFor="it-date">Dia</Label>
              <select
                id="it-date"
                value={v.itinerary_date}
                onChange={(e) => set('itinerary_date', e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {days.map((d, i) => (
                  <option key={d} value={d}>
                    Dia {i + 1} · {formatDay(d)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-start">Início</Label>
              <Input id="it-start" type="time" {...text('start_time')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-end">Fim</Label>
              <Input id="it-end" type="time" {...text('end_time')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-activity">Atividade</Label>
            <Input id="it-activity" placeholder="Ex.: Aula de surf na Tiririca" value={v.activity} onChange={(e) => set('activity', e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="it-location">Local</Label>
              <Input id="it-location" {...text('location')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-meeting">Ponto de encontro</Label>
              <Input id="it-meeting" {...text('meeting_point')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-included">Serviços inclusos</Label>
            <Input id="it-included" placeholder="Ex.: prancha e instrutor" {...text('included_services')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-public">Orientações para o passageiro</Label>
            <Textarea id="it-public" rows={2} {...text('public_instructions')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-internal">Observações internas</Label>
            <Textarea id="it-internal" rows={2} {...text('internal_notes')} />
          </div>
          <label className="flex items-center justify-between gap-4 text-sm">
            Mostrar no link do passageiro
            <Switch checked={v.is_public} onCheckedChange={(c) => set('is_public', c)} />
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// RF-016: roteiro por dia.
export function ItineraryPanel({ trip }: { trip: Trip }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = can('itinerary.write') && !['CANCELADA', 'ARQUIVADA'].includes(trip.status);
  const query = useQuery({ queryKey: ['itinerary', trip.id], queryFn: () => listItinerary(trip.id) });
  const [editing, setEditing] = useState<(ItineraryInput & { id?: string }) | null>(null);

  const days = useMemo(() => tripDays(trip), [trip]);
  const byDay = useMemo(() => {
    const map = new Map<string, ItineraryItem[]>(days.map((d) => [d, []]));
    for (const i of query.data ?? []) map.set(i.itinerary_date, [...(map.get(i.itinerary_date) ?? []), i]);
    return map;
  }, [query.data, days]);

  const done = (data: ItineraryItem[]) => {
    queryClient.setQueryData(['itinerary', trip.id], data);
    setEditing(null);
  };
  const fail = (err: Error) => toast({ title: 'Não foi possível salvar', description: err.message, variant: 'destructive' });
  const save = useMutation({
    mutationFn: (v: ItineraryInput) => (editing?.id ? updateItineraryItem(editing.id, v) : createItineraryItem(trip.id, v)),
    onSuccess: done,
    onError: fail,
  });
  const op = useMutation({ mutationFn: (fn: () => Promise<ItineraryItem[]>) => fn(), onSuccess: done, onError: fail });

  // Subir/descer dentro do dia. Itens com horário seguem a ordem do horário.
  const move = (items: ItineraryItem[], index: number, delta: number) => {
    const ids = items.map((i) => i.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    op.mutate(() => reorderItinerary(trip.id, ids));
  };

  // PDF do servidor (mesmo da aba Relatórios).
  const print = () =>
    getReport(trip.id, 'roteiro', 'pdf', { internal: '1' }).catch((err: Error) =>
      toast({ title: 'Não foi possível gerar o PDF', description: err.message, variant: 'destructive' }),
    );

  if (query.isLoading) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && (
          <Button size="sm" onClick={() => setEditing(emptyItem(days[0]))}>
            <Plus className="h-4 w-4" /> Novo item
          </Button>
        )}
        {(query.data ?? []).length > 0 && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={print}>
            <Printer className="h-4 w-4" /> Imprimir roteiro
          </Button>
        )}
      </div>

      <ol className="space-y-6">
        {days.map((day, n) => {
          const items = byDay.get(day) ?? [];
          return (
            <li key={day} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">
                  Dia {n + 1} <span className="font-normal text-muted-foreground">· {formatDay(day)} · {weekday(day)}</span>
                </h3>
                {canWrite && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(emptyItem(day))} aria-label={`Adicionar item no dia ${n + 1}`}>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg px-4 py-3">Nada programado.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((i, idx) => (
                    <li key={i.id} className="rounded-xl border bg-card p-3 flex gap-3">
                      <div className="w-16 shrink-0 text-sm font-medium tabular-nums text-primary pt-0.5">
                        {i.start_time ?? '—'}
                        {i.end_time && <span className="block text-xs text-muted-foreground">até {i.end_time}</span>}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1 text-sm">
                        <p className="font-medium flex flex-wrap items-center gap-2">
                          {i.activity}
                          {!i.is_public && (
                            <Badge variant="cancelled">
                              <EyeOff className="h-3 w-3 mr-1" /> Interno
                            </Badge>
                          )}
                        </p>
                        {i.location && (
                          <p className="text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {i.location}
                          </p>
                        )}
                        {i.meeting_point && (
                          <p className="text-muted-foreground flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> Encontro: {i.meeting_point}
                          </p>
                        )}
                        {i.included_services && <p className="text-muted-foreground">Incluso: {i.included_services}</p>}
                        {i.public_instructions && <p className="whitespace-pre-line">{i.public_instructions}</p>}
                        {i.internal_notes && <p className="text-xs text-muted-foreground italic">Interno: {i.internal_notes}</p>}
                      </div>
                      {canWrite && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${i.activity}`} onClick={() => setEditing({ ...i })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!i.start_time && idx > 0 && !items[idx - 1].start_time && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Subir ${i.activity}`} onClick={() => move(items, idx, -1)}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                          )}
                          {!i.start_time && idx < items.length - 1 && !items[idx + 1].start_time && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Descer ${i.activity}`} onClick={() => move(items, idx, 1)}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" aria-label={`Remover ${i.activity}`} onClick={() => op.mutate(() => deleteItineraryItem(i.id))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" /> Itens com horário seguem a ordem do relógio; os sem horário podem ser reordenados.
      </p>

      <ItemDialog item={editing} days={days} busy={save.isPending} onClose={() => setEditing(null)} onSave={(v) => save.mutate(v)} />
    </div>
  );
}
