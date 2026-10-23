import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createTrip, updateTrip } from '@/lib/trips.service';
import { centsToInput, parseBRLToCents, toDateTimeLocal } from '@/lib/format';
import { editableTripStatuses, tripStatusLabel } from '@/lib/constants';
import type { Trip, TripInput } from '@/types';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip?: Trip | null;
  onSaved?: (trip: Trip) => void;
}

const emptyForm = {
  name: '',
  destination: '',
  departure_at: '',
  return_at: '',
  departure_location: '',
  commercial_capacity: '',
  default_package_price: '',
  status: 'PLANEJADA' as TripInput['status'],
  description: '',
  included_services: '',
  optional_services: '',
  public_instructions: '',
  internal_notes: '',
  cancellation_policy: '',
  waitlist_enabled: false,
  pending_holds_seat: true,
  auto_release_holds: true,
  reservation_ttl_hours: '',
};

type FormState = typeof emptyForm;

function fromTrip(trip: Trip): FormState {
  return {
    name: trip.name,
    destination: trip.destination,
    departure_at: toDateTimeLocal(trip.departure_at),
    return_at: toDateTimeLocal(trip.return_at),
    departure_location: trip.departure_location,
    commercial_capacity: String(trip.commercial_capacity),
    default_package_price: centsToInput(trip.default_package_price),
    status: editableTripStatuses.includes(trip.status) ? (trip.status as TripInput['status']) : 'PLANEJADA',
    description: trip.description ?? '',
    included_services: trip.included_services ?? '',
    optional_services: trip.optional_services ?? '',
    public_instructions: trip.public_instructions ?? '',
    internal_notes: trip.internal_notes ?? '',
    cancellation_policy: trip.cancellation_policy ?? '',
    waitlist_enabled: trip.waitlist_enabled,
    pending_holds_seat: trip.pending_holds_seat,
    auto_release_holds: trip.auto_release_holds,
    reservation_ttl_hours: trip.reservation_ttl_hours ? String(trip.reservation_ttl_hours) : '',
  };
}

// Mesmas regras do CA-001 que o backend aplica; aqui só pra avisar antes de enviar.
function validate(form: FormState): string | null {
  if (!form.name.trim()) return 'Informe o nome da viagem.';
  if (!form.destination.trim()) return 'Informe o destino.';
  if (!form.departure_at || !form.return_at) return 'Informe as datas de saída e retorno.';
  if (new Date(form.return_at) <= new Date(form.departure_at)) return 'O retorno deve ser posterior à saída.';
  if (!form.departure_location.trim()) return 'Informe o local de embarque.';
  const capacity = Number(form.commercial_capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) return 'A capacidade deve ser um número maior que zero.';
  if (parseBRLToCents(form.default_package_price) === null) return 'Valor do pacote inválido.';
  return null;
}

export function TripFormDialog({ open, onOpenChange, trip, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(trip ? fromTrip(trip) : emptyForm);
      setError(null);
    }
  }, [open, trip]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const mutation = useMutation({
    mutationFn: (payload: TripInput) => (trip ? updateTrip(trip.id, payload) : createTrip(payload)),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', saved.id] });
      toast({ title: trip ? 'Viagem atualizada' : 'Viagem criada' });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return setError(problem);

    mutation.mutate({
      ...form,
      departure_at: new Date(form.departure_at).toISOString(),
      return_at: new Date(form.return_at).toISOString(),
      commercial_capacity: Number(form.commercial_capacity),
      default_package_price: parseBRLToCents(form.default_package_price)!,
      reservation_ttl_hours: form.reservation_ttl_hours ? Number(form.reservation_ttl_hours) : null,
    });
  };

  const text = (key: keyof FormState, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`trip-${key}`}>{label}</Label>
      <Input
        id={`trip-${key}`}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        {...props}
      />
    </div>
  );

  const area = (key: keyof FormState, label: string) => (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={`trip-${key}`}>{label}</Label>
      <Textarea id={`trip-${key}`} rows={2} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trip ? 'Editar viagem' : 'Nova viagem'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text('name', 'Nome da viagem *', { placeholder: 'Ex.: Surf Trip Itacaré 2027' })}</div>
            {text('destination', 'Destino *')}
            {text('departure_location', 'Local de embarque *')}
            {text('departure_at', 'Saída *', { type: 'datetime-local' })}
            {text('return_at', 'Retorno *', { type: 'datetime-local' })}
            {text('commercial_capacity', 'Capacidade comercial *', { type: 'number', min: 1, inputMode: 'numeric' })}
            {text('default_package_price', 'Valor padrão do pacote (R$) *', { inputMode: 'decimal', placeholder: '1.287,00' })}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as TripInput['status'])}>
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editableTripStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tripStatusLabel[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {area('description', 'Descrição')}
            {area('included_services', 'Serviços inclusos')}
            {area('optional_services', 'Serviços opcionais')}
            {area('public_instructions', 'Orientações públicas (aparecem no link do passageiro)')}
            {area('cancellation_policy', 'Política de cancelamento')}
            {area('internal_notes', 'Observações internas')}
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Vagas e reservas</p>
            <label className="flex items-center justify-between gap-4 text-sm">
              Reserva pendente ocupa vaga
              <Switch checked={form.pending_holds_seat} onCheckedChange={(v) => set('pending_holds_seat', v)} />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              Liberar a vaga sozinho quando a pré-reserva vencer
              <Switch checked={form.auto_release_holds} onCheckedChange={(v) => set('auto_release_holds', v)} />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              Lista de espera quando lotar
              <Switch checked={form.waitlist_enabled} onCheckedChange={(v) => set('waitlist_enabled', v)} />
            </label>
            <div className="max-w-xs">
              {text('reservation_ttl_hours', 'Validade da pré-reserva (horas)', { type: 'number', min: 1, placeholder: 'Sem prazo' })}
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
              {trip ? 'Salvar' : 'Criar viagem'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
