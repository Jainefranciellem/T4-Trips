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
import { createAccommodation, updateAccommodation, type AccommodationInput } from '@/lib/accommodations.service';
import { brazilStates } from '@/lib/constants';
import type { Accommodation } from '@/types';
import { Loader2 } from 'lucide-react';

const fields = ['name', 'address', 'city', 'state', 'phone', 'email', 'notes'] as const;
type FormState = Record<(typeof fields)[number], string>;
const empty = Object.fromEntries(fields.map((f) => [f, ''])) as FormState;

export function AccommodationFormDialog({ open, onOpenChange, accommodation }: { open: boolean; onOpenChange: (o: boolean) => void; accommodation?: Accommodation | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(accommodation ? (Object.fromEntries(fields.map((f) => [f, accommodation[f] ?? ''])) as FormState) : empty);
    setActive(accommodation ? accommodation.status === 'ATIVO' : true);
    setError(null);
  }, [open, accommodation]);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      const data = { ...form, phone: form.phone.replace(/\D/g, '') } as unknown as AccommodationInput;
      return accommodation ? updateAccommodation(accommodation.id, { ...data, status: active ? 'ATIVO' : 'INATIVO' }) : createAccommodation(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accommodations'] });
      toast({ title: accommodation ? 'Pousada atualizada' : 'Pousada cadastrada' });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError('Informe o nome da pousada.');
    setError(null);
    mutation.mutate();
  };

  const input = (k: keyof FormState, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`acc-${k}`}>{label}</Label>
      <Input id={`acc-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{accommodation ? 'Editar pousada' : 'Nova pousada'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {input('name', 'Nome')}
          {input('address', 'Endereço')}
          <div className="grid gap-4 grid-cols-[1fr_6rem]">
            {input('city', 'Cidade')}
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.state || undefined} onValueChange={(v) => set('state', v)}>
                <SelectTrigger aria-label="Estado">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {brazilStates.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {input('phone', 'Telefone', { inputMode: 'tel' })}
            {input('email', 'E-mail', { type: 'email' })}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-notes">Observações</Label>
            <Textarea id="acc-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          {accommodation && (
            <label className="flex items-center justify-between text-sm">
              Disponível para novas viagens
              <Switch checked={active} onCheckedChange={setActive} />
            </label>
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
              {accommodation ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
