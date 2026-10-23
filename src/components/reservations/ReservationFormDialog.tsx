import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api';
import { createReservation, updateReservation, type ReservationInput } from '@/lib/reservations.service';
import { centsToInput, formatBRL, parseBRLToCents } from '@/lib/format';
import { manualReservationStatuses, reservationStatusLabel } from '@/lib/constants';
import type { Customer, ManualReservationStatus, Reservation, Trip } from '@/types';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { CustomerPicker } from './CustomerPicker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  reservation?: Reservation | null;
  // Chamado com o link na criação, pra já oferecer o compartilhamento.
  onCreated?: (reservation: Reservation, publicUrl: string) => void;
}

const isManual = (s: string): s is ManualReservationStatus => manualReservationStatuses.includes(s as ManualReservationStatus);

export function ReservationFormDialog({ open, onOpenChange, trip, reservation, onCreated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editing = !!reservation;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState<ManualReservationStatus>('RESERVADA');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [surcharge, setSurcharge] = useState('');
  const [courtesy, setCourtesy] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomer(reservation?.customer ?? null);
    setStatus(reservation && isManual(reservation.reservation_status) ? reservation.reservation_status : 'RESERVADA');
    setPrice(centsToInput(reservation?.package_price ?? trip.default_package_price));
    setDiscount(reservation?.discount_amount ? centsToInput(reservation.discount_amount) : '');
    setSurcharge(reservation?.surcharge_amount ? centsToInput(reservation.surcharge_amount) : '');
    setCourtesy(reservation?.is_courtesy ?? false);
    setDueDate(reservation?.payment_due_date?.slice(0, 10) ?? '');
    setNotes(reservation?.notes ?? '');
    setReason('');
    setError(null);
    setFull(false);
  }, [open, reservation, trip]);

  const cents = (v: string) => (v.trim() ? parseBRLToCents(v) : 0);
  const pkg = parseBRLToCents(price);
  const disc = cents(discount);
  const sur = cents(surcharge);
  const finalPrice = courtesy ? 0 : pkg !== null && disc !== null && sur !== null ? pkg - disc + sur : null;

  const mutation = useMutation({
    mutationFn: async (override?: ManualReservationStatus) => {
      const payload: ReservationInput = {
        reservation_status: override ?? status,
        package_price: pkg!,
        discount_amount: courtesy ? 0 : disc!,
        surcharge_amount: courtesy ? 0 : sur!,
        is_courtesy: courtesy,
        payment_due_date: dueDate || null,
        notes: notes.trim() || null,
      };
      if (editing) return { reservation: await updateReservation(reservation!.id, { ...payload, reason: reason.trim() || null }), url: null };
      const res = await createReservation(trip.id, { ...payload, customer_id: customer!.id });
      return { reservation: res.reservation, url: res.public_url };
    },
    onSuccess: ({ reservation: saved, url }) => {
      queryClient.invalidateQueries({ queryKey: ['reservations', trip.id] });
      queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast({
        title: editing
          ? 'Reserva atualizada'
          : saved.reservation_status === 'LISTA_ESPERA'
            ? 'Adicionado à lista de espera'
            : 'Passageiro adicionado',
      });
      onOpenChange(false);
      if (url) onCreated?.(saved, url);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.body?.code === 'TRIP_FULL' && err.body.waitlist_available) {
        setFull(true);
        setError(null);
        return;
      }
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !customer) return setError('Selecione o cliente.');
    if (pkg === null) return setError('Valor do pacote inválido.');
    if (disc === null || sur === null) return setError('Desconto ou acréscimo inválido.');
    if (finalPrice !== null && finalPrice < 0) return setError('O desconto não pode ser maior que o valor do pacote.');
    setError(null);
    setFull(false);
    mutation.mutate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Reserva de ${reservation!.passenger_name}` : 'Adicionar passageiro'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {!editing && (
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <CustomerPicker value={customer} onChange={setCustomer} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Status da reserva</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ManualReservationStatus)}>
              <SelectTrigger aria-label="Status da reserva">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {manualReservationStatuses
                  .filter((s) => s !== 'LISTA_ESPERA' || trip.waitlist_enabled)
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {reservationStatusLabel[s]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {status === 'PRE_RESERVA' && trip.reservation_ttl_hours && (
              <p className="text-xs text-muted-foreground">Vale por {trip.reservation_ttl_hours} horas.</p>
            )}
          </div>

          <label className="flex items-center justify-between gap-4 text-sm">
            Cortesia (não paga)
            <Switch checked={courtesy} onCheckedChange={setCourtesy} />
          </label>

          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label htmlFor="res-price">Valor do pacote (R$)</Label>
              <Input id="res-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={courtesy} />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label htmlFor="res-due">Prazo de pagamento</Label>
              <Input id="res-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-discount">Desconto (R$)</Label>
              <Input id="res-discount" inputMode="decimal" placeholder="0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={courtesy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-surcharge">Acréscimo (R$)</Label>
              <Input id="res-surcharge" inputMode="decimal" placeholder="0,00" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} disabled={courtesy} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">Valor final</span>
            <span className="text-lg font-bold" aria-live="polite">
              {finalPrice === null || finalPrice < 0 ? '—' : formatBRL(finalPrice)}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="res-notes">Observações desta viagem</Label>
            <Textarea id="res-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {editing && (
            <div className="space-y-1.5">
              <Label htmlFor="res-reason">Motivo da alteração (vai para o histórico)</Label>
              <Input id="res-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}

          {full && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm space-y-2" role="alert">
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> A viagem está lotada.
              </p>
              <Button type="button" size="sm" variant="warning" onClick={() => mutation.mutate('LISTA_ESPERA')} disabled={mutation.isPending}>
                Colocar na lista de espera
              </Button>
            </div>
          )}

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
