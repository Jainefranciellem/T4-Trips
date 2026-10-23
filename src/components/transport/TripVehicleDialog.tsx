import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { addTripVehicle, listVehicleTemplates, updateTripVehicle } from '@/lib/vehicles.service';
import { layoutCapacity } from '@/lib/seat-layout';
import type { TripVehicle } from '@/types';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  vehicle?: TripVehicle | null;
  existingCount: number;
}

// Adiciona (ou edita) um veículo da viagem (RF-008).
export function TripVehicleDialog({ open, onOpenChange, tripId, vehicle, existingCount }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editing = !!vehicle;
  const templates = useQuery({ queryKey: ['vehicle-templates'], queryFn: listVehicleTemplates, enabled: open && !editing });

  const [templateId, setTemplateId] = useState('');
  const [layoutId, setLayoutId] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [driver, setDriver] = useState('');
  const [capacity, setCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => templates.data?.filter((t) => t.status === 'ATIVO') ?? [], [templates.data]);
  const template = active.find((t) => t.id === templateId);
  const layout = template?.layouts.find((l) => l.id === layoutId);
  const maxCapacity = editing ? null : layout ? layoutCapacity(layout.layout_data) : null;

  useEffect(() => {
    if (!open) return;
    setTemplateId('');
    setLayoutId('');
    setName(vehicle?.operational_name ?? '');
    setIdentifier(vehicle?.identifier ?? '');
    setDriver(vehicle?.driver_name ?? '');
    setCapacity(vehicle ? String(vehicle.operational_capacity) : '');
    setNotes(vehicle?.notes ?? '');
    setError(null);
  }, [open, vehicle]);

  const chooseTemplate = (id: string) => {
    const t = active.find((x) => x.id === id)!;
    const def = t.layouts.find((l) => l.is_default) ?? t.layouts[0];
    setTemplateId(id);
    setLayoutId(def?.id ?? '');
    setCapacity(def ? String(layoutCapacity(def.layout_data)) : '');
    if (!name) setName(`${t.name} ${existingCount + 1}`);
  };

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        operational_name: name.trim(),
        identifier: identifier.trim() || null,
        driver_name: driver.trim() || null,
        operational_capacity: Number(capacity),
        notes: notes.trim() || null,
      };
      return editing ? updateTripVehicle(vehicle!.id, data) : addTripVehicle(tripId, { ...data, seat_layout_id: layoutId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-vehicles', tripId] });
      toast({ title: editing ? 'Veículo atualizado' : 'Veículo adicionado à viagem' });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !layoutId) return setError('Escolha o veículo e o layout.');
    if (!name.trim()) return setError('Informe o nome do veículo na viagem.');
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap <= 0) return setError('Capacidade operacional inválida.');
    if (maxCapacity !== null && cap > maxCapacity) return setError(`O layout tem ${maxCapacity} lugares.`);
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${vehicle!.operational_name}` : 'Adicionar veículo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {!editing && (
            <>
              {templates.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : active.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum veículo cadastrado. <Link to="/veiculos" className="text-primary underline">Cadastre em Veículos</Link>.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Veículo</Label>
                    <Select value={templateId} onValueChange={chooseTemplate}>
                      <SelectTrigger aria-label="Veículo">
                        <SelectValue placeholder="Escolha" />
                      </SelectTrigger>
                      <SelectContent>
                        {active.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.capacity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Layout</Label>
                    <Select value={layoutId} onValueChange={(id) => {
                      setLayoutId(id);
                      const l = template?.layouts.find((x) => x.id === id);
                      if (l) setCapacity(String(layoutCapacity(l.layout_data)));
                    }} disabled={!template}>
                      <SelectTrigger aria-label="Layout">
                        <SelectValue placeholder="Escolha" />
                      </SelectTrigger>
                      <SelectContent>
                        {template?.layouts.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tv-name">Nome nesta viagem</Label>
              <Input id="tv-name" placeholder="Ex.: Ônibus 1" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tv-id">Placa ou identificação</Label>
              <Input id="tv-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tv-driver">Motorista</Label>
              <Input id="tv-driver" value={driver} onChange={(e) => setDriver(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tv-cap">Capacidade operacional</Label>
              <Input id="tv-cap" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              {maxCapacity !== null && <p className="text-xs text-muted-foreground">O layout tem {maxCapacity} lugares.</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tv-notes">Observações</Label>
              <Textarea id="tv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
