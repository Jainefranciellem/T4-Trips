import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInYears } from 'date-fns';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api';
import { createCustomer, updateCustomer, type CustomerInput } from '@/lib/customers.service';
import { brazilStates } from '@/lib/constants';
import { formatCpf } from '@/lib/format';
import type { Customer } from '@/types';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSaved?: (customer: Customer) => void;
}

const fields = [
  'full_name', 'cpf', 'birth_date', 'whatsapp', 'phone', 'email', 'city', 'state',
  'emergency_contact_name', 'emergency_contact_phone', 'guardian_name', 'guardian_phone', 'notes',
] as const;

type FormState = Record<(typeof fields)[number], string>;
const phoneFields = ['whatsapp', 'phone', 'emergency_contact_phone', 'guardian_phone'] as const;

const empty = Object.fromEntries(fields.map((f) => [f, ''])) as FormState;

function fromCustomer(c: Customer): FormState {
  return Object.fromEntries(
    fields.map((f) => [f, f === 'cpf' ? formatCpf(c.cpf).replace('—', '') : f === 'birth_date' ? (c.birth_date ?? '').slice(0, 10) : (c[f] ?? '')]),
  ) as FormState;
}

interface Duplicate {
  code: 'CPF_DUPLICATE' | 'POSSIBLE_DUPLICATE';
  message: string;
  names: string[];
}

export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const duplicateRef = useRef<HTMLDivElement>(null);

  // O aviso fica no fim do formulário; sem rolar, passaria despercebido no celular.
  useEffect(() => {
    if (duplicate) duplicateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [duplicate]);

  useEffect(() => {
    if (open) {
      setForm(customer ? fromCustomer(customer) : empty);
      setError(null);
      setDuplicate(null);
    }
  }, [open, customer]);

  const set = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDuplicate(null);
  };

  const isMinor = !!form.birth_date && differenceInYears(new Date(), new Date(form.birth_date)) < 18;

  const payload = (): CustomerInput => {
    const data = { ...form } as Record<string, string>;
    // Telefones só com dígitos: a busca e o alerta de duplicidade comparam assim.
    phoneFields.forEach((f) => (data[f] = data[f].replace(/\D/g, '')));
    return data as unknown as CustomerInput;
  };

  const mutation = useMutation({
    mutationFn: (confirm: boolean) =>
      customer ? updateCustomer(customer.id, payload()) : createCustomer(payload(), confirm),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: customer ? 'Cliente atualizado' : 'Cliente cadastrado' });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409 && err.body?.code) {
        const body = err.body as { code: Duplicate['code']; message: string; existing?: { full_name: string }; matches?: { full_name: string }[] };
        setDuplicate({
          code: body.code,
          message: body.message,
          names: body.existing ? [body.existing.full_name] : (body.matches ?? []).map((m) => m.full_name),
        });
        return;
      }
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Este diálogo também abre de dentro do formulário de reserva; o submit
    // atravessaria o portal até o formulário de fora.
    e.stopPropagation();
    if (form.full_name.trim().length < 2) return setError('Informe o nome completo.');
    if (isMinor && !form.guardian_name.trim()) return setError('Passageiro menor de idade: informe o responsável.');
    setError(null);
    mutation.mutate(false);
  };

  const input = (key: keyof FormState, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`customer-${key}`}>{label}</Label>
      <Input id={`customer-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{input('full_name', 'Nome completo *', { autoComplete: 'off' })}</div>
            {input('cpf', 'CPF', { inputMode: 'numeric', placeholder: '000.000.000-00' })}
            {input('birth_date', 'Data de nascimento', { type: 'date' })}
            {input('whatsapp', 'WhatsApp', { inputMode: 'tel', placeholder: '(79) 99999-9999' })}
            {input('phone', 'Telefone', { inputMode: 'tel' })}
            {input('email', 'E-mail', { type: 'email' })}
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
            {input('emergency_contact_name', 'Contato de emergência')}
            {input('emergency_contact_phone', 'Telefone de emergência', { inputMode: 'tel' })}
            {input('guardian_name', isMinor ? 'Responsável *' : 'Responsável (se menor de idade)')}
            {input('guardian_phone', 'Contato do responsável', { inputMode: 'tel' })}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="customer-notes">Observações internas</Label>
              <Textarea id="customer-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>

          {duplicate && (
            <div ref={duplicateRef} className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm space-y-2" role="alert">
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> {duplicate.message}
              </p>
              <ul className="list-disc pl-5">
                {duplicate.names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              {duplicate.code === 'CPF_DUPLICATE' ? (
                <p className="text-muted-foreground">Use o cadastro existente: busque pelo nome na lista de clientes.</p>
              ) : (
                <Button type="button" size="sm" variant="warning" onClick={() => mutation.mutate(true)} disabled={mutation.isPending}>
                  É outra pessoa, cadastrar mesmo assim
                </Button>
              )}
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
              {customer ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
